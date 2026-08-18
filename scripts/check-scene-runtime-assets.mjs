import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kenneyRoot = path.join(projectRoot, "public", "assets", "kenney");
const kaykitRoot = path.join(projectRoot, "public", "assets", "kaykit", "medieval-hex");
const kaykitDungeonRoot = path.join(projectRoot, "public", "assets", "kaykit", "dungeon");
const kaykitHalloweenRoot = path.join(projectRoot, "public", "assets", "kaykit", "halloween");
const kaykitSkeletonRoot = path.join(projectRoot, "public", "assets", "kaykit", "skeletons");
const threeJsDungeonRoot = path.join(
  projectRoot,
  "public",
  "assets",
  "threejsassets",
  "dungeon",
);
const battleCharacterRoot = path.join(
  projectRoot,
  "public",
  "assets",
  "kaykit",
  "adventurers",
  "characters",
  "battle",
);
const mediumRigAnimationRoot = path.join(
  projectRoot,
  "public",
  "assets",
  "kaykit",
  "character-animations",
  "rig-medium",
);
const battleFxRoot = path.join(projectRoot, "public", "assets", "fx", "battle");
const battleFxManifestPath = path.join(
  projectRoot,
  "src",
  "scene",
  "effects",
  "battleFxManifest.json",
);
const battleCharacterAttachments = {
  "Knight_Battle.glb": [
    ["handslot.l", "shield_round_color"],
    ["handslot.r", "sword_1handed"],
  ],
  "Ranger_Battle.glb": [["handslot.l", "bow_withString"]],
  "Mage_Battle.glb": [["handslot.r", "staff"]],
};

for (const modelPath of await findFiles(kenneyRoot, ".glb")) {
  const document = readGlbDocument(await readFile(modelPath), modelPath);
  await verifyExternalResources(document, modelPath, kenneyRoot);
}

for (const modelPath of await findFiles(kaykitRoot, ".gltf")) {
  const document = JSON.parse(await readFile(modelPath, "utf8"));
  await verifyExternalResources(document, modelPath, kaykitRoot);
}

for (const assetRoot of [
  kaykitDungeonRoot,
  kaykitHalloweenRoot,
  kaykitSkeletonRoot,
]) {
  for (const modelPath of await findFiles(assetRoot, ".gltf")) {
    const document = JSON.parse(await readFile(modelPath, "utf8"));
    await verifyExternalResources(document, modelPath, assetRoot);
  }
}

for (const modelPath of await findFiles(threeJsDungeonRoot, ".glb")) {
  const document = readGlbDocument(await readFile(modelPath), modelPath);
  await verifyExternalResources(document, modelPath, threeJsDungeonRoot);
}

const animatedNodes = new Set();
for (const animationPath of await findFiles(mediumRigAnimationRoot, ".glb")) {
  const document = readGlbDocument(await readFile(animationPath), animationPath);
  for (const animation of document.animations ?? []) {
    for (const channel of animation.channels ?? []) {
      const nodeName = document.nodes?.[channel.target?.node]?.name;
      if (nodeName) animatedNodes.add(nodeName);
    }
  }
}

for (const [fileName, attachments] of Object.entries(battleCharacterAttachments)) {
  const modelPath = path.join(battleCharacterRoot, fileName);
  const document = readGlbDocument(await readFile(modelPath), modelPath);
  verifyAttachments(document, attachments, modelPath);
  verifyAnimationRig(document, animatedNodes, modelPath);
}

for (const modelPath of await findFiles(path.join(kaykitSkeletonRoot, "characters"), ".glb")) {
  const document = readGlbDocument(await readFile(modelPath), modelPath);
  verifyAnimationRig(document, animatedNodes, modelPath);
}

const battleFxManifest = JSON.parse(await readFile(battleFxManifestPath, "utf8"));
for (const frameUrls of Object.values(battleFxManifest)) {
  if (!Array.isArray(frameUrls) || frameUrls.length !== 6) {
    throw new Error(`${battleFxManifestPath}: every battle FX sequence must contain six frames.`);
  }
  for (const frameUrl of frameUrls) {
    if (typeof frameUrl !== "string" || !frameUrl.startsWith("/assets/fx/battle/")) {
      throw new Error(`${battleFxManifestPath}: invalid battle FX frame URL.`);
    }
    const framePath = path.resolve(projectRoot, "public", frameUrl.slice(1));
    if (!framePath.startsWith(`${battleFxRoot}${path.sep}`)) {
      throw new Error(`${frameUrl}: battle FX frame path escapes its runtime asset directory.`);
    }
    verifyBattleFxFrame(await readFile(framePath), framePath);
  }
}

console.log(
  "Scene models, resources, character rigs, and battle FX frames are verified.",
);

async function findFiles(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findFiles(entryPath, extension));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) files.push(entryPath);
  }
  return files;
}

async function verifyExternalResources(document, modelPath, assetRoot) {
  const resources = [
    ...(document.images ?? []).map(({ uri }) => ({ kind: "texture", uri })),
    ...(document.buffers ?? []).map(({ uri }) => ({ kind: "buffer", uri })),
  ];
  for (const { kind, uri } of resources) {
    if (!uri || uri.startsWith("data:")) continue;
    const resourcePath = path.resolve(path.dirname(modelPath), decodeURIComponent(uri));
    if (!resourcePath.startsWith(`${assetRoot}${path.sep}`)) {
      throw new Error(`${modelPath}: ${kind} path escapes its runtime asset directory.`);
    }
    try {
      await access(resourcePath);
    } catch {
      throw new Error(`${modelPath}: missing referenced ${kind} ${uri}.`);
    }
  }
}

function verifyAttachments(document, attachments, modelPath) {
  const nodes = document.nodes ?? [];
  for (const [slotName, equipmentName] of attachments) {
    const slot = nodes.find(({ name }) => name === slotName);
    const childNames = slot?.children?.map((index) => nodes[index]?.name) ?? [];
    if (!childNames.includes(equipmentName)) {
      throw new Error(`${modelPath}: ${equipmentName} is not attached to ${slotName}.`);
    }
  }
}

function verifyAnimationRig(document, animatedNodes, modelPath) {
  const modelNodes = new Set((document.nodes ?? []).map(({ name }) => name));
  const missingNodes = [...animatedNodes].filter((nodeName) => !modelNodes.has(nodeName));
  if (missingNodes.length > 0) {
    throw new Error(`${modelPath}: missing animated rig nodes: ${missingNodes.join(", ")}.`);
  }
}

function verifyBattleFxFrame(buffer, framePath) {
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.byteLength < 24 || buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error(`${framePath}: battle FX frame is not a valid PNG.`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width < 124 || width > 126 || height !== 150) {
    throw new Error(`${framePath}: unexpected FX frame dimensions ${width}x${height}.`);
  }
}

function readGlbDocument(buffer, label) {
  if (buffer.byteLength < 20 || buffer.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`${label}: runtime model is not a valid GLB container.`);
  }
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== 0x4e4f534a || 20 + jsonLength > buffer.byteLength) {
    throw new Error(`${label}: runtime model does not contain a valid JSON chunk.`);
  }
  return JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString("utf8").replaceAll("\0", "").trim(),
  );
}
