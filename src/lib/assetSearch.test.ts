import { describe, expect, it } from "vitest";
import { searchAssets } from "./assetSearch";
import type { CanvasAsset } from "../types";

function a(id: string, name: string, category: CanvasAsset["category"], kind: CanvasAsset["kind"]): CanvasAsset {
  return { id, name, kind, category, url: "u" };
}

describe("searchAssets", () => {
  const assets = [
    a("1", "小李", "characters", "image"),
    a("2", "小李家", "scenes", "image"),
    a("3", "道具刀", "props", "image"),
    a("4", "小李配音", "audio", "audio"),
    a("5", "开场视频", "video", "video")
  ];
  it("empty query returns empty", () => {
    expect(searchAssets(assets, "")).toEqual([]);
  });
  it("whitespace query returns empty", () => {
    expect(searchAssets(assets, "   ")).toEqual([]);
  });
  it("fuzzy matches by name, grouped in fixed order", () => {
    const groups = searchAssets(assets, "小李");
    expect(groups.map((g) => g.category)).toEqual(["characters", "scenes", "audio"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["1"]);
    expect(groups[2].items.map((i) => i.id)).toEqual(["4"]);
  });
});
