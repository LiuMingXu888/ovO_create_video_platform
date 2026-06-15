import { ImagePlus, X } from "lucide-react";
import { validateReferenceItems } from "../lib/referenceValidation";
import type { GenerationSettings, ReferenceItem } from "../types";
import { GeneratePanel } from "./GeneratePanel";

interface PromptDockProps {
  prompt: string;
  references: ReferenceItem[];
  validationErrors?: string[];
  onPromptChange: (value: string) => void;
  onRemoveReference: (id: string) => void;
  onLocalFilesSelected: (files: FileList) => void;
  onGenerate: () => void;
  generationSettings: GenerationSettings;
  onGenerationSettingsChange: (settings: GenerationSettings) => void;
  generateDisabled?: boolean;
  generateStatus?: string;
}

function getKindLabel(kind: ReferenceItem["kind"]) {
  if (kind === "image") {
    return "图片";
  }

  if (kind === "video") {
    return "视频";
  }

  return "音频";
}

export function PromptDock({
  prompt,
  references,
  validationErrors = [],
  onPromptChange,
  onRemoveReference,
  onLocalFilesSelected,
  onGenerate,
  generationSettings,
  onGenerationSettingsChange,
  generateDisabled,
  generateStatus
}: PromptDockProps) {
  const validation = validateReferenceItems(references);
  const errors = [...validation.errors, ...validationErrors];

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
          <button key={item.id} type="button" className="reference-chip" onClick={() => onRemoveReference(item.id)}>
            <span>{getKindLabel(item.kind)}</span>
            <strong>{item.name}</strong>
            <X size={14} />
          </button>
        ))}
      </div>

      {errors.length > 0 && <div className="validation-errors">{errors.join(" / ")}</div>}

      <div className="prompt-row">
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.currentTarget.value)}
          placeholder="输入视频提示词，点击资源 + 会插入资源名"
        />
        <GeneratePanel
          settings={generationSettings}
          onSettingsChange={onGenerationSettingsChange}
          onGenerate={onGenerate}
          disabled={generateDisabled}
          statusMessage={generateStatus}
        />
      </div>
    </div>
  );
}
