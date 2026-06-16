#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const desktopDir = path.join(os.homedir(), "Desktop");
const appPath = path.join(desktopDir, "ovO.app");
const resourcesDir = path.join(appPath, "Contents", "Resources");
const macosDir = path.join(appPath, "Contents", "MacOS");
const iconsetDir = path.join(resourcesDir, "ovO.iconset");
const nodePath = process.execPath;
const launcherPath = path.join(repoRoot, "scripts", "launch-mac.mjs");
const sourceLogoPath = path.join(repoRoot, "resources", "ovO.svg");

fs.rmSync(appPath, { recursive: true, force: true });
fs.mkdirSync(resourcesDir, { recursive: true });
fs.mkdirSync(macosDir, { recursive: true });
fs.mkdirSync(iconsetDir, { recursive: true });

const svgPath = path.join(resourcesDir, "ovO.svg");
fs.copyFileSync(sourceLogoPath, svgPath);

for (const size of [16, 32, 128, 256, 512]) {
  renderPng(svgPath, path.join(iconsetDir, `icon_${size}x${size}.png`), size);
  renderPng(svgPath, path.join(iconsetDir, `icon_${size}x${size}@2x.png`), size * 2);
}

execFileSync("iconutil", ["-c", "icns", iconsetDir, "-o", path.join(resourcesDir, "ovO.icns")], { stdio: "inherit" });
fs.rmSync(iconsetDir, { recursive: true, force: true });

fs.writeFileSync(path.join(appPath, "Contents", "Info.plist"), createInfoPlist(), "utf8");
fs.writeFileSync(path.join(macosDir, "ovO"), createLauncherShell(nodePath, launcherPath), { mode: 0o755 });

console.log(`已安装到 ${appPath}`);

function renderPng(input, output, size) {
  execFileSync("sips", ["-s", "format", "png", "-z", String(size), String(size), input, "--out", output], {
    stdio: "ignore"
  });
}

function createLauncherShell(nodeExecutable, launcher) {
  return `#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:${path.dirname(nodeExecutable)}:$PATH"
LOG_DIR="$HOME/Library/Logs/ovO"
mkdir -p "$LOG_DIR"
echo "----- $(date '+%Y-%m-%d %H:%M:%S') ovO launcher start -----" >> "$LOG_DIR/launcher.log"
exec "${nodeExecutable}" "${launcher}" >> "$LOG_DIR/launcher.log" 2>&1
`;
}

function createInfoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>ovO</string>
  <key>CFBundleIconFile</key>
  <string>ovO</string>
  <key>CFBundleIdentifier</key>
  <string>cn.kjjhz.ovo.local-launcher</string>
  <key>CFBundleName</key>
  <string>ovO</string>
  <key>CFBundleDisplayName</key>
  <string>ovO</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.15</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
}
