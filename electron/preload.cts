const { contextBridge, ipcRenderer } = require("electron");

type SaveAssetInput = {
  url: string;
  fileName: string;
  category?: string;
  categoryLabel?: string;
};

contextBridge.exposeInMainWorld("ovoDesktop", {
  version: "0.1.12",
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
    inspectCanvas: (canvasUrl: string) => ipcRenderer.invoke("ovo:discovery:inspect-canvas", canvasUrl),
    openCanvas: (canvasUrl: string, mode: "plain" | "devtools" | "capture") =>
      ipcRenderer.invoke("ovo:canvas:open", canvasUrl, mode)
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
  },
  settings: {
    get: () => ipcRenderer.invoke("ovo:settings:get"),
    set: (input: { downloadDir: string }) => ipcRenderer.invoke("ovo:settings:set", input)
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke("ovo:dialog:select-folder")
  },
  localStore: {
    read: (projectId: string) => ipcRenderer.invoke("ovo:local-store:read", projectId),
    write: (projectId: string, data: unknown) => ipcRenderer.invoke("ovo:local-store:write", projectId, data)
  },
  snapshots: {
    list: (projectId: string) => ipcRenderer.invoke("ovo:snapshot:list", projectId),
    append: (projectId: string, entry: unknown) => ipcRenderer.invoke("ovo:snapshot:append", projectId, entry),
    get: (projectId: string, id: string) => ipcRenderer.invoke("ovo:snapshot:get", projectId, id),
    onFlush: (listener: () => void) => {
      const handler = () => listener();
      ipcRenderer.on("ovo:snapshot:flush", handler);
      return () => ipcRenderer.removeListener("ovo:snapshot:flush", handler);
    },
    sendFlushDone: () => ipcRenderer.send("ovo:snapshot:flush-done")
  }
});
