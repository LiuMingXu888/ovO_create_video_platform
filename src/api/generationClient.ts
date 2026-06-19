import type { GenerationSettings, ReferenceItem } from "../types";
import { endpoints } from "./endpoints";
import type { ApiTransport } from "./transport";

export const DEFAULT_GENERATION_POLL_OPTIONS: PollOptions = { intervalMs: 1500, maxAttempts: 3600 };

interface BuildGenerateVideoPayloadInput {
  projectId?: string;
  nodeId?: string;
  prompt: string;
  references: ReferenceItem[];
  settings?: GenerationSettings;
}

const SEEDANCE_MODEL_ID = "ep-20260319213857-htd7q";
const SEEDANCE_MODEL_NAME = "Seedance 2.0";

export function buildGenerateVideoPayload(input: BuildGenerateVideoPayloadInput) {
  const settings: GenerationSettings = input.settings ?? {
    aspectRatio: "9:16",
    durationSeconds: 15,
    omnireference: true
  };

  return {
    prompt: input.prompt,
    model: SEEDANCE_MODEL_NAME,
    aspectRatio: settings.aspectRatio,
    resolution: "720p",
    duration: settings.durationSeconds,
    referenceMode: settings.omnireference ? "omnireference" : "standard",
    referenceImages: getReferenceValues(input.references, "image"),
    referenceVideos: getReferenceValues(input.references, "video"),
    referenceAudios: getReferenceValues(input.references, "audio")
  };
}

export function buildCompanyGenerateVideoPayload(input: BuildGenerateVideoPayloadInput) {
  const settings: GenerationSettings = input.settings ?? {
    aspectRatio: "9:16",
    durationSeconds: 15,
    omnireference: true
  };
  const params = buildCompanyGenerateVideoParams(input, settings);

  let payload: any;
  if (input.projectId && input.nodeId) {
    payload = {
      ...params,
      ratio: settings.aspectRatio,
      _meta: {
        nodeId: input.nodeId,
        projectId: input.projectId,
        label: getTaskLabel(input.prompt)
      },
      task: {
        projectId: input.projectId,
        nodeId: input.nodeId,
        type: "video",
        label: getTaskLabel(input.prompt),
        modelName: SEEDANCE_MODEL_NAME,
        duration: settings.durationSeconds,
        aspectRatio: settings.aspectRatio
      }
    };
  } else {
    payload = params;
  }

  // 详细的调试日志
  console.log("[视频生成] Payload详情：", {
    "UI选择的比例": settings.aspectRatio,
    "payload.aspectRatio": payload.aspectRatio,
    "payload.ratio": payload.ratio,
    "payload.task?.aspectRatio": payload.task?.aspectRatio,
    "参考图片数量": payload.referenceImages?.length ?? 0,
    "参考视频数量": payload.referenceVideos?.length ?? 0,
    "参考音频数量": payload.referenceAudios?.length ?? 0,
    "参考图片URLs": payload.referenceImages,
    "参考视频URLs": payload.referenceVideos,
    "参考音频URLs": payload.referenceAudios,
    "完整payload": payload
  });

  return payload;
}

function buildCompanyGenerateVideoParams(input: BuildGenerateVideoPayloadInput, settings: GenerationSettings) {
  return {
    prompt: input.prompt,
    model: SEEDANCE_MODEL_ID,
    aspectRatio: settings.aspectRatio,
    resolution: "720p",
    duration: settings.durationSeconds,
    generateAudio: true,
    genTab: "allref",
    referenceMode: settings.omnireference ? "omnireference" : "standard",
    // 网页版用 webSearch 字段开联网/全网搜索；app 历史只发 networkEnabled，可能导致联网静默失效。
    // 两个都发以对齐网页并兼容服务端任一字段名。
    networkEnabled: true,
    webSearch: true,
    referenceImages: getReferenceValues(input.references, "image"),
    // 与 referenceImages 等长的标签数组，对齐网页版，提升多参考图的提示词指代质量。
    referenceImageLabels: getReferenceLabels(input.references, "image"),
    referenceVideos: getReferenceValues(input.references, "video"),
    referenceAudios: getReferenceValues(input.references, "audio")
  };
}

