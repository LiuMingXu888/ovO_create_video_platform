import type { AssetCategory, CanvasAsset } from "../types";

const ORDER: { category: AssetCategory; title: string }[] = [
  { category: "characters", title: "人物" },
  { category: "scenes", title: "场景" },
  { category: "props", title: "道具" },
  { category: "audio", title: "音频" },
  { category: "video", title: "视频" }
];

export function searchAssets(assets: CanvasAsset[], query: string) {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  return ORDER.map(({ category, title }) => ({
    category,
    title,
    items: assets.filter((a) => a.category === category && a.name.toLowerCase().includes(q))
  })).filter((g) => g.items.length > 0);
}
