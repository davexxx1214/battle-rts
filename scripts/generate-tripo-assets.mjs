import { createHash } from "node:crypto";
import { copyFile, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TRIPO_ASSETS, readTripoKey } from "./tripo-asset-catalog.mjs";
import {
  apiData,
  canResumeTask,
  mediaExtension,
  successfulTaskMedia,
  textureArtifactStem,
  totalCreditsForEntry,
  validatedTripoRedirectUrl,
} from "./tripo-generation.mjs";

const API_ROOT = "https://openapi.tripo3d.ai/v3";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "public", "assets", "generated", "tripo");
const manifestPath = path.join(outputRoot, "manifest.json");
const lockPath = path.join(outputRoot, ".generation.lock");
const force = process.argv.includes("--force");
const pollIntervalMs = 5_000;
const maximumPolls = 144;
const maximumModelBytes = 120 * 1024 * 1024;
const maximumPreviewBytes = 20 * 1024 * 1024;
const maximumMediaRedirects = 3;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function generationHash(asset) {
  return sha256(JSON.stringify({ endpoint: "generation/text-to-model", request: asset.request }));
}

function postprocessHash(asset, inputTaskId) {
  return sha256(JSON.stringify({
    endpoint: asset.postprocess.endpoint,
    inputTaskId,
    request: asset.postprocess.request,
  }));
}

function textureHash(asset, inputTaskId) {
  return sha256(JSON.stringify({
    endpoint: asset.texture.endpoint,
    inputTaskId,
    request: asset.texture.request,
  }));
}

