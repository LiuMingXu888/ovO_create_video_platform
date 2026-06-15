import type { AssetCategory, AssetKind, CanvasAsset } from "../types";

interface RawAssetRecord {
  id?: string;
  name?: string;
  title?: string;
  label?: string;
  type?: string;
  kind?: string;
  url?: string;
  publicUrl?: string;
  src?: string;
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  providerVideoUrl?: string;
  seedanceProviderUrl?: string;
  assetUri?: string;
  thumbnailUrl?: string;
  coverUrl?: string;
  posterUrl?: string;
  durationSeconds?: number;
  duration?: number;
  sizeBytes?: number;
  size?: number;
  assetId?: string;
  data?: unknown;
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
    return nodes.filter(isRecord).map(flattenNodeRecord);
  }

  return [];
}

function normalizeRawAsset(record: RawAssetRecord): CanvasAsset | null {
  const url = getRecordUrl(record);
  const kind = normalizeKind(record.kind ?? record.type ?? url);

  if (!url || !kind) {
    return null;
  }

  return {
    id: record.assetId ?? record.id ?? `${kind}-${url}`,
    name: record.name ?? record.title ?? record.label ?? fallbackName(url),
    kind,
    category: categoryForKind(kind),
    url,
    thumbnailUrl: record.thumbnailUrl ?? record.coverUrl ?? record.posterUrl,
    durationSeconds: record.durationSeconds ?? record.duration,
    sizeBytes: record.sizeBytes ?? record.size
  };
}

function flattenNodeRecord(record: Record<string, unknown>): RawAssetRecord {
  const data = isRecord(record.data) ? record.data : {};
  return {
    ...record,
    ...data,
    id: stringValue(data.assetId) ?? stringValue(record.id),
    type: stringValue(data.type) ?? stringValue(record.type),
    kind: stringValue(data.kind) ?? stringValue(record.kind)
  } as RawAssetRecord;
}

function getRecordUrl(record: RawAssetRecord) {
  return (
    record.url ??
    record.publicUrl ??
    record.src ??
    record.imageUrl ??
    record.audioUrl ??
    record.videoUrl ??
    record.providerVideoUrl ??
    record.seedanceProviderUrl ??
    record.assetUri
  );
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

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}
