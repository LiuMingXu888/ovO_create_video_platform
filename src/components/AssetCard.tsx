import { CaptionsOff, Check, Download, Film, Maximize2, Package, Pause, Pencil, Play, Plus, RefreshCcw, Trash2, UserRound, X } from "lucide-react";
import { useRef, useState } from "react";
import type { AssetAction, AssetCategory, CanvasAsset } from "../types";

interface AssetCardProps {
  asset: CanvasAsset;
  draggable?: boolean;
  playingAssetId?: string | null;
  onAction: (asset: CanvasAsset, action: AssetAction) => void;
  onRename: (assetId: string, name: string) => void;
  onChangeCategory: (assetId: string, category: AssetCategory) => void;
  onMediaElement?: (assetId: string, element: HTMLMediaElement | null) => void;
  onMediaEnded?: (assetId: string) => void;
  onDragStart?: (asset: CanvasAsset) => void;
  onDropOnAsset?: (targetAsset: CanvasAsset) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onSelectionChange?: (assetId: string, selected: boolean) => void;
}

const categoryActions: Array<{ category: AssetCategory; label: string; icon: "user" | "film" | "package" }> = [
  { category: "characters", label: "人物图片", icon: "user" },
  { category: "scenes", label: "场景图片", icon: "film" },
  { category: "props", label: "道具图片", icon: "package" }
];

const categoryActionOrder: Record<"characters" | "scenes" | "props", AssetCategory[]> = {
  characters: ["scenes", "props"],
  scenes: ["characters", "props"],
  props: ["characters", "scenes"]
};

export function AssetCard({
  asset,
  draggable = false,
  playingAssetId,
  onAction,
  onRename,
  onChangeCategory,
  onMediaElement,
  onMediaEnded,
  onDragStart,
  onDropOnAsset,
  selectionMode = false,
  selected = false,
  onSelectionChange
}: AssetCardProps) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(asset.name);
  const mediaElementRef = useRef<HTMLMediaElement | null>(null);
  const isPlaying = playingAssetId === asset.id;

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

  function setMediaElement(element: HTMLMediaElement | null) {
    if (mediaElementRef.current === element) {
      return;
    }

    if (mediaElementRef.current) {
      onMediaElement?.(asset.id, null);
    }

    mediaElementRef.current = element;

    if (element) {
      onMediaElement?.(asset.id, element);
    }
  }

  function renderCategoryIcon(icon: "user" | "film" | "package") {
    if (icon === "user") {
      return <UserRound size={15} />;
    }

    if (icon === "film") {
      return <Film size={15} />;
    }

    return <Package size={15} />;
  }

  const imageCategoryActions =
    asset.kind === "image" && (asset.category === "characters" || asset.category === "scenes" || asset.category === "props")
      ? categoryActionOrder[asset.category]
          .map((category) => categoryActions.find((action) => action.category === category))
          .filter((action): action is (typeof categoryActions)[number] => Boolean(action))
      : [];

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
      {selectionMode && (
        <label className="asset-select-box">
          <input
            type="checkbox"
            checked={selected}
            aria-label={`选择资源 ${asset.name}`}
            onChange={(event) => onSelectionChange?.(asset.id, event.currentTarget.checked)}
          />
        </label>
      )}
      <div className="asset-media">
        {asset.kind === "image" && <img src={asset.thumbnailUrl ?? asset.url} alt={asset.name} />}
        {asset.kind === "video" && (
          <video
            ref={setMediaElement}
            src={asset.url}
            poster={asset.thumbnailUrl}
            muted={false}
            playsInline
            preload="metadata"
            onEnded={() => onMediaEnded?.(asset.id)}
          />
        )}
        {asset.kind === "audio" && (
          <>
            <audio ref={setMediaElement} src={asset.url} muted={false} preload="metadata" onEnded={() => onMediaEnded?.(asset.id)} />
            <div className="audio-wave">音频</div>
          </>
        )}
      </div>

      <div className="asset-card-overlay">
        <div className="asset-card-primary-actions">
          <button type="button" title="放大预览" aria-label={`放大预览 ${asset.name}`} onClick={() => onAction(asset, "preview")}>
            <Maximize2 size={16} />
          </button>
          <button type="button" title="重命名" aria-label={`重命名 ${asset.name}`} onClick={() => setEditingName(true)}>
            <Pencil size={15} />
          </button>
          <button type="button" title="下载" aria-label={`下载资源 ${asset.name}`} onClick={() => onAction(asset, "download")}>
            <Download size={16} />
          </button>
          <button type="button" title="加入提示词" aria-label={`加入提示词 ${asset.name}`} onClick={() => onAction(asset, "insert")}>
            <Plus size={17} />
          </button>
        </div>
        <div className="asset-card-secondary-actions">
          {imageCategoryActions.map((action) => (
            <button
              key={action.category}
              type="button"
              title={`设为${action.label}`}
              aria-label={`设为${action.label} ${asset.name}`}
              onClick={() => onChangeCategory(asset.id, action.category)}
            >
              {renderCategoryIcon(action.icon)}
            </button>
          ))}
          {asset.kind !== "image" && (
            <button
              type="button"
              title={isPlaying ? "暂停" : "播放"}
              aria-label={`${isPlaying ? "暂停" : "播放"} ${asset.name}`}
              onClick={() => onAction(asset, "toggle-play")}
            >
              {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            </button>
          )}
          {asset.kind === "video" && (
            <>
              <button
                type="button"
                title={asset.generationPrompt && asset.generationReferences?.length ? "复用生成" : "暂无可复用的生成提示词和引用"}
                aria-label={`复用生成 ${asset.name}`}
                disabled={!asset.generationPrompt || !asset.generationReferences?.length}
                onClick={() => onAction(asset, "reuse-generation")}
              >
                <RefreshCcw size={15} />
              </button>
              <button
                type="button"
                title="去除字幕"
                aria-label={`去除字幕 ${asset.name}`}
                onClick={() => onAction(asset, "remove-subtitles")}
              >
                <CaptionsOff size={15} />
              </button>
            </>
          )}
          <button type="button" title="删除" aria-label={`删除 ${asset.name}`} onClick={() => onAction(asset, "delete")}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {editingName ? (
        <form
          className="asset-name-editor"
          onSubmit={(event) => {
            event.preventDefault();
            saveName();
          }}
        >
          <div className="asset-name-editor-actions">
            <button type="submit" title="保存名称" aria-label="保存名称">
              <Check size={14} />
            </button>
            <button type="button" title="取消重命名" aria-label="取消重命名" onClick={cancelEdit}>
              <X size={14} />
            </button>
          </div>
          <input
            aria-label={`编辑名称 ${asset.name}`}
            value={draftName}
            onChange={(event) => setDraftName(event.currentTarget.value)}
          />
        </form>
      ) : (
        <div className="asset-name" title={asset.name}>
          {asset.name}
        </div>
      )}
    </article>
  );
}