function getTaskLabel(prompt: string) {
  const trimmed = prompt.trim();
  return trimmed.length > 32 ? `${trimmed.slice(0, 32)}...` : trimmed || "生成视频";
}

function getReferenceValues(references: ReferenceItem[], kind: ReferenceItem["kind"]) {
  return references.filter((item) => item.kind === kind).map((item) => item.url ?? item.previewUrl ?? item.name);
}

function getReferenceLabels(references: ReferenceItem[], kind: ReferenceItem["kind"]) {
  return references.filter((item) => item.kind === kind).map((item) => item.name);
}

interface GenerateVideoResponse {
  taskId?: string;
  queueTaskId?: string;
  _genTaskId?: string;
}

export interface GenerateVideoResult {
  taskId: string;
  videoUrl: string;
  providerVideoUrl?: string;
  persisted?: boolean;
}

interface GenerateVideoPollResponse {
  status?: string;
  providerTaskId?: string;
  videoUrl?: string;
  providerVideoUrl?: string;
  seedanceProviderUrl?: string;
  outputUrl?: string;
  resultUrl?: string;
  persisted?: boolean;
  errorMessage?: string;
  error?: unknown;
  startedAt?: string;
  completedAt?: string;
}

interface PersistTaskResponse {
  persisted?: boolean;
  url?: string;
  error?: string;
}

export async function generateVideo(
  transport: ApiTransport,
  input: BuildGenerateVideoPayloadInput,
  options: PollOptions = DEFAULT_GENERATION_POLL_OPTIONS
): Promise<GenerateVideoResult> {
  const submitResult = await requestGenerateVideo(transport, input);

  if (!submitResult.taskId) {
    throw new Error("生成接口未返回任务 ID");
  }

  // 对于画布生成，使用 queueTaskId 来轮询队列
  const queueTaskId = submitResult.queueTaskId ?? submitResult.taskId;
  console.log("[视频生成] 使用的轮询ID:", {
    taskId: submitResult.taskId,
    queueTaskId: submitResult.queueTaskId,
    _genTaskId: submitResult._genTaskId,
    "实际用于轮询": queueTaskId
  });

  const pollResult =
    input.projectId && input.nodeId
      ? await pollCanvasQueueUntilComplete(transport, input.projectId, input.nodeId, queueTaskId, options, submitResult.taskId)
      : await pollTaskUntilComplete(transport, endpoints.generateVideoTask(submitResult.taskId), options);
  const persistResult = await persistTaskIfNeeded(transport, submitResult.taskId, pollResult);
  const videoUrl =
    persistResult?.url ??
    pollResult.videoUrl ??
    pollResult.outputUrl ??
    pollResult.resultUrl ??
    pollResult.providerVideoUrl ??
    pollResult.seedanceProviderUrl;
  const providerVideoUrl = pollResult.providerVideoUrl ?? pollResult.seedanceProviderUrl;

  if (!videoUrl) {
    throw new Error("生成成功但接口未返回视频地址");
  }

  return {
    taskId: submitResult.taskId,
    videoUrl,
    providerVideoUrl,
    persisted: persistResult?.persisted ?? pollResult.persisted
  };
}

export async function loadGenerationQueue(transport: ApiTransport, projectId: string): Promise<unknown> {
  return transport.request(endpoints.genQueue(projectId));
}

export async function persistGeneratedTask(transport: ApiTransport, taskId: string): Promise<PersistTaskResponse> {
  const result = await transport.request<PersistTaskResponse>(endpoints.persistTask(), {
    method: "POST",
    body: { taskId }
  });

  if (result.error) {
    throw new Error(result.error);
  }

  return result;
}

export interface PollOptions {
  intervalMs: number;
  maxAttempts: number;
}

