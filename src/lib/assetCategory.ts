import type { AssetCategory, AssetKind } from "../types";

export function getCategoryForAssetName(kind: AssetKind, name: string, fallback: AssetCategory = "characters"): AssetCategory {
  if (kind === "image") {
    if (name.startsWith("场景-")) {
      return "scenes";
    }

    if (name.startsWith("道具-")) {
      return "props";
    }

    return fallback;
  }

  return kind;
}
