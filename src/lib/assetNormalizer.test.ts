import { describe, expect, it } from "vitest";
import { mockSnapshotResponse } from "../api/mockFixtures";
import { normalizeSnapshotAssets } from "./assetNormalizer";

describe("normalizeSnapshotAssets", () => {
  it("maps images to characters, audio to audio, and video to video", () => {
    expect(normalizeSnapshotAssets(mockSnapshotResponse)).toEqual([
      {
        id: "img-1",
        name: "男主秦扬人脸参考",
        kind: "image",
        category: "characters",
        url: "https://example.com/man.png",
        thumbnailUrl: "https://example.com/man-thumb.png",
        sizeBytes: 1024,
        generationPrompt: undefined,
        generationReferences: undefined
      },
      {
        id: "audio-1",
        name: "紧张背景音乐",
        kind: "audio",
        category: "audio",
        url: "https://example.com/bgm.mp3",
        durationSeconds: 12,
        sizeBytes: 2048,
        generationPrompt: undefined,
        generationReferences: undefined
      },
      {
        id: "video-1",
        name: "开场参考视频",
        kind: "video",
        category: "video",
        url: "https://example.com/opening.mp4",
        thumbnailUrl: "https://example.com/opening.jpg",
        durationSeconds: 5,
        sizeBytes: 4096,
        generationPrompt: undefined,
        generationReferences: undefined
      }
    ]);
  });

  it("ignores records without a usable URL", () => {
    expect(normalizeSnapshotAssets({ assets: [{ id: "bad", name: "bad", type: "image" }] })).toEqual([]);
  });

  it("normalizes real canvas snapshot node media fields", () => {
    expect(
      normalizeSnapshotAssets({
        nodes: [
          {
            id: "image-node",
            type: "reference-image",
            data: {
              name: "小区楼道",
              imageUrl: "https://example.com/hallway.webp",
              assetId: "asset-image-1"
            }
          },
          {
            id: "video-node",
            type: "seedance-video",
            data: {
              label: "生成视频",
              videoUrl: "https://example.com/video.mp4",
              seedanceProviderUrl: "https://example.com/provider.mp4",
              duration: 5
            }
          }
        ]
      })
    ).toEqual([
      {
        id: "asset-image-1",
        name: "小区楼道",
        kind: "image",
        category: "characters",
        url: "https://example.com/hallway.webp",
        thumbnailUrl: undefined,
        durationSeconds: undefined,
        sizeBytes: undefined,
        generationPrompt: undefined,
        generationReferences: undefined
      },
      {
        id: "video-node",
        name: "生成视频",
        kind: "video",
        category: "video",
        url: "https://example.com/video.mp4",
        thumbnailUrl: undefined,
        durationSeconds: 5,
        sizeBytes: undefined,
        generationPrompt: undefined,
        generationReferences: undefined
      }
    ]);
  });

  it("finds media URLs nested inside canvas node payloads", () => {
    expect(
      normalizeSnapshotAssets({
        nodes: [
          {
            id: "nested-image-node",
            type: "custom-node",
            data: {
              label: "嵌套图片节点",
              payload: {
                media: {
                  imageUrl: "https://example.com/nested.png"
                }
              }
            }
          }
        ]
      })
    ).toEqual([
      {
        id: "nested-image-node",
        name: "嵌套图片节点",
        kind: "image",
        category: "characters",
        url: "https://example.com/nested.png",
        thumbnailUrl: undefined,
        durationSeconds: undefined,
        sizeBytes: undefined,
        generationPrompt: undefined,
        generationReferences: undefined
      }
    ]);
  });

  it("loads nodes from the real snapshot response wrapper", () => {
    expect(
      normalizeSnapshotAssets({
        snapshot: {
          nodes: [
            {
              id: "wrapped-image-node",
              type: "image",
              data: {
                name: "包裹图片",
                imageUrl: "https://example.com/wrapped.webp"
              }
            }
          ]
        },
        hash: "hash-1",
        source: "server"
      })
    ).toEqual([
      {
        id: "wrapped-image-node",
        name: "包裹图片",
        kind: "image",
        category: "characters",
        url: "https://example.com/wrapped.webp",
        thumbnailUrl: undefined,
        durationSeconds: undefined,
        sizeBytes: undefined,
        generationPrompt: undefined,
        generationReferences: undefined
      }
    ]);
  });

  it("normalizes reusable generation prompt and references on video assets", () => {
    expect(
      normalizeSnapshotAssets({
        assets: [
          {
            id: "generated-video",
            name: "生成视频",
            type: "video",
            url: "https://example.com/generated.mp4",
            generationPrompt: "镜头缓慢推进，人物回头",
            generationReferences: [
              {
                id: "ref-image",
                name: "小区楼道",
                kind: "image",
                url: "https://example.com/hallway.png",
                sizeBytes: 2048
              },
              {
                id: "ref-audio",
                name: "紧张音乐",
                kind: "audio",
                durationSeconds: 5
              }
            ]
          }
        ]
      })
    ).toEqual([
      {
        id: "generated-video",
        name: "生成视频",
        kind: "video",
        category: "video",
        url: "https://example.com/generated.mp4",
        thumbnailUrl: undefined,
        durationSeconds: undefined,
        sizeBytes: undefined,
        generationPrompt: "镜头缓慢推进，人物回头",
        generationReferences: [
          {
            id: "ref-image",
            name: "小区楼道",
            kind: "image",
            sizeBytes: 2048,
            durationSeconds: undefined,
            mimeType: undefined,
            fileName: undefined,
            source: "asset",
            previewUrl: "https://example.com/hallway.png"
          },
          {
            id: "ref-audio",
            name: "紧张音乐",
            kind: "audio",
            sizeBytes: 1048576,
            durationSeconds: 5,
            mimeType: undefined,
            fileName: undefined,
            source: "asset",
            previewUrl: undefined
          }
        ]
      }
    ]);
  });

  it("preserves stored image categories from snapshot node data", () => {
    expect(
      normalizeSnapshotAssets({
        snapshot: {
          nodes: [
            {
              id: "scene-node",
              type: "image",
              data: {
                name: "场景图",
                category: "scenes",
                imageUrl: "https://example.com/scene.webp"
              }
            },
            {
              id: "prop-node",
              type: "image",
              data: {
                name: "道具图",
                category: "props",
                imageUrl: "https://example.com/prop.webp"
              }
            }
          ]
        }
      })
    ).toEqual([
      {
        id: "scene-node",
        name: "场景图",
        kind: "image",
        category: "scenes",
        url: "https://example.com/scene.webp",
        thumbnailUrl: undefined,
        durationSeconds: undefined,
        sizeBytes: undefined
      },
      {
        id: "prop-node",
        name: "道具图",
        kind: "image",
        category: "props",
        url: "https://example.com/prop.webp",
        thumbnailUrl: undefined,
        durationSeconds: undefined,
        sizeBytes: undefined
      }
    ]);
  });
});
