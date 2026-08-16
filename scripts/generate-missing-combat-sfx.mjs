import { fal } from "@fal-ai/client";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = "sonilo/v1.1/text-to-sound-effects";
const AUDIO_FORMAT = "wav";
const MAXIMUM_DURATION_SECONDS = 2;
const MAXIMUM_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "public", "audio", "battle");
const provenancePath = path.join(projectRoot, "audio", "combat-sfx.provenance.json");
let provenanceDirty = false;

const sounds = [
  {
    id: "catapult_launch_01",
    duration: 1,
    prompt: "Isolated medieval torsion catapult firing one heavy stone, sudden wooden frame strain, rope snap and forceful low launch thump, dry close game sound, no impact, no voice, no ambience, no music",
  },
  {
    id: "catapult_launch_02",
    duration: 1,
    prompt: "Single medieval catapult release, compact timber creak, taut rope recoil and heavy arm slam, powerful but short isolated game effect, no projectile impact, no voice, no ambience, no music",
  },
  {
    id: "catapult_impact_01",
    duration: 2,
    prompt: "Single large catapult stone smashing into medieval stonework, deep compact impact, cracking masonry and brief falling rubble, fast decay, isolated game sound, no voices, no ambience, no music",
  },
  {
    id: "catapult_impact_02",
    duration: 2,
    prompt: "One heavy siege rock striking earth and timber fortifications, powerful low thud, splintering wood and short debris burst, dry isolated battle effect, no voices, no ambience, no music",
  },
];

for (const sound of sounds) {
  if (!Number.isInteger(sound.duration) || sound.duration < 1 || sound.duration > MAXIMUM_DURATION_SECONDS) {
    throw new Error(`${sound.id}: duration must be an integer from 1 to ${MAXIMUM_DURATION_SECONDS}.`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function specHash(sound) {
  return sha256(JSON.stringify({
    model: MODEL,
    prompt: sound.prompt,
    duration: sound.duration,
    audioFormat: AUDIO_FORMAT,
  }));
}

async function readFalKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  const config = await readFile(path.join(projectRoot, "config.yaml"), "utf8");
  const match = config.match(/^\s*fal_key\s*:\s*(.+?)\s*$/m);
  if (!match) throw new Error("Set FAL_KEY or add fal_key to config.yaml.");
  return match[1].trim().replace(/^["']|["']$/g, "");
}

async function readPreviousEntries() {
  try {
    const manifest = JSON.parse(await readFile(provenancePath, "utf8"));
    return new Map((manifest.entries ?? []).map((entry) => [entry.id, entry]));
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    throw error;
  }
}

function validateFalMediaUrl(value, label) {
  const parsed = value instanceof URL ? value : new URL(value);
  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:"
    || !(hostname === "fal.media" || hostname.endsWith(".fal.media"))
  ) {
    throw new Error(`${label}: Fal returned an unexpected media URL.`);
  }
  return parsed;
}

function validateWav(bytes, label) {
  const valid = bytes.length >= 12
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WAVE";
  if (!valid) throw new Error(`${label}: downloaded media is not a RIFF/WAVE file.`);
}

function trimPcmWav(bytes, durationSeconds, label) {
  let byteRate = null;
  let blockAlign = null;
  let dataOffset = null;
  let dataSize = null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkId = bytes.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const payloadOffset = offset + 8;
    if (payloadOffset + chunkSize > bytes.length) {
      throw new Error(`${label}: WAV chunk exceeds the file boundary.`);
    }
    if (chunkId === "fmt " && chunkSize >= 16) {
      byteRate = bytes.readUInt32LE(payloadOffset + 8);
      blockAlign = bytes.readUInt16LE(payloadOffset + 12);
    }
    if (chunkId === "data") {
      dataOffset = payloadOffset;
      dataSize = chunkSize;
      break;
    }
    offset = payloadOffset + chunkSize + (chunkSize % 2);
  }
  if (!byteRate || !blockAlign || dataOffset === null || dataSize === null) {
    throw new Error(`${label}: WAV is missing PCM format or data metadata.`);
  }
  const maximumDataBytes = Math.floor(byteRate * durationSeconds / blockAlign) * blockAlign;
  if (dataSize <= maximumDataBytes) return bytes;
  const trimmed = Buffer.from(bytes.subarray(0, dataOffset + maximumDataBytes));
  trimmed.writeUInt32LE(trimmed.length - 8, 4);
  trimmed.writeUInt32LE(maximumDataBytes, dataOffset - 4);
  return trimmed;
}

async function downloadAudio(audioUrl, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    let currentUrl = validateFalMediaUrl(audioUrl, label);
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      const response = await fetch(currentUrl, { redirect: "manual", signal: controller.signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirectCount === 3) throw new Error(`${label}: too many download redirects.`);
        const location = response.headers.get("location");
        if (!location) throw new Error(`${label}: media redirect had no location.`);
        await response.body?.cancel();
        currentUrl = validateFalMediaUrl(new URL(location, currentUrl), label);
        continue;
      }
      if (!response.ok) throw new Error(`${label}: download failed with HTTP ${response.status}.`);
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAXIMUM_DOWNLOAD_BYTES) {
        throw new Error(`${label}: media exceeds the 5 MB safety limit.`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAXIMUM_DOWNLOAD_BYTES) {
        throw new Error(`${label}: media exceeds the 5 MB safety limit.`);
      }
      validateWav(bytes, label);
      return bytes;
    }
    throw new Error(`${label}: media download did not resolve.`);
  } finally {
    clearTimeout(timeout);
  }
}

