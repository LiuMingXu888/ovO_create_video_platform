const { contextBridge, ipcRenderer } = require("electron");

type SaveAssetInput = {
  url: string;
  fileName: string;
  category?: string;
  categoryLabel?: string;
};

contextBridge.exposeInMainWorld("ovoDesktop", {
  version: "0.1.0",
  updater: {
    getCurrentVersion: () => ipcRenderer.invoke("ovo:updater:get-current-version"),
    checkForUpdates: () => ipcRenderer.invoke("ovo:updater:check-for-updates"),
    downloadUpdate: () => ipcRenderer.invoke("ovo:updater:download-update"),
    installUpdate: () => ipcRenderer.invoke("ovo:updater:install-update"),
    onProgress: (listener: (progress: { percent: number; transferred: number; total?: number }) => void) => {
      const handler = (_event: unknown, progress: { percent: number; transferred: number; total?: number }) => {
        listener(progress);
      };
      ipcRenderer.on("ovo:updater:progress", handler);
      return () => ipcRenderer.removeListener("ovo:updater:progress", handler);
    }
  },
  auth: {
    openLoginWindow: (targetUrl?: string) => ipcRenderer.invoke("ovo:auth:open-login-window", targetUrl),
    checkSession: () => ipcRenderer.invoke("ovo:auth:check-session"),
    clearSession: () => ipcRenderer.invoke("ovo:auth:clear-session")
  },
  discovery: {
    inspectCanvas: (canvasUrl: string) => ipcRenderer.invoke("ovo:discovery:inspect-canvas", canvasUrl)
  },
  api: {
    request: (
      path: string,
      options?: {
        method?: "GET" | "POST" | "PUT" | "DELETE";
        body?: unknown;
        headers?: Record<string, string>;
      }
    ) => ipcRenderer.invoke("ovo:company-api:request", path, options),
    uploadFile: async (
      path: string,
      input: { fileName: string; mimeType?: string; bytes: ArrayBuffer; prefix: string; projectId?: string }
    ) => ipcRenderer.invoke("ovo:company-api:upload-file", path, input)
  },
  file: {
    saveAsset: (input: { url: string; fileName: string }) => ipcRenderer.invoke("ovo:file:save-asset", input),
    saveAssets: (input: { assets: SaveAssetInput[] }) => ipcRenderer.invoke("ovo:file:save-assets", input)
  }
});
