import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkSession,
  clearSession,
  inspectCanvas,
  openCanvasWindow,
  openLoginWindow,
  requestCompanyApi,
  saveAssetToDownloads,
  saveAssetsToDownloads,
  uploadCompanyFile
} from "./companySession.js";
import type { SaveAssetInput } from "./downloadPaths.js";
import { readCanvasStore, writeCanvasStore } from "./canvasStore.js";
import { createGiteeReleaseUpdater } from "./giteeReleaseUpdater.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const appIconPath = path.join(__dirname, "../resources/ovO.png");

app.setName("ovO");

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 1000,
    minWidth: 1180,
    minHeight: 760,
    title: "ovO",
    icon: appIconPath,
    backgroundColor: "#f7f8fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    app.dock?.setIcon(appIconPath);
  }

  ipcMain.handle("ovo:auth:open-login-window", (_event, targetUrl?: string) => openLoginWindow(targetUrl));
  ipcMain.handle("ovo:auth:check-session", () => checkSession());
  ipcMain.handle("ovo:auth:clear-session", () => clearSession());
  ipcMain.handle("ovo:discovery:inspect-canvas", (_event, canvasUrl: string) => inspectCanvas(canvasUrl));
  ipcMain.handle("ovo:canvas:open", (_event, canvasUrl: string, mode: "plain" | "devtools" | "capture") =>
    openCanvasWindow(canvasUrl, mode)
  );
  ipcMain.handle("ovo:company-api:request", (_event, pathname: string, options) => requestCompanyApi(pathname, options));
  ipcMain.handle("ovo:company-api:upload-file", (_event, pathname: string, input) => uploadCompanyFile(pathname, input));
  ipcMain.handle("ovo:file:save-asset", (_event, input: { url: string; fileName: string }) => saveAssetToDownloads(input));
  ipcMain.handle("ovo:file:save-assets", (_event, input: { assets: SaveAssetInput[] }) =>
    saveAssetsToDownloads(input)
  );
  ipcMain.handle("ovo:local-store:read", (_event, projectId: string) => readCanvasStore(projectId));
  ipcMain.handle("ovo:local-store:write", (_event, projectId: string, data: unknown) =>
    writeCanvasStore(projectId, data)
  );

  const updater = createGiteeReleaseUpdater({
    onProgress: (progress) => {
      for (const browserWindow of BrowserWindow.getAllWindows()) {
        browserWindow.webContents.send("ovo:updater:progress", progress);
      }
    }
  });

  ipcMain.handle("ovo:updater:get-current-version", () => app.getVersion());
  ipcMain.handle("ovo:updater:check-for-updates", () => updater.checkForUpdates());
  ipcMain.handle("ovo:updater:download-update", () => updater.downloadUpdate());
  ipcMain.handle("ovo:updater:install-update", () => updater.installUpdate());

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && !devServerUrl) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
