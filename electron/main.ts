import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkSession,
  clearSession,
  inspectCanvas,
  openLoginWindow,
  requestCompanyApi,
  saveAssetToDownloads,
  saveAssetsToDownloads,
  uploadCompanyFile
} from "./companySession.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const devServerUrl = process.env.VITE_DEV_SERVER_URL;

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 1000,
    minWidth: 1180,
    minHeight: 760,
    title: "ovO Create Video",
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
  ipcMain.handle("ovo:auth:open-login-window", (_event, targetUrl?: string) => openLoginWindow(targetUrl));
  ipcMain.handle("ovo:auth:check-session", () => checkSession());
  ipcMain.handle("ovo:auth:clear-session", () => clearSession());
  ipcMain.handle("ovo:discovery:inspect-canvas", (_event, canvasUrl: string) => inspectCanvas(canvasUrl));
  ipcMain.handle("ovo:company-api:request", (_event, pathname: string, options) => requestCompanyApi(pathname, options));
  ipcMain.handle("ovo:company-api:upload-file", (_event, pathname: string, input) => uploadCompanyFile(pathname, input));
  ipcMain.handle("ovo:file:save-asset", (_event, input: { url: string; fileName: string }) => saveAssetToDownloads(input));
  ipcMain.handle("ovo:file:save-assets", (_event, input: { assets: Array<{ url: string; fileName: string }> }) =>
    saveAssetsToDownloads(input)
  );

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
