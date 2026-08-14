import path from "node:path";

import { validateTripoMediaUrl } from "./tripo-provider.mjs";

const supportedExtensions = new Set([".glb", ".gltf", ".fbx", ".obj", ".png", ".jpg", ".jpeg", ".webp"]);

export function apiData(payload) {
  if (!payload || payload.code !== 0 || payload.data === undefined) {
    const message = payload?.message ?? "Tripo API returned an invalid response.";
    throw new Error(`Tripo API error: ${message}`);
  }
  return payload.data;
}

export function successfulTaskMedia(task) {
  if (task?.status !== "success") {
    throw new Error(`Tripo task is ${task?.status ?? "invalid"}, not successful.`);
  }
  const modelUrl = task.output?.model_url;
  if (!modelUrl) throw new Error("Successful Tripo task did not contain a model URL.");
  validateTripoMediaUrl(modelUrl);
  const previewUrl = task.output?.rendered_image_url ?? null;
  if (previewUrl) validateTripoMediaUrl(previewUrl);
  return { modelUrl, previewUrl };
}

export function mediaExtension(mediaUrl, fallback) {
  const extension = path.extname(new URL(mediaUrl).pathname).toLowerCase();
  return supportedExtensions.has(extension) ? extension : fallback;
}

export function canResumeTask(entry) {
  return Boolean(entry?.taskId && ["queued", "running", "success"].includes(entry.status));
}

function safeArtifactSegment(value, fallback) {
  return String(value ?? "")
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

export function textureArtifactStem(inputModelPath, taskId) {
  const extension = path.extname(inputModelPath);
  const basename = path.basename(inputModelPath, extension).replace(/^segmented-/, "");
  const safeDescriptor = safeArtifactSegment(basename, "model");
  const safeTaskId = safeArtifactSegment(taskId, "task").slice(0, 8);
  return `textured-${safeDescriptor}-${safeTaskId}`;
}

export function validatedTripoRedirectUrl(currentUrl, location) {
  return validateTripoMediaUrl(new URL(location, currentUrl));
}

export function totalCreditsForEntry(entry) {
  if (!entry) return 0;
  const stageRecords = [
    entry.postprocess,
    ...(entry.postprocessHistory ?? []),
    entry.texture,
    ...(entry.textureHistory ?? []),
  ];
  return (entry.creditsConsumed ?? 0)
    + stageRecords.reduce((total, record) => total + (record?.creditsConsumed ?? 0), 0)
    + (entry.generationHistory ?? [])
      .reduce((total, previousEntry) => total + totalCreditsForEntry(previousEntry), 0);
}
