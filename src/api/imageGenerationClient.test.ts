import { describe, expect, it } from "vitest";
import {
  applyCameraSuffix,
  buildGenerateImagePayload,
  generateImage,
  pollImageResult,
  resolveImageModelId,
  DEFAULT_IMAGE_GENERATION_POLL_OPTIONS
} from "./imageGenerationClient";
import { IMAGE_CAMERA_PROMPT_SUFFIX } from "../lib/imageGenOptions";
import type { ApiTransport, ApiRequestOptions } from "./transport";
import type { ImageGenerationSettings } from "../types";

const baseSettings: ImageGenerationSettings = {
  model: "GPT-Image-2",
  aspectRatio: "16:9",
  quality: "4k",
  camera: "暂不选择",
  category: "人物"
};

describe("buildGenerateImagePayload", () => {
  it("maps display model names to API model ids", () => {
    expect(resolveImageModelId("GPT-Image-2")).toBe("gpt-image-2");
    expect(resolveImageModelId("GPT-Image-2(兑吧)")).toBe("gpt-image-2-duiba");
    expect(resolveImageModelId("Gemini 3 Pro")).toBe("gemini-3-pro-image-preview");
    expect(resolveImageModelId("Gemini 3.1 Flash")).toBe("gemini-3.1-flash-image-preview");
  });

  it("sends `size` for gpt-image-2 and never `quality`", () => {
    const payload = buildGenerateImagePayload({ prompt: "人物", settings: { ...baseSettings, model: "GPT-Image-2", quality: "2k" } });
    expect(payload.model).toBe("gpt-image-2");
    expect(payload.size).toBe("2K");
    expect(payload.quality).toBeUndefined();
  });

  it("sends `quality` (low/medium/high) for gpt-image-2-duiba and never `size`", () => {
    const high = buildGenerateImagePayload({ prompt: "人物", settings: { ...baseSettings, model: "GPT-Image-2(兑吧)", quality: "high" } });
    expect(high.model).toBe("gpt-image-2-duiba");
    expect(high.quality).toBe("high");
    expect(high.size).toBeUndefined();

    const low = buildGenerateImagePayload({ prompt: "人物", settings: { ...baseSettings, model: "GPT-Image-2(兑吧)", quality: "low" } });
    expect(low.quality).toBe("low");
    const medium = buildGenerateImagePayload({ prompt: "人物", settings: { ...baseSettings, model: "GPT-Image-2(兑吧)", quality: "medium" } });
    expect(medium.quality).toBe("medium");
  });

  it("sends neither size nor quality for gemini models", () => {
    const payload = buildGenerateImagePayload({ prompt: "人物", settings: { ...baseSettings, model: "Gemini 3 Pro" } });
    expect(payload.model).toBe("gemini-3-pro-image-preview");
    expect(payload.size).toBeUndefined();
    expect(payload.quality).toBeUndefined();
  });

  it("appends the camera preset phrase to the prompt", () => {
    const payload = buildGenerateImagePayload({ prompt: "一个女人", settings: { ...baseSettings, camera: "Sony FX3" } });
    expect(payload.prompt).toBe(`一个女人${IMAGE_CAMERA_PROMPT_SUFFIX["Sony FX3"]}`);
  });

  it("leaves the prompt unchanged for 暂不选择", () => {
    expect(applyCameraSuffix("hello", "暂不选择")).toBe("hello");
  });

  it("includes reference images and _meta when project/node are present", () => {
    const payload = buildGenerateImagePayload({
      projectId: "proj-1",
      nodeId: "node-1",
      prompt: "人物",
      settings: baseSettings,
      referenceImageUrls: ["https://example.com/a.png", "", "https://example.com/b.png"]
    });
    expect(payload.image).toEqual(["https://example.com/a.png", "https://example.com/b.png"]);
    expect(payload._meta).toMatchObject({ nodeId: "node-1", projectId: "proj-1" });
  });

  it("omits the image field when there are no references", () => {
    const payload = buildGenerateImagePayload({ prompt: "人物", settings: baseSettings });
    expect(payload.image).toBeUndefined();
    expect(payload._meta).toBeUndefined();
  });
});

class StubTransport implements ApiTransport {
  public calls: Array<{ path: string; options?: ApiRequestOptions }> = [];

  constructor(private readonly responder: (path: string, options?: ApiRequestOptions) => unknown) {}

  async request<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    this.calls.push({ path, options });
    return this.responder(path, options) as T;
  }
}

