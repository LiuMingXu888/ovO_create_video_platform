import path from "node:path";

export interface StoragePaths {
  rootDir: string;
  authDir: string;
  storageStatePath: string;
  apiDir: string;
  capturesDir: string;
  sanitizedApiMapPath: string;
  assetsDir: string;
  outputsDir: string;
}

export function createStoragePaths(rootDir: string): StoragePaths {
  const authDir = path.join(rootDir, "auth");
  const apiDir = path.join(rootDir, "api");

  return {
    rootDir,
    authDir,
    storageStatePath: path.join(authDir, "storage-state.json"),
    apiDir,
    capturesDir: path.join(apiDir, "captures"),
    sanitizedApiMapPath: path.join(apiDir, "sanitized-api-map.json"),
    assetsDir: path.join(rootDir, "assets"),
    outputsDir: path.join(rootDir, "outputs")
  };
}
