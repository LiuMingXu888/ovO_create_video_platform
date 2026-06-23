import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Electron preload build contract", () => {
  it("keeps the preload source CommonJS-compatible for Electron's sandboxed preload runtime", () => {
    const preloadSource = fs.readFileSync(path.join(process.cwd(), "electron/preload.cts"), "utf8");

    expect(preloadSource).not.toContain("import ");
    expect(preloadSource).not.toContain("export ");
    expect(preloadSource).toContain('require("electron")');
  });

  it("builds preload output without ESM syntax when dist-electron exists", () => {
    const builtPreloadPath = path.join(process.cwd(), "dist-electron/preload.cjs");
    if (!fs.existsSync(builtPreloadPath)) {
      return;
    }

    const builtPreload = fs.readFileSync(builtPreloadPath, "utf8");

    expect(builtPreload).not.toContain("import ");
    expect(builtPreload).not.toContain("export ");
    expect(builtPreload).toContain('require("electron")');
  });

  it("exposes a sandbox-safe updater bridge", () => {
    const preloadSource = fs.readFileSync(path.join(process.cwd(), "electron/preload.cts"), "utf8");

    expect(preloadSource).toContain("updater:");
    expect(preloadSource).toContain("getCurrentVersion");
    expect(preloadSource).toContain('ipcRenderer.invoke("ovo:updater:get-current-version")');
    expect(preloadSource).toContain('ipcRenderer.invoke("ovo:updater:check-for-updates")');
    expect(preloadSource).toContain('ipcRenderer.invoke("ovo:updater:download-update")');
    expect(preloadSource).toContain('ipcRenderer.invoke("ovo:updater:install-update")');
    expect(preloadSource).toContain('ipcRenderer.on("ovo:updater:progress"');
    expect(preloadSource).toContain("localStore:");
    expect(preloadSource).toContain('ipcRenderer.invoke("ovo:local-store:read"');
    expect(preloadSource).toContain('ipcRenderer.invoke("ovo:local-store:write"');
  });
});
