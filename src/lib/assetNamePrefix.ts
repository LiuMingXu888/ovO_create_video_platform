import type { AssetCategory, CanvasAsset } from "../types";

const categoryPrefixes = {
  characters: "人物-",
  scenes: "场景-",
  props: "道具-",
  audio: "音频-"
} as const satisfies Partial<Record<AssetCategory, string>>;

type PrefixedCategory = keyof typeof categoryPrefixes;

export interface ParsedAssetNamePrefix {
  prefix: string;
  category: PrefixedCategory;
  baseName: string;
}

export interface PrefixResult extends CanvasAsset {
  renamed: boolean;
}

export function parseAssetNamePrefix(name: string): ParsedAssetNamePrefix | null {
  for (const [category, prefix] of Object.entries(categoryPrefixes) as Array<[PrefixedCategory, string]>) {
    if (name.startsWith(prefix)) {
      return {
        prefix,
        category,
        baseName: name.slice(prefix.length)
      };
    }
  }

  return null;
}

export function ensureDefaultAssetPrefix(asset: CanvasAsset): PrefixResult {
  const parsed = parseAssetNamePrefix(asset.name);
  if (parsed) {
    return {
      ...asset,
      category: parsed.category,
      renamed: false
    };
  }

  if (asset.kind === "image") {
    return {
      ...asset,
      name: `${categoryPrefixes.characters}${asset.name}`,
      category: "characters",
      renamed: true
    };
  }

  if (asset.kind === "audio") {
    return {
      ...asset,
      name: `${categoryPrefixes.audio}${asset.name}`,
      category: "audio",
      renamed: true
    };
  }

  return { ...asset, renamed: false };
}

export function replaceAssetCategoryPrefix(name: string, category: AssetCategory) {
  const nextPrefix = categoryPrefixes[category as PrefixedCategory];
  if (!nextPrefix) {
    return name;
  }

  const parsed = parseAssetNamePrefix(name);
  return `${nextPrefix}${parsed?.baseName ?? name}`;
}

export function categoryFromAssetNamePrefix(name: string): AssetCategory | null {
  return parseAssetNamePrefix(name)?.category ?? null;
}
