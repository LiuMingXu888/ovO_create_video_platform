import { ChevronDown, ChevronUp } from "lucide-react";
import type { AssetAction, AssetCategory, CanvasAsset, SectionDefinition, SortMode } from "../types";
import { AssetCard } from "./AssetCard";
import { UploadPlaceholder } from "./UploadPlaceholder";

interface AssetSectionProps {
  section: SectionDefinition;
  assets: CanvasAsset[];
  expanded: boolean;
  sortMode: SortMode;
  playingAssetId?: string | null;
  onToggle: (category: AssetCategory) => void;
  onAction: (asset: CanvasAsset, action: AssetAction) => void;
  onRename: (assetId: string, name: string) => void;
  onChangeCategory: (assetId: string, category: AssetCategory) => void;
  onMediaElement: (assetId: string, element: HTMLMediaElement | null) => void;
  onMediaEnded: (assetId: string) => void;
  onSortModeChange: (category: AssetCategory, mode: SortMode) => void;
  onFilesSelected: (category: AssetCategory, files: FileList) => void;
  onDragStart: (asset: CanvasAsset) => void;
  onDropAsset: (category: AssetCategory) => void;
  onDropOnAsset: (targetAsset: CanvasAsset) => void;
  selectionMode?: boolean;
  selectedAssetIds?: Set<string>;
  onSelectionChange?: (assetId: string, selected: boolean) => void;
}

const uploadAcceptByCategory: Record<AssetCategory, string> = {
  characters: "image/jpeg,image/png,image/webp,image/*",
  scenes: "image/jpeg,image/png,image/webp,image/*",
  props: "image/jpeg,image/png,image/webp,image/*",
  audio: "audio/mpeg,audio/wav,audio/*",
  video: "video/mp4,video/quicktime,video/*"
};

const imageCategories: AssetCategory[] = ["characters", "scenes", "props"];

export function AssetSection({
  section,
  assets,
  expanded,
  sortMode,
  playingAssetId,
  onToggle,
  onAction,
  onRename,
  onChangeCategory,
  onMediaElement,
  onMediaEnded,
  onSortModeChange,
  onFilesSelected,
  onDragStart,
  onDropAsset,
  onDropOnAsset,
  selectionMode = false,
  selectedAssetIds = new Set(),
  onSelectionChange
}: AssetSectionProps) {
  const acceptsDraggedImages = imageCategories.includes(section.id);

  return (
    <section
      className="asset-section"
      onDragOver={(event) => {
        if (acceptsDraggedImages) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (acceptsDraggedImages) {
          event.preventDefault();
          onDropAsset(section.id);
        }
      }}
    >
      <div className="section-header">
        <span>{section.title}</span>
        <div className="section-actions">
          <select
            className="section-sort-select"
            aria-label={`${section.title}排序`}
            value={sortMode}
            onChange={(event) => onSortModeChange(section.id, event.currentTarget.value as SortMode)}
          >
            <option value="default">默认排序</option>
            <option value="generated-asc">生成时间升序</option>
            <option value="generated-desc">生成时间降序</option>
            <option value="name-asc">名字升序</option>
            <option value="name-desc">名字降序</option>
          </select>
          <button
            type="button"
            className="section-action-button"
            aria-label={section.title}
            onClick={() => onToggle(section.id)}
          >
            {expanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="asset-grid">
          {assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              draggable={asset.kind === "image"}
              playingAssetId={playingAssetId}
              onAction={onAction}
              onRename={onRename}
              onChangeCategory={onChangeCategory}
              onMediaElement={onMediaElement}
              onMediaEnded={onMediaEnded}
              onDragStart={onDragStart}
              onDropOnAsset={onDropOnAsset}
              selectionMode={selectionMode}
              selected={selectedAssetIds.has(asset.id)}
              onSelectionChange={onSelectionChange}
            />
          ))}
          <UploadPlaceholder
            accept={uploadAcceptByCategory[section.id]}
            category={section.id}
            onFilesSelected={onFilesSelected}
          />
        </div>
      )}
    </section>
  );
}
