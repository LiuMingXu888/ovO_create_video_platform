import type { ImageAspectRatio, ImageGenerationSettings, ImageQuality, VideoResolution } from "../types";

// Image-generation option lists. Model / ratio / quality field shapes are
// confirmed from real 接口诊断 captures of POST /api/generate-image:
//   gpt-image-2-duiba 发 quality(low/medium/high)
//   gpt-image-2       发 size(1K/2K/4K)
//   gemini-*          不发画质字段(后端固定 4K)
// 香蕉后缀仅用于下拉 label;value 保持公司端规范名以兼容快照。

export interface ImageQualityOption {
  value: ImageQuality;
  label: string;
}

export interface ImageModelOption {
  label: string;
  value: string;
  apiId: string;
  qualityField: "size" | "quality" | null;
  qualityOptions: ImageQualityOption[];
  defaultQuality: ImageQuality;
}

const GEMINI_QUALITY: ImageQualityOption[] = [{ value: "4k", label: "4K" }];

export const IMAGE_MODEL_OPTIONS: ImageModelOption[] = [
  {
    label: "GPT-Image-2(兑吧)",
    value: "GPT-Image-2(兑吧)",
    apiId: "gpt-image-2-duiba",
    qualityField: "quality",
    qualityOptions: [
      { value: "low", label: "低" },
      { value: "medium", label: "中" },
      { value: "high", label: "高" }
    ],
    defaultQuality: "high"
  },
  {
    label: "GPT-Image-2",
    value: "GPT-Image-2",
    apiId: "gpt-image-2",
    qualityField: "size",
    qualityOptions: [
      { value: "1k", label: "1K" },
      { value: "2k", label: "2K" },
      { value: "4k", label: "4K" }
    ],
    defaultQuality: "4k"
  },
  {
    label: "Gemini 3 Pro(香蕉pro)",
    value: "Gemini 3 Pro",
    apiId: "gemini-3-pro-image-preview",
    qualityField: null,
    qualityOptions: GEMINI_QUALITY,
    defaultQuality: "4k"
  },
  {
    label: "Gemini 3.1 Flash(香蕉2)",
    value: "Gemini 3.1 Flash",
    apiId: "gemini-3.1-flash-image-preview",
    qualityField: null,
    qualityOptions: GEMINI_QUALITY,
    defaultQuality: "4k"
  }
];

export function getImageModelOption(value: string): ImageModelOption | undefined {
  return IMAGE_MODEL_OPTIONS.find((m) => m.value === value || m.label === value || m.apiId === value);
}

// Backward-compatible derived exports (consumed by client + tests).
export const IMAGE_MODELS: string[] = IMAGE_MODEL_OPTIONS.map((m) => m.value);

export const IMAGE_MODEL_IDS: Record<string, string> = Object.fromEntries(
  IMAGE_MODEL_OPTIONS.map((m) => [m.value, m.apiId])
);

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
// fixed lens/look phrase to the prompt. The full list (15 presets) and the exact
// promptSuffix strings are lifted verbatim from the company web app's
// CAMERA_PRESETS source data (chunk 2157, module 14555), so they match the
// company output 1:1. The leading ", " keeps appending onto a prompt clean.
export const IMAGE_CAMERAS = [
  "暂不选择",
  "Sony A7 IV",
  "Sony FX3",
  "Canon EOS R5",
  "Canon C70",
  "ARRI ALEXA 35",
  "ARRI ALEXA Mini LF",
  "RED V-RAPTOR",
  "Blackmagic URSA Mini Pro 12K",
  "Fujifilm GFX 100 II",
  "Nikon Z8",
  "Leica SL3",
  "Hasselblad X2D 100C",
  "Panasonic S1H",
  "DJI Ronin 4D-8K",
  "iPhone 16 Pro Max"
] as const;

