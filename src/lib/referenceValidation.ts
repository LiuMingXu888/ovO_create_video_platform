import type { AssetKind, ReferenceItem } from "../types";

const MB = 1024 * 1024;

const LIMITS = {
  total: 12,
  imageCount: 9,
  imageSize: 30 * MB,
  videoCount: 3,
  videoSize: 50 * MB,
  minVideoDuration: 2,
  maxVideoDuration: 15,
  audioCount: 3,
  audioSize: 15 * MB,
  maxAudioDuration: 15
};

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateReferenceItems(items: ReferenceItem[]): ValidationResult {
  const errors: string[] = [];
  const byKind = groupByKind(items);

  if (items.length > LIMITS.total) {
    errors.push("图片 + 视频 + 音频合计不能超过 12 个文件");
  }

  validateImages(byKind.image, errors);
  validateVideos(byKind.video, errors);
  validateAudios(byKind.audio, errors);

  return {
    valid: errors.length === 0,
    errors
  };
}

function groupByKind(items: ReferenceItem[]): Record<AssetKind, ReferenceItem[]> {
  return {
    image: items.filter((item) => item.kind === "image"),
    audio: items.filter((item) => item.kind === "audio"),
    video: items.filter((item) => item.kind === "video")
  };
}

function validateImages(items: ReferenceItem[], errors: string[]) {
  if (items.length > LIMITS.imageCount) {
    errors.push("图片最多 9 张");
  }

  for (const item of items) {
    if (item.sizeBytes >= LIMITS.imageSize) {
      errors.push(`图片「${item.name}」必须小于 30MB`);
    }
  }
}

function validateVideos(items: ReferenceItem[], errors: string[]) {
  if (items.length > LIMITS.videoCount) {
    errors.push("视频最多 3 个");
  }

  const totalDuration = sumDuration(items);
  if (items.length > 0 && (totalDuration < LIMITS.minVideoDuration || totalDuration > LIMITS.maxVideoDuration)) {
    errors.push("所有视频总时长必须控制在 2-15 秒");
  }

  for (const item of items) {
    if (item.sizeBytes >= LIMITS.videoSize) {
      errors.push(`视频「${item.name}」必须小于 50MB`);
    }

    if (shouldValidateLocalFormat(item) && !hasSupportedFileType(item, ["video/mp4", "video/quicktime"], [".mp4", ".mov"])) {
      errors.push(`视频「${item.name}」仅支持 MP4、MOV 格式`);
    }
  }
}

function validateAudios(items: ReferenceItem[], errors: string[]) {
  if (items.length > LIMITS.audioCount) {
    errors.push("音频最多 3 个");
  }

  if (sumDuration(items) > LIMITS.maxAudioDuration) {
    errors.push("所有音频总时长不能超过 15 秒");
  }

  for (const item of items) {
    if (item.sizeBytes >= LIMITS.audioSize) {
      errors.push(`音频「${item.name}」必须小于 15MB`);
    }

    if (
      shouldValidateLocalFormat(item) &&
      !hasSupportedFileType(item, ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"], [".mp3", ".wav"])
    ) {
      errors.push(`音频「${item.name}」仅支持 MP3、WAV 格式`);
    }
  }
}

function sumDuration(items: ReferenceItem[]) {
  return items.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0);
}

function shouldValidateLocalFormat(item: ReferenceItem) {
  return item.source === "local-file";
}

function hasSupportedFileType(item: ReferenceItem, mimeTypes: string[], extensions: string[]) {
  const mimeType = item.mimeType?.toLowerCase();

  if (mimeType) {
    return mimeTypes.includes(mimeType);
  }

  const fileName = (item.fileName ?? item.name).toLowerCase();
  return extensions.some((extension) => fileName.endsWith(extension));
}
