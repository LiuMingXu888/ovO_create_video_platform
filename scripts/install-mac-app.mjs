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

fs.rmSync(appPath, { recursive: true, force: true });
fs.mkdirSync(resourcesDir, { recursive: true });
fs.mkdirSync(macosDir, { recursive: true });
fs.mkdirSync(iconsetDir, { recursive: true });

const svgPath = path.join(resourcesDir, "ovO.svg");
fs.writeFileSync(svgPath, createLogoSvg(), "utf8");

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

function createLogoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="146" x2="878" y1="118" y2="906" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ff6b6b"/>
      <stop offset="0.52" stop-color="#e32934"/>
      <stop offset="1" stop-color="#9f101d"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="42" stdDeviation="42" flood-color="#7e0710" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" rx="228" fill="url(#bg)"/>
  <circle cx="512" cy="512" r="366" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="34"/>
  <g filter="url(#shadow)">
    <text x="512" y="592" fill="#ffffff" font-family="Arial Rounded MT Bold, Avenir Next, Arial, sans-serif" font-size="246" font-weight="800" letter-spacing="4" text-anchor="middle">ovO</text>
    <circle cx="512" cy="424" r="25" fill="#ffffff"/>
  </g>
</svg>
`;
}
