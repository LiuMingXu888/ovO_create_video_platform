import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

function storeDir() {
  return path.join(app.getPath("userData"), "canvas-store");
}

function storeFile(projectId: string) {
  // projectId 来自服务端 id, 仍做基本清洗避免路径穿越。
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(storeDir(), `${safe}.json`);
}

export async function readCanvasStore(projectId: string): Promise<unknown | null> {
  if (!projectId) {
    return null;
  }

  try {
    const raw = await fs.readFile(storeFile(projectId), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeCanvasStore(projectId: string, data: unknown): Promise<{ ok: boolean }> {
  if (!projectId) {
    return { ok: false };
  }

  try {
    await fs.mkdir(storeDir(), { recursive: true });
    await fs.writeFile(storeFile(projectId), JSON.stringify(data), "utf8");
    return { ok: true };
  } catch (error) {
    console.warn("[canvasStore] 写入失败", error);
    return { ok: false };
  }
}
