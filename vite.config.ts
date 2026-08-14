import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        ".npmrc",
        ".yarnrc.yml",
        "**/.git/**",
        "config.yaml",
        "**/config.yaml",
      ],
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4174,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
