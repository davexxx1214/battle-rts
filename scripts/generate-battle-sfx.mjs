import { fal } from "@fal-ai/client";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicCueCatalog, sounds } from "./battle-sfx-catalog.mjs";

const MODEL = "sonilo/v1.1/text-to-sound-effects";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "public", "audio", "battle");
const provenancePath = path.join(projectRoot, "audio", "battle-sfx.provenance.json");
const legacyManifestPath = path.join(outputDirectory, "manifest.json");
const force = process.argv.includes("--force");
const maximumDownloadBytes = 5 * 1024 * 1024;
const downloadTimeoutMs = 30_000;
const previousEntriesById = new Map();
const completedEntriesById = new Map();
let previousManifestModel;
let provenanceWriteChain = Promise.resolve();
let generatedThisRun = 0;

function readFalKey(configText) {
  const match = configText.match(/^\s*fal_key\s*:\s*(.+?)\s*$/m);
  if (!match) throw new Error("config.yaml does not contain fal_key.");
  return match[1].trim().replace(/^['"]|['"]$/g, "");
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function generationSpecHash(sound) {
  return sha256(JSON.stringify({
    model: MODEL,
    prompt: sound.prompt,
    duration: sound.duration,
    audioFormat: "wav",
  }));
}

function validateWav(audio, label) {
  const hasRiffHeader = audio.length >= 12
    && audio.subarray(0, 4).toString("ascii") === "RIFF"
    && audio.subarray(8, 12).toString("ascii") === "WAVE";
  if (!hasRiffHeader) throw new Error(`${label}: download was not a valid RIFF/WAVE file.`);
}

function validateFalMediaUrl(value, label) {
  const parsedUrl = value instanceof URL ? value : new URL(value);
  const hostname = parsedUrl.hostname.toLowerCase();
  if (
    parsedUrl.protocol !== "https:"
    || !(hostname === "fal.media" || hostname.endsWith(".fal.media"))
  ) {
    throw new Error(`${label}: Fal returned an unexpected download host.`);
  }
  return parsedUrl;
}

async function withRetry(operation, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
      const delay = attempt * 3000;
      console.warn(`${label}: attempt ${attempt} failed; retrying in ${delay / 1000}s.`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function downloadAudioOnce(audioUrl, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), downloadTimeoutMs);
  try {
    let currentUrl = validateFalMediaUrl(audioUrl, label);
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      const response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirectCount === 3) throw new Error(`${label}: too many download redirects.`);
        const location = response.headers.get("location");
        if (!location) throw new Error(`${label}: download redirect had no location.`);
        await response.body?.cancel();
        currentUrl = validateFalMediaUrl(new URL(location, currentUrl), label);
        continue;
      }
      if (!response.ok) throw new Error(`${label}: download failed with HTTP ${response.status}.`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.startsWith("audio/") && contentType !== "application/octet-stream") {
        throw new Error(`${label}: download did not return audio content.`);
      }
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > maximumDownloadBytes) {
        throw new Error(`${label}: download exceeded the 5 MB safety limit.`);
      }
      if (!response.body) throw new Error(`${label}: download response had no body.`);
      const reader = response.body.getReader();
      const chunks = [];
      let receivedBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > maximumDownloadBytes) {
          await reader.cancel();
          throw new Error(`${label}: download exceeded the 5 MB safety limit.`);
        }
        chunks.push(Buffer.from(value));
      }
      const audio = Buffer.concat(chunks, receivedBytes);
      validateWav(audio, label);
      return audio;
    }
    throw new Error(`${label}: download did not resolve to audio.`);
  } finally {
    clearTimeout(timeout);
  }
}

function downloadAudio(audioUrl, label) {
  return withRetry(() => downloadAudioOnce(audioUrl, label), `${label} download`);
}

function provenanceEntries() {
  return sounds
    .map(({ id }) => completedEntriesById.get(id))
    .filter(Boolean);
}

