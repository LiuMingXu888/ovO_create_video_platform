import { describe, expect, it, vi } from "vitest";
import type { ReferenceItem } from "../types";
import type { ApiError } from "../types";
import type { ApiTransport } from "./transport";
import {
  DEFAULT_GENERATION_POLL_OPTIONS,
  buildCompanyGenerateVideoPayload,
  buildGenerateVideoPayload,
  generateVideo,
  loadGenerationQueue,
  persistGeneratedTask,
  pollTaskUntilComplete
} from "./generationClient";

const refs: ReferenceItem[] = [
  { id: "img", name: "图", kind: "image", sizeBytes: 1, source: "asset", url: "https://example.com/image.png" },
  { id: "vid", name: "视频", kind: "video", sizeBytes: 1, durationSeconds: 4, source: "asset", url: "https://example.com/video.mp4" },
  { id: "aud", name: "音频", kind: "audio", sizeBytes: 1, durationSeconds: 5, source: "asset", url: "https://example.com/audio.mp3" }
];

describe("buildGenerateVideoPayload", () => {
  it("uses default Seedance settings and groups references by kind", () => {
    expect(buildGenerateVideoPayload({ prompt: "生成一段视频", references: refs })).toEqual({
      prompt: "生成一段视频",
      model: "Seedance 2.0",
      aspectRatio: "9:16",
      resolution: "720p",
      duration: 15,
      referenceMode: "omnireference",
      referenceImages: ["https://example.com/image.png"],
      referenceVideos: ["https://example.com/video.mp4"],
      referenceAudios: ["https://example.com/audio.mp3"]
    });
  });

  it("maps the Seedance display model to the company backend model id", () => {
    expect(buildCompanyGenerateVideoPayload({ prompt: "生成一段视频", references: refs })).toEqual({
      prompt: "生成一段视频",
      model: "ep-20260319213857-htd7q",
      aspectRatio: "9:16",
      resolution: "720p",
      duration: 15,
      generateAudio: true,
      genTab: "allref",
      referenceMode: "omnireference",
      networkEnabled: true,
      referenceImages: ["https://example.com/image.png"],
      referenceVideos: ["https://example.com/video.mp4"],
      referenceAudios: ["https://example.com/audio.mp3"]
    });
  });

  it("builds a canvas video generation payload with explicit vertical generation metadata", () => {
    expect(
      buildCompanyGenerateVideoPayload({
        projectId: "project-1",
        nodeId: "video-node-1",
        prompt: "生成一段视频",
        references: refs,
        settings: {
          aspectRatio: "9:16",
          durationSeconds: 15,
          omnireference: true
        }
      })
    ).toEqual({
      prompt: "生成一段视频",
      model: "ep-20260319213857-htd7q",
      aspectRatio: "9:16",
      ratio: "9:16",
      resolution: "720p",
      duration: 15,
      generateAudio: true,
      genTab: "allref",
      referenceMode: "omnireference",
      networkEnabled: true,
      referenceImages: ["https://example.com/image.png"],
      referenceVideos: ["https://example.com/video.mp4"],
      referenceAudios: ["https://example.com/audio.mp3"],
      _meta: {
        nodeId: "video-node-1",
        projectId: "project-1",
        label: "生成一段视频"
      },
      task: {
        projectId: "project-1",
        nodeId: "video-node-1",
        type: "video",
        label: "生成一段视频",
        modelName: "Seedance 2.0",
        duration: 15,
        aspectRatio: "9:16"
      }
    });
  });
});

