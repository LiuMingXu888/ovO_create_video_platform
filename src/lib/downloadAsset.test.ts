import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadAsset, downloadAssets } from "./downloadAsset";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("downloadAsset", () => {
  it("uses the desktop bridge to save assets into the downloads folder when available", async () => {
    const saveAsset = vi.fn().mockResolvedValue({ ok: true, path: "/Users/mac/Downloads/素材.png" });
    vi.stubGlobal("window", {
      ovoDesktop: {
        file: { saveAsset }
      }
    });

    await downloadAsset({
      id: "asset-1",
      name: "素材",
      kind: "image",
      category: "characters",
      url: "https://example.com/image.png"
    });

    expect(saveAsset).toHaveBeenCalledWith({
      url: "https://example.com/image.png",
      fileName: "素材.png"
    });
  });

  it("downloads remote assets through a temporary blob URL", async () => {
    const blob = new Blob(["asset"], { type: "image/png" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }));
    const createObjectURL = vi.fn(() => "blob:download");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const anchor = document.createElement("a");
    const click = vi.fn();
    vi.spyOn(anchor, "click").mockImplementation(click);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName === "a") {
        return anchor;
      }
      return Document.prototype.createElement.call(document, tagName, options);
    }) as typeof document.createElement);

    await downloadAsset({
      id: "asset-1",
      name: "素材",
      kind: "image",
      category: "characters",
      url: "https://example.com/image.png"
    });

    expect(anchor.href).toBe("blob:download");
    expect(anchor.download).toBe("素材.png");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:download");
  });

  it("uses the desktop bridge to save selected assets with category folder metadata", async () => {
    const saveAssets = vi.fn().mockResolvedValue({ ok: true, directoryPath: "/Users/mac/Downloads/2026-06-15-201500" });
    vi.stubGlobal("window", {
      ovoDesktop: {
        file: { saveAssets }
      }
    });

    await downloadAssets([
      {
        id: "asset-1",
        name: "素材",
        kind: "image",
        category: "characters",
        url: "https://example.com/image.png"
      },
      {
        id: "asset-2",
        name: "开场参考视频.mp4",
        kind: "video",
        category: "video",
        url: "https://example.com/video.mp4"
      }
    ]);

    expect(saveAssets).toHaveBeenCalledWith({
      assets: [
        { url: "https://example.com/image.png", fileName: "素材.png", category: "characters", categoryLabel: "人物" },
        { url: "https://example.com/video.mp4", fileName: "开场参考视频.mp4", category: "video", categoryLabel: "视频" }
      ]
    });
  });
});