async function withRetry(operation, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    }
  }
  throw new Error(`${label} failed after 3 attempts.`, { cause: lastError });
}

const previousEntries = await readPreviousEntries();
const completedEntries = new Map();
if (
  previousEntries.size !== sounds.length
  || sounds.some(({ id }) => !previousEntries.has(id))
) provenanceDirty = true;
let provenanceWriteChain = Promise.resolve();

function queueProvenanceWrite() {
  provenanceWriteChain = provenanceWriteChain.then(async () => {
    const entries = sounds
      .map(({ id }) => completedEntries.get(id))
      .filter(Boolean);
    const manifest = {
      version: 1,
      model: MODEL,
      updatedAt: new Date().toISOString(),
      format: AUDIO_FORMAT,
      maximumDurationSeconds: MAXIMUM_DURATION_SECONDS,
      entries,
    };
    const temporaryPath = `${provenancePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rename(temporaryPath, provenancePath);
  });
  return provenanceWriteChain;
}

async function cachedEntry(sound, filePath) {
  const previous = previousEntries.get(sound.id);
  if (!previous || previous.specHash !== specHash(sound)) return null;
  try {
    const bytes = await readFile(filePath);
    validateWav(bytes, sound.id);
    if (sha256(bytes) !== previous.sha256) return null;
    const normalizedBytes = trimPcmWav(bytes, sound.duration, sound.id);
    if (normalizedBytes.length === bytes.length) return previous;
    const temporaryPath = `${filePath}.normalize`;
    try {
      await writeFile(temporaryPath, normalizedBytes);
      await rename(temporaryPath, filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
    provenanceDirty = true;
    return { ...previous, sha256: sha256(normalizedBytes) };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function generateSound(sound) {
  const file = `${sound.id}.wav`;
  const filePath = path.join(outputDirectory, file);
  const cached = await cachedEntry(sound, filePath);
  if (cached) {
    completedEntries.set(sound.id, cached);
    console.log(`reuse ${file}`);
    return false;
  }

  console.log(`generate ${file} (${sound.duration}s)`);
  const result = await withRetry(() => fal.subscribe(MODEL, {
    input: {
      prompt: sound.prompt,
      duration: sound.duration,
      audio_format: AUDIO_FORMAT,
    },
    logs: false,
  }), sound.id);
  const audioUrl = result.data?.audio?.url;
  if (!audioUrl) throw new Error(`${sound.id}: Fal response omitted the audio URL.`);
  const downloadedBytes = await withRetry(
    () => downloadAudio(audioUrl, sound.id),
    `${sound.id} download`,
  );
  const bytes = trimPcmWav(downloadedBytes, sound.duration, sound.id);
  const temporaryPath = `${filePath}.download`;
  try {
    await writeFile(temporaryPath, bytes);
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  completedEntries.set(sound.id, {
    ...sound,
    file,
    requestId: result.requestId,
    specHash: specHash(sound),
    sha256: sha256(bytes),
  });
  provenanceDirty = true;
  await queueProvenanceWrite();
  return true;
}

async function mapWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;
  const results = new Array(items.length);
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

fal.config({ credentials: await readFalKey() });
await mkdir(outputDirectory, { recursive: true });
await mkdir(path.dirname(provenancePath), { recursive: true });
const generated = await mapWithConcurrency(sounds, 3, generateSound);
if (provenanceDirty) await queueProvenanceWrite();
console.log(`Generated ${generated.filter(Boolean).length}; reused ${generated.filter((value) => !value).length}.`);
