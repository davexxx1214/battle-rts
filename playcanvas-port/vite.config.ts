import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const portRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  publicDir: resolve(portRoot, "../public"),
  server: {
    host: "127.0.0.1",
    port: 5175,
    fs: {
      allow: [resolve(portRoot, "..")],
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        ".npmrc",
        ".yarnrc.yml",
        "**/.git/**",
        "config.yaml",
        "**/config.yaml"
      ]
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4175
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
