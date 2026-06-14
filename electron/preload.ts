import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("ovoDesktop", {
  version: "0.1.0"
});