function queueProvenanceWrite() {
  provenanceWriteChain = provenanceWriteChain.then(async () => {
    const manifest = {
      version: 1,
      model: MODEL,
      updatedAt: new Date().toISOString(),
      format: "wav",
      entries: provenanceEntries(),
    };
    const temporaryPath = `${provenancePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rename(temporaryPath, provenancePath);
  });
  return provenanceWriteChain;
}

async function writePublicCueCatalog(entries) {
  const publicCatalog = createPublicCueCatalog(entries);
  const cuePath = path.join(outputDirectory, "cues.json");
  const temporaryPath = `${cuePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(publicCatalog, null, 2)}\n`, "utf8");
  await rename(temporaryPath, cuePath);
}

async function cachedEntry(sound, fileName, filePath) {
  if (force || !await fileExists(filePath)) return undefined;
  const previous = previousEntriesById.get(sound.id);
  if (!previous) return undefined;
  const audio = await readFile(filePath);
  validateWav(audio, sound.id);
  const fileHash = sha256(audio);
  const specHash = generationSpecHash(sound);
  const hasCurrentHashes = previous.specHash === specHash && previous.sha256 === fileHash;
  const isValidLegacyEntry = !previous.specHash
    && previousManifestModel === MODEL
    && previous.prompt === sound.prompt
    && previous.duration === sound.duration
    && previous.file === fileName;
  if (!hasCurrentHashes && !isValidLegacyEntry) return undefined;
  return {
    ...sound,
    file: fileName,
    requestId: previous.requestId ?? null,
    specHash,
    sha256: fileHash,
  };
}

async function generateSound(sound) {
  const fileName = `${sound.id}.wav`;
  const filePath = path.join(outputDirectory, fileName);
  const cached = await cachedEntry(sound, fileName, filePath);
  if (cached) {
    console.log(`skip ${fileName}`);
    completedEntriesById.set(sound.id, cached);
    return cached;
  }

  console.log(`generate ${fileName} (${sound.duration}s)`);
  const result = await withRetry(() => fal.subscribe(MODEL, {
    input: {
      prompt: sound.prompt,
      duration: sound.duration,
      audio_format: "wav",
    },
    logs: false,
  }), sound.id);
  const audioUrl = result.data?.audio?.url;
  if (!audioUrl) throw new Error(`${sound.id}: Fal response did not contain an audio URL.`);
  const audio = await downloadAudio(audioUrl, sound.id);
  const temporaryPath = `${filePath}.download`;
  try {
    await writeFile(temporaryPath, audio);
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  generatedThisRun += 1;
  const entry = {
    ...sound,
    file: fileName,
    requestId: result.requestId,
    specHash: generationSpecHash(sound),
    sha256: sha256(audio),
  };
  completedEntriesById.set(sound.id, entry);
  await queueProvenanceWrite();
  return entry;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function consume() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, consume));
  return results;
}

const configText = await readFile(path.join(projectRoot, "config.yaml"), "utf8");
fal.config({ credentials: readFalKey(configText) });
await mkdir(outputDirectory, { recursive: true });
await mkdir(path.dirname(provenancePath), { recursive: true });
try {
  let previousManifest;
  try {
    previousManifest = JSON.parse(await readFile(provenancePath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    previousManifest = JSON.parse(await readFile(legacyManifestPath, "utf8"));
  }
  previousManifestModel = previousManifest.model;
  for (const entry of previousManifest.entries ?? []) {
    previousEntriesById.set(entry.id, entry);
    completedEntriesById.set(entry.id, entry);
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const entries = await mapWithConcurrency(sounds, 3, generateSound);
completedEntriesById.clear();
for (const entry of entries) completedEntriesById.set(entry.id, entry);
await queueProvenanceWrite();
await writePublicCueCatalog(entries);
console.log(`Generated ${generatedThisRun} sound effects.`);
