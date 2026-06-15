import { describe, expect, it } from "vitest";
import { addAssetNodeToSnapshot, buildAssetUploadPayload, buildUploadFormData, getUploadPrefix, uploadCanvasAsset } from "./uploadClient";
import type { ApiTransport } from "./transport";

describe("uploadClient payload builders", () => {
  it("uses the filename without extension as upload prefix", () => {
    expect(getUploadPrefix(new File(["x"], "green-box.png", { type: "image/png" }))).toBe("green-box");
  });

  it("builds upload FormData with file, prefix, and projectId", () => {
    const file = new File(["x"], "green-box.png", { type: "image/png" });
    const formData = buildUploadFormData(file, "project-1");

    expect(formData.get("file")).toBe(file);
    expect(formData.get("prefix")).toBe("green-box");
    expect(formData.get("projectId")).toBe("project-1");
  });

  it("builds asset metadata for registration", () => {
    expect(
      buildAssetUploadPayload({
        name: "green-box",
        kind: "image",
        publicUrl: "https://example.com/green-box.png",
        projectId: "project-1"
      })
    ).toEqual({
      name: "green-box",
      type: "image",
      url: "https://example.com/green-box.png",
      projectId: "project-1"
    });
  });

  it("adds default coordinates to uploaded asset nodes", () => {
    const snapshot = { snapshot: { nodes: [] } };
    const nextSnapshot = addAssetNodeToSnapshot(snapshot, {
      id: "asset-audio",
      name: "音频",
      kind: "audio",
      category: "audio",
      url: "https://example.com/audio.mp3",
      sizeBytes: 12
    });

    expect(nextSnapshot).toEqual({
      snapshot: {
        nodes: [
          {
            id: "asset-audio",
            type: "audio-node",
            x: 0,
            y: 0,
            position: { x: 0, y: 0 },
            data: {
              id: "asset-audio",
              assetId: "asset-audio",
              name: "音频",
              type: "audio",
              kind: "audio",
              category: "audio",
              audioUrl: "https://example.com/audio.mp3",
              sizeBytes: 12
            }
          }
        ]
      }
    });
  });

  it("adds uploaded assets to wrapped project snapshots as media nodes", () => {
    const snapshot = { snapshot: { nodes: [] } };

    expect(
      addAssetNodeToSnapshot(snapshot, {
        id: "asset-video",
        name: "视频",
        kind: "video",
        category: "video",
        url: "https://example.com/video.mp4",
        sizeBytes: 12
      })
    ).toEqual({
      snapshot: {
        nodes: [
          {
            id: "asset-video",
            type: "video-node",
            x: 0,
            y: 0,
            position: { x: 0, y: 0 },
              data: {
                id: "asset-video",
                assetId: "asset-video",
                name: "视频",
                type: "video",
                kind: "video",
                category: "video",
                videoUrl: "https://example.com/video.mp4",
                sizeBytes: 12
              }
            }
        ]
      }
    });
    expect(snapshot.snapshot.nodes).toEqual([]);
  });

  it("preserves the selected image category on uploaded snapshot nodes", () => {
    const snapshot = { snapshot: { nodes: [] } };

    expect(
      addAssetNodeToSnapshot(snapshot, {
        id: "asset-scene",
        name: "场景图",
        kind: "image",
        category: "scenes",
        url: "https://example.com/scene.png",
        sizeBytes: 12
      })
    ).toEqual({
      snapshot: {
        nodes: [
          {
            id: "asset-scene",
            type: "image-node",
            x: 0,
            y: 0,
            position: { x: 0, y: 0 },
            data: {
              id: "asset-scene",
              assetId: "asset-scene",
              name: "场景图",
              type: "image",
              kind: "image",
              category: "scenes",
              imageUrl: "https://example.com/scene.png",
              sizeBytes: 12
            }
          }
        ]
      }
    });
  });

  it("uploads a file and saves the project snapshot with a new node", async () => {
    const requests: Array<{ path: string; options?: unknown }> = [];
    const transport: ApiTransport = {
      request: async (path, options) => {
        requests.push({ path, options });

        if (path === "/api/upload-file") {
          return {
            publicUrl: "https://example.com/uploaded.png",
            fileSize: 4
          } as never;
        }

        return { ok: true } as never;
      }
    };
    const file = new File(["data"], "uploaded.png", { type: "image/png" });

    const result = await uploadCanvasAsset(transport, {
      projectId: "project-1",
      snapshot: { snapshot: { nodes: [] } },
      file,
      name: "uploaded",
      kind: "image",
      category: "characters"
    });

    expect(result.asset).toMatchObject({
      name: "uploaded",
      kind: "image",
      category: "characters",
      url: "https://example.com/uploaded.png",
      sizeBytes: 4
    });
    expect(requests[0].path).toBe("/api/upload-file");
    expect(requests[1]).toMatchObject({
      path: "/api/projects/project-1/snapshot",
      options: {
        method: "PUT"
      }
    });
  });
});
