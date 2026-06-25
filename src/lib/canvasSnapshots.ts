import type { CanvasAsset } from "../types";

export interface SnapshotEntry {
  id: string;
  createdAt: string;
  projectId: string;
  canvasName: string;
  canvasUrl: string;
  assets: CanvasAsset[];
  canvasSnapshot: unknown;
  assetCount: number;
}

export interface SnapshotMeta {
  id: string;
  createdAt: string;
  canvasName: string;
  assetCount: number;
}

export function buildSnapshotEntry(
  input: Omit<SnapshotEntry, "id" | "createdAt" | "assetCount">,
  now: Date
): SnapshotEntry {
  const createdAt = now.toISOString();
  const id = createdAt.replace(/[:.]/g, "-");
  return { ...input, id, createdAt, assetCount: input.assets.length };
}

export function formatSnapshotTimestamp(createdAt: string): string {
  const d = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
