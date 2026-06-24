import { describe, expect, it } from "vitest";
import {
  applyCameraSuffix,
  applyAspectRatioSuffix,
  buildGenerateImagePayload,
  generateImage,
  pollGenQueueByNodeId,
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
    expect(payload.prompt).toBe(
      `一个女人${IMAGE_CAMERA_PROMPT_SUFFIX["Sony FX3"]}，生成的比例为 ${baseSettings.aspectRatio}`
    );
  });

  it("appends the aspect-ratio phrase to the sent prompt", () => {
    const payload = buildGenerateImagePayload({
      prompt: "一个女人",
      settings: { ...baseSettings, aspectRatio: "9:16", camera: "暂不选择" }
    });
    expect(payload.prompt).toBe("一个女人，生成的比例为 9:16");
    expect(payload.aspectRatio).toBe("9:16"); // 字段仍照常发送
  });

  it("appends ratio AFTER the camera suffix, in order", () => {
    const payload = buildGenerateImagePayload({
      prompt: "一个女人",
      settings: { ...baseSettings, aspectRatio: "1:1", camera: "Sony FX3" }
    });
    expect(payload.prompt).toBe(
      `一个女人${IMAGE_CAMERA_PROMPT_SUFFIX["Sony FX3"]}，生成的比例为 1:1`
    );
  });

  it("keeps _meta.label based on the original prompt (not polluted by suffixes)", () => {
    const payload = buildGenerateImagePayload({
      projectId: "p1",
      nodeId: "n1",
      prompt: "海边日落",
      settings: { ...baseSettings, aspectRatio: "16:9", camera: "Sony FX3" }
    });
    expect((payload._meta as { label: string }).label).toBe("海边日落");
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
  it("resolves directly from the POST response for sync models (imageUrl in body)", async () => {
    const transport = new StubTransport((path, options) => {
      if (options?.method === "POST" && path.endsWith("/generate-image")) {
        return {
          imageUrl: "https://example.com/sync.png",
          images: ["https://example.com/sync.png"],
          created: 123
        };
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const result = await generateImage(
      transport,
      { projectId: "proj-1", nodeId: "node-1", prompt: "人物", settings: baseSettings },
      { intervalMs: 0, maxAttempts: 3 }
    );

    expect(result.imageUrl).toBe("https://example.com/sync.png");
    // 同步模型不应再轮询 per-task 接口。
    const pollCalls = transport.calls.filter((call) => call.path.includes("/generate-image/"));
    expect(pollCalls).toHaveLength(0);
  });

  it("submits then polls the per-task endpoint for async models (taskId in body)", async () => {
    let pollCalls = 0;
    const transport = new StubTransport((path, options) => {
      if (options?.method === "POST" && path.endsWith("/generate-image")) {
        return { taskId: "apimart:task_1", status: "submitted" };
      }
      if (path.includes("/generate-image/")) {
        expect(path).toContain(encodeURIComponent("apimart:task_1"));
        pollCalls += 1;
        if (pollCalls < 2) {
          return { taskId: "apimart:task_1", status: "running" };
        }
        return { taskId: "apimart:task_1", status: "succeeded", imageUrl: "https://example.com/out.png" };
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const result = await generateImage(
      transport,
      { projectId: "proj-1", nodeId: "node-1", prompt: "人物", settings: baseSettings },
      { intervalMs: 0, maxAttempts: 5 }
    );

    expect(result).toEqual({ taskId: "apimart:task_1", imageUrl: "https://example.com/out.png" });
    // 图片任务不进 gen-queue, 不应查询队列接口。
    expect(transport.calls.some((call) => call.path.includes("/gen-queue"))).toBe(false);
  });

  it("throws when neither imageUrl nor taskId is returned", async () => {
    const transport = new StubTransport((path, options) => {
      if (options?.method === "POST" && path.endsWith("/generate-image")) {
        return { status: "submitted" };
      }
      throw new Error(`unexpected call: ${path}`);
    });

    await expect(
      generateImage(
        transport,
        { projectId: "proj-1", nodeId: "node-1", prompt: "人物", settings: baseSettings },
        { intervalMs: 0, maxAttempts: 3 }
      )
    ).rejects.toThrow("未返回任务 ID 或图片地址");
  });

  it("throws a clear error when the task fails", async () => {
    const transport = new StubTransport((path, options) => {
      if (options?.method === "POST") {
        return { taskId: "apimart:task_2", status: "submitted" };
      }
      return { taskId: "apimart:task_2", status: "failed", errorMessage: "内容违规" };
    });

    await expect(
      generateImage(transport, { projectId: "p", nodeId: "n", prompt: "x", settings: baseSettings }, { intervalMs: 0, maxAttempts: 3 })
    ).rejects.toThrow("内容违规");
  });

  it("tolerates transient poll errors and keeps polling", async () => {
    let pollCalls = 0;
    const transport = new StubTransport((path, options) => {
      if (options?.method === "POST") {
        return { taskId: "apimart:task_3", status: "submitted" };
      }
      pollCalls += 1;
      if (pollCalls <= 2) {
        throw new Error("网络抖动");
      }
      return { taskId: "apimart:task_3", status: "succeeded", imageUrl: "https://example.com/ok.png" };
    });

    const result = await generateImage(
      transport,
      { projectId: "p", nodeId: "n", prompt: "x", settings: baseSettings },
      { intervalMs: 0, maxAttempts: 6 }
    );
    expect(result.imageUrl).toBe("https://example.com/ok.png");
  });

  it("falls back to gen-queue polling (by nodeId) when POST hits a 504 gateway timeout", async () => {
    let queueCalls = 0;
    const transport = new StubTransport((path, options) => {
      if (options?.method === "POST" && path.endsWith("/generate-image")) {
        throw { status: 504, message: "请求失败 (504)", detail: null };
      }
      if (path.includes("/gen-queue")) {
        expect(path).toContain("projectId=proj-1");
        queueCalls += 1;
        if (queueCalls < 2) {
          return { stats: {}, tasks: [{ id: "t1", nodeId: "node-1", status: "running", resultUrl: null, errorMessage: null }] };
        }
        return {
          stats: {},
          tasks: [{ id: "t1", nodeId: "node-1", status: "succeeded", resultUrl: "https://example.com/duiba.png", errorMessage: null }]
        };
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const result = await generateImage(
      transport,
      { projectId: "proj-1", nodeId: "node-1", prompt: "人物", settings: { ...baseSettings, model: "GPT-Image-2(兑吧)" } },
      { intervalMs: 0, maxAttempts: 5, initialDelayMs: 0 }
    );

    expect(result.imageUrl).toBe("https://example.com/duiba.png");
    expect(queueCalls).toBeGreaterThanOrEqual(2);
  });

  it("throws when the gen-queue task ends in failed after a 504", async () => {
    const transport = new StubTransport((path, options) => {
      if (options?.method === "POST" && path.endsWith("/generate-image")) {
        throw { status: 504, message: "请求失败 (504)", detail: null };
      }
      if (path.includes("/gen-queue")) {
        return {
          stats: {},
          tasks: [{ id: "t1", nodeId: "node-1", status: "failed", resultUrl: null, errorMessage: "内容违规" }]
        };
      }
      throw new Error(`unexpected call: ${path}`);
    });

    await expect(
      generateImage(
        transport,
        { projectId: "proj-1", nodeId: "node-1", prompt: "人物", settings: { ...baseSettings, model: "GPT-Image-2(兑吧)" } },
        { intervalMs: 0, maxAttempts: 5, initialDelayMs: 0 }
      )
    ).rejects.toThrow("内容违规");
  });
});

describe("pollGenQueueByNodeId", () => {
  it("returns the resultUrl of the matching nodeId task once it succeeds", async () => {
    let calls = 0;
    const transport = new StubTransport((path) => {
      if (path.includes("/gen-queue")) {
        calls += 1;
        const status = calls < 2 ? "running" : "succeeded";
        return {
          stats: {},
          tasks: [
            { id: "other", nodeId: "someone-else", status: "succeeded", resultUrl: "https://example.com/nope.png" },
            { id: "mine", nodeId: "node-9", status, resultUrl: status === "succeeded" ? "https://example.com/mine.png" : null }
          ]
        };
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const result = await pollGenQueueByNodeId(
      transport,
      { projectId: "proj-1", nodeId: "node-9" },
      { intervalMs: 0, maxAttempts: 5, initialDelayMs: 0 }
    );
    expect(result.imageUrl).toBe("https://example.com/mine.png");
  });
});

describe("DEFAULT_IMAGE_GENERATION_POLL_OPTIONS", () => {
  it("matches the company contract: 15s initial delay then 4s interval, 30-min budget", () => {
    expect(DEFAULT_IMAGE_GENERATION_POLL_OPTIONS).toEqual({ intervalMs: 4000, maxAttempts: 450, initialDelayMs: 15000 });
  });
});

describe("pollImageResult", () => {
  it("polls the per-task endpoint until an image url appears without re-submitting generate-image", async () => {
    let pollCalls = 0;
    const transport = new StubTransport((path, options) => {
      if (options?.method === "POST" && path.endsWith("/generate-image")) {
        throw new Error("不应重新提交 generate-image");
      }
      if (path.includes("/generate-image/")) {
        pollCalls += 1;
        if (pollCalls < 2) {
          return { taskId: "apimart:task_1", status: "running" };
        }
        return { taskId: "apimart:task_1", status: "succeeded", imageUrl: "https://example.com/resumed.png" };
      }
      return {};
    });

    const result = await pollImageResult(
      transport,
      { projectId: "proj-1", nodeId: "node-1", taskId: "apimart:task_1" },
      { intervalMs: 0, maxAttempts: 5 }
    );

    expect(result).toEqual({ taskId: "apimart:task_1", imageUrl: "https://example.com/resumed.png" });
    const submitCalls = transport.calls.filter(
      (call) => call.options?.method === "POST" && call.path.endsWith("/generate-image")
    );
    expect(submitCalls).toHaveLength(0);
  });

  it("throws when there is no taskId to resume with (image tasks are not in gen-queue)", async () => {
    const transport = new StubTransport(() => ({}));

    await expect(
      pollImageResult(transport, { projectId: "proj-1", nodeId: "node-1" }, { intervalMs: 0, maxAttempts: 3 })
    ).rejects.toThrow("缺少任务 ID");
  });
});
