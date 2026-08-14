export function readTripoKey(configText) {
  const match = configText.match(/^\s*tripo_key\s*:\s*(.+?)\s*$/m);
  if (!match) throw new Error("config.yaml does not contain tripo_key.");
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

export function validateTripoMediaUrl(value) {
  const parsedUrl = value instanceof URL ? value : new URL(value);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Tripo media URL must use HTTPS.");
  }
  const hostname = parsedUrl.hostname.toLowerCase();
  const isOfficialHost = ["tripo3d.ai", "tripo3d.com"]
    .some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  if (!isOfficialHost) {
    throw new Error("Media URL was not returned from a Tripo domain.");
  }
  return parsedUrl;
}
