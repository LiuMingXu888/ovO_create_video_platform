import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**"]
  },
  build: {
    outDir: "dist"
  }
});
