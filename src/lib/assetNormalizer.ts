import type { AssetCategory, AssetKind, CanvasAsset, ReferenceItem } from "../types";
import { getCategoryForAssetName } from "./assetCategory";

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
  prompt?: string;
  generationPrompt?: string;
  references?: unknown;
  generationReferences?: unknown;
  referenceImages?: unknown;
  referenceVideos?: unknown;
  referenceAudios?: unknown;
  assetId?: string;
  category?: string;
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

  if (isRecord(value.snapshot)) {
    return collectRawAssets(value.snapshot);
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
  const kind = normalizeKind(record.kind) ?? normalizeKind(record.type) ?? normalizeKind(url);

  if (!url || !kind) {
    return null;
  }

  return {
    id: record.assetId ?? record.id ?? `${kind}-${url}`,
    name: record.name ?? record.title ?? record.label ?? fallbackName(url),
    kind,
    category: getCategoryForAssetName(kind, record.name ?? record.title ?? record.label ?? fallbackName(url), normalizeCategory(record.category) ?? "characters"),
    url,
    thumbnailUrl: record.thumbnailUrl ?? record.coverUrl ?? record.posterUrl,
    durationSeconds: record.durationSeconds ?? record.duration,
    sizeBytes: record.sizeBytes ?? record.size,
    generationPrompt: getGenerationPrompt(record),
    generationReferences: getGenerationReferences(record)
  };
}

