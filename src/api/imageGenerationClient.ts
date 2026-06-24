import type { ImageGenerationSettings } from "../types";
import { endpoints } from "./endpoints";
import { IMAGE_CAMERA_PROMPT_SUFFIX, IMAGE_MODEL_IDS, getImageModelOption } from "../lib/imageGenOptions";
import type { ApiTransport } from "./transport";

// 真实契约(来自公司前端反编译): 异步图片任务首轮延迟 15s, 之后每 4s 轮询一次。
// 30 分钟预算 ≈ 15s + 4s × 450。
export const DEFAULT_IMAGE_GENERATION_POLL_OPTIONS: PollOptions = { intervalMs: 4000, maxAttempts: 450, initialDelayMs: 15000 };

export interface PollOptions {
  intervalMs: number;
  maxAttempts: number;
  initialDelayMs?: number;
}

interface BuildGenerateImagePayloadInput {
  projectId?: string;
  nodeId?: string;
  prompt: string;
  settings: ImageGenerationSettings;
  referenceImageUrls?: string[];
}

export interface GenerateImageResult {
  taskId: string;
  imageUrl: string;
}

export function resolveImageModelId(displayName: string) {
  return IMAGE_MODEL_IDS[displayName] ?? displayName;
}

export function applyCameraSuffix(prompt: string, camera: string) {
  const suffix = IMAGE_CAMERA_PROMPT_SUFFIX[camera] ?? "";
  return suffix ? `${prompt}${suffix}` : prompt;
}

export function applyAspectRatioSuffix(prompt: string, aspectRatio: string) {
  if (!aspectRatio) {
    return prompt;
  }
  return `${prompt}，生成的比例为 ${aspectRatio}`;
}

export function buildGenerateImagePayload(input: BuildGenerateImagePayloadInput) {
  const modelId = resolveImageModelId(input.settings.model);
  const withCamera = applyCameraSuffix(input.prompt, input.settings.camera);
  const prompt = applyAspectRatioSuffix(withCamera, input.settings.aspectRatio);

  const payload: Record<string, unknown> = {
    prompt,
    model: modelId,
    aspectRatio: input.settings.aspectRatio
  };

  // 画质字段按模型而定(来自真实抓包):gpt-image-2 发 size、gpt-image-2-duiba
  // 发 quality(low/medium/high)、gemini 两者都不发。
  const qualityField = getImageModelOption(input.settings.model)?.qualityField ?? null;
  if (qualityField === "size") {
    payload.size = input.settings.quality.toUpperCase();
  } else if (qualityField === "quality") {
    payload.quality = input.settings.quality;
  }

  const referenceImageUrls = (input.referenceImageUrls ?? []).filter((url): url is string => Boolean(url));
  if (referenceImageUrls.length > 0) {
    payload.image = referenceImageUrls;
  }

  if (input.projectId && input.nodeId) {
    payload._meta = {
      nodeId: input.nodeId,
      projectId: input.projectId,
      label: getTaskLabel(input.prompt)
    };
  }

  return payload;
}

interface GenerateImageResponse {
  taskId?: string;
  queueTaskId?: string;
  _genTaskId?: string;
  status?: string;
  imageUrl?: string;
  url?: string;
  outputUrl?: string;
  resultUrl?: string;
  images?: unknown;
}

interface GenerateImagePollResponse {
  status?: string;
  imageUrl?: string;
  url?: string;
  outputUrl?: string;
  resultUrl?: string;
  images?: unknown;
  errorMessage?: string;
  error?: unknown;
}

export async function generateImage(
  transport: ApiTransport,
  input: BuildGenerateImagePayloadInput,
  options: PollOptions = DEFAULT_IMAGE_GENERATION_POLL_OPTIONS
): Promise<GenerateImageResult> {
  const submitResult = await requestGenerateImage(transport, input);

  // 同步模型(gemini / nano-banana 等)直接在 POST 响应里返回图片地址。
  const directUrl = extractImageUrl(submitResult);
  if (directUrl) {
    return { taskId: submitResult.taskId ?? input.nodeId ?? "", imageUrl: directUrl };
  }

  // 异步模型(gpt-image-2 等)返回 taskId, 需轮询 GET /api/generate-image/{taskId}。
  if (!submitResult.taskId) {
    throw new Error("生成接口未返回任务 ID 或图片地址");
  }

  const pollResult = await pollImageTaskUntilComplete(
    transport,
    endpoints.generateImageTask(submitResult.taskId),
    options
  );

  const imageUrl = extractImageUrl(pollResult);
  if (!imageUrl) {
    throw new Error("生成成功但接口未返回图片地址");
  }

  return { taskId: submitResult.taskId, imageUrl };
}

