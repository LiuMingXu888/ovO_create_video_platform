#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLauncher } from "./launcherCore.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const launcher = createLauncher({
  cwd: repoRoot,
  env: process.env,
  port: 5173,
  debugPort: process.env.OVO_DEBUG_PORT ? Number(process.env.OVO_DEBUG_PORT) : 9333
});

try {
  const code = await launcher.launch();
  process.exit(code);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
