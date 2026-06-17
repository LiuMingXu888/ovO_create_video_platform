import type { GenerationSettings, ReferenceItem } from "../types";
import { endpoints } from "./endpoints";
import type { ApiTransport } from "./transport";

export const DEFAULT_GENERATION_POLL_OPTIONS: PollOptions = { intervalMs: 1500, maxAttempts: 1400 };

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

  if (input.projectId && input.nodeId) {
    return {
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
  }

  return params;
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
    networkEnabled: true,
    referenceImages: getReferenceValues(input.references, "image"),
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

interface GenerateVideoResponse {
  taskId?: string;
  queueTaskId?: unknown;
  _genTaskId?: unknown;
}

export interface GenerateVideoResult {
  taskId: string;
  videoUrl: string;
  providerVideoUrl?: string;
  persisted?: boolean;
}

interface GenerateVideoPollResponse {
  status?: string;
  videoUrl?: string;
  providerVideoUrl?: string;
  seedanceProviderUrl?: string;
  outputUrl?: string;
  resultUrl?: string;
  persisted?: boolean;
  errorMessage?: string;
  error?: unknown;
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

  const pollResult =
    input.projectId && input.nodeId
      ? await pollCanvasQueueUntilComplete(transport, input.projectId, input.nodeId, submitResult.taskId, options)
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
    const result = await transport.request<GenerateVideoResponse>(endpoints.generateVideo(), {
      method: "POST",
      body: buildCompanyGenerateVideoPayload(input)
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

async function pollCanvasQueueUntilComplete(
  transport: ApiTransport,
  projectId: string,
  nodeId: string,
  taskId: string,
  options: PollOptions
): Promise<GenerateVideoPollResponse> {
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    const queueResult = await requestQueueStatus(transport, projectId, taskId);
    const taskResult = findQueueTask(queueResult, taskId, nodeId);

    if (taskResult?.status === "failed") {
      throw new Error(taskResult.errorMessage ?? getPollErrorMessage(taskResult.error) ?? "视频生成失败");
    }

    if (taskResult?.status === "succeeded") {
      return taskResult;
    }

    if (options.intervalMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, options.intervalMs));
    }
  }

  throw new Error("任务轮询超时");
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
    const found = findQueueTask(value[key], taskId, nodeId);
    if (found) {
      return found;
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

function normalizeQueueTask(value: Record<string, unknown>): GenerateVideoPollResponse {
  return {
    status: stringValue(value.status),
    videoUrl: stringValue(value.videoUrl),
    providerVideoUrl: stringValue(value.providerVideoUrl),
    seedanceProviderUrl: stringValue(value.seedanceProviderUrl),
    outputUrl: stringValue(value.outputUrl),
    resultUrl: stringValue(value.resultUrl),
    persisted: typeof value.persisted === "boolean" ? value.persisted : undefined,
    errorMessage: stringValue(value.errorMessage),
    error: value.error
  };
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
