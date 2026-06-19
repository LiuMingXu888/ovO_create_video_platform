import type { AssetCategory, CanvasAsset, CanvasProject } from "../types";

const storageKey = "ovo.canvasHistory.v1";
const maxHistoryEntries = 24;
const categories: AssetCategory[] = ["characters", "scenes", "props", "audio", "video"];
const emptyCategoryOrder: Record<AssetCategory, string[]> = {
  characters: [],
  scenes: [],
  props: [],
  audio: [],
  video: []
};

export interface CanvasAssetLayout {
  categories: Record<string, AssetCategory>;
  categoryOrder: Record<AssetCategory, string[]>;
}

export interface CanvasHistoryEntry {
  url: string;
  name: string;
  projectId?: string;
  projectTitle?: string;
  createdAt: string;
  updatedAt: string;
  layout?: CanvasAssetLayout;
}

export function loadCanvasHistory(storage: Storage = localStorage): CanvasHistoryEntry[] {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isCanvasHistoryEntry).slice(0, maxHistoryEntries);
  } catch {
    return [];
  }
}

export function saveCanvasHistory(entries: CanvasHistoryEntry[], storage: Storage = localStorage) {
  storage.setItem(storageKey, JSON.stringify(entries.slice(0, maxHistoryEntries)));
}

export function upsertCanvasHistoryEntry(
  entries: CanvasHistoryEntry[],
  input: { url: string; project?: CanvasProject | null; name?: string; layout?: CanvasAssetLayout }
) {
  const now = new Date().toISOString();
  const existing = findCanvasHistoryEntry(entries, input.url, input.project?.projectId);
  const nextEntry: CanvasHistoryEntry = {
    url: input.url,
    name: input.name?.trim() || existing?.name || input.project?.title || "未命名画布",
    projectId: input.project?.projectId ?? existing?.projectId,
    projectTitle: input.project?.title ?? existing?.projectTitle,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    layout: input.layout ?? existing?.layout
  };
  const withoutCurrent = entries.filter((entry) => entry !== existing);
  return [nextEntry, ...withoutCurrent].slice(0, maxHistoryEntries);
}

export function renameCanvasHistoryEntry(entries: CanvasHistoryEntry[], url: string, name: string) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return entries;
  }

  return entries.map((entry) =>
    entry.url === url
      ? {
          ...entry,
          name: trimmedName,
          updatedAt: new Date().toISOString()
        }
      : entry
  );
}

export function updateCanvasHistoryLayout(
  entries: CanvasHistoryEntry[],
  input: { url: string; project?: CanvasProject | null; assets: CanvasAsset[]; fallbackName?: string }
) {
  if (!input.url) {
    return entries;
  }

  return upsertCanvasHistoryEntry(entries, {
    url: input.url,
    project: input.project,
    name: findCanvasHistoryEntry(entries, input.url, input.project?.projectId)?.name ?? input.fallbackName,
    layout: createCanvasAssetLayout(input.assets)
  });
}

export function findCanvasHistoryEntry(entries: CanvasHistoryEntry[], url: string, projectId?: string) {
  return entries.find((entry) => entry.url === url || (projectId && entry.projectId === projectId));
}

export function createCanvasAssetLayout(assets: CanvasAsset[]): CanvasAssetLayout {
  const categoryOrder = cloneEmptyCategoryOrder();
  const assetCategories: Record<string, AssetCategory> = {};

  for (const asset of assets) {
    assetCategories[asset.id] = asset.category;
    categoryOrder[asset.category].push(asset.id);
  }

  return { categories: assetCategories, categoryOrder };
}

export function applyCanvasAssetLayout(assets: CanvasAsset[], layout?: CanvasAssetLayout) {
  if (!layout) {
    return assets;
  }

  const originalIndex = new Map(assets.map((asset, index) => [asset.id, index]));
  const patchedAssets = assets.map((asset) => {
    const savedCategory = layout.categories[asset.id];
    if (!savedCategory || !canAssetUseCategory(asset, savedCategory)) {
      return asset;
    }

    return { ...asset, category: savedCategory };
  });

  const orderRank = new Map<string, number>();
  for (const category of categories) {
    const order = layout.categoryOrder[category] ?? [];
    order.forEach((assetId, index) => {
      orderRank.set(`${category}:${assetId}`, index);
    });
  }

  return patchedAssets.slice().sort((left, right) => {
    if (left.category !== right.category) {
      return 0;
    }

    const leftRank = orderRank.get(`${left.category}:${left.id}`) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = orderRank.get(`${right.category}:${right.id}`) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0);
  });
}

function cloneEmptyCategoryOrder() {
  return {
    characters: [...emptyCategoryOrder.characters],
    scenes: [...emptyCategoryOrder.scenes],
    props: [...emptyCategoryOrder.props],
    audio: [...emptyCategoryOrder.audio],
    video: [...emptyCategoryOrder.video]
  };
}

function canAssetUseCategory(asset: CanvasAsset, category: AssetCategory) {
  if (asset.kind === "image") {
    return category === "characters" || category === "scenes" || category === "props";
  }

  return asset.kind === category;
}

function isCanvasHistoryEntry(value: unknown): value is CanvasHistoryEntry {
  if (!isRecord(value) || typeof value.url !== "string" || typeof value.name !== "string") {
    return false;
  }

  return typeof value.createdAt === "string" && typeof value.updatedAt === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
