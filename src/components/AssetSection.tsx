import { ChevronDown, ChevronUp } from "lucide-react";
import type { AssetAction, AssetCategory, CanvasAsset, SectionDefinition } from "../types";
import { AssetCard } from "./AssetCard";
import { UploadPlaceholder } from "./UploadPlaceholder";

interface AssetSectionProps {
  section: SectionDefinition;
  assets: CanvasAsset[];
  expanded: boolean;
  onToggle: (category: AssetCategory) => void;
  onAction: (asset: CanvasAsset, action: AssetAction) => void;
  onFilesSelected: (category: AssetCategory, files: FileList) => void;
  onDragStart: (asset: CanvasAsset) => void;
  onDropAsset: (category: AssetCategory) => void;
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
  onToggle,
  onAction,
  onFilesSelected,
  onDragStart,
  onDropAsset
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
      <button type="button" className="section-header" onClick={() => onToggle(section.id)}>
        <span>{section.title}</span>
        {expanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
      </button>

      {expanded && (
        <div className="asset-grid">
          {assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              draggable={asset.kind === "image"}
              onAction={onAction}
              onDragStart={onDragStart}
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
