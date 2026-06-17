import { useEffect, useState } from "react";
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
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setVideoSize(null);
  }, [asset?.id]);

  if (!asset) {
    return null;
  }

  const videoOrientation = getVideoOrientation(videoSize);
  const videoClassName = ["preview-media", videoOrientation ? `preview-media-${videoOrientation}` : ""].filter(Boolean).join(" ");
  const videoStyle = undefined;

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
          {asset.kind === "video" && (
            <video
              className={videoClassName}
              src={asset.url}
              controls
              playsInline
              title="完整视频预览"
              style={videoStyle}
              onLoadedMetadata={(event) => {
                const { videoWidth, videoHeight } = event.currentTarget;
                if (videoWidth > 0 && videoHeight > 0) {
                  setVideoSize({ width: videoWidth, height: videoHeight });
                }
              }}
            />
          )}
          {asset.kind === "audio" && <audio src={asset.url} controls />}
        </div>
      </div>
    </div>
  );
}

function getVideoOrientation(size: { width: number; height: number } | null) {
  if (!size) {
    return null;
  }

  if (size.height > size.width) {
    return "portrait";
  }

  if (size.width > size.height) {
    return "landscape";
  }

  return "square";
}
