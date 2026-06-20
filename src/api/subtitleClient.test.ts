import { describe, expect, it, vi } from "vitest";
import { chooseSubtitleRemovalRoute, removeSubtitles } from "./subtitleClient";
import type { ApiTransport } from "./transport";

describe("chooseSubtitleRemovalRoute", () => {
  const now = new Date("2026-06-20T12:00:00.000Z");
  const base = { providerVideoUrl: "https://provider.example.com/v.mp4", isSeedance: true };

  it("returns paid when createdAt is missing", () => {
    expect(chooseSubtitleRemovalRoute({ ...base, createdAt: undefined }, now)).toBe("paid");
  });

  it("returns paid when createdAt is unparseable", () => {
    expect(chooseSubtitleRemovalRoute({ ...base, createdAt: "not-a-date" }, now)).toBe("paid");
  });

  it("returns paid when createdAt is in the future", () => {
    expect(chooseSubtitleRemovalRoute({ ...base, createdAt: "2026-06-20T13:00:00.000Z" }, now)).toBe("paid");
  });

  it("returns paid when older than 24h", () => {
    expect(chooseSubtitleRemovalRoute({ ...base, createdAt: "2026-06-19T11:00:00.000Z" }, now)).toBe("paid");
  });

  it("returns free when within 24h and Seedance with a provider URL", () => {
    expect(chooseSubtitleRemovalRoute({ ...base, createdAt: "2026-06-20T01:00:00.000Z" }, now)).toBe("free");
  });

  it("returns paid when within 24h but not Seedance", () => {
    expect(
      chooseSubtitleRemovalRoute({ ...base, isSeedance: false, createdAt: "2026-06-20T01:00:00.000Z" }, now)
    ).toBe("paid");
  });

  it("returns paid when within 24h + Seedance but no provider URL", () => {
    expect(
      chooseSubtitleRemovalRoute(
        { createdAt: "2026-06-20T01:00:00.000Z", isSeedance: true, providerVideoUrl: undefined },
        now
      )
    ).toBe("paid");
  });

  it("treats exactly 24h as a free boundary", () => {
    expect(chooseSubtitleRemovalRoute({ ...base, createdAt: "2026-06-19T12:00:00.000Z" }, now)).toBe("free");
  });
});

describe("removeSubtitles", () => {
  it("submits the paid route with a _meta body and polls by runId", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ runId: "hb:abc", status: "running", _genTaskId: "q1" })
      .mockResolvedValueOnce({ runId: "hb:abc", status: "succeeded", videoUrl: "https://cdn.example.com/clean.mp4", error: null });
    const transport: ApiTransport = { request };

    const result = await removeSubtitles(
      transport,
      { url: "https://cdn.example.com/v.mp4", createdAt: "2026-06-19T00:00:00.000Z", nodeId: "n1", projectId: "p1" },
      { intervalMs: 0, maxAttempts: 5, now: new Date("2026-06-21T00:00:00.000Z") }
    );

    expect(request).toHaveBeenNthCalledWith(1, "/api/subtitle-remove", {
      method: "POST",
      body: { videoUrl: "https://cdn.example.com/v.mp4", _meta: { nodeId: "n1", projectId: "p1", label: "字幕擦除" } }
    });
    expect(request).toHaveBeenNthCalledWith(2, "/api/subtitle-remove/hb%3Aabc");
    expect(result).toEqual({ runId: "hb:abc", videoUrl: "https://cdn.example.com/clean.mp4", route: "paid" });
  });

  it("submits the free route with the provider URL and free label", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ runId: "hb:free", status: "running" })
      .mockResolvedValueOnce({ runId: "hb:free", status: "succeeded", videoUrl: "https://cdn.example.com/free-clean.mp4" });
    const transport: ApiTransport = { request };

    const result = await removeSubtitles(
      transport,
      {
        url: "https://cdn.example.com/v.mp4",
        providerVideoUrl: "https://provider.example.com/orig.mp4",
        isSeedance: true,
        createdAt: "2026-06-20T23:00:00.000Z",
        nodeId: "n2",
        projectId: "p2"
      },
      { intervalMs: 0, maxAttempts: 5, now: new Date("2026-06-21T00:00:00.000Z") }
    );

    expect(request).toHaveBeenNthCalledWith(1, "/api/subtitle-remove/ark", {
      method: "POST",
      body: {
        videoUrl: "https://provider.example.com/orig.mp4",
        _meta: { nodeId: "n2", projectId: "p2", label: "字幕擦除（免费）" }
      }
    });
    expect(request).toHaveBeenNthCalledWith(2, "/api/subtitle-remove/ark/hb%3Afree");
    expect(result).toEqual({ runId: "hb:free", videoUrl: "https://cdn.example.com/free-clean.mp4", route: "free" });
  });

  it("throws a diagnostic error when submit returns no runId", async () => {
    const transport: ApiTransport = { request: vi.fn().mockResolvedValueOnce({}) };

    await expect(
      removeSubtitles(
        transport,
        {
          url: "https://cdn.example.com/v.mp4",
          createdAt: "2026-06-20T01:00:00.000Z",
          isSeedance: true,
          providerVideoUrl: "https://provider.example.com/v.mp4",
          nodeId: "n1",
          projectId: "p1"
        },
        { intervalMs: 0, maxAttempts: 1, now: new Date("2026-06-20T02:00:00.000Z") }
      )
    ).rejects.toThrow(/未返回 runId.*(free|paid)/);
  });

  it("throws a timeout diagnostic with attempts and last status", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ runId: "hb:x", status: "running" })
      .mockResolvedValue({ runId: "hb:x", status: "running", videoUrl: null });
    const transport: ApiTransport = { request };

    await expect(
      removeSubtitles(
        transport,
        { url: "https://cdn.example.com/v.mp4", nodeId: "n1", projectId: "p1" },
        { intervalMs: 0, maxAttempts: 2, now: new Date("2026-06-21T00:00:00.000Z") }
      )
    ).rejects.toThrow(/轮询超时.*2.*running/);
  });

  it("throws when the task succeeds without a video URL", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ runId: "hb:y", status: "running" })
      .mockResolvedValueOnce({ runId: "hb:y", status: "succeeded", videoUrl: null });
    const transport: ApiTransport = { request };

    await expect(
      removeSubtitles(
        transport,
        { url: "https://cdn.example.com/v.mp4", nodeId: "n1", projectId: "p1" },
        { intervalMs: 0, maxAttempts: 3, now: new Date("2026-06-21T00:00:00.000Z") }
      )
    ).rejects.toThrow(/未返回视频地址/);
  });

  it("surfaces the server error message when the task fails", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ runId: "hb:z", status: "running" })
      .mockResolvedValueOnce({ runId: "hb:z", status: "failed", error: "字幕擦除失败：源视频无法访问" });
    const transport: ApiTransport = { request };

    await expect(
      removeSubtitles(
        transport,
        { url: "https://cdn.example.com/v.mp4", nodeId: "n1", projectId: "p1" },
        { intervalMs: 0, maxAttempts: 3, now: new Date("2026-06-21T00:00:00.000Z") }
      )
    ).rejects.toThrow("字幕擦除失败：源视频无法访问");
  });
});
