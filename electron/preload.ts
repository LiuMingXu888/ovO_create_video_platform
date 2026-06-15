import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ovoDesktop", {
  version: "0.1.0",
  auth: {
    openLoginWindow: () => ipcRenderer.invoke("ovo:auth:open-login-window"),
    checkSession: () => ipcRenderer.invoke("ovo:auth:check-session"),
    clearSession: () => ipcRenderer.invoke("ovo:auth:clear-session")
  },
  discovery: {
    inspectCanvas: (canvasUrl: string) => ipcRenderer.invoke("ovo:discovery:inspect-canvas", canvasUrl)
  }
});
