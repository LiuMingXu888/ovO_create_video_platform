import { CaptionsOff, Check, Download, Maximize2, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";
import type { AssetAction, CanvasAsset } from "../types";

interface AssetCardProps {
  asset: CanvasAsset;
  draggable?: boolean;
  onAction: (asset: CanvasAsset, action: AssetAction) => void;
  onRename: (assetId: string, name: string) => void;
  onDragStart?: (asset: CanvasAsset) => void;
  onDropOnAsset?: (targetAsset: CanvasAsset) => void;
}

export function AssetCard({ asset, draggable = false, onAction, onRename, onDragStart, onDropOnAsset }: AssetCardProps) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(asset.name);

  function saveName() {
    const nextName = draftName.trim();
    if (nextName) {
      onRename(asset.id, nextName);
    }
    setEditingName(false);
  }

  function cancelEdit() {
    setDraftName(asset.name);
    setEditingName(false);
  }

  return (
    <article
      className={`asset-card asset-card-${asset.kind}`}
      draggable={draggable}
      onDragStart={() => onDragStart?.(asset)}
      onDragOver={(event) => {
        if (draggable) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (draggable) {
          event.preventDefault();
          onDropOnAsset?.(asset);
        }
      }}
    >
      <div className="asset-media">
        {asset.kind === "image" && <img src={asset.thumbnailUrl ?? asset.url} alt={asset.name} />}
        {asset.kind === "video" && (
          <video src={asset.url} poster={asset.thumbnailUrl} muted playsInline preload="metadata" />
        )}
        {asset.kind === "audio" && <div className="audio-wave">音频</div>}
      </div>

      <div className="asset-card-overlay">
        <button type="button" title="放大预览" aria-label="放大预览" onClick={() => onAction(asset, "preview")}>
          <Maximize2 size={16} />
        </button>
        <button type="button" title="下载" aria-label="下载资源" onClick={() => onAction(asset, "download")}>
          <Download size={16} />
        </button>
        <button type="button" title="加入提示词" aria-label={`加入提示词 ${asset.name}`} onClick={() => onAction(asset, "insert")}>
          <Plus size={17} />
        </button>
        <button type="button" title="重命名" aria-label={`重命名 ${asset.name}`} onClick={() => setEditingName(true)}>
          <Pencil size={15} />
        </button>
        {asset.kind === "video" && (
          <button
            type="button"
            title="去除字幕"
            aria-label={`去除字幕 ${asset.name}`}
            onClick={() => onAction(asset, "remove-subtitles")}
          >
            <CaptionsOff size={15} />
          </button>
        )}
      </div>

      {editingName ? (
        <form
          className="asset-name-editor"
          onSubmit={(event) => {
            event.preventDefault();
            saveName();
          }}
        >
          <input
            aria-label={`编辑名称 ${asset.name}`}
            value={draftName}
            onChange={(event) => setDraftName(event.currentTarget.value)}
          />
          <button type="submit" title="保存名称" aria-label="保存名称">
            <Check size={14} />
          </button>
          <button type="button" title="取消重命名" aria-label="取消重命名" onClick={cancelEdit}>
            <X size={14} />
          </button>
        </form>
      ) : (
        <div className="asset-name" title={asset.name}>
          {asset.name}
        </div>
      )}
    </article>
  );
}
