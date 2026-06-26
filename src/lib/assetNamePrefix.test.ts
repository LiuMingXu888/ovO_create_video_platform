import { describe, expect, it } from "vitest";
import {
  ensureDefaultAssetPrefix,
  parseAssetNamePrefix,
  replaceAssetCategoryPrefix,
  stripPromptPrefixes
} from "./assetNamePrefix";
import type { CanvasAsset } from "../types";

describe("asset name prefixes", () => {
  it("parses Chinese category prefixes and returns the stripped base name", () => {
    expect(parseAssetNamePrefix("人物-苏晚晴")).toEqual({
      prefix: "人物-",
      category: "characters",
      baseName: "苏晚晴"
    });
    expect(parseAssetNamePrefix("场景-百家老宅")).toMatchObject({ category: "scenes", baseName: "百家老宅" });
    expect(parseAssetNamePrefix("道具-桂花糕")).toMatchObject({ category: "props", baseName: "桂花糕" });
    expect(parseAssetNamePrefix("音频-旁白")).toMatchObject({ category: "audio", baseName: "旁白" });
    expect(parseAssetNamePrefix("苏晚晴")).toBeNull();
  });

  it("adds default prefixes by media kind without renaming videos", () => {
    const image: CanvasAsset = {
      id: "image-1",
      name: "苏晚晴",
      kind: "image",
      category: "characters",
      url: "https://example.com/image.png"
    };
    const audio: CanvasAsset = {
      id: "audio-1",
      name: "旁白",
      kind: "audio",
      category: "audio",
      url: "https://example.com/audio.mp3"
    };
    const video: CanvasAsset = {
      id: "video-1",
      name: "成片",
      kind: "video",
      category: "video",
      url: "https://example.com/video.mp4"
    };

    expect(ensureDefaultAssetPrefix(image)).toMatchObject({
      name: "人物-苏晚晴",
      category: "characters",
      renamed: true
    });
    expect(ensureDefaultAssetPrefix(audio)).toMatchObject({
      name: "音频-旁白",
      category: "audio",
      renamed: true
    });
    expect(ensureDefaultAssetPrefix(video)).toMatchObject({
      name: "成片",
      category: "video",
      renamed: false
    });
  });

  it("does not duplicate existing prefixes and lets prefixes drive category", () => {
    const asset: CanvasAsset = {
      id: "image-1",
      name: "场景-百家老宅",
      kind: "image",
      category: "characters",
      url: "https://example.com/image.png"
    };

    expect(ensureDefaultAssetPrefix(asset)).toMatchObject({
      name: "场景-百家老宅",
      category: "scenes",
      renamed: false
    });
  });

  it("rewrites category prefixes when an image is converted between lists", () => {
    expect(replaceAssetCategoryPrefix("人物-苏晚晴", "props")).toBe("道具-苏晚晴");
    expect(replaceAssetCategoryPrefix("场景-百家老宅", "characters")).toBe("人物-百家老宅");
    expect(replaceAssetCategoryPrefix("苏晚晴", "scenes")).toBe("场景-苏晚晴");
  });

  it("strips 人物- and 音频- prefixes from prompt text, keeping 场景- and 道具- intact", () => {
    expect(stripPromptPrefixes("人物-苏晚晴在场景-百家老宅吃道具-桂花糕，音频-背景音乐")).toBe(
      "苏晚晴在场景-百家老宅吃道具-桂花糕，背景音乐"
    );
    expect(stripPromptPrefixes("音频-旁白讲述故事")).toBe("旁白讲述故事");
    expect(stripPromptPrefixes("场景-森林很美丽")).toBe("场景-森林很美丽");
    expect(stripPromptPrefixes("道具-宝剑闪闪发光")).toBe("道具-宝剑闪闪发光");
    expect(stripPromptPrefixes("普通文本没有前缀")).toBe("普通文本没有前缀");
  });
});
