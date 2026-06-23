import { describe, expect, it, vi } from "vitest";
import { mockSnapshotResponse } from "../api/mockFixtures";
import type { ApiTransport } from "../api/transport";
import { loadCanvasResources, removeCanvasAssetSubtitles, saveCanvasAsset } from "./canvasLoader";

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
        { name: "人物-男主秦扬人脸参考", category: "characters" },
        { name: "音频-紧张背景音乐", category: "audio" },
        { name: "开场参考视频", category: "video" }
      ]
    });
  });

  it("syncs missing default prefixes back to the loaded snapshot", async () => {
    const requests: Array<{ path: string; options?: unknown }> = [];
    const transport: ApiTransport = {
      request: vi.fn(async (path, options) => {
        requests.push({ path, options });
        return {
          snapshot: {
            nodes: [
              {
                id: "image-1",
                type: "image",
                data: {
                  id: "image-1",
                  assetId: "image-1",
                  name: "苏晚晴",
                  imageUrl: "https://example.com/su.png"
                }
              },
              {
                id: "audio-1",
                type: "audio",
                data: {
                  id: "audio-1",
                  assetId: "audio-1",
                  name: "旁白",
                  audioUrl: "https://example.com/voice.mp3"
                }
              }
            ]
          }
        } as never;
      })
    };

    const result = await loadCanvasResources(transport, "http://qijing.kjjhz.cn/canvas/project-1");

    expect(result.assets).toEqual([
      expect.objectContaining({ id: "image-1", name: "人物-苏晚晴", category: "characters" }),
      expect.objectContaining({ id: "audio-1", name: "音频-旁白", category: "audio" })
    ]);
    expect(requests.filter((request) => isPutRequest(request.options))).toHaveLength(1);
  });

  it("still returns normalized assets when the prefix-sync save fails", async () => {
    let putCount = 0;
    const transport: ApiTransport = {
      request: vi.fn(async (path: string, options?: { method?: string }) => {
        if (options?.method === "PUT") {
          putCount += 1;
          throw new Error("PUT failed");
        }
        return {
          snapshot: {
            nodes: [
              { id: "image-1", type: "image", data: { id: "image-1", assetId: "image-1", name: "苏晚晴", imageUrl: "https://example.com/su.png" } }
            ]
          }
        } as never;
      })
    };

    const result = await loadCanvasResources(transport, "http://qijing.kjjhz.cn/canvas/project-1");
    expect(result.assets).toEqual([
      expect.objectContaining({ id: "image-1", name: "人物-苏晚晴", category: "characters" })
    ]);
    expect(putCount).toBe(1);
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
        durationSeconds: 15,
        generationStartedAt: "2026-06-21T00:00:00.000Z",
        model: "Seedance 2.0"
      })
    ).resolves.toMatchObject({
      asset: {
        id: "generated-video-node",
        url: "https://example.com/generated.mp4",
        providerVideoUrl: "https://provider.example.com/generated.mp4",
        generationStartedAt: "2026-06-21T00:00:00.000Z",
        model: "Seedance 2.0"
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

  it("saves a subtitle-removal placeholder before polling and then updates the same node", async () => {
    const requests: Array<{ path: string; options?: unknown }> = [];
    let savedSnapshot: unknown = { snapshot: { nodes: [] } };
    const transport: ApiTransport = {
      request: async (path: string, options?: { method?: string; body?: unknown }) => {
        requests.push({ path, options });

        if (path === "/api/subtitle-remove/ark") {
          return { runId: "hb:sub1", status: "running" } as never;
        }

        if (path === "/api/subtitle-remove/ark/hb%3Asub1") {
          return {
            runId: "hb:sub1",
            status: "succeeded",
            videoUrl: "https://example.com/no-subtitles.mp4"
          } as never;
        }

        if (options?.method === "PUT") {
          savedSnapshot = options.body;
          return { ok: true } as never;
        }

        return savedSnapshot as never;
      }
    };

    await expect(
      removeCanvasAssetSubtitles(transport, {
        projectId: "project-1",
        sourceAsset: {
          id: "video-1",
          name: "生成视频 1",
          kind: "video",
          category: "video",
          url: "https://example.com/video.mp4",
          providerVideoUrl: "https://provider.example.com/video.mp4",
          model: "Seedance 2.0",
          createdAt: new Date().toISOString()
        },
        placeholderAsset: {
          id: "subtitle-video-1",
          name: "去字幕-生成视频 1",
          kind: "video",
          category: "video",
          url: "",
          status: "generating",
          statusLabel: "去字幕中"
        }
      })
    ).resolves.toMatchObject({
      asset: {
        id: "subtitle-video-1",
        url: "https://example.com/no-subtitles.mp4",
        status: "ready"
      }
    });
    expect(requests.map((request) => request.path)).toEqual([
      "/api/projects/project-1/snapshot",
      "/api/projects/project-1/snapshot",
      "/api/projects/project-1/snapshot",
      "/api/subtitle-remove/ark",
      "/api/subtitle-remove/ark/hb%3Asub1",
      "/api/projects/project-1/snapshot",
      "/api/projects/project-1/snapshot",
      "/api/projects/project-1/snapshot"
    ]);
    const putRequests = requests.filter((request) => isPutRequest(request.options));
    expect(putRequests[0]).toMatchObject({
      options: {
        body: {
          snapshot: {
            nodes: [
              {
                id: "subtitle-video-1",
                data: {
                  status: "generating",
                  videoUrl: ""
                }
              }
            ]
          }
        }
      }
    });
    expect(putRequests[1]).toMatchObject({
      options: {
        body: {
          snapshot: {
            nodes: [
              {
                id: "subtitle-video-1",
                data: {
                  status: "ready",
                  videoUrl: "https://example.com/no-subtitles.mp4"
                }
              }
            ]
          }
        }
      }
    });
  });

  it("inherits generation metadata onto the subtitle-removed asset", async () => {
    let savedSnapshot: unknown = { snapshot: { nodes: [] } };
    const transport: ApiTransport = {
      request: async (path: string, options?: { method?: string; body?: unknown }) => {
        if (path === "/api/subtitle-remove/ark") {
          return { runId: "hb:sub1", status: "running" } as never;
        }
        if (path === "/api/subtitle-remove/ark/hb%3Asub1") {
          return { runId: "hb:sub1", status: "succeeded", videoUrl: "https://example.com/clean.mp4" } as never;
        }
        if (options?.method === "PUT") {
          savedSnapshot = options.body;
          return { ok: true } as never;
        }
        return savedSnapshot as never;
      }
    };

    const placeholder = {
      id: "subtitle-video-1",
      name: "去字幕-成片",
      kind: "video",
      category: "video",
      url: "",
      status: "generating",
      statusLabel: "去字幕中",
      generationPrompt: "提示词",
      generationStartedAt: "2026-06-20T01:00:00.000Z",
      model: "Seedance 2.0"
    } as const;

    await expect(
      removeCanvasAssetSubtitles(transport, {
        projectId: "project-1",
        sourceAsset: {
          id: "video-1",
          name: "成片",
          kind: "video",
          category: "video",
          url: "https://example.com/video.mp4",
          providerVideoUrl: "https://provider.example.com/video.mp4",
          model: "Seedance 2.0",
          createdAt: new Date().toISOString()
        },
        placeholderAsset: placeholder
      })
    ).resolves.toMatchObject({
      asset: {
        url: "https://example.com/clean.mp4",
        status: "ready",
        generationPrompt: "提示词",
        generationStartedAt: "2026-06-20T01:00:00.000Z",
        model: "Seedance 2.0"
      }
    });
  });

  it("uses the paid subtitle route for an old provider video", async () => {
    const requests: Array<{ path: string; options?: unknown }> = [];
    let savedSnapshot: unknown = { snapshot: { nodes: [] } };
    const transport: ApiTransport = {
      request: async (path: string, options?: { method?: string; body?: unknown }) => {
        requests.push({ path, options });

        if (path === "/api/subtitle-remove") {
          return { runId: "hb:sub2", status: "running" } as never;
        }

        if (path === "/api/subtitle-remove/hb%3Asub2") {
          return {
            runId: "hb:sub2",
            status: "succeeded",
            videoUrl: "https://example.com/no-subtitles.mp4"
          } as never;
        }

        if (options?.method === "PUT") {
          savedSnapshot = options.body;
          return { ok: true } as never;
        }

        return savedSnapshot as never;
      }
    };

    await removeCanvasAssetSubtitles(transport, {
      projectId: "project-1",
      sourceAsset: {
        id: "video-1",
        name: "生成视频 1",
        kind: "video",
        category: "video",
        url: "https://example.com/video.mp4",
        providerVideoUrl: "https://provider.example.com/video.mp4",
        createdAt: "2026-06-18T00:00:00.000Z"
      },
      placeholderAsset: {
        id: "subtitle-video-1",
        name: "去字幕-生成视频 1",
        kind: "video",
        category: "video",
        url: "",
        status: "generating",
        statusLabel: "去字幕中"
      }
    });

    expect(requests.map((request) => request.path)).toContain("/api/subtitle-remove");
    expect(requests.map((request) => request.path)).toContain("/api/subtitle-remove/hb%3Asub2");
    expect(requests.map((request) => request.path)).not.toContain("/api/subtitle-remove/ark");
  });
});

function isPutRequest(options: unknown): options is { method: "PUT"; body?: unknown } {
  return typeof options === "object" && options !== null && "method" in options && options.method === "PUT";
}
