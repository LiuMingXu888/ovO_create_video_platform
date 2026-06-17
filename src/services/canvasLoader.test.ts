import { describe, expect, it, vi } from "vitest";
import { mockSnapshotResponse } from "../api/mockFixtures";
import type { ApiTransport } from "../api/transport";
import { loadCanvasResources, saveCanvasAsset } from "./canvasLoader";

describe("loadCanvasResources", () => {
  it("loads and normalizes resources for a valid canvas URL", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockResolvedValue(mockSnapshotResponse)
    };

    await expect(
      loadCanvasResources(transport, "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x")
    ).resolves.toMatchObject({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "测试项目"
      },
      assets: [
        { name: "男主秦扬人脸参考", category: "characters" },
        { name: "紧张背景音乐", category: "audio" },
        { name: "开场参考视频", category: "video" }
      ]
    });
  });

  it("returns a readable error for invalid canvas URLs", async () => {
    const transport: ApiTransport = {
      request: vi.fn()
    };

    await expect(loadCanvasResources(transport, "bad-url")).rejects.toMatchObject({
      message: "请输入有效的画布地址"
    });
    expect(transport.request).not.toHaveBeenCalled();
  });

  it("saves canvas assets by merging into the latest snapshot and verifying reload", async () => {
    const requests: Array<{ path: string; options?: unknown }> = [];
    let savedSnapshot: unknown = undefined;
    const transport: ApiTransport = {
      request: async (path: string, options?: { method?: string; body?: unknown }) => {
        requests.push({ path, options });
        if (options?.method === "PUT") {
          savedSnapshot = options.body;
          return { ok: true } as never;
        }

        if (savedSnapshot) {
          return savedSnapshot as never;
        }

        return {
          snapshot: {
            nodes: [
              {
                id: "existing-node",
                type: "image",
                data: {
                  id: "existing-node",
                  assetId: "existing-node",
                  name: "现有图片",
                  imageUrl: "https://example.com/a.png"
                }
              }
            ]
          }
        } as never;
      }
    };

    await expect(
      saveCanvasAsset(transport, {
        projectId: "project-1",
        snapshot: { snapshot: { nodes: [] } },
        id: "generated-video-node",
        name: "生成视频",
        kind: "video",
        category: "video",
        url: "https://example.com/generated.mp4",
        providerVideoUrl: "https://provider.example.com/generated.mp4",
        durationSeconds: 15
      })
    ).resolves.toMatchObject({
      asset: {
        id: "generated-video-node",
        url: "https://example.com/generated.mp4",
        providerVideoUrl: "https://provider.example.com/generated.mp4"
      },
      snapshot: {
        snapshot: {
          nodes: [
            { id: "existing-node" },
            {
              id: "generated-video-node",
              type: "video",
              data: {
                videoUrl: "https://example.com/generated.mp4",
                seedanceProviderUrl: "https://provider.example.com/generated.mp4",
                videoPersisted: true
              }
            }
          ]
        }
      }
    });
    expect(requests[0]).toEqual({ path: "/api/projects/project-1/snapshot", options: undefined });
    expect(requests[1]).toMatchObject({ path: "/api/projects/project-1/snapshot", options: { method: "PUT" } });
    expect(requests[2]).toEqual({ path: "/api/projects/project-1/snapshot", options: undefined });
  });
});
