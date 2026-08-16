import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const expectedAssets = {
  "public/audio/battle/catapult_impact_01.wav": "edecadf6253ebc0307afe30a50299b36c2c34b6fe36a46c1b64ee4ec215f91c7",
  "public/audio/battle/catapult_impact_02.wav": "7da82f90cb53b549d2111e5220c4ad6856a9739efe5601e74c6b15f55f19fb74",
  "public/audio/battle/catapult_launch_01.wav": "e7f299bd4c754862e564d263c433911768fd343b806842ae626a6c08575a324d",
  "public/audio/battle/catapult_launch_02.wav": "9007689403a21ab8910d72910c0ac9b8f37313b0550341a87d2a329a6fba330d",
  "public/audio/battle/draw-bow.wav": "4d10e1a04c4c1885fe19e06ec110d799dfab9a92b87906f24547f2d0ab68d43a",
  "public/audio/music/fail.mp3": "5a1a3c7104b5c513b3e4669641a4df559f19f393a615fdc76e27f0fa5093dc0b",
  "public/audio/music/victory1.mp3": "79397ee5650725ddf9a9edc5bbc0820fd634ad38ff58dbfba07e4453382ab8f8",
  "public/audio/music/victory2.mp3": "f0390f73e0b5db15b583ad08eebc10da63bbfc657ef2814483d2733915d99055",
  "public/audio/music/victory3.mp3": "da241d6f81a9c7e8e07e26da3e225d262152a73660c634c5f9e6a8cac9240d96",
  "public/audio/ui/organic/drop.mp3": "1f86693b432f4f6748d936ec7835f2c4937a4ed014b7c1a77166028c2c7b661d",
  "public/audio/ui/organic/hover.mp3": "014ee5aa188437d8e9b498a010f761b92c2b9bce8531622fbb1a2cde4206f8bd",
  "public/audio/ui/organic/select.mp3": "7955c150979f41669701cdf6155e54ec3deea00f715e0847ce6ec55223ee74a2",
  "public/audio/ui/organic/snap.mp3": "2f2fb677266f14289999eaad3b58fb9c19a8f95a545d87ff2bc219c9513e244a",
};

const maximumWavDurations = {
  "public/audio/battle/catapult_impact_01.wav": 2,
  "public/audio/battle/catapult_impact_02.wav": 2,
  "public/audio/battle/catapult_launch_01.wav": 1,
  "public/audio/battle/catapult_launch_02.wav": 1,
  "public/audio/battle/draw-bow.wav": 2,
};

function pcmWavDuration(bytes, label) {
  let byteRate = null;
  let dataSize = null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkId = bytes.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const payloadOffset = offset + 8;
    if (payloadOffset + chunkSize > bytes.length) {
      throw new Error(`${label}: WAV chunk exceeds the file boundary.`);
    }
    if (chunkId === "fmt " && chunkSize >= 16) byteRate = bytes.readUInt32LE(payloadOffset + 8);
    if (chunkId === "data") {
      dataSize = chunkSize;
      break;
    }
    offset = payloadOffset + chunkSize + (chunkSize % 2);
  }
  if (!byteRate || dataSize === null) throw new Error(`${label}: missing WAV duration metadata.`);
  return dataSize / byteRate;
}

const failures = [];
for (const [relativePath, expectedHash] of Object.entries(expectedAssets)) {
  try {
    const bytes = await readFile(path.join(projectRoot, relativePath));
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== expectedHash) {
      failures.push(`${relativePath}: expected ${expectedHash}, received ${actualHash}`);
    }
    const maximumDuration = maximumWavDurations[relativePath];
    if (maximumDuration !== undefined) {
      const duration = pcmWavDuration(bytes, relativePath);
      if (duration > maximumDuration) {
        failures.push(`${relativePath}: ${duration}s exceeds ${maximumDuration}s`);
      }
    }
  } catch (error) {
    failures.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  throw new Error(`Audio asset validation failed:\n${failures.join("\n")}`);
}

console.log(`Validated ${Object.keys(expectedAssets).length} combat, outcome-music, and UI-sound assets.`);
