import { describe, expect, it, vi } from "vitest";
import { mockSnapshotResponse } from "../api/mockFixtures";
import type { ApiTransport } from "../api/transport";
import { loadCanvasResources } from "./canvasLoader";

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
});
