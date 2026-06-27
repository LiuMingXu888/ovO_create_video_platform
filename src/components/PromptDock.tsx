import { ListPlus, X } from "lucide-react";
import { useState } from "react";
import { buildReferenceText, getReferenceLabel } from "../lib/referenceText";
import { validateReferenceItems } from "../lib/referenceValidation";
import type { GenerateMode, GenerationSettings, ImageGenerationSettings, ReferenceItem } from "../types";
import { GeneratePanel } from "./GeneratePanel";
import { ImageGeneratePanel } from "./ImageGeneratePanel";
import { PromptTokenEditor } from "./PromptTokenEditor";

interface PromptDockProps {
  prompt: string;
  references: ReferenceItem[];
  validationErrors?: string[];
  nodeName: string;
  onNodeNameChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onRemoveReference: (id: string) => void;
  onLocalFilesSelected?: (files: FileList) => void;
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

export function PromptDock({
  prompt,
  references,
  validationErrors = [],
  nodeName,
  onNodeNameChange,
  onPromptChange,
  onRemoveReference,
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
        <button
          type="button"
          className="reference-add reference-textify"
          title="文字化引用到提示词"
          aria-label="文字化引用到提示词"
          disabled={references.length === 0}
          onClick={() => {
            const text = buildReferenceText(references);
            if (text) {
              onPromptChange(`${text}\n${prompt}`);
            }
          }}
        >
          <ListPlus size={20} />
        </button>

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

      <div className="node-name-field">
        <label htmlFor="node-name-input">节点名称</label>
        <input
          id="node-name-input"
          type="text"
          value={nodeName}
          placeholder="自动命名"
          onChange={(e) => onNodeNameChange(e.currentTarget.value)}
        />
      </div>

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
