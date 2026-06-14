import type { AssetCategory, AssetKind, CanvasAsset } from "../types";

interface RawAssetRecord {
  id?: string;
  name?: string;
  title?: string;
  type?: string;
  kind?: string;
  url?: string;
  publicUrl?: string;
  src?: string;
  thumbnailUrl?: string;
  coverUrl?: string;
  durationSeconds?: number;
  duration?: number;
  sizeBytes?: number;
  size?: number;
}

export function normalizeSnapshotAssets(snapshot: unknown): CanvasAsset[] {
  return collectRawAssets(snapshot)
    .map(normalizeRawAsset)
    .filter((asset): asset is CanvasAsset => Boolean(asset));
}

function collectRawAssets(value: unknown): RawAssetRecord[] {
  if (!isRecord(value)) {
    return [];
  }

  const directAssets = value.assets;
  if (Array.isArray(directAssets)) {
    return directAssets.filter(isRecord) as RawAssetRecord[];
  }

  const nodes = value.nodes;
  if (Array.isArray(nodes)) {
    return nodes.filter(isRecord) as RawAssetRecord[];
  }

  return [];
}

function normalizeRawAsset(record: RawAssetRecord): CanvasAsset | null {
  const url = record.url ?? record.publicUrl ?? record.src;
  const kind = normalizeKind(record.kind ?? record.type ?? url);

  if (!url || !kind) {
    return null;
  }

  return {
    id: record.id ?? `${kind}-${url}`,
    name: record.name ?? record.title ?? fallbackName(url),
    kind,
    category: categoryForKind(kind),
    url,
    thumbnailUrl: record.thumbnailUrl ?? record.coverUrl,
    durationSeconds: record.durationSeconds ?? record.duration,
    sizeBytes: record.sizeBytes ?? record.size
  };
}

function normalizeKind(value: unknown): AssetKind | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized.includes("image") || /\.(png|jpe?g|webp)(\?|$)/.test(normalized)) {
    return "image";
  }
  if (normalized.includes("audio") || /\.(mp3|wav)(\?|$)/.test(normalized)) {
    return "audio";
  }
  if (normalized.includes("video") || /\.(mp4|mov)(\?|$)/.test(normalized)) {
    return "video";
  }

  return null;
}

function categoryForKind(kind: AssetKind): AssetCategory {
  if (kind === "image") {
    return "characters";
  }

  return kind;
}

function fallbackName(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const fileName = pathname.split("/").filter(Boolean).at(-1) ?? "asset";
    return decodeURIComponent(fileName).replace(/\.[^.]+$/, "");
  } catch {
    return "asset";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
