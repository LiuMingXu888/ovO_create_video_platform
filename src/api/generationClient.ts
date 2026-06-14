import type { ReferenceItem } from "../types";
import type { ApiTransport } from "./transport";

interface BuildGenerateVideoPayloadInput {
  prompt: string;
  references: ReferenceItem[];
}

export function buildGenerateVideoPayload(input: BuildGenerateVideoPayloadInput) {
  return {
    prompt: input.prompt,
    model: "Seedance 2.0",
    aspectRatio: "9:16",
    resolution: "720p",
    referenceImages: input.references.filter((item) => item.kind === "image").map((item) => item.name),
    referenceVideos: input.references.filter((item) => item.kind === "video").map((item) => item.name),
    referenceAudios: input.references.filter((item) => item.kind === "audio").map((item) => item.name)
  };
}

export interface PollOptions {
  intervalMs: number;
  maxAttempts: number;
}

export async function pollTaskUntilComplete(
  transport: ApiTransport,
  path: string,
  options: PollOptions = { intervalMs: 1500, maxAttempts: 80 }
) {
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    const result = await transport.request<{ status?: string; outputUrl?: string; errorMessage?: string }>(path);

    if (result.status === "succeeded" || result.status === "failed") {
      return result;
    }

    if (options.intervalMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, options.intervalMs));
    }
  }

  throw new Error("任务轮询超时");
}