describe("generateVideo", () => {
  it("uses a longer default polling window for real Seedance tasks", async () => {
    expect(DEFAULT_GENERATION_POLL_OPTIONS).toEqual({
      intervalMs: 1500,
      maxAttempts: 1400
    });
  });

  it("throws a login-expired error when submitting generation is unauthorized", async () => {
    const authError = { status: 401, message: "请求失败 (401)" } satisfies ApiError;
    const transport: ApiTransport = {
      request: vi.fn().mockRejectedValue(authError)
    };

    await expect(generateVideo(transport, { prompt: "生成一段视频", references: refs }, { intervalMs: 0, maxAttempts: 1 }))
      .rejects.toThrow("登录态已失效，请重新登录后再试");
    expect(transport.request).toHaveBeenCalledTimes(1);
  });

  it("submits a generation task and returns the first completed video URL", async () => {
    const transport: ApiTransport = {
      request: vi.fn()
        .mockResolvedValueOnce({ taskId: "task-1" })
        .mockResolvedValueOnce({
          items: [{ taskId: "task-1", nodeId: "video-node-1", status: "running" }]
        })
        .mockResolvedValueOnce({
          items: [
            {
              taskId: "task-1",
              nodeId: "video-node-1",
              status: "succeeded",
              videoUrl: "https://example.com/generated.mp4",
              providerVideoUrl: "https://provider.example.com/generated.mp4"
            }
          ]
        })
    };

    await expect(
      generateVideo(
        transport,
        { projectId: "project-1", nodeId: "video-node-1", prompt: "生成一段视频", references: refs },
        { intervalMs: 0, maxAttempts: 3 }
      )
    ).resolves.toEqual({
      taskId: "task-1",
      videoUrl: "https://example.com/generated.mp4",
      providerVideoUrl: "https://provider.example.com/generated.mp4"
    });
    expect(transport.request).toHaveBeenNthCalledWith(1, "/api/generate-video", {
      method: "POST",
      body: expect.objectContaining({
        ratio: "9:16",
        aspectRatio: "9:16",
        model: "ep-20260319213857-htd7q",
        prompt: "生成一段视频",
        _meta: {
          projectId: "project-1",
          nodeId: "video-node-1",
          label: "生成一段视频"
        },
        task: expect.objectContaining({
          projectId: "project-1",
          nodeId: "video-node-1",
          aspectRatio: "9:16"
        })
      })
    });
    expect(transport.request).toHaveBeenNthCalledWith(2, "/api/gen-queue?projectId=project-1&taskId=task-1");
  });

  it("polls the canvas generation queue for queued canvas video tasks", async () => {
    const transport: ApiTransport = {
      request: vi.fn()
        .mockResolvedValueOnce({ tasks: [{ taskId: "queue-task-1", nodeId: "video-node-1" }] })
        .mockResolvedValueOnce({
          items: [{ taskId: "queue-task-1", nodeId: "video-node-1", status: "running" }]
        })
        .mockResolvedValueOnce({
          items: [
            {
              taskId: "queue-task-1",
              nodeId: "video-node-1",
              status: "succeeded",
              resultUrl: "https://example.com/generated-queue.mp4",
              providerVideoUrl: "https://provider.example.com/generated-queue.mp4",
              persisted: true
            }
          ]
        })
    };

    await expect(
      generateVideo(
        transport,
        { projectId: "project-1", nodeId: "video-node-1", prompt: "生成一段视频", references: refs },
        { intervalMs: 0, maxAttempts: 3 }
      )
    ).resolves.toEqual({
      taskId: "queue-task-1",
      videoUrl: "https://example.com/generated-queue.mp4",
      providerVideoUrl: "https://provider.example.com/generated-queue.mp4",
      persisted: true
    });
    expect(transport.request).toHaveBeenNthCalledWith(2, "/api/gen-queue?projectId=project-1&taskId=queue-task-1");
    expect(transport.request).toHaveBeenNthCalledWith(3, "/api/gen-queue?projectId=project-1&taskId=queue-task-1");
  });

  it("persists an unpersisted generated task before returning the final URL", async () => {
    const transport: ApiTransport = {
      request: vi.fn()
        .mockResolvedValueOnce({ taskId: "task-1" })
        .mockResolvedValueOnce({
          status: "succeeded",
          providerVideoUrl: "https://provider.example.com/generated.mp4",
          persisted: false
        })
        .mockResolvedValueOnce({
          persisted: true,
          url: "https://example.com/persisted.mp4"
        })
    };

    await expect(
      generateVideo(transport, { prompt: "生成一段视频", references: refs }, { intervalMs: 0, maxAttempts: 1 })
    ).resolves.toEqual({
      taskId: "task-1",
      videoUrl: "https://example.com/persisted.mp4",
      providerVideoUrl: "https://provider.example.com/generated.mp4",
      persisted: true
    });
    expect(transport.request).toHaveBeenNthCalledWith(3, "/api/asset/persist-task", {
      method: "POST",
      body: { taskId: "task-1" }
    });
  });

  it("does not call persist-task when generation already returned a persisted video URL", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ taskId: "task-1" })
      .mockResolvedValueOnce({
        status: "succeeded",
        videoUrl: "https://example.com/generated.mp4",
        providerVideoUrl: "https://provider.example.com/generated.mp4",
        persisted: true
      });
    const transport: ApiTransport = { request };

    await expect(
      generateVideo(transport, { prompt: "生成一段视频", references: refs }, { intervalMs: 0, maxAttempts: 1 })
    ).resolves.toEqual({
      taskId: "task-1",
      videoUrl: "https://example.com/generated.mp4",
      providerVideoUrl: "https://provider.example.com/generated.mp4",
      persisted: true
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe("generation helpers", () => {
  it("loads generation queue by project id", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockResolvedValue({ items: [] })
    };

    await expect(loadGenerationQueue(transport, "project-1")).resolves.toEqual({ items: [] });
    expect(transport.request).toHaveBeenCalledWith("/api/gen-queue?projectId=project-1");
  });

  it("persists generated task output", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockResolvedValue({ persisted: true, url: "https://example.com/out.mp4" })
    };

    await expect(persistGeneratedTask(transport, "task-1")).resolves.toEqual({
      persisted: true,
      url: "https://example.com/out.mp4"
    });
    expect(transport.request).toHaveBeenCalledWith("/api/asset/persist-task", {
      method: "POST",
      body: { taskId: "task-1" }
    });
  });
});

