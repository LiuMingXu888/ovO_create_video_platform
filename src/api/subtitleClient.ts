import type { ApiTransport } from "./transport";
import { endpoints } from "./endpoints";

export type SubtitleRemovalRoute = "free" | "paid";

export interface SubtitleRemovalResult {
  runId: string;
  videoUrl: string;
  route: SubtitleRemovalRoute;
}

interface SubtitleRemovalPollResponse {
  runId?: string;
  status?: string;
  videoUrl?: string | null;
  error?: unknown;
}

interface SubtitleRemovalPollOptions {
  intervalMs: number;
  maxAttempts: number;
  now?: Date;
}

interface SubtitleRemovalSource {
  url: string;
  providerVideoUrl?: string;
  createdAt?: string;
  isSeedance?: boolean;
  nodeId?: string;
  projectId?: string;
}

const FREE_SUBTITLE_ROUTE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Pick the subtitle-removal route from the source video's age and origin.
 *
 * The free (方舟/Ark) route only accepts fresh Seedance original videos and is
 * keyed on the provider URL; everything else falls back to the paid (火山 VOD)
 * route, which accepts any video. Unknown / unparseable / future timestamps and
 * missing provider URLs all default to paid — the conservative choice that
 * almost never fails.
 */
export function chooseSubtitleRemovalRoute(
  asset: { providerVideoUrl?: string; createdAt?: string; isSeedance?: boolean },
  now: Date
): SubtitleRemovalRoute {
  if (!asset.createdAt) {
    return "paid";
  }

  const createdAtMs = Date.parse(asset.createdAt);
  const nowMs = now.getTime();
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(nowMs)) {
    return "paid";
  }

  const ageMs = nowMs - createdAtMs;
  if (ageMs < 0 || ageMs > FREE_SUBTITLE_ROUTE_WINDOW_MS) {
    return "paid";
  }

  if (!asset.isSeedance) {
    return "paid";
  }

  // The ark route needs the 方舟 original URL; without it the free channel
  // cannot be used, so degrade to paid (matches the web app's client gate).
  if (!asset.providerVideoUrl) {
    return "paid";
  }

  return "free";
}

export async function removeSubtitles(
  transport: ApiTransport,
  asset: SubtitleRemovalSource,
  options: SubtitleRemovalPollOptions
): Promise<SubtitleRemovalResult> {
  const route = chooseSubtitleRemovalRoute(asset, options.now ?? new Date());
  const endpoint = route === "free" ? endpoints.subtitleRemoveArk() : endpoints.subtitleRemove();
  const videoUrl = route === "free" ? asset.providerVideoUrl ?? asset.url : asset.url;
  const label = route === "free" ? "字幕擦除（免费）" : "字幕擦除";

  const submitResult = await transport.request<{ runId?: string }>(endpoint, {
    method: "POST",
    body: {
      videoUrl,
      _meta: { nodeId: asset.nodeId, projectId: asset.projectId, label }
    }
  });

  if (!submitResult.runId) {
    throw new Error(`去字幕接口未返回 runId（route=${route}, endpoint=${endpoint}）`);
  }

  const pollPath =
    route === "free"
      ? endpoints.subtitleRemoveArkTask(submitResult.runId)
      : endpoints.subtitleRemoveTask(submitResult.runId);
  const pollResult = await pollSubtitleRemoval(transport, pollPath, options);

  if (!pollResult.videoUrl) {
    throw new Error("去字幕成功但接口未返回视频地址");
  }

  return {
    runId: submitResult.runId,
    videoUrl: pollResult.videoUrl,
    route
  };
}

export async function pollSubtitleRemoval(
  transport: ApiTransport,
  path: string,
  options: SubtitleRemovalPollOptions
): Promise<SubtitleRemovalPollResponse> {
  let lastStatus: string | undefined;

  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    const result = await transport.request<SubtitleRemovalPollResponse>(path);
    lastStatus = result.status ?? lastStatus;

    if (result.status === "failed") {
      throw new Error(getSubtitlePollError(result.error) ?? "去字幕失败");
    }

    if (result.status === "succeeded") {
      return result;
    }

    if (options.intervalMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, options.intervalMs));
    }
  }

  throw new Error(`去字幕任务轮询超时（已轮询 ${options.maxAttempts} 次，最后状态=${lastStatus ?? "未知"}）`);
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
