import { readdir, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = path.join(projectRoot, "public", "assets");
const tripoRoot = path.join(assetRoot, "generated", "tripo");
const apply = process.argv.includes("--apply");

const retainedTripoIds = new Set([
  "mobile-catapult",
  "undead-shipwreck",
  "undead-frost-bone-dragon",
]);
const unusedTripoIds = [
  "siege-workshop",
  "undead-banner",
  "undead-bone-pile",
  "undead-cemetery-cluster-a",
  "undead-cemetery-cluster-b",
  "undead-cemetery-cluster-c",
  "undead-cemetery-fence-corner",
  "undead-cemetery-fence-gate",
  "undead-cemetery-fence-straight",
  "undead-crypt-barracks",
  "undead-dead-tree-a",
  "undead-dead-tree-b",
  "undead-gothic-tombstone-a",
  "undead-gothic-tombstone-b",
  "undead-gothic-tombstone-c",
  "undead-necropolis",
  "undead-skull-spire",
  "undead-soul-brazier",
  "undead-soul-mine",
  "undead-soul-obelisk",
  "undead-stone-sarcophagus",
];

const halloweenKeep = new Set([
  "arch",
  "arch_gate",
  "bench_decorated",
  "bone_A",
  "bone_B",
  "coffin_decorated",
  "crypt",
  "fence_gate",
  "fence_pillar",
  "fence_seperate",
  "fence_seperate_broken",
  "floor_dirt_small",
  "grave_A",
  "grave_A_destroyed",
  "grave_B",
  "gravemarker_A",
  "gravemarker_B",
  "floor_dirt_grave",
  "gravestone",
  "lantern_standing",
  "post_lantern",
  "post_skull",
  "pumpkin_orange_small",
  "pumpkin_yellow_jackolantern",
  "pumpkin_yellow_small",
  "ribcage",
  "shrine",
  "shrine_candles",
  "skull_candle",
  "tree_dead_large_decorated",
  "tree_dead_medium",
  "tree_dead_small",
  "tree_pine_orange_large",
  "tree_pine_orange_medium",
  "tree_pine_yellow_medium",
  "tree_pine_yellow_small",
]);
const threeJsDungeonKeep = new Set([
  "dun_cursed_crystal",
  "dun_skull_candelabra",
  "dun_stone_altar",
]);

const targets = [
  ...unusedTripoIds.flatMap((id) => [
    path.join(tripoRoot, id),
    path.join(tripoRoot, "runtime", `${id}.glb`),
  ]),
  path.join(tripoRoot, "undead-shipwreck", "model-3ea18b80.glb"),
  path.join(tripoRoot, "undead-shipwreck", "preview-3ea18b80.webp"),
  path.join(assetRoot, "kaykit", "forest"),
];

targets.push(...await unusedSiblingModels(
  path.join(assetRoot, "kaykit", "halloween"),
  halloweenKeep,
  new Set([".gltf", ".bin"]),
));
targets.push(...await unusedSiblingModels(
  path.join(assetRoot, "threejsassets", "dungeon"),
  threeJsDungeonKeep,
  new Set([".glb"]),
));

const realAssetRoot = await realpath(assetRoot);
const existingTargets = [];
for (const target of targets) {
  let realTarget;
  try {
    realTarget = await realpath(target);
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  if (!realTarget.startsWith(`${realAssetRoot}${path.sep}`)) {
    throw new Error(`Cleanup target escapes the asset root: ${realTarget}`);
  }
  existingTargets.push(target);
}

for (const id of retainedTripoIds) {
  await stat(path.join(tripoRoot, "runtime", `${id}.glb`));
}

const bytes = (await Promise.all(existingTargets.map(directorySize)))
  .reduce((sum, value) => sum + value, 0);

if (apply) {
  for (const target of existingTargets) await rm(target, { recursive: true });
}

console.log(
  `${apply ? "Removed" : "Would remove"} ${existingTargets.length} unused model targets `
  + `(${(bytes / 1024 / 1024).toFixed(2)} MiB).`,
);

async function unusedSiblingModels(directory, keep, extensions) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .filter((entry) => extensions.has(path.extname(entry.name)))
    .filter((entry) => !keep.has(path.basename(entry.name, path.extname(entry.name))))
    .map((entry) => path.join(directory, entry.name));
}

async function directorySize(target) {
  const metadata = await stat(target);
  if (metadata.isFile()) return metadata.size;
  const entries = await readdir(target, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => (
    directorySize(path.join(target, entry.name))
  )))).reduce((sum, value) => sum + value, 0);
}
