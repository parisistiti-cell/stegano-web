import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

// GitHub Pages project sites are served from https://<user>.github.io/<repo>/,
// so the build needs a matching `base`. The deploy workflow sets
// GITHUB_REPOSITORY automatically; override with VITE_BASE_PATH if you deploy
// elsewhere (e.g. a custom domain, where the base should stay "/").
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const basePath = process.env.VITE_BASE_PATH ?? (repoName ? `/${repoName}/` : "/");

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false,
    host: true,
  },
});
