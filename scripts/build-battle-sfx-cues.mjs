import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicCueCatalog } from "./battle-sfx-catalog.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cuePath = path.join(projectRoot, "public", "audio", "battle", "cues.json");
const expected = `${JSON.stringify(createPublicCueCatalog(), null, 2)}\n`;

if (process.argv.includes("--check")) {
  const actual = await readFile(cuePath, "utf8");
  if (actual !== expected) {
    throw new Error("public/audio/battle/cues.json is out of date. Run pnpm build:sfx-cues.");
  }
  console.log("Battle sound cue catalog is up to date.");
} else {
  const temporaryPath = `${cuePath}.tmp`;
  await writeFile(temporaryPath, expected, "utf8");
  await rename(temporaryPath, cuePath);
  console.log("Updated public/audio/battle/cues.json.");
}
