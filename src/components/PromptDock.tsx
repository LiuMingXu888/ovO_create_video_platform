import { ImagePlus, X } from "lucide-react";
import { validateReferenceItems } from "../lib/referenceValidation";
import type { GenerationSettings, ReferenceItem } from "../types";
import { GeneratePanel } from "./GeneratePanel";
import { PromptTokenEditor } from "./PromptTokenEditor";

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

function getReferenceLabel(item: ReferenceItem, references: ReferenceItem[]) {
  const sameKindIndex = references.filter((reference) => reference.kind === item.kind).findIndex((reference) => reference.id === item.id) + 1;

  if (item.kind === "image") {
    return `图${numberToChinese(sameKindIndex)}`;
  }

  if (item.kind === "video") {
    return `视频${numberToChinese(sameKindIndex)}`;
  }

  return `音频${numberToChinese(sameKindIndex)}`;
}

function numberToChinese(value: number) {
  const labels = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
  return labels[value] ?? String(value);
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
          <button
            key={item.id}
            type="button"
            className={`reference-chip reference-chip-${item.kind}`}
            onClick={() => onRemoveReference(item.id)}
          >
            <span className="reference-kind">{getReferenceLabel(item, references)}</span>
            <strong>{item.name}</strong>
            {item.kind === "image" && item.previewUrl && (
              <span className="reference-preview" aria-hidden="true">
                <img src={item.previewUrl} alt="" />
              </span>
            )}
            <X size={14} />
          </button>
        ))}
      </div>

      {errors.length > 0 && <div className="validation-errors">{errors.join(" / ")}</div>}

      <div className="prompt-row">
        <PromptTokenEditor
          prompt={prompt}
          references={references}
          onPromptChange={onPromptChange}
          onRemoveReference={onRemoveReference}
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
