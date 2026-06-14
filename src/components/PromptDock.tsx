import { ImagePlus, X } from "lucide-react";
import { validateReferenceItems } from "../lib/referenceValidation";
import type { ReferenceItem } from "../types";
import { GeneratePanel } from "./GeneratePanel";

interface PromptDockProps {
  prompt: string;
  references: ReferenceItem[];
  onPromptChange: (value: string) => void;
  onRemoveReference: (id: string) => void;
  onLocalFilesSelected: (files: FileList) => void;
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
  onPromptChange,
  onRemoveReference,
  onLocalFilesSelected
}: PromptDockProps) {
  const validation = validateReferenceItems(references);

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

      {!validation.valid && <div className="validation-errors">{validation.errors.join(" / ")}</div>}

      <div className="prompt-row">
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.currentTarget.value)}
          placeholder="输入视频提示词，点击资源 + 会插入资源名"
        />
        <GeneratePanel />
      </div>
    </div>
  );
}
