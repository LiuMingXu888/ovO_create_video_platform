import { describe, expect, it, vi } from "vitest";
import type { ApiTransport } from "./transport";
import { loadProjectSnapshot, saveProjectSnapshot, renameAssetInSnapshot } from "./canvasClient";

describe("loadProjectSnapshot", () => {
  it("loads snapshot by project id", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockResolvedValue({ title: "测试项目", nodes: [] })
    };

    await expect(loadProjectSnapshot(transport, "project-1")).resolves.toEqual({ title: "测试项目", nodes: [] });
    expect(transport.request).toHaveBeenCalledWith("/api/projects/project-1/snapshot");
  });

  it("saves a project snapshot by project id", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockResolvedValue({ ok: true })
    };
    const snapshot = { nodes: [] };

    await expect(saveProjectSnapshot(transport, "project-1", snapshot)).resolves.toEqual({ ok: true });
    expect(transport.request).toHaveBeenCalledWith("/api/projects/project-1/snapshot", {
      method: "PUT",
      body: snapshot
    });
  });

  it("renames a matching snapshot node without mutating the original snapshot", () => {
    const snapshot = {
      snapshot: {
        nodes: [
          {
            id: "node-image",
            data: {
              assetId: "asset-image",
              name: "旧名称",
              imageUrl: "https://example.com/image.png"
            }
          }
        ]
      }
    };

    const renamed = renameAssetInSnapshot(snapshot, "asset-image", "新名称");

    expect(renamed.updated).toBe(true);
    expect(renamed.snapshot).toEqual({
      snapshot: {
        nodes: [
          {
            id: "node-image",
            data: {
              assetId: "asset-image",
              name: "新名称",
              imageUrl: "https://example.com/image.png"
            }
          }
        ]
      }
    });
    expect(snapshot.snapshot.nodes[0].data.name).toBe("旧名称");
  });
});
