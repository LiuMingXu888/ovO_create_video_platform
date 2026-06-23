import type { ImageGenerationSettings } from "../types";
import { endpoints } from "./endpoints";
import { IMAGE_CAMERA_PROMPT_SUFFIX, IMAGE_MODEL_IDS, getImageModelOption } from "../lib/imageGenOptions";
import type { ApiTransport } from "./transport";

export const DEFAULT_IMAGE_GENERATION_POLL_OPTIONS: PollOptions = { intervalMs: 1500, maxAttempts: 600 };

export interface PollOptions {
  intervalMs: number;
  maxAttempts: number;
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

export function buildGenerateImagePayload(input: BuildGenerateImagePayloadInput) {
  const modelId = resolveImageModelId(input.settings.model);
  const prompt = applyCameraSuffix(input.prompt, input.settings.camera);

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
  let submitResult: Awaited<ReturnType<typeof requestGenerateImage>>;
  try {
    submitResult = await requestGenerateImage(transport, input);
  } catch (error) {
    // 桌面端主进程对 POST /api/generate-image 有 60s 硬超时, 超时抛 504。
    // 但任务此时已进 gen-queue 并最终成功, 因此 504 时转入按 nodeId 轮询队列兜底,
    // 而不是直接失败。不重提交 POST (避免重复扣积分)。
    if (isGatewayTimeoutError(error) && input.projectId && input.nodeId) {
      const recovered = await pollImageQueueUntilComplete(
        transport,
        input.projectId,
        input.nodeId,
        input.nodeId,
        options
      );
      const recoveredUrl = extractImageUrl(recovered);
      if (recoveredUrl) {
        return { taskId: input.nodeId, imageUrl: recoveredUrl };
      }
      throw new Error("生成请求网关超时，且队列未返回结果，请稍后在画布查看或重试");
    }

    throw error;
  }

  if (!submitResult.taskId) {
    throw new Error("生成接口未返回任务 ID");
  }

  const queueTaskId = submitResult.queueTaskId ?? submitResult.taskId;
  const pollResult =
    input.projectId && input.nodeId
      ? await pollImageQueueUntilComplete(transport, input.projectId, input.nodeId, queueTaskId, options, submitResult.taskId)
      : await pollImageTaskUntilComplete(transport, endpoints.generateImageTask(submitResult.taskId), options);

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
      taskId: result.taskId ?? extractTaskId(result.queueTaskId) ?? extractTaskId(result._genTaskId) ?? extractTaskId(result)
    };
  } catch (error) {
    if (isAuthExpiredError(error)) {
      throw new Error("登录态已失效，请重新登录后再试");
    }

    throw error;
  }
}

async function pollImageTaskUntilComplete(transport: ApiTransport, path: string, options: PollOptions) {
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    const result = await requestImagePollStatus(transport, path);

    if (result.status === "failed") {
      throw new Error(result.errorMessage ?? getPollErrorMessage(result.error) ?? "图片生成失败");
    }

    if (result.status === "succeeded" && extractImageUrl(result)) {
      return result;
    }

    if (options.intervalMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, options.intervalMs));
    }
  }

  throw new Error("任务轮询超时");
}

async function pollImageQueueUntilComplete(
  transport: ApiTransport,
  projectId: string,
  nodeId: string,
  taskId: string,
  options: PollOptions,
  providerTaskId?: string
): Promise<GenerateImagePollResponse> {
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    const queueResult = await requestQueueStatus(transport, projectId, taskId);
    const taskResult = findQueueTask(queueResult, taskId, nodeId);

    if (taskResult?.status === "failed") {
      throw new Error(taskResult.errorMessage ?? getPollErrorMessage(taskResult.error) ?? "图片生成失败");
    }

    if (taskResult?.status === "succeeded" && extractImageUrl(taskResult)) {
      return taskResult;
    }

    // Accelerator: also query the single-task endpoint, mirroring the video
    // flow where the queue can lag behind the per-task result.
    const accelerated = await requestProviderTaskStatus(transport, providerTaskId);
    if (accelerated?.status === "succeeded" && extractImageUrl(accelerated)) {
      return accelerated;
    }

    if (options.intervalMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, options.intervalMs));
    }
  }

  throw new Error("任务轮询超时");
}

async function requestProviderTaskStatus(
  transport: ApiTransport,
  providerTaskId?: string
): Promise<GenerateImagePollResponse | undefined> {
  if (!providerTaskId) {
    return undefined;
  }

  try {
    return await transport.request<GenerateImagePollResponse>(endpoints.generateImageTask(providerTaskId));
  } catch {
    return undefined;
  }
}

async function requestQueueStatus(transport: ApiTransport, projectId: string, taskId?: string) {
  try {
    return await transport.request<unknown>(endpoints.genQueue(projectId, taskId));
  } catch (error) {
    if (isAuthExpiredError(error)) {
      throw new Error("登录态已失效，请重新登录后再试");
    }

    throw error;
  }
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

function findQueueTask(value: unknown, taskId: string, nodeId: string): GenerateImagePollResponse | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findQueueTask(item, taskId, nodeId);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (matchesQueueTask(value, taskId, nodeId)) {
    return normalizeQueueTask(value);
  }

  for (const key of ["items", "tasks", "data", "result"]) {
    if (key in value) {
      const found = findQueueTask(value[key], taskId, nodeId);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

function matchesQueueTask(value: Record<string, unknown>, taskId: string, nodeId: string) {
  return (
    value.taskId === taskId ||
    value.id === taskId ||
    value._id === taskId ||
    value.queueTaskId === taskId ||
    value.nodeId === nodeId ||
    (isRecord(value.params) && value.params.nodeId === nodeId)
  );
}

function normalizeQueueTask(value: Record<string, unknown>): GenerateImagePollResponse {
  return {
    status: stringValue(value.status),
    imageUrl: stringValue(value.imageUrl),
    url: stringValue(value.url),
    outputUrl: stringValue(value.outputUrl),
    resultUrl: stringValue(value.resultUrl),
    images: value.images,
    errorMessage: stringValue(value.errorMessage),
    error: value.error
  };
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
