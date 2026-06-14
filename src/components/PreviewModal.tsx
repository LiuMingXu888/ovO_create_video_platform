import { X } from "lucide-react";
import type { CanvasAsset } from "../types";

interface PreviewModalProps {
  asset: CanvasAsset | null;
  onClose: () => void;
}

export function PreviewModal({ asset, onClose }: PreviewModalProps) {
  if (!asset) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${asset.name} 预览`}>
      <div className="preview-modal">
        <button type="button" className="modal-close" onClick={onClose} title="关闭" aria-label="关闭">
          <X size={20} />
        </button>
        <h2>{asset.name}</h2>
        <div className="preview-frame">
          {asset.kind === "image" && <img src={asset.url} alt={asset.name} />}
          {asset.kind === "video" && <video src={asset.url} controls playsInline />}
          {asset.kind === "audio" && <audio src={asset.url} controls />}
        </div>
      </div>
    </div>
  );
}
