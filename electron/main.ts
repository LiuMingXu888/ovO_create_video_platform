import { app, BrowserWindow, dialog, ipcMain } from "electron";
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
import { appendSnapshot, getSnapshot, listSnapshots } from "./canvasSnapshotStore.js";
import { createGiteeReleaseUpdater } from "./giteeReleaseUpdater.js";
import { readAppSettings, writeAppSettings } from "./appSettingsStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const appIconPath = path.join(__dirname, "../resources/ovO.png");

let mainWindow: BrowserWindow | null = null;

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

  mainWindow = window;
  window.on("closed", () => { if (mainWindow === window) mainWindow = null; });

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

  ipcMain.handle("ovo:snapshot:list", (_e, projectId: string) => listSnapshots(projectId));
  ipcMain.handle("ovo:snapshot:append", (_e, projectId: string, entry: unknown) => appendSnapshot(projectId, entry as Parameters<typeof appendSnapshot>[1]));
  ipcMain.handle("ovo:snapshot:get", (_e, projectId: string, id: string) => getSnapshot(projectId, id));

  ipcMain.handle("ovo:settings:get", () => readAppSettings());
  ipcMain.handle("ovo:settings:set", (_e, input: { downloadDir: string }) => writeAppSettings({ downloadDir: typeof input?.downloadDir === "string" ? input.downloadDir : "" }));
  ipcMain.handle("ovo:dialog:select-folder", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }
    return { canceled: false, path: result.filePaths[0] };
  });

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

// 退出前向主窗口发 flush，等渲染端存完快照再真正退出（1.5s 超时兜底）
let quitFlushed = false;
app.on("before-quit", (event) => {
  if (quitFlushed) return;
  const win = mainWindow;
  if (!win || win.isDestroyed()) { quitFlushed = true; return; }
  event.preventDefault();
  const timer = setTimeout(() => { quitFlushed = true; app.quit(); }, 1500);
  ipcMain.once("ovo:snapshot:flush-done", () => {
    clearTimeout(timer);
    quitFlushed = true;
    app.quit();
  });
  win.webContents.send("ovo:snapshot:flush");
});
