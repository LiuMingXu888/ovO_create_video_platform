const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ovoDesktop", {
  version: "0.1.0",
  auth: {
    openLoginWindow: () => ipcRenderer.invoke("ovo:auth:open-login-window"),
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
    saveAssets: (input: { assets: Array<{ url: string; fileName: string }> }) => ipcRenderer.invoke("ovo:file:save-assets", input)
  }
});
