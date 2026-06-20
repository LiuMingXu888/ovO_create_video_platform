import { describe, expect, it, vi } from "vitest";
import { buildSubtitleRemovePayload, chooseSubtitleRemovalRoute, removeSubtitles } from "./subtitleClient";
import type { CanvasAsset } from "../types";
import type { ApiTransport } from "./transport";

describe("subtitleClient", () => {
  const persistedVideo: CanvasAsset = {
    id: "video-1",
    name: "成片",
    kind: "video",
    category: "video",
    url: "https://cdn.example.com/video.mp4"
  };

  const providerVideo: CanvasAsset = {
    ...persistedVideo,
    providerVideoUrl: "https://provider.example.com/video.mp4",
    createdAt: "2026-06-20T01:00:00.000Z"
  };

  it("builds the default persisted-video subtitle payload", () => {
    expect(buildSubtitleRemovePayload("https://cdn.example.com/video.mp4")).toEqual({
      videoUrl: "https://cdn.example.com/video.mp4"
    });
  });

  it("uses the Ark/free route when a provider URL is fresh within 24 hours", async () => {
    const transport: ApiTransport = {
      request: vi.fn()
        .mockResolvedValueOnce({ taskId: "subtitle-task-1" })
        .mockResolvedValueOnce({
          status: "succeeded",
          videoUrl: "https://cdn.example.com/no-subtitles.mp4",
          providerVideoUrl: "https://provider.example.com/no-subtitles.mp4"
        })
    };

    await expect(
      removeSubtitles(transport, providerVideo, {
        intervalMs: 0,
        maxAttempts: 1,
        now: new Date("2026-06-20T02:00:00.000Z")
      })
    ).resolves.toEqual({
      taskId: "subtitle-task-1",
      videoUrl: "https://cdn.example.com/no-subtitles.mp4",
      providerVideoUrl: "https://provider.example.com/no-subtitles.mp4",
      route: "ark"
    });
    expect(transport.request).toHaveBeenNthCalledWith(1, "/api/subtitle-remove/ark", {
      method: "POST",
      body: {
        videoUrl: "https://provider.example.com/video.mp4",
        providerVideoUrl: "https://provider.example.com/video.mp4"
      }
    });
    expect(transport.request).toHaveBeenNthCalledWith(2, "/api/subtitle-remove/ark/subtitle-task-1");
  });

  it("uses the paid route when a provider URL is older than 24 hours", async () => {
    const transport: ApiTransport = {
      request: vi.fn()
        .mockResolvedValueOnce({ taskId: "subtitle-task-1" })
        .mockResolvedValueOnce({
          status: "succeeded",
          videoUrl: "https://cdn.example.com/no-subtitles.mp4"
        })
    };

    await expect(
      removeSubtitles(
        transport,
        {
          ...providerVideo,
          createdAt: "2026-06-18T01:59:59.000Z"
        },
        {
          intervalMs: 0,
          maxAttempts: 1,
          now: new Date("2026-06-20T02:00:00.000Z")
        }
      )
    ).resolves.toMatchObject({
      taskId: "subtitle-task-1",
      videoUrl: "https://cdn.example.com/no-subtitles.mp4",
      route: "default"
    });
    expect(transport.request).toHaveBeenNthCalledWith(1, "/api/subtitle-remove", {
      method: "POST",
      body: {
        videoUrl: "https://cdn.example.com/video.mp4"
      }
    });
    expect(transport.request).toHaveBeenNthCalledWith(2, "/api/subtitle-remove/subtitle-task-1");
  });

  it("falls back to the default subtitle route for persisted-only URLs", async () => {
    const transport: ApiTransport = {
      request: vi.fn()
        .mockResolvedValueOnce({ taskId: "subtitle-task-1" })
        .mockResolvedValueOnce({
          status: "succeeded",
          videoUrl: "https://cdn.example.com/no-subtitles.mp4"
        })
    };

    await expect(removeSubtitles(transport, persistedVideo, { intervalMs: 0, maxAttempts: 1 })).resolves.toMatchObject({
      taskId: "subtitle-task-1",
      videoUrl: "https://cdn.example.com/no-subtitles.mp4",
      route: "default"
    });
    expect(transport.request).toHaveBeenNthCalledWith(1, "/api/subtitle-remove", {
      method: "POST",
      body: {
        videoUrl: "https://cdn.example.com/video.mp4"
      }
    });
    expect(transport.request).toHaveBeenNthCalledWith(2, "/api/subtitle-remove/subtitle-task-1");
  });

  it("keeps the free route available through the exact 24-hour boundary", () => {
    expect(
      chooseSubtitleRemovalRoute(
        {
          providerVideoUrl: "https://provider.example.com/video.mp4",
          createdAt: "2026-06-19T02:00:00.000Z"
        },
        new Date("2026-06-20T02:00:00.000Z")
      )
    ).toBe("ark");
  });

  it("uses the paid route when generation time is missing or invalid", () => {
    const now = new Date("2026-06-20T02:00:00.000Z");

    expect(
      chooseSubtitleRemovalRoute(
        {
          providerVideoUrl: "https://provider.example.com/video.mp4"
        },
        now
      )
    ).toBe("default");
    expect(
      chooseSubtitleRemovalRoute(
        {
          providerVideoUrl: "https://provider.example.com/video.mp4",
          createdAt: "not-a-date"
        },
        now
      )
    ).toBe("default");
  });
});