export async function pollTaskUntilComplete(
  transport: ApiTransport,
  path: string,
  options: PollOptions = DEFAULT_GENERATION_POLL_OPTIONS
) {
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    const result = await requestPollStatus(transport, path);

    if (result.status === "failed") {
      throw new Error(result.errorMessage ?? getPollErrorMessage(result.error) ?? "视频生成失败");
    }

    if (result.status === "succeeded") {
      return result;
    }

    if (options.intervalMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, options.intervalMs));
    }
  }

  throw new Error("任务轮询超时");
}

async function requestGenerateVideo(transport: ApiTransport, input: BuildGenerateVideoPayloadInput) {
  try {
    const payload = buildCompanyGenerateVideoPayload(input);
    console.log("[视频生成] 发送请求到:", endpoints.generateVideo());
    console.log("[视频生成] 请求方法: POST");
    console.log("[视频生成] 请求Body:", JSON.stringify(payload, null, 2));

    const result = await transport.request<GenerateVideoResponse>(endpoints.generateVideo(), {
      method: "POST",
      body: payload
    });

    console.log("[视频生成] 服务器响应:", result);

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

async function pollCanvasQueueUntilComplete(
  transport: ApiTransport,
  projectId: string,
  nodeId: string,
  taskId: string,
  options: PollOptions,
  providerTaskId?: string
): Promise<GenerateVideoPollResponse> {
  console.log("[轮询开始] projectId:", projectId, "nodeId:", nodeId, "taskId:", taskId, "providerTaskId:", providerTaskId);
  console.log("[轮询配置] maxAttempts:", options.maxAttempts, "intervalMs:", options.intervalMs);
  let lastTaskResult: GenerateVideoPollResponse | undefined;

  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    const queueResult = await requestQueueStatus(transport, projectId, taskId);
    console.log(`[轮询尝试 ${attempt + 1}/${options.maxAttempts}] 队列响应:`, queueResult);

    const taskResult = findQueueTask(queueResult, taskId, nodeId);
    lastTaskResult = taskResult ?? lastTaskResult;
    console.log(`[轮询尝试 ${attempt + 1}/${options.maxAttempts}] 找到的任务:`, taskResult);

    if (taskResult?.status === "failed") {
      console.error("[轮询失败] 任务状态为failed:", taskResult);
      throw new Error(taskResult.errorMessage ?? getPollErrorMessage(taskResult.error) ?? "视频生成失败");
    }

    if (taskResult?.status === "succeeded") {
      console.log("[轮询成功] 任务完成:", taskResult);
      return taskResult;
    }

    // 加速器：画布队列(/api/gen-queue)对 canvas-mode 任务可能滞后约45分钟才 reconcile，
    // 但视频本身通常几分钟就好，并已能在单任务端点(/api/generate-video/{taskId})取到。
    // 网页版同时轮询这两个端点；这里也补查单任务端点，任一 succeeded 即返回，避免空等。
    const accelerated = await requestProviderTaskStatus(transport, providerTaskId);
    if (accelerated?.status === "succeeded" && hasAnyVideoUrl(accelerated)) {
      console.log("[轮询成功] 单任务端点已完成(队列仍滞后):", accelerated);
      return accelerated;
    }

    if (taskResult?.status) {
      console.log(`[轮询进行中] 任务状态: ${taskResult.status}, 等待${options.intervalMs}ms后重试`);
    } else {
      console.warn(`[轮询警告] 未找到任务状态，可能任务还未在队列中`);
    }

    if (options.intervalMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, options.intervalMs));
    }
  }

  console.error("[轮询超时] 已尝试", options.maxAttempts, "次，任务仍未完成");
  throw new Error(`任务轮询超时：${formatQueueDiagnostics(lastTaskResult)}`);
}

// 查询单任务端点；任何错误(含任务过期 410)都吞掉返回 undefined —— 它只是加速器，
// 队列(/api/gen-queue)仍是失败与最终状态的权威来源。
async function requestProviderTaskStatus(
  transport: ApiTransport,
  providerTaskId?: string
): Promise<GenerateVideoPollResponse | undefined> {
  if (!providerTaskId) {
    return undefined;
  }

  try {
    return await transport.request<GenerateVideoPollResponse>(endpoints.generateVideoTask(providerTaskId));
  } catch {
    return undefined;
  }
}

