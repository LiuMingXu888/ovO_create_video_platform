import type { ImageAspectRatio, ImageGenerationSettings, ImageQuality, VideoResolution } from "../types";

// Image-generation option lists. These mirror the company web UI. The model /
// ratio / quality lists are confirmed by the user; the camera list is a
// placeholder ("暂不选择" default) until a real 接口诊断 capture of the
// image-generation flow gives us the full set + the generation endpoint.

export const IMAGE_MODELS = [
  "GPT-Image-2(兑吧)",
  "GPT-Image-2",
  "Gemini 3 Pro",
  "Gemini 3.1 Flash",
  "Seedream 5.0"
] as const;

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

// Camera presets — only the default placeholder is known for now. Append the
// real list once captured; the UI renders whatever is in this array.
export const IMAGE_CAMERAS = ["暂不选择"] as const;

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
