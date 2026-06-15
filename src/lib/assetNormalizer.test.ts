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
        sizeBytes: 1024
      },
      {
        id: "audio-1",
        name: "紧张背景音乐",
        kind: "audio",
        category: "audio",
        url: "https://example.com/bgm.mp3",
        durationSeconds: 12,
        sizeBytes: 2048
      },
      {
        id: "video-1",
        name: "开场参考视频",
        kind: "video",
        category: "video",
        url: "https://example.com/opening.mp4",
        thumbnailUrl: "https://example.com/opening.jpg",
        durationSeconds: 5,
        sizeBytes: 4096
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
        sizeBytes: undefined
      },
      {
        id: "video-node",
        name: "生成视频",
        kind: "video",
        category: "video",
        url: "https://example.com/video.mp4",
        thumbnailUrl: undefined,
        durationSeconds: 5,
        sizeBytes: undefined
      }
    ]);
  });
});
