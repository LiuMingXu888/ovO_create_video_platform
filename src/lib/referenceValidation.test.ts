import { describe, expect, it } from "vitest";
import type { ReferenceItem } from "../types";
import { validateReferenceItems } from "./referenceValidation";

const mb = 1024 * 1024;

function ref(overrides: Partial<ReferenceItem>): ReferenceItem {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? "asset",
    kind: overrides.kind ?? "image",
    sizeBytes: overrides.sizeBytes ?? mb,
    durationSeconds: overrides.durationSeconds,
    mimeType: overrides.mimeType,
    fileName: overrides.fileName,
    source: overrides.source ?? "asset"
  };
}

describe("validateReferenceItems", () => {
  it("accepts a valid mixed set inside the hard total limit", () => {
    const result = validateReferenceItems([
      ref({ kind: "image", name: "图1" }),
      ref({ kind: "video", name: "视频1", durationSeconds: 4, sizeBytes: 10 * mb }),
      ref({ kind: "audio", name: "音频1", durationSeconds: 5, sizeBytes: 3 * mb })
    ]);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects more than 12 total files", () => {
    const result = validateReferenceItems(
      Array.from({ length: 13 }, (_, index) => ref({ id: `image-${index}`, kind: "image" }))
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("图片 + 视频 + 音频合计不能超过 12 个文件");
  });

  it("rejects image count and image size violations", () => {
    const result = validateReferenceItems([
      ...Array.from({ length: 10 }, (_, index) => ref({ id: `image-${index}`, kind: "image" })),
      ref({ id: "large-image", kind: "image", name: "超大图", sizeBytes: 31 * mb })
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("图片最多 9 张");
    expect(result.errors).toContain("图片「超大图」必须小于 30MB");
  });

  it("rejects video count, size, and duration violations", () => {
    const result = validateReferenceItems([
      ref({ id: "v1", kind: "video", name: "v1", durationSeconds: 7, sizeBytes: 10 * mb }),
      ref({ id: "v2", kind: "video", name: "v2", durationSeconds: 7, sizeBytes: 10 * mb }),
      ref({ id: "v3", kind: "video", name: "v3", durationSeconds: 7, sizeBytes: 10 * mb }),
      ref({ id: "v4", kind: "video", name: "v4", durationSeconds: 1, sizeBytes: 51 * mb })
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("视频最多 3 个");
    expect(result.errors).toContain("视频「v4」必须小于 50MB");
    expect(result.errors).toContain("所有视频总时长必须控制在 2-15 秒");
  });

  it("rejects audio count, size, and duration violations", () => {
    const result = validateReferenceItems([
      ref({ id: "a1", kind: "audio", name: "a1", durationSeconds: 6, sizeBytes: 3 * mb }),
      ref({ id: "a2", kind: "audio", name: "a2", durationSeconds: 6, sizeBytes: 3 * mb }),
      ref({ id: "a3", kind: "audio", name: "a3", durationSeconds: 6, sizeBytes: 3 * mb }),
      ref({ id: "a4", kind: "audio", name: "a4", durationSeconds: 1, sizeBytes: 16 * mb })
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("音频最多 3 个");
    expect(result.errors).toContain("音频「a4」必须小于 15MB");
    expect(result.errors).toContain("所有音频总时长不能超过 15 秒");
  });

  it("rejects unsupported local video and audio formats", () => {
    const result = validateReferenceItems([
      ref({
        id: "webm-video",
        kind: "video",
        name: "webm-video",
        durationSeconds: 4,
        mimeType: "video/webm",
        fileName: "webm-video.webm",
        source: "local-file"
      }),
      ref({
        id: "ogg-audio",
        kind: "audio",
        name: "ogg-audio",
        durationSeconds: 4,
        mimeType: "audio/ogg",
        fileName: "ogg-audio.ogg",
        source: "local-file"
      })
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("视频「webm-video」仅支持 MP4、MOV 格式");
    expect(result.errors).toContain("音频「ogg-audio」仅支持 MP3、WAV 格式");
  });

  it("accepts local media when the MIME type is empty but the extension is supported", () => {
    const result = validateReferenceItems([
      ref({
        kind: "video",
        name: "empty-mime-video",
        durationSeconds: 4,
        mimeType: "",
        fileName: "empty-mime-video.mov",
        source: "local-file"
      }),
      ref({
        kind: "audio",
        name: "empty-mime-audio",
        durationSeconds: 4,
        mimeType: "",
        fileName: "empty-mime-audio.wav",
        source: "local-file"
      })
    ]);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
