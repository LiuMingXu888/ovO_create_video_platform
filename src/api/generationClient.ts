import type { GenerationSettings, ReferenceItem } from "../types";
import { endpoints } from "./endpoints";
import type { ApiTransport } from "./transport";

export const DEFAULT_GENERATION_POLL_OPTIONS: PollOptions = { intervalMs: 1500, maxAttempts: 1400 };

interface BuildGenerateVideoPayloadInput {
  prompt: string;
  references: ReferenceItem[];
  settings?: GenerationSettings;
}

export function buildGenerateVideoPayload(input: BuildGenerateVideoPayloadInput) {
  const settings: GenerationSettings = input.settings ?? {
    aspectRatio: "9:16",
    durationSeconds: 15,
    omnireference: true
  };

  return {
    prompt: input.prompt,
    model: "Seedance 2.0",
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

  return {
    prompt: input.prompt,
    model: "ep-20260319213857-htd7q",
    aspectRatio: settings.aspectRatio,
    resolution: "720p",
    duration: settings.durationSeconds,
    generateAudio: true,
    referenceImages: getReferenceValues(input.references, "image"),
    referenceVideos: getReferenceValues(input.references, "video"),
    referenceAudios: getReferenceValues(input.references, "audio")
  };
}

function getReferenceValues(references: ReferenceItem[], kind: ReferenceItem["kind"]) {
  return references.filter((item) => item.kind === kind).map((item) => item.url ?? item.previewUrl ?? item.name);
}

interface GenerateVideoResponse {
  taskId?: string;
}

export interface GenerateVideoResult {
  taskId: string;
  videoUrl: string;
  providerVideoUrl?: string;
}

interface GenerateVideoPollResponse {
  status?: string;
  videoUrl?: string;
  providerVideoUrl?: string;
  outputUrl?: string;
  errorMessage?: string;
  error?: unknown;
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

  const pollResult = await pollTaskUntilComplete(transport, endpoints.generateVideoTask(submitResult.taskId), options);
  const videoUrl = pollResult.videoUrl ?? pollResult.outputUrl ?? pollResult.providerVideoUrl;

  if (!videoUrl) {
    throw new Error("生成成功但接口未返回视频地址");
  }

  return {
    taskId: submitResult.taskId,
    videoUrl,
    providerVideoUrl: pollResult.providerVideoUrl
  };
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
    return await transport.request<GenerateVideoResponse>(endpoints.generateVideo(), {
      method: "POST",
      body: buildCompanyGenerateVideoPayload(input)
    });
  } catch (error) {
    if (isAuthExpiredError(error)) {
      throw new Error("登录态已失效，请重新登录后再试");
    }

    throw error;
  }
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
