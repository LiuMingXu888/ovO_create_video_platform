import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

// 与 src/lib/canvasSnapshots.ts 同步的精简类型（electron 编译边界隔离，不跨目录 import）
interface SnapshotEntry {
  id: string;
  createdAt: string;
  projectId: string;
  canvasName: string;
  canvasUrl: string;
  assets: unknown[];
  canvasSnapshot: unknown;
  assetCount: number;
}

interface SnapshotMeta {
  id: string;
  createdAt: string;
  canvasName: string;
  assetCount: number;
}

const MAX_SNAPSHOTS = 6;

function safeId(projectId: string) {
  return projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function snapshotFile(projectId: string) {
  const dir = path.join(app.getPath("userData"), "canvas-snapshots");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${safeId(projectId)}.json`);
}

function readEntries(projectId: string): SnapshotEntry[] {
  try {
    const raw = JSON.parse(fs.readFileSync(snapshotFile(projectId), "utf-8")) as { entries?: SnapshotEntry[] };
    return raw.entries ?? [];
  } catch {
    return [];
  }
}

function toMeta(e: SnapshotEntry): SnapshotMeta {
  return { id: e.id, createdAt: e.createdAt, canvasName: e.canvasName, assetCount: e.assetCount };
}

export function listSnapshots(projectId: string): SnapshotMeta[] {
  return readEntries(projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toMeta);
}

export function getSnapshot(projectId: string, id: string): SnapshotEntry | null {
  return readEntries(projectId).find((e) => e.id === id) ?? null;
}

// 串行写队列，防止 auto/manual/quit 并发读-改-写互相覆盖
let writeQueue: Promise<void> = Promise.resolve();

export function appendSnapshot(projectId: string, entry: SnapshotEntry): Promise<SnapshotMeta[]> {
  writeQueue = writeQueue.then(() => {
    const entries = readEntries(projectId);
    entries.push(entry);
    entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const trimmed = entries.slice(-MAX_SNAPSHOTS);
    fs.writeFileSync(snapshotFile(projectId), JSON.stringify({ entries: trimmed }));
  });
  return writeQueue.then(() =>
    readEntries(projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toMeta)
  );
}
