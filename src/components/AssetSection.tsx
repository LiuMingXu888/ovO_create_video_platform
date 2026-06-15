import { ArrowDownAZ, ChevronDown, ChevronUp } from "lucide-react";
import type { AssetAction, AssetCategory, CanvasAsset, SectionDefinition, SortMode } from "../types";
import { AssetCard } from "./AssetCard";
import { UploadPlaceholder } from "./UploadPlaceholder";

interface AssetSectionProps {
  section: SectionDefinition;
  assets: CanvasAsset[];
  expanded: boolean;
  sortMode: SortMode;
  onToggle: (category: AssetCategory) => void;
  onAction: (asset: CanvasAsset, action: AssetAction) => void;
  onRename: (assetId: string, name: string) => void;
  onChangeCategory: (assetId: string, category: AssetCategory) => void;
  onCycleSort: (category: AssetCategory) => void;
  onFilesSelected: (category: AssetCategory, files: FileList) => void;
  onDragStart: (asset: CanvasAsset) => void;
  onDropAsset: (category: AssetCategory) => void;
  onDropOnAsset: (targetAsset: CanvasAsset) => void;
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
  onToggle,
  onAction,
  onRename,
  onChangeCategory,
  onCycleSort,
  onFilesSelected,
  onDragStart,
  onDropAsset,
  onDropOnAsset
}: AssetSectionProps) {
  const acceptsDraggedImages = imageCategories.includes(section.id);
  const sortLabel = sortMode === "asc" ? "升序" : sortMode === "desc" ? "降序" : "默认";

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
          <span className="sort-mode-label">{sortLabel}</span>
          <button
            type="button"
            className="section-action-button"
            title="按名称排序"
            aria-label={`${section.title} 按名称排序：${sortLabel}`}
            onClick={() => onCycleSort(section.id)}
          >
            <ArrowDownAZ size={18} />
          </button>
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
              onAction={onAction}
              onRename={onRename}
              onChangeCategory={onChangeCategory}
              onDragStart={onDragStart}
              onDropOnAsset={onDropOnAsset}
            />
          ))}
          {assets.length === 0 && (
            <UploadPlaceholder
              accept={uploadAcceptByCategory[section.id]}
              category={section.id}
              onFilesSelected={onFilesSelected}
            />
          )}
        </div>
      )}
    </section>
  );
}
