import { X } from "lucide-react";
import type { CanvasAsset } from "../types";

interface PromptInfoModalProps {
  asset: CanvasAsset | null;
  onClose: () => void;
}

export function PromptInfoModal({ asset, onClose }: PromptInfoModalProps) {
  if (!asset) return null;

  const lines = (asset.generationPrompt ?? "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const references = asset.generationReferences ?? [];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${asset.name} 提示词`} onClick={onClose} onWheel={(e) => e.preventDefault()}>
      <div className="preview-modal prompt-info-modal" onClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} title="关闭" aria-label="关闭">
          <X size={20} />
        </button>
        <h2 className="preview-title">{asset.name} · 提示词</h2>
        <div className="prompt-info-thumbs" aria-label="生成引用素材">
          {references.length === 0 ? (
            <span className="prompt-info-empty">无引用素材</span>
          ) : (
            references.map((ref) => (
              <div key={ref.id} className="prompt-info-thumb" title={ref.name}>
                {ref.previewUrl ? <img src={ref.previewUrl} alt={ref.name} /> : <span>{ref.name}</span>}
              </div>
            ))
          )}
        </div>
        <ul className="prompt-info-prompt" aria-label="提示词内容">
          {lines.length === 0
            ? <li className="prompt-info-empty">无提示词</li>
            : lines.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      </div>
    </div>
  );
}
