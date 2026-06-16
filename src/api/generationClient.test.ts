import { describe, expect, it, vi } from "vitest";
import type { ReferenceItem } from "../types";
import type { ApiTransport } from "./transport";
import { buildCompanyGenerateVideoPayload, buildGenerateVideoPayload, generateVideo, pollTaskUntilComplete } from "./generationClient";

const refs: ReferenceItem[] = [
  { id: "img", name: "图", kind: "image", sizeBytes: 1, source: "asset" },
  { id: "vid", name: "视频", kind: "video", sizeBytes: 1, durationSeconds: 4, source: "asset" },
  { id: "aud", name: "音频", kind: "audio", sizeBytes: 1, durationSeconds: 5, source: "asset" }
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
      referenceImages: ["图"],
      referenceVideos: ["视频"],
      referenceAudios: ["音频"]
    });
  });

  it("maps the Seedance display model to the company backend model id", () => {
    expect(buildCompanyGenerateVideoPayload({ prompt: "生成一段视频", references: refs })).toMatchObject({
      model: "ep-20260319213857-htd7q",
      generateAudio: true
    });
  });
});

describe("generateVideo", () => {
  it("submits a generation task and returns the first completed video URL", async () => {
    const transport: ApiTransport = {
      request: vi.fn()
        .mockResolvedValueOnce({ taskId: "task-1" })
        .mockResolvedValueOnce({ status: "running" })
        .mockResolvedValueOnce({
          status: "succeeded",
          videoUrl: "https://example.com/generated.mp4",
          providerVideoUrl: "https://provider.example.com/generated.mp4"
        })
    };

    await expect(
      generateVideo(transport, { prompt: "生成一段视频", references: refs }, { intervalMs: 0, maxAttempts: 3 })
    ).resolves.toEqual({
      taskId: "task-1",
      videoUrl: "https://example.com/generated.mp4",
      providerVideoUrl: "https://provider.example.com/generated.mp4"
    });
    expect(transport.request).toHaveBeenNthCalledWith(1, "/api/generate-video", {
      method: "POST",
      body: expect.objectContaining({
        model: "ep-20260319213857-htd7q",
        prompt: "生成一段视频"
      })
    });
    expect(transport.request).toHaveBeenNthCalledWith(2, "/api/generate-video/task-1");
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

  it("throws the server error when the task fails", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockResolvedValue({ status: "failed", errorMessage: "积分不足" })
    };

    await expect(pollTaskUntilComplete(transport, "/api/generate-video/task-1", { intervalMs: 0, maxAttempts: 2 }))
      .rejects.toThrow("积分不足");
  });
});
