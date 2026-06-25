import { describe, expect, it } from "vitest";
import { buildReferenceText, getReferenceLabel } from "./referenceText";
import type { ReferenceItem } from "../types";

function ref(id: string, name: string, kind: ReferenceItem["kind"]): ReferenceItem {
  return { id, name, kind, sizeBytes: 0, source: "asset" };
}

describe("getReferenceLabel", () => {
  it("labels by per-kind index", () => {
    const refs = [ref("a", "小李", "image"), ref("b", "小张", "image"), ref("c", "小李", "audio")];
    expect(getReferenceLabel(refs[1], refs)).toBe("图片2");
    expect(getReferenceLabel(refs[2], refs)).toBe("音频1");
  });
});

describe("buildReferenceText", () => {
  it("groups by exact name, preserves first-appearance order, joins labels then 、", () => {
    const refs = [
      ref("1", "小李", "image"),   // 图片1
      ref("2", "小张", "image"),   // 图片2
      ref("3", "小王", "image"),   // 图片3
      ref("4", "小李家", "image"), // 图片4
      ref("5", "小张家", "image"), // 图片5
      ref("6", "小李", "audio"),   // 音频1
      ref("7", "小张", "audio"),   // 音频2
      ref("8", "视频节点", "video") // 视频1
    ];
    expect(buildReferenceText(refs)).toBe(
      "图片1音频1是小李、图片2音频2是小张、图片3是小王、图片4是小李家、图片5是小张家、视频1是视频节点"
    );
  });

  it("returns empty string for no references", () => {
    expect(buildReferenceText([])).toBe("");
  });
});
