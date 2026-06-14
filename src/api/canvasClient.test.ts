import { describe, expect, it, vi } from "vitest";
import type { ApiTransport } from "./transport";
import { loadProjectSnapshot } from "./canvasClient";

describe("loadProjectSnapshot", () => {
  it("loads snapshot by project id", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockResolvedValue({ title: "测试项目", nodes: [] })
    };

    await expect(loadProjectSnapshot(transport, "project-1")).resolves.toEqual({ title: "测试项目", nodes: [] });
    expect(transport.request).toHaveBeenCalledWith("/api/projects/project-1/snapshot");
  });
});
