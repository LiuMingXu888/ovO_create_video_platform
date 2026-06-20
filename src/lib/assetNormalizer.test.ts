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

  it("categorizes image assets by Chinese name prefixes", () => {
    expect(
      normalizeSnapshotAssets({
        assets: [
          {
            id: "scene-image",
            name: "场景-百家老宅",
            type: "image",
            imageUrl: "https://example.com/house.png"
          },
          {
            id: "prop-image",
            title: "道具-桂花糕",
            type: "image",
            imageUrl: "https://example.com/cake.png"
          },
          {
            id: "character-image",
            label: "女主林夏",
            type: "image",
            imageUrl: "https://example.com/person.png"
          }
        ]
      }).map((asset) => ({ name: asset.name, category: asset.category }))
    ).toEqual([
      { name: "场景-百家老宅", category: "scenes" },
      { name: "道具-桂花糕", category: "props" },
      { name: "女主林夏", category: "characters" }
    ]);
  });

  it("keeps an explicit server category when it is already provided", () => {
    expect(
      normalizeSnapshotAssets({
        assets: [
          {
            id: "server-image",
            name: "普通图片",
            type: "image",
            category: "scenes",
            imageUrl: "https://example.com/server.png"
          }
        ]
      })
    ).toEqual([
      {
        id: "server-image",
        name: "普通图片",
        kind: "image",
        category: "scenes",
        url: "https://example.com/server.png",
        thumbnailUrl: undefined,
        durationSeconds: undefined,
        sizeBytes: undefined
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
              generationStartedAt: "2026-06-20T01:00:00.000Z",
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
        providerVideoUrl: "https://example.com/provider.mp4",
        thumbnailUrl: undefined,
        durationSeconds: 5,
        sizeBytes: undefined,
        createdAt: "2026-06-20T01:00:00.000Z",
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
            url: "https://example.com/hallway.png",
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
            url: undefined,
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

  it("does not duplicate reused references stored in both generationReferences and referenceImages", () => {
    const url = "https://oss.example.com/users/x/images/1bad79953c2bb.png";
    const snapshot = {
      nodes: [
        {
          id: "gen-1",
          type: "video",
          data: {
            label: "生成视频 1",
            status: "succeeded",
            videoUrl: "https://oss.example.com/v.mp4",
            generationPrompt: "p",
            generationReferences: [{ id: "a", name: "人物-民警", kind: "image", url }],
            referenceImages: [url]
          }
        }
      ]
    };
    const assets = normalizeSnapshotAssets(snapshot);
    const video = assets.find((a) => a.id === "gen-1");
    const refs = video?.generationReferences ?? [];
    const forUrl = refs.filter((r) => r.url === url);
    expect(forUrl).toHaveLength(1);
    expect(forUrl[0]?.name).toBe("人物-民警");
  });
});
