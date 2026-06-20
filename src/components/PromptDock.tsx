import { ImagePlus, X } from "lucide-react";
import { useState } from "react";
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
  generationSettings,
  onGenerationSettingsChange,
  generateDisabled,
  generateStatus
}: PromptDockProps) {
  const validation = validateReferenceItems(references);
  const errors = [...validation.errors, ...validationErrors];
  const [hoveredReferenceId, setHoveredReferenceId] = useState<string | null>(null);
  const hoveredReference = references.find((item) => item.id === hoveredReferenceId && item.previewUrl);
  const promptNotes = generateStatus
    ? [generateStatus]
    : ["可添加图片、视频或音频参考素材", "输入提示词后即可生成视频"];

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
        <GeneratePanel
          settings={generationSettings}
          onSettingsChange={onGenerationSettingsChange}
          onGenerate={onGenerate}
          disabled={generateDisabled}
        />
        <section className="prompt-note-panel" aria-label="提示记录">
          <ul aria-label="提示记录列表">
            {promptNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
