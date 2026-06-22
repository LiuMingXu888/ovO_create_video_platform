import { ImagePlus, X } from "lucide-react";
import { useState } from "react";
import { validateReferenceItems } from "../lib/referenceValidation";
import type { GenerateMode, GenerationSettings, ImageGenerationSettings, ReferenceItem } from "../types";
import { GeneratePanel } from "./GeneratePanel";
import { ImageGeneratePanel } from "./ImageGeneratePanel";
import { PromptTokenEditor } from "./PromptTokenEditor";

interface PromptDockProps {
  prompt: string;
  references: ReferenceItem[];
  validationErrors?: string[];
  onPromptChange: (value: string) => void;
  onRemoveReference: (id: string) => void;
  onLocalFilesSelected: (files: FileList) => void;
  onGenerate: () => void;
  generateMode: GenerateMode;
  onGenerateModeChange: (mode: GenerateMode) => void;
  generationSettings: GenerationSettings;
  onGenerationSettingsChange: (settings: GenerationSettings) => void;
  imageGenerationSettings: ImageGenerationSettings;
  onImageGenerationSettingsChange: (settings: ImageGenerationSettings) => void;
  onGenerateImage: () => void;
  generateDisabled?: boolean;
  activityMessages?: string[];
}

function getReferenceLabel(item: ReferenceItem, references: ReferenceItem[]) {
  const sameKindIndex = references.filter((reference) => reference.kind === item.kind).findIndex((reference) => reference.id === item.id) + 1;

  if (item.kind === "image") {
    return `图片${sameKindIndex}`;
  }

  if (item.kind === "video") {
    return `视频${sameKindIndex}`;
  }

  return `音频${sameKindIndex}`;
}

export function PromptDock({
  prompt,
  references,
  validationErrors = [],
  onPromptChange,
  onRemoveReference,
  onLocalFilesSelected,
  onGenerate,
  generateMode,
  onGenerateModeChange,
  generationSettings,
  onGenerationSettingsChange,
  imageGenerationSettings,
  onImageGenerationSettingsChange,
  onGenerateImage,
  generateDisabled,
  activityMessages = []
}: PromptDockProps) {
  const validation = validateReferenceItems(references);
  const errors = [...validation.errors, ...validationErrors];
  const [hoveredReferenceId, setHoveredReferenceId] = useState<string | null>(null);
  const hoveredReference = references.find((item) => item.id === hoveredReferenceId && item.previewUrl);

  return (
    <div className="prompt-dock">
      <div className="reference-strip" aria-label="参考素材">
        <label className="reference-add" title="添加参考素材">
          <input
            className="visually-hidden"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,audio/mpeg,audio/wav"
            onChange={(event) => {
              if (event.currentTarget.files) {
                onLocalFilesSelected(event.currentTarget.files);
              }
              event.currentTarget.value = "";
            }}
          />
          <ImagePlus size={20} />
        </label>

        {references.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`reference-chip reference-chip-${item.kind}`}
            onClick={() => onRemoveReference(item.id)}
            onMouseEnter={() => setHoveredReferenceId(item.id)}
            onMouseLeave={() => setHoveredReferenceId((current) => (current === item.id ? null : current))}
            onFocus={() => setHoveredReferenceId(item.id)}
            onBlur={() => setHoveredReferenceId((current) => (current === item.id ? null : current))}
          >
            <span className="reference-kind">{getReferenceLabel(item, references)}</span>
            <strong>{item.name}</strong>
            <X size={14} />
          </button>
        ))}
      </div>

      {hoveredReference?.previewUrl && (
        <div className="reference-hover-preview reference-hover-preview-large">
          <img className="reference-hover-preview-image" src={hoveredReference.previewUrl} alt={`${hoveredReference.name} 预览`} />
        </div>
      )}

      {errors.length > 0 && <div className="validation-errors">{errors.join(" / ")}</div>}

      <div className="prompt-row prompt-row-three-column">
        <PromptTokenEditor
          prompt={prompt}
          onPromptChange={onPromptChange}
        />
        <div className="generate-column">
          <div className="generate-mode-tabs" role="tablist" aria-label="生成类型">
            <button
              type="button"
              role="tab"
              aria-selected={generateMode === "video"}
              className={`generate-mode-tab${generateMode === "video" ? " generate-mode-tab-active" : ""}`}
              onClick={() => onGenerateModeChange("video")}
            >
              视频生成
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={generateMode === "image"}
              className={`generate-mode-tab${generateMode === "image" ? " generate-mode-tab-active" : ""}`}
              onClick={() => onGenerateModeChange("image")}
            >
              图片生成
            </button>
          </div>
          {generateMode === "video" ? (
            <GeneratePanel
              settings={generationSettings}
              onSettingsChange={onGenerationSettingsChange}
              onGenerate={onGenerate}
              disabled={generateDisabled}
            />
          ) : (
            <ImageGeneratePanel
              settings={imageGenerationSettings}
              onSettingsChange={onImageGenerationSettingsChange}
              onGenerate={onGenerateImage}
              disabled={generateDisabled}
            />
          )}
        </div>
        <section className="prompt-note-panel" aria-label="提示记录">
          <ul aria-label="提示记录列表">
            {activityMessages.map((message, index) => (
              <li key={`${message}-${index}`}>{message}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
