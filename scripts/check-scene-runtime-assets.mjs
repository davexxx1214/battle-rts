import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kenneyRoot = path.join(projectRoot, "public", "assets", "kenney");

for (const modelPath of await findGlbFiles(kenneyRoot)) {
  const document = readGlbDocument(await readFile(modelPath), modelPath);
  for (const image of document.images ?? []) {
    if (!image.uri || image.uri.startsWith("data:")) continue;
    const texturePath = path.resolve(path.dirname(modelPath), decodeURIComponent(image.uri));
    if (!texturePath.startsWith(`${kenneyRoot}${path.sep}`)) {
      throw new Error(`${modelPath}: texture path escapes the Kenney runtime asset directory.`);
    }
    try {
      await access(texturePath);
    } catch {
      throw new Error(`${modelPath}: missing referenced texture ${image.uri}.`);
    }
  }
}

console.log("Kenney runtime model textures are present and verified.");

async function findGlbFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findGlbFiles(entryPath));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".glb")) files.push(entryPath);
  }
  return files;
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
