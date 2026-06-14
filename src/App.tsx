import { useMemo, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { AssetSection } from "./components/AssetSection";
import { PreviewModal } from "./components/PreviewModal";
import { PromptDock } from "./components/PromptDock";
import { sampleAssets, sectionDefinitions } from "./data/sampleAssets";
import type { AssetAction, AssetCategory, AssetKind, CanvasAsset, ReferenceItem } from "./types";

const imageCategories: AssetCategory[] = ["characters", "scenes", "props"];
const mb = 1024 * 1024;

function createId(prefix: string) {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `${prefix}-${randomPart}`;
}

function getDisplayName(file: File) {
  return file.name.replace(/\.[^.]+$/, "");
}

function kindFromFile(file: File, fallback: AssetKind): AssetKind {
  if (file.type.startsWith("video/")) {
    return "video";
  }

  if (file.type.startsWith("audio/")) {
    return "audio";
  }

  if (file.type.startsWith("image/")) {
    return "image";
  }

  return fallback;
}

function kindFromCategory(category: AssetCategory): AssetKind {
  if (category === "audio") {
    return "audio";
  }

  if (category === "video") {
    return "video";
  }

  return "image";
}

function getReferenceSize(asset: CanvasAsset) {
  return asset.sizeBytes ?? mb;
}

export function App() {
  const [assets, setAssets] = useState<CanvasAsset[]>(sampleAssets);
  const [expandedSections, setExpandedSections] = useState<AssetCategory[]>(
    sectionDefinitions.map((section) => section.id)
  );
  const [draggedAsset, setDraggedAsset] = useState<CanvasAsset | null>(null);
  const [prompt, setPrompt] = useState("");
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [previewAsset, setPreviewAsset] = useState<CanvasAsset | null>(null);

  const assetsByCategory = useMemo(() => {
    return sectionDefinitions.reduce<Record<AssetCategory, CanvasAsset[]>>(
      (groups, section) => {
        groups[section.id] = assets.filter((asset) => asset.category === section.id);
        return groups;
      },
      { characters: [], scenes: [], props: [], audio: [], video: [] }
    );
  }, [assets]);

  function toggleSection(category: AssetCategory) {
    setExpandedSections((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category]
    );
  }

  function insertAsset(asset: CanvasAsset) {
    const token = asset.name.trim();

    setPrompt((current) => {
      const normalized = current.trim();
      return normalized ? `${normalized} ${token}` : token;
    });
    setReferences((current) => [
      ...current,
      {
        id: createId(`ref-${asset.id}`),
        name: asset.name,
        kind: asset.kind,
        sizeBytes: getReferenceSize(asset),
        durationSeconds: asset.durationSeconds,
        source: "asset"
      }
    ]);
  }

  function handleAssetAction(asset: CanvasAsset, action: AssetAction) {
    if (action === "preview") {
      setPreviewAsset(asset);
      return;
    }

    if (action === "download") {
      window.open(asset.url, "_blank", "noopener,noreferrer");
      return;
    }

    insertAsset(asset);
  }

  function handleDropAsset(category: AssetCategory) {
    if (!draggedAsset || draggedAsset.kind !== "image" || !imageCategories.includes(category)) {
      return;
    }

    setAssets((current) => current.map((asset) => (asset.id === draggedAsset.id ? { ...asset, category } : asset)));
    setDraggedAsset(null);
  }

  function handleFilesSelected(category: AssetCategory, files: FileList) {
    const fallbackKind = kindFromCategory(category);
    const createdAssets: CanvasAsset[] = Array.from(files).map((file) => {
      const kind = kindFromFile(file, fallbackKind);

      return {
        id: createId("local-asset"),
        name: getDisplayName(file),
        kind,
        category,
        url: URL.createObjectURL(file),
        sizeBytes: file.size
      };
    });

    setAssets((current) => [...current, ...createdAssets]);
  }

  function handleReferenceFilesSelected(files: FileList) {
    const createdReferences: ReferenceItem[] = Array.from(files).map((file) => ({
      id: createId("local-ref"),
      name: getDisplayName(file),
      kind: kindFromFile(file, "image"),
      sizeBytes: file.size,
      source: "local-file"
    }));

    setReferences((current) => [...current, ...createdReferences]);
  }

  return (
    <main className="app-shell">
      <AppHeader />

      <div className="asset-workspace">
        {sectionDefinitions.map((section) => (
          <AssetSection
            key={section.id}
            section={section}
            assets={assetsByCategory[section.id]}
            expanded={expandedSections.includes(section.id)}
            onToggle={toggleSection}
            onAction={handleAssetAction}
            onFilesSelected={handleFilesSelected}
            onDragStart={setDraggedAsset}
            onDropAsset={handleDropAsset}
          />
        ))}
      </div>

      <PromptDock
        prompt={prompt}
        references={references}
        onPromptChange={setPrompt}
        onRemoveReference={(id) => setReferences((current) => current.filter((item) => item.id !== id))}
        onLocalFilesSelected={handleReferenceFilesSelected}
      />

      <PreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />
    </main>
  );
}
