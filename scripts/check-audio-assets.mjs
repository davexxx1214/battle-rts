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
  "public/audio/battle/undead_bone_dragon_breath_01.wav": "8bc6e9bf193ab9b69c4cd25bbf8f111d7359eb9783daf06503d16ba744ff2492",
  "public/audio/battle/undead_bone_dragon_breath_02.wav": "c6a9deb3cb978e2d8bb9221e8a7f38270dea7fae28fe5a6b671d232041045ecd",
  "public/audio/battle/undead_knight_attack_01.wav": "1e174f9dff2bb6775ef5ad751a3ea684fc2a3c4d41aa1af0ace95b15b12f75a1",
  "public/audio/battle/undead_knight_attack_02.wav": "9b62ed799e1e871585e65ec35b9170fb38cb422616b3c465f3cdc90f4c85f97e",
  "public/audio/battle/undead_mage_lightning_01.wav": "0acb6457fffed1cc0aa539f8e65c9a584e8c4e55b1029a03bcfd5c200ddd1dbf",
  "public/audio/battle/undead_mage_lightning_02.wav": "0a62ba1d4c713f1a8e80d79293b7eb21aa464d3ee2305e233b2553cd41967ac4",
  "public/audio/battle/undead_ranger_attack_01.wav": "91b48648244bb51a98129235d102f09b45fe207e5c904ee5cd9fde55b74839b4",
  "public/audio/battle/undead_ranger_attack_02.wav": "7f1a73e0266a91128bbbee87d47193be1adc843146093212c65aae2cc9e950f5",
  "public/audio/battle/undead_spearman_attack_01.wav": "5afd3d13f3d2ab70119f223dec5081f182694a6023e3c6cd07e67f4b852e169e",
  "public/audio/battle/undead_spearman_attack_02.wav": "e971ee1a9fcb4058a57ee107d88e9a8e47730903889050e2eed0254ee7d0be9c",
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
  "public/audio/battle/undead_bone_dragon_breath_01.wav": 2,
  "public/audio/battle/undead_bone_dragon_breath_02.wav": 2,
  "public/audio/battle/undead_knight_attack_01.wav": 1,
  "public/audio/battle/undead_knight_attack_02.wav": 1,
  "public/audio/battle/undead_mage_lightning_01.wav": 2,
  "public/audio/battle/undead_mage_lightning_02.wav": 2,
  "public/audio/battle/undead_ranger_attack_01.wav": 1,
  "public/audio/battle/undead_ranger_attack_02.wav": 1,
  "public/audio/battle/undead_spearman_attack_01.wav": 1,
  "public/audio/battle/undead_spearman_attack_02.wav": 1,
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
