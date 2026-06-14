import { Download, Maximize2, Plus } from "lucide-react";
import type { AssetAction, CanvasAsset } from "../types";

interface AssetCardProps {
  asset: CanvasAsset;
  draggable?: boolean;
  onAction: (asset: CanvasAsset, action: AssetAction) => void;
  onDragStart?: (asset: CanvasAsset) => void;
}

export function AssetCard({ asset, draggable = false, onAction, onDragStart }: AssetCardProps) {
  return (
    <article
      className={`asset-card asset-card-${asset.kind}`}
      draggable={draggable}
      onDragStart={() => onDragStart?.(asset)}
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
      </div>

      <div className="asset-name" title={asset.name}>
        {asset.name}
      </div>
    </article>
  );
}