function flattenNodeRecord(record: Record<string, unknown>): RawAssetRecord {
  const data = isRecord(record.data) ? record.data : {};
  const nestedMedia = findNestedMediaRecord(record);
  return {
    ...record,
    ...data,
    ...nestedMedia,
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

function normalizeCategory(value: unknown): AssetCategory | null {
  if (value === "characters" || value === "scenes" || value === "props" || value === "audio" || value === "video") {
    return value;
  }

  return null;
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

function findNestedMediaRecord(value: unknown): Partial<RawAssetRecord> {
  const found = findFirstMediaRecord(value, new Set());
  return found ? pickMediaFields(found) : {};
}

function findFirstMediaRecord(value: unknown, seen: Set<unknown>): Record<string, unknown> | undefined {
  if (!isRecord(value) || seen.has(value)) {
    return undefined;
  }

  seen.add(value);

  if (hasMediaUrl(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    const found = findFirstMediaRecord(child, seen);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function hasMediaUrl(record: Record<string, unknown>) {
  return [
    record.url,
    record.publicUrl,
    record.src,
    record.imageUrl,
    record.audioUrl,
    record.videoUrl,
    record.providerVideoUrl,
    record.seedanceProviderUrl,
    record.assetUri
  ].some((value) => typeof value === "string" && value.trim());
}

function pickMediaFields(record: Record<string, unknown>): Partial<RawAssetRecord> {
  return {
    url: stringValue(record.url),
    publicUrl: stringValue(record.publicUrl),
    src: stringValue(record.src),
    imageUrl: stringValue(record.imageUrl),
    audioUrl: stringValue(record.audioUrl),
    videoUrl: stringValue(record.videoUrl),
    providerVideoUrl: stringValue(record.providerVideoUrl),
    seedanceProviderUrl: stringValue(record.seedanceProviderUrl),
    assetUri: stringValue(record.assetUri),
    thumbnailUrl: stringValue(record.thumbnailUrl),
    coverUrl: stringValue(record.coverUrl),
    posterUrl: stringValue(record.posterUrl),
    prompt: stringValue(record.prompt),
    generationPrompt: stringValue(record.generationPrompt),
    references: record.references,
    generationReferences: record.generationReferences,
    referenceImages: record.referenceImages,
    referenceVideos: record.referenceVideos,
    referenceAudios: record.referenceAudios
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getGenerationPrompt(record: RawAssetRecord) {
  return record.generationPrompt ?? record.prompt;
}

function getGenerationReferences(record: RawAssetRecord): ReferenceItem[] | undefined {
  const directReferences = parseReferenceList(record.generationReferences ?? record.references);
  const groupedReferences = [
    ...parseNamedReferences(record.referenceImages, "image"),
    ...parseNamedReferences(record.referenceAudios, "audio"),
    ...parseNamedReferences(record.referenceVideos, "video")
  ];

  // 节点会把参考存两份：generationReferences(带正常名) + referenceImages/Audios/Videos(仅URL,回退哈希名)。
  // 按 URL 去重，优先保留带正常名(generationReferences)的那条，避免复用时出现重复+哈希名。
  const byUrl = new Map<string, ReferenceItem>();
  const noUrl: ReferenceItem[] = [];
  for (const ref of [...directReferences, ...groupedReferences]) {
    if (ref.url) {
      if (!byUrl.has(ref.url)) {
        byUrl.set(ref.url, ref);
      }
    } else {
      noUrl.push(ref);
    }
  }

  const references = [...byUrl.values(), ...noUrl];
  return references.length > 0 ? references : undefined;
}

function parseReferenceList(value: unknown): ReferenceItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (typeof item === "string") {
      return [createReferenceItem(item, "image", index)];
    }

    if (!isRecord(item)) {
      return [];
    }

    const url = stringValue(item.url) ?? stringValue(item.imageUrl) ?? stringValue(item.audioUrl) ?? stringValue(item.videoUrl);
    const kind =
      normalizeKind(item.kind) ??
      normalizeKind(item.type) ??
      normalizeKind(url) ??
      normalizeKind(stringValue(item.fileName)) ??
      "image";
    const name = stringValue(item.name) ?? stringValue(item.title) ?? stringValue(item.label) ?? (url ? fallbackName(url) : `${kind}-${index + 1}`);

    return [
      {
        id: stringValue(item.id) ?? `source-ref-${index + 1}`,
        name,
        kind,
        url,
        sizeBytes: numberValue(item.sizeBytes) ?? numberValue(item.size) ?? 1024 * 1024,
        durationSeconds: numberValue(item.durationSeconds) ?? numberValue(item.duration),
        mimeType: stringValue(item.mimeType),
        fileName: stringValue(item.fileName),
        source: "asset" as const,
        previewUrl: kind === "image" ? url : undefined
      }
    ];
  });
}

function parseNamedReferences(value: unknown, kind: AssetKind): ReferenceItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (typeof item === "string") {
      return [createReferenceItem(item, kind, index)];
    }

    if (!isRecord(item)) {
      return [];
    }

    const url = stringValue(item.url) ?? stringValue(item.imageUrl) ?? stringValue(item.audioUrl) ?? stringValue(item.videoUrl);
    const name = stringValue(item.name) ?? stringValue(item.title) ?? stringValue(item.label) ?? (url ? fallbackName(url) : `${kind}-${index + 1}`);
    return [
      {
        id: stringValue(item.id) ?? `source-${kind}-${index + 1}`,
        name,
        kind,
        url,
        sizeBytes: numberValue(item.sizeBytes) ?? numberValue(item.size) ?? 1024 * 1024,
        durationSeconds: numberValue(item.durationSeconds) ?? numberValue(item.duration),
        mimeType: stringValue(item.mimeType),
        fileName: stringValue(item.fileName),
        source: "asset" as const,
        previewUrl: kind === "image" ? url : undefined
      }
    ];
  });
}

function createReferenceItem(nameOrUrl: string, kind: AssetKind, index: number): ReferenceItem {
  const looksLikeUrl = /^https?:\/\//.test(nameOrUrl);
  return {
    id: `source-${kind}-${index + 1}`,
    name: looksLikeUrl ? fallbackName(nameOrUrl) : nameOrUrl,
    kind,
    url: looksLikeUrl ? nameOrUrl : undefined,
    sizeBytes: 1024 * 1024,
    source: "asset",
    previewUrl: kind === "image" && looksLikeUrl ? nameOrUrl : undefined
  };
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
