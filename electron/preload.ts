import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("ovoDesktop", {
  version: "0.1.0",
  auth: {
    openLoginWindow: async () => ({ ok: false, message: "登录窗口将在下一阶段接入" }),
    clearSession: async () => ({ ok: true })
  }
});