describe("generateImage", () => {
  it("submits then resolves the image url from the queue", async () => {
    const transport = new StubTransport((path, options) => {
      if (options?.method === "POST" && path.endsWith("/generate-image")) {
        return { taskId: "task-1" };
      }

      if (path.includes("/gen-queue")) {
        return { tasks: [{ taskId: "task-1", status: "succeeded", imageUrl: "https://example.com/out.png" }] };
      }

      return {};
    });

    const result = await generateImage(
      transport,
      { projectId: "proj-1", nodeId: "node-1", prompt: "人物", settings: baseSettings },
      { intervalMs: 0, maxAttempts: 3 }
    );

    expect(result).toEqual({ taskId: "task-1", imageUrl: "https://example.com/out.png" });
  });

  it("recovers from a submit 504 by polling the queue with nodeId", async () => {
    const transport = new StubTransport((path, options) => {
      if (options?.method === "POST" && path.endsWith("/generate-image")) {
        throw { status: 504, message: "请求失败 (504)" };
      }

      if (path.includes("/gen-queue")) {
        return { tasks: [{ nodeId: "node-1", status: "succeeded", resultUrl: "https://example.com/recovered.png" }] };
      }

      return {};
    });

    const result = await generateImage(
      transport,
      { projectId: "proj-1", nodeId: "node-1", prompt: "人物", settings: baseSettings },
      { intervalMs: 0, maxAttempts: 3 }
    );

    expect(result).toEqual({ taskId: "node-1", imageUrl: "https://example.com/recovered.png" });
  });

  it("does not surface the raw 504 when a 504 submit leaves nothing in the queue", async () => {
    const transport = new StubTransport((path, options) => {
      if (options?.method === "POST" && path.endsWith("/generate-image")) {
        throw { status: 504, message: "请求失败 (504)" };
      }

      return { tasks: [] };
    });

    // 504 后转队列轮询; 队列始终为空时, 轮询自身超时, 而不是把原始 "请求失败 (504)" 抛给用户。
    await expect(
      generateImage(
        transport,
        { projectId: "proj-1", nodeId: "node-1", prompt: "人物", settings: baseSettings },
        { intervalMs: 0, maxAttempts: 2 }
      )
    ).rejects.toThrow("轮询超时");
  });

  it("re-throws a 504 when project/node are absent (no queue to recover from)", async () => {
    const transport = new StubTransport((_path, options) => {
      if (options?.method === "POST") {
        throw { status: 504, message: "请求失败 (504)" };
      }

      return {};
    });

    await expect(
      generateImage(transport, { prompt: "x", settings: baseSettings }, { intervalMs: 0, maxAttempts: 2 })
    ).rejects.toMatchObject({ status: 504 });
  });

  it("throws a clear error when the task fails", async () => {
    const transport = new StubTransport((path, options) => {
      if (options?.method === "POST") {
        return { taskId: "task-2" };
      }

      return { tasks: [{ taskId: "task-2", status: "failed", errorMessage: "内容违规" }] };
    });

    await expect(
      generateImage(transport, { projectId: "p", nodeId: "n", prompt: "x", settings: baseSettings }, { intervalMs: 0, maxAttempts: 3 })
    ).rejects.toThrow("内容违规");
  });
});

describe("DEFAULT_IMAGE_GENERATION_POLL_OPTIONS", () => {
  it("defaults to 30 minutes (1.5s × 1200)", () => {
    expect(DEFAULT_IMAGE_GENERATION_POLL_OPTIONS).toEqual({ intervalMs: 1500, maxAttempts: 1200 });
  });
});

describe("pollImageResult", () => {
  it("polls the queue until an image url appears without re-submitting generate-image", async () => {
    let queueCalls = 0;
    const transport = new StubTransport((path, options) => {
      if (options?.method === "POST" && path.endsWith("/generate-image")) {
        throw new Error("不应重新提交 generate-image");
      }

      if (path.includes("/gen-queue")) {
        queueCalls += 1;
        if (queueCalls < 2) {
          return { tasks: [{ nodeId: "node-1", status: "running" }] };
        }
        return { tasks: [{ nodeId: "node-1", status: "succeeded", imageUrl: "https://example.com/resumed.png" }] };
      }

      return {};
    });

    const result = await pollImageResult(
      transport,
      { projectId: "proj-1", nodeId: "node-1", taskId: "task-1" },
      { intervalMs: 0, maxAttempts: 5 }
    );

    expect(result).toEqual({ taskId: "task-1", imageUrl: "https://example.com/resumed.png" });
    const submitCalls = transport.calls.filter(
      (call) => call.options?.method === "POST" && call.path.endsWith("/generate-image")
    );
    expect(submitCalls).toHaveLength(0);
  });

  it("falls back to nodeId as queue task id when taskId is missing", async () => {
    const transport = new StubTransport((path) => {
      if (path.includes("/gen-queue")) {
        return { tasks: [{ nodeId: "node-1", status: "succeeded", imageUrl: "https://example.com/done.png" }] };
      }
      return {};
    });

    const result = await pollImageResult(
      transport,
      { projectId: "proj-1", nodeId: "node-1" },
      { intervalMs: 0, maxAttempts: 3 }
    );

    expect(result).toEqual({ taskId: "node-1", imageUrl: "https://example.com/done.png" });
  });
});