async function fileExists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function requestJson(pathname, apiKey, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(`${API_ROOT}/${pathname}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
      signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`Tripo API HTTP ${response.status}: ${payload?.message ?? "unknown error"}`);
    }
    return apiData(payload);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTripoMedia(mediaUrl, signal, label) {
  let currentUrl = new URL(mediaUrl);
  for (let hop = 0; hop <= maximumMediaRedirects; hop += 1) {
    const response = await fetch(currentUrl, { signal, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    if (hop === maximumMediaRedirects) {
      throw new Error(`${label}: download exceeded its redirect limit.`);
    }
    const location = response.headers.get("location");
    if (!location) throw new Error(`${label}: redirect did not contain a location.`);
    currentUrl = validatedTripoRedirectUrl(currentUrl, location);
  }
  throw new Error(`${label}: download redirect handling failed.`);
}

async function downloadMedia(mediaUrl, targetPath, maximumBytes, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  const temporaryPath = `${targetPath}.download`;
  let temporaryHandle = null;
  try {
    const response = await fetchTripoMedia(mediaUrl, controller.signal, label);
    if (!response.ok) throw new Error(`${label}: download failed with HTTP ${response.status}.`);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > maximumBytes) throw new Error(`${label}: download exceeded its size limit.`);
    if (!response.body) throw new Error(`${label}: download response did not contain a body.`);
    temporaryHandle = await open(temporaryPath, "w");
    const digest = createHash("sha256");
    let bytes = 0;
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maximumBytes) {
        controller.abort();
        throw new Error(`${label}: download exceeded its size limit.`);
      }
      digest.update(buffer);
      await temporaryHandle.write(buffer);
    }
    if (bytes === 0) throw new Error(`${label}: download was empty.`);
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = null;
    await rename(temporaryPath, targetPath);
    return { bytes, sha256: digest.digest("hex") };
  } catch (error) {
    if (temporaryHandle) await temporaryHandle.close().catch(() => {});
    await rm(temporaryPath, { force: true });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return {
      version: 1,
      provider: "Tripo3D",
      updatedAt: null,
      operator: {
        id: "catapult-operator",
        label: "投石车操作兵",
        mode: "reused",
        model: "/assets/kaykit/adventurers/characters/Knight.glb",
      },
      entries: [],
    };
  }
}

async function writeManifest(manifest) {
  manifest.updatedAt = new Date().toISOString();
  const temporaryPath = `${manifestPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporaryPath, manifestPath);
}

async function completedEntryIsUsable(entry, specHash) {
  if (force || entry?.status !== "success" || entry.specHash !== specHash) return false;
  if (!entry.files?.model) return false;
  const modelPath = path.join(outputRoot, entry.files.model.path);
  if (!await fileExists(modelPath)) return false;
  return sha256(await readFile(modelPath)) === entry.files.model.sha256;
}

function resolveOutputPath(relativePath) {
  const resolved = path.resolve(outputRoot, relativePath);
  if (resolved === outputRoot || !resolved.startsWith(`${outputRoot}${path.sep}`)) {
    throw new Error(`Asset path escapes the generated model directory: ${relativePath}`);
  }
  return resolved;
}

async function syncRuntimeAssets(manifest) {
  for (const asset of TRIPO_ASSETS) {
    if (!asset.runtime) continue;
    const entry = manifest.entries.find(({ id }) => id === asset.id);
    const sourceRecord = asset.runtime.sourceStage === "texture" ? entry?.texture : entry;
    const sourceFile = sourceRecord?.files?.model;
    if (sourceRecord?.status !== "success" || !sourceFile) {
      throw new Error(`${asset.id}: runtime source stage ${asset.runtime.sourceStage} is unavailable.`);
    }
    const sourcePath = resolveOutputPath(sourceFile.path);
    const sourceBuffer = await readFile(sourcePath);
    const sourceHash = sha256(sourceBuffer);
    if (sourceHash !== sourceFile.sha256 || sourceBuffer.byteLength !== sourceFile.bytes) {
      throw new Error(`${asset.id}: runtime source does not match its manifest record.`);
    }

    const runtimePath = resolveOutputPath(asset.runtime.path);
    const temporaryPath = `${runtimePath}.copy`;
    await mkdir(path.dirname(runtimePath), { recursive: true });
    let currentHash = null;
    try {
      currentHash = sha256(await readFile(runtimePath));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (currentHash !== sourceHash) {
      await copyFile(sourcePath, temporaryPath);
      await rm(runtimePath, { force: true });
      await rename(temporaryPath, runtimePath);
    }
    entry.runtime = {
      sourceStage: asset.runtime.sourceStage,
      sourceTaskId: sourceRecord.taskId,
      path: asset.runtime.path,
      bytes: sourceBuffer.byteLength,
      sha256: sourceHash,
    };
  }
  await writeManifest(manifest);
}

async function pollTask(taskId, apiKey, label, record, manifest) {
  for (let attempt = 0; attempt < maximumPolls; attempt += 1) {
    const task = await requestJson(`tasks/${encodeURIComponent(taskId)}`, apiKey);
    record.status = task.status;
    record.progress = task.progress ?? 0;
    record.creditsConsumed = task.credits_consumed ?? record.creditsConsumed ?? null;
    await writeManifest(manifest);
    console.log(`${label}: ${record.status} ${record.progress}%`);
    if (task.status === "success") return task;
    if (task.status === "failed" || task.status === "cancelled") {
      throw new Error(`${label}: Tripo task ${task.status}: ${task.message ?? "no reason supplied"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`${label}: Tripo task timed out after 12 minutes.`);
}

async function postprocessAsset(asset, apiKey, entry, manifest) {
  if (!asset.postprocess) return null;
  const specHash = postprocessHash(asset, entry.taskId);
  let record = entry.postprocess;
  if (
    !force
    && record?.status === "success"
    && record.specHash === specHash
    && record.files?.model
  ) {
    const modelPath = path.join(outputRoot, record.files.model.path);
    if (await fileExists(modelPath) && sha256(await readFile(modelPath)) === record.files.model.sha256) {
      console.log(`skip ${asset.id} postprocess`);
      return record;
    }
  }
  if (!record || record.specHash !== specHash || force) {
    if (record?.taskId) {
      entry.postprocessHistory ??= [];
      entry.postprocessHistory.push(record);
    }
    record = {
      endpoint: `/v3/${asset.postprocess.endpoint}`,
      request: asset.postprocess.request,
      specHash,
      taskId: null,
      status: "not-started",
      progress: 0,
      creditsConsumed: null,
      files: null,
    };
    entry.postprocess = record;
    await writeManifest(manifest);
  }
  if (!canResumeTask(record)) {
    console.log(`create ${asset.id} postprocess`);
    const created = await requestJson(asset.postprocess.endpoint, apiKey, {
      method: "POST",
      body: JSON.stringify({ input: entry.taskId, ...asset.postprocess.request }),
    });
    if (!created.task_id) throw new Error(`${asset.id} postprocess: response did not contain task_id.`);
    record.taskId = created.task_id;
    record.status = "queued";
    await writeManifest(manifest);
  } else {
    console.log(`resume ${asset.id} postprocess (${record.taskId})`);
  }
  const task = await pollTask(record.taskId, apiKey, `${asset.id} postprocess`, record, manifest);
  const { modelUrl, previewUrl } = successfulTaskMedia(task);
  const assetDirectory = path.join(outputRoot, asset.id);
  const modelExtension = mediaExtension(modelUrl, ".glb");
  const granularity = asset.postprocess.request.segmentation_granularity ?? "custom";
  const taskSuffix = record.taskId.replace(/[^a-z0-9-]/gi, "-").slice(0, 8);
  const segmentationName = asset.postprocess.request.split_by_connectivity
    ? `segmented-${granularity}-${taskSuffix}`
    : `segmented-${granularity}-semantic-${taskSuffix}`;
  const modelName = `${segmentationName}${modelExtension}`;
  const modelFile = await downloadMedia(
    modelUrl,
    path.join(assetDirectory, modelName),
    maximumModelBytes,
    `${asset.id} segmented model`,
  );
  let previewFile = null;
  if (previewUrl) {
    const previewExtension = mediaExtension(previewUrl, ".png");
    const previewName = `${segmentationName}-preview${previewExtension}`;
    previewFile = {
      path: `${asset.id}/${previewName}`,
      ...await downloadMedia(
        previewUrl,
        path.join(assetDirectory, previewName),
        maximumPreviewBytes,
        `${asset.id} segmented preview`,
      ),
    };
  }
  record.status = "success";
  record.progress = 100;
  record.creditsConsumed = task.credits_consumed ?? record.creditsConsumed ?? null;
  record.files = {
    model: { path: `${asset.id}/${modelName}`, ...modelFile },
    preview: previewFile,
  };
  await writeManifest(manifest);
  return record;
}

async function textureAsset(asset, apiKey, entry, inputRecord, manifest) {
  if (!asset.texture || !inputRecord?.taskId) return null;
  const specHash = textureHash(asset, inputRecord.taskId);
  let record = entry.texture;
  if (
    !force
    && record?.status === "success"
    && record.specHash === specHash
    && record.files?.model
  ) {
    const modelPath = path.join(outputRoot, record.files.model.path);
    if (await fileExists(modelPath) && sha256(await readFile(modelPath)) === record.files.model.sha256) {
      console.log(`skip ${asset.id} texture`);
      return record;
    }
  }
  if (!record || record.specHash !== specHash || force) {
    if (record?.taskId) {
      entry.textureHistory ??= [];
      entry.textureHistory.push(record);
    }
    record = {
      endpoint: `/v3/${asset.texture.endpoint}`,
      request: asset.texture.request,
      inputTaskId: inputRecord.taskId,
      specHash,
      taskId: null,
      status: "not-started",
      progress: 0,
      creditsConsumed: null,
      files: null,
    };
    entry.texture = record;
    await writeManifest(manifest);
  }
  if (!canResumeTask(record)) {
    console.log(`create ${asset.id} texture`);
    const created = await requestJson(asset.texture.endpoint, apiKey, {
      method: "POST",
      body: JSON.stringify({ input: inputRecord.taskId, ...asset.texture.request }),
    });
    if (!created.task_id) throw new Error(`${asset.id} texture: response did not contain task_id.`);
    record.taskId = created.task_id;
    record.status = "queued";
    await writeManifest(manifest);
  } else {
    console.log(`resume ${asset.id} texture (${record.taskId})`);
  }
  const task = await pollTask(record.taskId, apiKey, `${asset.id} texture`, record, manifest);
  const { modelUrl, previewUrl } = successfulTaskMedia(task);
  const assetDirectory = path.join(outputRoot, asset.id);
  const modelExtension = mediaExtension(modelUrl, ".glb");
  const artifactStem = textureArtifactStem(inputRecord.files.model.path, record.taskId);
  const modelName = `${artifactStem}${modelExtension}`;
  const modelFile = await downloadMedia(
    modelUrl,
    path.join(assetDirectory, modelName),
    maximumModelBytes,
    `${asset.id} textured model`,
  );
  let previewFile = null;
  if (previewUrl) {
    const previewExtension = mediaExtension(previewUrl, ".png");
    const previewName = `${artifactStem}-preview${previewExtension}`;
    previewFile = {
      path: `${asset.id}/${previewName}`,
      ...await downloadMedia(
        previewUrl,
        path.join(assetDirectory, previewName),
        maximumPreviewBytes,
        `${asset.id} textured preview`,
      ),
    };
  }
  record.status = "success";
  record.progress = 100;
  record.creditsConsumed = task.credits_consumed ?? record.creditsConsumed ?? null;
  record.files = {
    model: { path: `${asset.id}/${modelName}`, ...modelFile },
    preview: previewFile,
  };
  await writeManifest(manifest);
  return record;
}

async function generateAsset(asset, apiKey, manifest) {
  const specHash = generationHash(asset);
  let entry = manifest.entries.find(({ id }) => id === asset.id);
  if (await completedEntryIsUsable(entry, specHash)) {
    console.log(`skip ${asset.id}`);
    const postprocessRecord = await postprocessAsset(asset, apiKey, entry, manifest);
    await textureAsset(asset, apiKey, entry, postprocessRecord, manifest);
    return;
  }
  if (!entry || entry.specHash !== specHash || force) {
    const generationHistory = entry
      ? [
          ...(entry.generationHistory ?? []),
          Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "generationHistory")),
        ]
      : [];
    entry = {
      id: asset.id,
      label: asset.label,
      modelFamily: asset.modelFamily,
      endpoint: "/v3/generation/text-to-model",
      request: asset.request,
      specHash,
      taskId: null,
      status: "not-started",
      progress: 0,
      creditsConsumed: null,
      files: null,
      generationHistory,
    };
    manifest.entries = manifest.entries.filter(({ id }) => id !== asset.id);
    manifest.entries.push(entry);
    await writeManifest(manifest);
  }

  if (!canResumeTask(entry)) {
    console.log(`create ${asset.id} (${asset.modelFamily})`);
    const created = await requestJson("generation/text-to-model", apiKey, {
      method: "POST",
      body: JSON.stringify(asset.request),
    });
    if (!created.task_id) throw new Error(`${asset.id}: create response did not contain task_id.`);
    entry.taskId = created.task_id;
    entry.status = "queued";
    await writeManifest(manifest);
  } else {
    console.log(`resume ${asset.id} (${entry.taskId})`);
  }

  const task = await pollTask(entry.taskId, apiKey, asset.id, entry, manifest);
  const { modelUrl, previewUrl } = successfulTaskMedia(task);
  const assetDirectory = path.join(outputRoot, asset.id);
  await mkdir(assetDirectory, { recursive: true });
  const modelExtension = mediaExtension(modelUrl, ".glb");
  const taskSuffix = entry.taskId.replace(/[^a-z0-9-]/gi, "-").slice(0, 8);
  const modelName = `model-${taskSuffix}${modelExtension}`;
  const modelFile = await downloadMedia(
    modelUrl,
    path.join(assetDirectory, modelName),
    maximumModelBytes,
    `${asset.id} model`,
  );
  let previewFile = null;
  if (previewUrl) {
    const previewExtension = mediaExtension(previewUrl, ".png");
    const previewName = `preview-${taskSuffix}${previewExtension}`;
    previewFile = {
      path: `${asset.id}/${previewName}`,
      ...await downloadMedia(
        previewUrl,
        path.join(assetDirectory, previewName),
        maximumPreviewBytes,
        `${asset.id} preview`,
      ),
    };
  }
  entry.status = "success";
  entry.progress = 100;
  entry.creditsConsumed = task.credits_consumed ?? entry.creditsConsumed ?? null;
  entry.files = {
    model: { path: `${asset.id}/${modelName}`, ...modelFile },
    preview: previewFile,
  };
  await writeManifest(manifest);
  const postprocessRecord = await postprocessAsset(asset, apiKey, entry, manifest);
  await textureAsset(asset, apiKey, entry, postprocessRecord, manifest);
}

async function main() {
  const configText = await readFile(path.join(projectRoot, "config.yaml"), "utf8");
  const apiKey = readTripoKey(configText);
  await mkdir(outputRoot, { recursive: true });
  let lockHandle;
  try {
    lockHandle = await open(lockPath, "wx");
    await lockHandle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`);
    await lockHandle.close();
  } catch (error) {
    if (lockHandle) await lockHandle.close().catch(() => {});
    if (error?.code === "EEXIST") {
      throw new Error(
        `Another model generation is active, or a stale lock exists at ${lockPath}.`,
        { cause: error },
      );
    }
    throw error;
  }

  try {
    const manifest = await readManifest();
    for (const asset of TRIPO_ASSETS) await generateAsset(asset, apiKey, manifest);
    await syncRuntimeAssets(manifest);
    const consumed = manifest.entries.reduce(
      (total, entry) => total + totalCreditsForEntry(entry),
      0,
    );
    console.log(`Tripo assets ready. Recorded credits consumed: ${consumed}.`);
  } finally {
    await rm(lockPath, { force: true });
  }
}

await main();
