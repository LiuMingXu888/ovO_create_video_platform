import type { ApiTransport } from "./transport";
import { endpoints } from "./endpoints";

export function buildSubtitleRemovePayload(videoUrl: string) {
  return { videoUrl };
}

export interface SubtitleRemovalResult {
  taskId: string;
  videoUrl: string;
  providerVideoUrl?: string;
  persisted?: boolean;
  route: "default" | "ark";
}

interface SubtitleRemovalPollResponse {
  status?: string;
  videoUrl?: string;
  providerVideoUrl?: string;
  outputUrl?: string;
  persisted?: boolean;
  errorMessage?: string;
  error?: unknown;
}

interface SubtitleRemovalPollOptions {
  intervalMs: number;
  maxAttempts: number;
}

export async function removeSubtitles(
  transport: ApiTransport,
  asset: { url: string; providerVideoUrl?: string },
  options: SubtitleRemovalPollOptions
): Promise<SubtitleRemovalResult> {
  const route = asset.providerVideoUrl ? "ark" : "default";
  const endpoint = route === "ark" ? endpoints.subtitleRemoveArk() : endpoints.subtitleRemove();
  const body = route === "ark" && asset.providerVideoUrl ? { videoUrl: asset.providerVideoUrl, providerVideoUrl: asset.providerVideoUrl } : buildSubtitleRemovePayload(asset.url);
  const submitResult = await transport.request<{ taskId?: string }>(endpoint, {
    method: "POST",
    body
  });

  if (!submitResult.taskId) {
    throw new Error("去字幕接口未返回任务 ID");
  }

  const pollPath = route === "ark" ? endpoints.subtitleRemoveArkTask(submitResult.taskId) : endpoints.subtitleRemoveTask(submitResult.taskId);
  const pollResult = await pollSubtitleRemoval(transport, pollPath, options);
  const videoUrl = pollResult.videoUrl ?? pollResult.outputUrl ?? pollResult.providerVideoUrl;

  if (!videoUrl) {
    throw new Error("去字幕成功但接口未返回视频地址");
  }

  return {
    taskId: submitResult.taskId,
    videoUrl,
    providerVideoUrl: pollResult.providerVideoUrl,
    persisted: pollResult.persisted,
    route
  };
}

export async function pollSubtitleRemoval(
  transport: ApiTransport,
  path: string,
  options: SubtitleRemovalPollOptions
) {
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    const result = await transport.request<SubtitleRemovalPollResponse>(path);

    if (result.status === "failed") {
      throw new Error(result.errorMessage ?? getSubtitlePollError(result.error) ?? "去字幕失败");
    }

    if (result.status === "succeeded") {
      return result;
    }

    if (options.intervalMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, options.intervalMs));
    }
  }

  throw new Error("去字幕任务轮询超时");
}

function getSubtitlePollError(error: unknown) {
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
