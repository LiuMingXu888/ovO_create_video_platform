import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Pencil, Plus, RefreshCcw, Trash2, X } from "lucide-react";
import type { AssetAction, CanvasAsset } from "../types";

interface PreviewModalProps {
  asset: CanvasAsset | null;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onAction?: (asset: CanvasAsset, action: AssetAction) => void;
  onRename?: (assetId: string, name: string) => void;
}

export function PreviewModal({
  asset,
  onClose,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  onAction,
  onRename
}: PreviewModalProps) {
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [scale, setScale] = useState(1);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setVideoSize(null);
  }, [asset?.id]);

  useEffect(() => {
    setEditingName(false);
    setDraftName(asset?.name ?? "");
  }, [asset?.id, asset?.name]);

  useEffect(() => {
    setScale(1);
  }, [asset?.id]);

  if (!asset) {
    return null;
  }

  const videoOrientation = getVideoOrientation(videoSize);
  const videoClassName = ["preview-media", videoOrientation ? `preview-media-${videoOrientation}` : ""].filter(Boolean).join(" ");
  const videoStyle = videoSize ? { aspectRatio: `${videoSize.width} / ${videoSize.height}` } : undefined;

  function startRename() {
    if (!asset) {
      return;
    }
    setDraftName(asset.name);
    setEditingName(true);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${asset.name} 预览`} onClick={onClose} onWheel={(e) => e.preventDefault()}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} title="关闭" aria-label="关闭">
          <X size={20} />
        </button>
        <div className="preview-modal-header">
          {editingName ? (
            <form
              className="preview-name-editor"
              onSubmit={(event) => {
                event.preventDefault();
                const next = draftName.trim();
                if (next) {
                  onRename?.(asset.id, next);
                }
                setEditingName(false);
              }}
            >
              <input
                ref={nameInputRef}
                aria-label="编辑名称"
                value={draftName}
                autoFocus
                onChange={(event) => setDraftName(event.currentTarget.value)}
                onBlur={() => setEditingName(false)}
              />
            </form>
          ) : (
            <h2 className="preview-title" title={asset.name} onDoubleClick={startRename}>
              {asset.name}
            </h2>
          )}
          <div className="preview-actions" aria-label="预览操作">
            <button type="button" className="preview-action-button" title="重命名" aria-label="重命名" onClick={startRename}>
              <Pencil size={16} />
            </button>
            <button
              type="button"
              className="preview-action-button"
              title="加入提示词资源引用"
              aria-label="加入提示词资源引用"
              onClick={() => onAction?.(asset, "insert")}
            >
              <Plus size={17} />
            </button>
            <button
              type="button"
              className="preview-action-button"
              title={asset.generationPrompt ? "复用提示词和资源" : "暂无可复用的生成提示词"}
              aria-label="复用提示词"
              disabled={!asset.generationPrompt}
              onClick={() => onAction?.(asset, "reuse-generation")}
            >
              <RefreshCcw size={16} />
            </button>
            <button type="button" className="preview-action-button" title="下载" aria-label="下载" onClick={() => onAction?.(asset, "download")}>
              <Download size={16} />
            </button>
            <button type="button" className="preview-action-button" title="删除" aria-label="删除" onClick={() => onAction?.(asset, "delete")}>
              <Trash2 size={16} />
            </button>
            <span className="preview-action-divider" aria-hidden="true" />
            <button
              type="button"
              className="preview-action-button"
              onClick={onPrevious}
              disabled={!hasPrevious}
              title="查看上一个节点"
              aria-label="查看上一个节点"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="preview-action-button"
              onClick={onNext}
              disabled={!hasNext}
              title="查看下一个节点"
              aria-label="查看下一个节点"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <div
          className="preview-frame"
          onWheel={(e) => {
            e.preventDefault();
            if (e.ctrlKey && asset.kind === "image") {
              setScale((current) => {
                const next = current + (e.deltaY < 0 ? 0.25 : -0.25);
                return Math.min(4, Math.max(1, Number(next.toFixed(2))));
              });
            }
          }}
        >
          {asset.kind === "image" && (
            <img
              className="preview-media"
              src={asset.url}
              alt={asset.name}
              style={{ transform: `scale(${scale})`, transformOrigin: "center center", transition: "transform 0.08s ease-out" }}
            />
          )}
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
