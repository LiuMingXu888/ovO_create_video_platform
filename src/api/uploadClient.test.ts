import { describe, expect, it } from "vitest";
import {
  addAssetNodeToSnapshot,
  buildAssetUploadPayload,
  buildUploadFormData,
  createCompanyAudioNode,
  createCompanyImageNode,
  createCompanyVideoNode,
  getUploadPrefix,
  uploadCanvasAsset
} from "./uploadClient";
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

  it("builds native company image nodes for uploaded files", () => {
    expect(
      createCompanyImageNode({
        id: "asset-image",
        name: "场景图",
        kind: "image",
        category: "scenes",
        url: "https://example.com/scene.png",
        sizeBytes: 12
      })
    ).toEqual({
      id: "asset-image",
      type: "image",
      x: 0,
      y: 0,
      position: { x: 0, y: 0 },
      measured: { width: 288, height: 162 },
      data: {
        id: "asset-image",
        assetId: "asset-image",
        name: "场景图",
        label: "场景图",
        type: "image",
        kind: "image",
        category: "scenes",
        imageUrl: "https://example.com/scene.png",
        assetUri: "https://example.com/scene.png",
        assetStatus: "Active",
        status: "completed",
        imageSource: "upload",
        sizeBytes: 12
      }
    });
  });

  it("builds native company audio nodes for uploaded files", () => {
    expect(
      createCompanyAudioNode({
        id: "asset-audio",
        name: "旁白",
        kind: "audio",
        category: "audio",
        url: "https://example.com/audio.mp3",
        durationSeconds: 8,
        sizeBytes: 12
      })
    ).toEqual({
      id: "asset-audio",
      type: "audio",
      x: 0,
      y: 0,
      position: { x: 0, y: 0 },
      measured: { width: 224, height: 122 },
      data: {
        id: "asset-audio",
        assetId: "asset-audio",
        name: "旁白",
        label: "旁白",
        type: "audio",
        kind: "audio",
        category: "audio",
        audioUrl: "https://example.com/audio.mp3",
        assetUri: "https://example.com/audio.mp3",
        assetStatus: "Active",
        status: "idle",
        duration: 8,
        durationSeconds: 8,
        isCustomUpload: true,
        voicePresetId: null,
        voiceName: null,
        gender: null,
        ageGroup: null,
        sizeBytes: 12
      }
    });
  });

  it("builds native company video nodes for generated persisted videos", () => {
    expect(
      createCompanyVideoNode({
        id: "asset-video",
        name: "生成视频",
        kind: "video",
        category: "video",
        url: "https://example.com/video.mp4",
        providerVideoUrl: "https://provider.example.com/video.mp4",
        durationSeconds: 15,
        sizeBytes: 12,
        generationPrompt: "镜头推进",
        generationReferences: [{ id: "ref-1", name: "图", kind: "image", url: "https://example.com/image.png", sizeBytes: 1, source: "asset" }]
      })
    ).toEqual({
      id: "asset-video",
      type: "video",
      x: 0,
      y: 0,
      position: { x: 0, y: 0 },
      measured: { width: 320, height: 588 },
      data: {
        id: "asset-video",
        assetId: "asset-video",
        name: "生成视频",
        label: "生成视频",
        type: "video",
        kind: "video",
        category: "video",
        videoUrl: "https://example.com/video.mp4",
        seedanceProviderUrl: "https://provider.example.com/video.mp4",
        assetUri: "https://example.com/video.mp4",
        assetStatus: "Active",
        status: "idle",
        videoPersisted: true,
        duration: 15,
        durationSeconds: 15,
        resolution: "720p",
        generateAudio: true,
        genTab: "allref",
        model: "Seedance 2.0",
        modelName: "Seedance 2.0",
        aspectRatio: "9:16",
        sizeBytes: 12,
        generationPrompt: "镜头推进",
        prompt: "镜头推进",
        generationReferences: [{ id: "ref-1", name: "图", kind: "image", url: "https://example.com/image.png", sizeBytes: 1, source: "asset" }],
        referenceImages: ["https://example.com/image.png"],
        referenceVideos: [],
        referenceAudios: []
      }
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
            type: "audio",
            x: 0,
            y: 0,
            position: { x: 0, y: 0 },
            measured: { width: 224, height: 122 },
            data: {
              id: "asset-audio",
              assetId: "asset-audio",
              name: "音频",
              label: "音频",
              type: "audio",
              kind: "audio",
              category: "audio",
              audioUrl: "https://example.com/audio.mp3",
              assetUri: "https://example.com/audio.mp3",
              assetStatus: "Active",
              status: "idle",
              isCustomUpload: true,
              voicePresetId: null,
              voiceName: null,
              gender: null,
              ageGroup: null,
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
            type: "video",
            x: 0,
            y: 0,
            position: { x: 0, y: 0 },
            measured: { width: 320, height: 588 },
              data: {
                id: "asset-video",
                assetId: "asset-video",
                name: "视频",
                label: "视频",
                type: "video",
                kind: "video",
                category: "video",
                videoUrl: "https://example.com/video.mp4",
                assetUri: "https://example.com/video.mp4",
                assetStatus: "Active",
                status: "idle",
                videoPersisted: true,
                resolution: "720p",
                generateAudio: true,
                genTab: "allref",
                model: "Seedance 2.0",
                modelName: "Seedance 2.0",
                aspectRatio: "9:16",
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
            type: "image",
            x: 0,
            y: 0,
            position: { x: 0, y: 0 },
            measured: { width: 288, height: 162 },
            data: {
              id: "asset-scene",
              assetId: "asset-scene",
              name: "场景图",
              label: "场景图",
              type: "image",
              kind: "image",
              category: "scenes",
              imageUrl: "https://example.com/scene.png",
              assetUri: "https://example.com/scene.png",
              assetStatus: "Active",
              status: "completed",
              imageSource: "upload",
              sizeBytes: 12
            }
          }
        ]
      }
    });
  });

  it("uploads a file and saves the project snapshot with a new node", async () => {
    const requests: Array<{ path: string; options?: unknown }> = [];
    let savedSnapshot: unknown = { snapshot: { nodes: [] } };
    const transport: ApiTransport = {
      request: async (path, options) => {
        requests.push({ path, options });

        if (path === "/api/upload-file") {
          return {
            publicUrl: "https://example.com/uploaded.png",
            fileSize: 4
          } as never;
        }

        if (options && "method" in options && options.method === "PUT") {
          savedSnapshot = options.body;
          return { ok: true } as never;
        }

        return savedSnapshot as never;
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
    expect(requests[1]).toEqual({ path: "/api/projects/project-1/snapshot", options: undefined });
    expect(requests[2]).toMatchObject({
      path: "/api/projects/project-1/snapshot",
      options: {
        method: "PUT"
      }
    });
    expect(requests[3]).toEqual({ path: "/api/projects/project-1/snapshot", options: undefined });
  });

  it("places consecutively added nodes at distinct positions instead of stacking at the origin", () => {
    let snapshot: unknown = { snapshot: { nodes: [] } };
    snapshot = addAssetNodeToSnapshot(snapshot, {
      id: "asset-a",
      name: "A",
      kind: "image",
      category: "characters",
      url: "https://example.com/a.png"
    });
    snapshot = addAssetNodeToSnapshot(snapshot, {
      id: "asset-b",
      name: "B",
      kind: "image",
      category: "characters",
      url: "https://example.com/b.png"
    });

    const nodes = (snapshot as { snapshot: { nodes: Array<{ id: string; position: { x: number; y: number } }> } }).snapshot.nodes;
    const a = nodes.find((node) => node.id === "asset-a")!;
    const b = nodes.find((node) => node.id === "asset-b")!;
    expect(a.position).toEqual({ x: 0, y: 0 });
    expect(b.position).not.toEqual(a.position);
    expect(b.position.y).toBeGreaterThan(a.position.y);
  });

  it("company node schema 对齐公司端原生: image 完成态 status=completed + imageSource=upload", () => {
    const n = createCompanyImageNode({ id: "a1", name: "n", kind: "image", category: "scenes", url: "http://x/y", status: "ready" });
    expect(n.data.status).toBe("completed");
    expect(n.data.imageSource).toBe("upload");
  });
  it("company node schema 对齐公司端原生: audio 完成态 status=idle + isCustomUpload=true + 占位字段为 null", () => {
    const n = createCompanyAudioNode({ id: "a1", name: "n", kind: "audio", category: "audio", url: "http://x/y", status: "ready" });
    expect(n.data.status).toBe("idle");
    expect(n.data.isCustomUpload).toBe(true);
    expect(n.data.voicePresetId).toBeNull();
    expect(n.data.voiceName).toBeNull();
    expect(n.data.gender).toBeNull();
    expect(n.data.ageGroup).toBeNull();
  });
  it("company node schema 对齐公司端原生: video 完成态 status=idle + model=Seedance 2.0", () => {
    const n = createCompanyVideoNode({ id: "a1", name: "n", kind: "video", category: "video", url: "http://x/y", status: "ready" });
    expect(n.data.status).toBe("idle");
    expect(n.data.model).toBe("Seedance 2.0");
  });
  it("company node schema 对齐公司端原生: 生成中占位 status 不被强转为完成值", () => {
    const n = createCompanyVideoNode({ id: "a1", name: "n", kind: "video", category: "video", url: "http://x/y", status: "generating" });
    expect(n.data.status).toBe("generating");
  });

  it("preserves an existing node's position when it is updated in place", () => {
    const snapshot = {
      snapshot: {
        nodes: [
          {
            id: "asset-c",
            type: "image",
            x: 120,
            y: 340,
            position: { x: 120, y: 340 },
            data: { id: "asset-c", assetId: "asset-c", status: "generating" }
          }
        ]
      }
    };

    const next = addAssetNodeToSnapshot(snapshot, {
      id: "asset-c",
      name: "完成图",
      kind: "image",
      category: "characters",
      url: "https://example.com/c.png"
    }) as { snapshot: { nodes: Array<{ id: string; position: { x: number; y: number } }> } };

    expect(next.snapshot.nodes).toHaveLength(1);
    expect(next.snapshot.nodes[0].position).toEqual({ x: 120, y: 340 });
  });
});
