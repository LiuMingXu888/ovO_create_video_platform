import type { AssetCategory, AssetKind } from "../types";
import { categoryFromAssetNamePrefix } from "./assetNamePrefix";

export function getCategoryForAssetName(kind: AssetKind, name: string, fallback: AssetCategory = "characters"): AssetCategory {
  const prefixedCategory = categoryFromAssetNamePrefix(name);
  if (prefixedCategory) {
    return prefixedCategory;
  }

  if (kind === "image") {
    return fallback;
  }

  return kind;
}
