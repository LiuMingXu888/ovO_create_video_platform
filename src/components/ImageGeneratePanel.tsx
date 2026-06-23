import { Sparkles } from "lucide-react";
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_CAMERAS,
  IMAGE_CATEGORIES,
  IMAGE_MODEL_OPTIONS,
  getImageModelOption
} from "../lib/imageGenOptions";
import type { ImageAspectRatio, ImageGenerationSettings, ImageQuality } from "../types";

interface ImageGeneratePanelProps {
  settings: ImageGenerationSettings;
  onSettingsChange: (settings: ImageGenerationSettings) => void;
  onGenerate: () => void;
  disabled?: boolean;
}

export function ImageGeneratePanel({ settings, onSettingsChange, onGenerate, disabled = false }: ImageGeneratePanelProps) {
  const modelOption = getImageModelOption(settings.model) ?? IMAGE_MODEL_OPTIONS[0];
  const qualityLocked = modelOption.qualityField === null;

  return (
    <aside className="generate-panel generate-panel-image" aria-label="图片生成设置">
      <label className="field-line field-line-wide">
        <span>生图模型</span>
        <select
          aria-label="生图模型"
          value={settings.model}
          onChange={(event) => {
            const next = getImageModelOption(event.currentTarget.value) ?? IMAGE_MODEL_OPTIONS[0];
            onSettingsChange({ ...settings, model: next.value, quality: next.defaultQuality });
          }}
        >
          {IMAGE_MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="field-pair">
        <label className="field-line">
          <span>比例</span>
          <select
            aria-label="比例"
            value={settings.aspectRatio}
            onChange={(event) =>
              onSettingsChange({ ...settings, aspectRatio: event.currentTarget.value as ImageAspectRatio })
            }
          >
            {IMAGE_ASPECT_RATIOS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </label>
        <label className="field-line">
          <span>质量</span>
          <select
            aria-label="质量"
            value={settings.quality}
            disabled={qualityLocked}
            onChange={(event) => onSettingsChange({ ...settings, quality: event.currentTarget.value as ImageQuality })}
          >
            {modelOption.qualityOptions.map((quality) => (
              <option key={quality.value} value={quality.value}>
                {quality.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-pair">
        <label className="field-line">
          <span>摄像机</span>
          <select
            aria-label="摄像机"
            value={settings.camera}
            onChange={(event) => onSettingsChange({ ...settings, camera: event.currentTarget.value })}
          >
            {IMAGE_CAMERAS.map((camera) => (
              <option key={camera} value={camera}>
                {camera}
              </option>
            ))}
          </select>
        </label>
        <label className="field-line">
          <span>类别</span>
          <select
            aria-label="类别"
            value={settings.category}
            onChange={(event) => onSettingsChange({ ...settings, category: event.currentTarget.value })}
          >
            {IMAGE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" className="generate-button generate-button-light" onClick={onGenerate} disabled={disabled}>
        <Sparkles size={18} />
        <span>生成图片</span>
      </button>
    </aside>
  );
}
