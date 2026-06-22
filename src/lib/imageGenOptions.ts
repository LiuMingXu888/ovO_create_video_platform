import type { ImageAspectRatio, ImageGenerationSettings, ImageQuality, VideoResolution } from "../types";

// Image-generation option lists. These mirror the company web UI. The model /
// ratio / quality lists and the request shape are confirmed from a real
// 接口诊断 capture of the image-generation flow (POST /api/generate-image).
// Seedream 5.0 appears in the web dropdown but its API model id has not been
// captured yet, so it is intentionally omitted until we have it.

export const IMAGE_MODELS = [
  "GPT-Image-2(兑吧)",
  "GPT-Image-2",
  "Gemini 3 Pro",
  "Gemini 3.1 Flash"
] as const;

// Display name → API model id sent in the generate-image payload.
export const IMAGE_MODEL_IDS: Record<string, string> = {
  "GPT-Image-2(兑吧)": "gpt-image-2-duiba",
  "GPT-Image-2": "gpt-image-2",
  "Gemini 3 Pro": "gemini-3-pro-image-preview",
  "Gemini 3.1 Flash": "gemini-3.1-flash-image-preview"
};

export const IMAGE_ASPECT_RATIOS: ImageAspectRatio[] = [
  "9:16",
  "1:1",
  "3:4",
  "16:9",
  "4:3",
  "2:3",
  "3:2",
  "21:9"
];

export const IMAGE_QUALITIES: ImageQuality[] = ["1k", "2k", "4k"];

// Camera presets. "摄像机" is not a request field — selecting one appends a
// fixed lens/look phrase to the prompt. Only the two presets below are confirmed
// from the capture; append more once captured.
export const IMAGE_CAMERAS = ["暂不选择", "Sony FX3", "ARRI ALEXA 35"] as const;

export const IMAGE_CAMERA_PROMPT_SUFFIX: Record<string, string> = {
  暂不选择: "",
  "Sony FX3":
    ", shot on Sony FX3 cinema camera, 35mm f/1.4 GM lens, S-Cinetone color profile, filmic skin tones, cinematic motion blur, professional cinema look",
  "ARRI ALEXA 35":
    ", shot on ARRI ALEXA 35, ARRI Master Prime 50mm T1.3 lens, ARRI LogC4, Hollywood cinematic look, organic film-like grain, unmatched dynamic range, industry-standard color"
};

export const IMAGE_CATEGORIES = ["人物", "场景", "道具"] as const;

export const VIDEO_RESOLUTIONS: VideoResolution[] = ["480p", "720p", "1080p"];

export const IMAGE_GENERATION_CREDIT_COST = 10;

export const DEFAULT_IMAGE_GENERATION_SETTINGS: ImageGenerationSettings = {
  model: "GPT-Image-2(兑吧)",
  aspectRatio: "9:16",
  quality: "4k",
  camera: "暂不选择",
  category: "人物"
};
