import { X } from "lucide-react";
import type { ReferenceItem } from "../types";

interface PromptTokenEditorProps {
  prompt: string;
  references: ReferenceItem[];
  onPromptChange: (value: string) => void;
  onRemoveReference: (id: string) => void;
}

function getKindLabel(kind: ReferenceItem["kind"]) {
  if (kind === "image") return "图片";
  if (kind === "video") return "视频";
  return "音频";
}

export function PromptTokenEditor({ prompt, references, onPromptChange, onRemoveReference }: PromptTokenEditorProps) {
  return (
    <div className="prompt-token-editor">
      {references.length > 0 && (
        <div className="prompt-token-line" aria-label="提示词资源">
          {references.map((item) => (
            <span key={item.id} className={`prompt-token prompt-token-${item.kind}`}>
              <span>{getKindLabel(item.kind)}</span>
              <strong>{item.name}</strong>
              <button type="button" aria-label={`删除提示词资源 ${item.name}`} onClick={() => onRemoveReference(item.id)}>
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <textarea
        value={prompt}
        onChange={(event) => onPromptChange(event.currentTarget.value)}
        placeholder="输入视频提示词，点击资源 + 会插入资源标签"
      />
    </div>
  );
}