function hasAnyVideoUrl(result: GenerateVideoPollResponse) {
  return Boolean(
    result.videoUrl ?? result.outputUrl ?? result.resultUrl ?? result.providerVideoUrl ?? result.seedanceProviderUrl
  );
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

function findQueueTask(value: unknown, taskId: string, nodeId: string): GenerateVideoPollResponse | undefined {
  console.log("[查找任务] 在响应中查找 taskId:", taskId, "nodeId:", nodeId);

  if (Array.isArray(value)) {
    console.log("[查找任务] 响应是数组，长度:", value.length);
    for (const item of value) {
      const found = findQueueTask(item, taskId, nodeId);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  if (!isRecord(value)) {
    console.log("[查找任务] 响应不是对象，跳过");
    return undefined;
  }

  console.log("[查找任务] 检查对象，keys:", Object.keys(value));

  if (matchesQueueTask(value, taskId, nodeId)) {
    console.log("[查找任务] ✅ 找到匹配的任务!");
    return normalizeQueueTask(value);
  }

  for (const key of ["items", "tasks", "data", "result"]) {
    if (key in value) {
      console.log(`[查找任务] 在嵌套字段 "${key}" 中查找`);
      const found = findQueueTask(value[key], taskId, nodeId);
      if (found) {
        return found;
      }
    }
  }

  console.log("[查找任务] ❌ 未找到匹配的任务");
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

function normalizeQueueTask(value: Record<string, unknown>): GenerateVideoPollResponse {
  return {
    status: stringValue(value.status),
    providerTaskId: stringValue(value.providerTaskId),
    videoUrl: stringValue(value.videoUrl),
    providerVideoUrl: stringValue(value.providerVideoUrl),
    seedanceProviderUrl: stringValue(value.seedanceProviderUrl),
    outputUrl: stringValue(value.outputUrl),
    resultUrl: stringValue(value.resultUrl),
    persisted: typeof value.persisted === "boolean" ? value.persisted : undefined,
    errorMessage: stringValue(value.errorMessage),
    error: value.error,
    startedAt: stringValue(value.startedAt),
    completedAt: stringValue(value.completedAt)
  };
}

function formatQueueDiagnostics(taskResult: GenerateVideoPollResponse | undefined) {
  if (!taskResult) {
    return "status=unknown, providerTaskId=empty, resultUrl=empty, errorMessage=empty, startedAt=empty, completedAt=empty";
  }

  return [
    `status=${taskResult.status ?? "unknown"}`,
    `providerTaskId=${taskResult.providerTaskId ?? "empty"}`,
    `resultUrl=${taskResult.resultUrl ?? "empty"}`,
    `errorMessage=${taskResult.errorMessage ?? "empty"}`,
    `startedAt=${taskResult.startedAt ?? "empty"}`,
    `completedAt=${taskResult.completedAt ?? "empty"}`
  ].join(", ");
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

async function requestPollStatus(transport: ApiTransport, path: string) {
  try {
    return await transport.request<GenerateVideoPollResponse>(path);
  } catch (error) {
    if (isAuthExpiredError(error)) {
      throw new Error("登录态已失效，请重新登录后再试");
    }

    throw error;
  }
}

async function persistTaskIfNeeded(transport: ApiTransport, taskId: string, pollResult: GenerateVideoPollResponse) {
  if (pollResult.persisted === true && (pollResult.videoUrl || pollResult.outputUrl || pollResult.resultUrl)) {
    return undefined;
  }

  if (
    pollResult.persisted === false ||
    (!pollResult.videoUrl && !pollResult.outputUrl && !pollResult.resultUrl && Boolean(pollResult.providerVideoUrl ?? pollResult.seedanceProviderUrl))
  ) {
    return persistGeneratedTask(transport, taskId);
  }

  return undefined;
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

function isAuthExpiredError(error: unknown) {
  if (!isRecord(error)) {
    return false;
  }

  return error.status === 401 || error.status === 403;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