async function requestGenerateImage(transport: ApiTransport, input: BuildGenerateImagePayloadInput) {
  try {
    const payload = buildGenerateImagePayload(input);
    const result = await transport.request<GenerateImageResponse>(endpoints.generateImage(), {
      method: "POST",
      body: payload
    });

    return {
      ...result,
      taskId: result.taskId ?? extractTaskId(result.queueTaskId) ?? extractTaskId(result._genTaskId)
    };
  } catch (error) {
    if (isAuthExpiredError(error)) {
      throw new Error("登录态已失效，请重新登录后再试");
    }

    // 部分慢同步模型(如 gpt-image-2-duiba/兑吧)服务端生成耗时超过网关 60s 上限,
    // nginx 直接返回 504 且不返回 taskId, 客户端无法续轮询。给出可操作提示。
    if (isGatewayTimeoutError(error)) {
      throw new Error("该模型生成超时（服务端网关 60 秒限制，未返回任务号无法续查）。请改用 Gemini 或 GPT-Image-2 等更快的模型重试。");
    }

    throw error;
  }
}

async function pollImageTaskUntilComplete(transport: ApiTransport, path: string, options: PollOptions) {
  if (options.initialDelayMs && options.initialDelayMs > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, options.initialDelayMs));
  }
  let consecutiveErrors = 0;
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    let result: GenerateImagePollResponse | undefined;
    try {
      result = await requestImagePollStatus(transport, path);
      consecutiveErrors = 0;
    } catch (error) {
      // 登录失效等致命错误立即抛出; 其余视为瞬时网络错误, 容忍连续 5 次。
      if (error instanceof Error && error.message.includes("登录态")) {
        throw error;
      }
      consecutiveErrors += 1;
      console.warn(`[图片生成] 轮询出错 (${consecutiveErrors}/5)`, error instanceof Error ? error.message : error);
      if (consecutiveErrors >= 5) {
        throw new Error("图片生成查询连续失败，请重试");
      }
    }

    if (result) {
      console.log("[图片生成] 轮询", {
        attempt: attempt + 1,
        status: result.status ?? "pending",
        path
      });

      if (result.status === "failed") {
        throw new Error(result.errorMessage ?? getPollErrorMessage(result.error) ?? "图片生成失败");
      }

      if (extractImageUrl(result)) {
        return result;
      }
    }

    if (options.intervalMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, options.intervalMs));
    }
  }

  throw new Error("任务轮询超时");
}

// 应用重开后续轮询用: 只查询任务状态, 不重新提交 generate-image (避免重复扣积分)。
// 图片任务不进 gen-queue, 因此必须有真实的 apimart taskId 才能续轮询。
export async function pollImageResult(
  transport: ApiTransport,
  input: { projectId: string; nodeId: string; taskId?: string },
  options: PollOptions = DEFAULT_IMAGE_GENERATION_POLL_OPTIONS
): Promise<GenerateImageResult> {
  if (!input.taskId) {
    throw new Error("无法续轮询：缺少任务 ID（任务可能在拿到 ID 前已中断）");
  }
  const pollResult = await pollImageTaskUntilComplete(
    transport,
    endpoints.generateImageTask(input.taskId),
    options
  );
  const imageUrl = extractImageUrl(pollResult);
  if (!imageUrl) {
    throw new Error("续轮询成功但接口未返回图片地址");
  }
  return { taskId: input.taskId, imageUrl };
}

async function requestImagePollStatus(transport: ApiTransport, path: string) {
  try {
    return await transport.request<GenerateImagePollResponse>(path);
  } catch (error) {
    if (isAuthExpiredError(error)) {
      throw new Error("登录态已失效，请重新登录后再试");
    }

    throw error;
  }
}

function extractImageUrl(result: GenerateImagePollResponse | undefined): string | undefined {
  if (!result) {
    return undefined;
  }

  const direct = stringValue(result.imageUrl) ?? stringValue(result.url) ?? stringValue(result.outputUrl) ?? stringValue(result.resultUrl);
  if (direct) {
    return direct;
  }

  if (Array.isArray(result.images)) {
    for (const entry of result.images) {
      if (typeof entry === "string" && entry.trim()) {
        return entry;
      }

      if (isRecord(entry)) {
        const nested = stringValue(entry.url) ?? stringValue(entry.imageUrl);
        if (nested) {
          return nested;
        }
      }
    }
  }

  return undefined;
}

function getTaskLabel(prompt: string) {
  const trimmed = prompt.trim();
  return trimmed.length > 32 ? `${trimmed.slice(0, 32)}...` : trimmed || "生成图片";
}

function extractTaskId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const taskId = extractTaskId(item);
      if (taskId) {
        return taskId;
      }
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of ["taskId", "id", "_id", "genTaskId", "queueTaskId"]) {
    const taskId = extractTaskId(value[key]);
    if (taskId) {
      return taskId;
    }
  }

  for (const key of ["tasks", "items", "data", "result"]) {
    const taskId = extractTaskId(value[key]);
    if (taskId) {
      return taskId;
    }
  }

  return undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getPollErrorMessage(error: unknown) {
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    for (const key of ["message", "error", "errorDetail"]) {
      if (key in error && typeof error[key as keyof typeof error] === "string") {
        return error[key as keyof typeof error] as string;
      }
    }
  }

  return undefined;
}

function isGatewayTimeoutError(error: unknown) {
  return isRecord(error) && error.status === 504;
}

function isAuthExpiredError(error: unknown) {
  if (!isRecord(error)) {
    return false;
  }

  return error.status === 401 || error.status === 403;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
