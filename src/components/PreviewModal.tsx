import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { CanvasAsset } from "../types";

interface PreviewModalProps {
  asset: CanvasAsset | null;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
}

export function PreviewModal({ asset, onClose, onPrevious, onNext, hasPrevious = false, hasNext = false }: PreviewModalProps) {
  if (!asset) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${asset.name} 预览`}>
      <div className="preview-modal">
        <button type="button" className="modal-close" onClick={onClose} title="关闭" aria-label="关闭">
          <X size={20} />
        </button>
        <div className="preview-modal-header">
          <h2>{asset.name}</h2>
          <div className="preview-nav-group" aria-label="预览切换">
            <button
              type="button"
              className="preview-nav-button"
              onClick={onPrevious}
              disabled={!hasPrevious}
              title="查看上一个节点"
              aria-label="查看上一个节点"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="preview-nav-button"
              onClick={onNext}
              disabled={!hasNext}
              title="查看下一个节点"
              aria-label="查看下一个节点"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <div className="preview-frame">
          {asset.kind === "image" && <img className="preview-media" src={asset.url} alt={asset.name} />}
          {asset.kind === "video" && <video className="preview-media" src={asset.url} controls playsInline title="完整视频预览" />}
          {asset.kind === "audio" && <audio src={asset.url} controls />}
        </div>
      </div>
    </div>
  );
}
