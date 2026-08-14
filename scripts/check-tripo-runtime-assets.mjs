import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TRIPO_ASSETS } from "./tripo-asset-catalog.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "public", "assets", "generated", "tripo");
const manifestPath = path.join(outputRoot, "manifest.json");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function resolveOutputPath(relativePath) {
  const resolved = path.resolve(outputRoot, relativePath);
  if (resolved === outputRoot || !resolved.startsWith(`${outputRoot}${path.sep}`)) {
    throw new Error(`Asset path escapes the generated model directory: ${relativePath}`);
  }
  return resolved;
}

function inspectGlbNodes(buffer, label) {
  if (buffer.byteLength < 20 || buffer.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`${label}: runtime model is not a valid GLB container.`);
  }
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== 0x4e4f534a || 20 + jsonLength > buffer.byteLength) {
    throw new Error(`${label}: runtime model does not contain a valid JSON chunk.`);
  }
  const document = JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString("utf8").replaceAll(String.fromCharCode(0), "").trim(),
  );
  const nodes = new Map();
  for (const node of document.nodes ?? []) {
    if (!node.name) continue;
    const primitives = document.meshes?.[node.mesh]?.primitives ?? [];
    const bounds = primitives
      .map((primitive) => document.accessors?.[primitive.attributes?.POSITION])
      .filter((accessor) => accessor?.min && accessor?.max);
    if (bounds.length === 0) {
      nodes.set(node.name, null);
      continue;
    }
    const minimum = [0, 1, 2].map((axis) => Math.min(...bounds.map(({ min }) => min[axis])));
    const maximum = [0, 1, 2].map((axis) => Math.max(...bounds.map(({ max }) => max[axis])));
    nodes.set(node.name, {
      size: maximum.map((value, axis) => value - minimum[axis]),
      pivotCenter: maximum.map((value, axis) => (value + minimum[axis]) / 2),
    });
  }
  return nodes;
}

function validatePartContract(assetId, nodes, contract) {
  const geometry = nodes.get(contract.node);
  if (geometry === undefined) {
    throw new Error(`${assetId}: runtime model is missing ${contract.semantic} node ${contract.node}.`);
  }
  if (geometry === null) {
    throw new Error(`${assetId}: ${contract.semantic} node has no POSITION bounds.`);
  }
  for (let axis = 0; axis < 3; axis += 1) {
    const size = geometry.size[axis];
    if (size < contract.localSizeMin[axis] || size > contract.localSizeMax[axis]) {
      throw new Error(
        `${assetId}: ${contract.semantic} geometry no longer matches its expected local shape.`,
      );
    }
    if (Math.abs(geometry.pivotCenter[axis]) > contract.pivotCenterAbsMax[axis]) {
      throw new Error(
        `${assetId}: ${contract.semantic} pivot is too far from its expected rotation center.`,
      );
    }
  }
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
for (const asset of TRIPO_ASSETS) {
  if (!asset.runtime) continue;
  const entry = manifest.entries.find(({ id }) => id === asset.id);
  const sourceRecord = asset.runtime.sourceStage === "texture" ? entry?.texture : entry;
  const sourceFile = sourceRecord?.files?.model;
  const runtime = entry?.runtime;
  if (!sourceFile || !runtime) throw new Error(`${asset.id}: runtime manifest entry is missing.`);
  if (runtime.path !== asset.runtime.path || runtime.sourceStage !== asset.runtime.sourceStage) {
    throw new Error(`${asset.id}: runtime manifest mapping is stale.`);
  }
  if (runtime.sha256 !== sourceFile.sha256 || runtime.bytes !== sourceFile.bytes) {
    throw new Error(`${asset.id}: runtime manifest does not match its source artifact.`);
  }
  const runtimeBuffer = await readFile(resolveOutputPath(runtime.path));
  if (runtimeBuffer.byteLength !== runtime.bytes || sha256(runtimeBuffer) !== runtime.sha256) {
    throw new Error(`${asset.id}: runtime asset failed integrity verification.`);
  }
  if (asset.runtime.partContracts) {
    const nodes = inspectGlbNodes(runtimeBuffer, asset.id);
    for (const contract of asset.runtime.partContracts) {
      validatePartContract(asset.id, nodes, contract);
    }
  }
}

console.log("Tripo runtime model aliases are present and verified.");
