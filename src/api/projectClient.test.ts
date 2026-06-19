import { describe, expect, it, vi } from "vitest";
import { createCompanyCanvas } from "./projectClient";
import type { ApiTransport } from "./transport";

describe("createCompanyCanvas", () => {
  it("posts to the project collection and normalizes the returned canvas project", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockResolvedValue({
        projectId: "project-1",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/project-1",
        title: "新画布"
      })
    };

    await expect(createCompanyCanvas(transport, "新画布")).resolves.toMatchObject({
      projectId: "project-1",
      canvasUrl: "http://qijing.kjjhz.cn/canvas/project-1",
      title: "新画布"
    });
    expect(transport.request).toHaveBeenCalledWith("/api/projects", {
      method: "POST",
      body: { title: "新画布", name: "新画布" }
    });
  });

  it("extracts a project id from returned canvas URLs", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockResolvedValue({
        url: "http://qijing.kjjhz.cn/canvas/project-from-url"
      })
    };

    await expect(createCompanyCanvas(transport)).resolves.toMatchObject({
      projectId: "project-from-url",
      canvasUrl: "http://qijing.kjjhz.cn/canvas/project-from-url"
    });
  });
});