describe("pollTaskUntilComplete", () => {
  it("stops when the task succeeds", async () => {
    const transport: ApiTransport = {
      request: vi.fn()
        .mockResolvedValueOnce({ status: "running" })
        .mockResolvedValueOnce({ status: "succeeded", outputUrl: "https://example.com/out.mp4" })
    };

    await expect(pollTaskUntilComplete(transport, "/api/generate-video/task-1", { intervalMs: 0, maxAttempts: 3 }))
      .resolves.toEqual({ status: "succeeded", outputUrl: "https://example.com/out.mp4" });
  });

  it("fails after max attempts", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockResolvedValue({ status: "running" })
    };

    await expect(pollTaskUntilComplete(transport, "/api/generate-video/task-1", { intervalMs: 0, maxAttempts: 2 }))
      .rejects.toThrow("任务轮询超时");
  });

  it("throws a login-expired error instead of timing out when polling is unauthorized", async () => {
    const authError = { status: 401, message: "请求失败 (401)" } satisfies ApiError;
    const transport: ApiTransport = {
      request: vi.fn().mockRejectedValue(authError)
    };

    await expect(pollTaskUntilComplete(transport, "/api/generate-video/task-1", { intervalMs: 0, maxAttempts: 2 }))
      .rejects.toThrow("登录态已失效，请重新登录后再试");
    expect(transport.request).toHaveBeenCalledTimes(1);
  });

  it("throws the server error when the task fails", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockResolvedValue({ status: "failed", errorMessage: "积分不足" })
    };

    await expect(pollTaskUntilComplete(transport, "/api/generate-video/task-1", { intervalMs: 0, maxAttempts: 2 }))
      .rejects.toThrow("积分不足");
  });

  it("throws structured task error details when the task fails", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockResolvedValue({ status: "failed", error: { errorDetail: "参考素材不能为空" } })
    };

    await expect(pollTaskUntilComplete(transport, "/api/generate-video/task-1", { intervalMs: 0, maxAttempts: 2 }))
      .rejects.toThrow("参考素材不能为空");
  });
});
