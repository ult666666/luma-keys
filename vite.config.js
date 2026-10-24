import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { devBuildIdentity } from "./scripts/dev-build-identity.mjs";
export default defineConfig({
  plugins: [react(), devBuildIdentity()],
  server: {
    port: 5188,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:5189" },
    watch: {
      ignored: [
        "**/.qa-runs/**",
        "**/Library/**",
        "**/Exports/**",
        "**/evidence/**",
        "**/release/**",
      ],
    },
  },
  build: { chunkSizeWarningLimit: 1600 },
});