export const IMAGE_CAMERA_PROMPT_SUFFIX: Record<string, string> = {
  暂不选择: "",
  "Sony A7 IV":
    ", shot on Sony A7 IV, 85mm f/1.4 GM lens, full-frame sensor, natural color science, cinematic shallow depth of field, rich highlight rolloff",
  "Sony FX3":
    ", shot on Sony FX3 cinema camera, 35mm f/1.4 GM lens, S-Cinetone color profile, filmic skin tones, cinematic motion blur, professional cinema look",
  "Canon EOS R5":
    ", shot on Canon EOS R5, RF 50mm f/1.2L USM lens, 45-megapixel full-frame, Canon color science, warm skin tones, ultra-sharp detail, beautiful bokeh",
  "Canon C70":
    ", shot on Canon C70 cinema camera, 24-70mm f/2.8L lens, Super 35 sensor, Canon Log 3, cinematic dynamic range, broadcast-quality color",
  "ARRI ALEXA 35":
    ", shot on ARRI ALEXA 35, ARRI Master Prime 50mm T1.3 lens, ARRI LogC4, Hollywood cinematic look, organic film-like grain, unmatched dynamic range, industry-standard color",
  "ARRI ALEXA Mini LF":
    ", shot on ARRI ALEXA Mini LF, Signature Prime 40mm T1.8, large format sensor, ARRI LogC, immersive shallow depth of field, creamy cinematic bokeh, premium film texture",
  "RED V-RAPTOR":
    ", shot on RED V-RAPTOR 8K, Zeiss Supreme Prime 35mm T1.5, VistaVision sensor, REDWideGamutRGB, hyper-detailed 8K resolution, cinematic highlight compression, razor-sharp clarity",
  "Blackmagic URSA Mini Pro 12K":
    ", shot on Blackmagic URSA Mini Pro 12K, Sigma Cine 50mm T1.5, Blackmagic RAW, extreme resolution, Blackmagic color science, filmic dynamic range",
  "Fujifilm GFX 100 II":
    ", shot on Fujifilm GFX 100 II, GF 80mm f/1.7 lens, medium format 102-megapixel sensor, Fujifilm color simulation, extraordinary detail and tonal range, dreamy medium format bokeh",
  "Nikon Z8":
    ", shot on Nikon Z8, NIKKOR Z 85mm f/1.2 S, 45.7-megapixel full-frame, Nikon color science, creamy out-of-focus rendering, exceptional sharpness, natural tonal gradation",
  "Leica SL3":
    ", shot on Leica SL3, Summilux-SL 50mm f/1.4, 60-megapixel full-frame, Leica color rendering, three-dimensional pop, legendary Leica look, elegant tonal transition, luxurious image quality",
  "Hasselblad X2D 100C":
    ", shot on Hasselblad X2D 100C, XCD 90mm f/2.5 V lens, medium format 100-megapixel sensor, Hasselblad Natural Colour Solution, extraordinary tonal depth, creamy medium format rendering",
  "Panasonic S1H":
    ", shot on Panasonic S1H, Lumix S Pro 50mm f/1.4 lens, full-frame 6K, V-Log, cinema-grade dynamic range, organic color rendering, documentary filmmaking look",
  "DJI Ronin 4D-8K":
    ", shot on DJI Ronin 4D-8K, DL 35mm f/2.8 LS ASPH lens, full-frame 8K, built-in stabilization, CinemaDNG RAW, smooth cinematic motion, modern filmmaking aesthetic",
  "iPhone 16 Pro Max":
    ", shot on iPhone 16 Pro Max, 48MP main camera, Apple Photonic Engine, computational photography, natural HDR, Smart HDR 5, ProRAW, smartphone photography aesthetic"
};

export const IMAGE_CATEGORIES = ["人物", "场景", "道具"] as const;

export const VIDEO_RESOLUTIONS: VideoResolution[] = ["480p", "720p", "1080p"];

export const IMAGE_GENERATION_CREDIT_COST = 10;

export const DEFAULT_IMAGE_GENERATION_SETTINGS: ImageGenerationSettings = {
  model: "GPT-Image-2",
  aspectRatio: "9:16",
  quality: "4k",
  camera: "暂不选择",
  category: "人物"
};
