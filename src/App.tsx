import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { AssetSection } from "./components/AssetSection";
import { CanvasControls } from "./components/CanvasControls";
import { PreviewModal } from "./components/PreviewModal";
import { PromptDock } from "./components/PromptDock";
import { buildGenerateVideoPayload } from "./api/generationClient";
import { sampleAssets, sectionDefinitions } from "./data/sampleAssets";
import { downloadAsset } from "./lib/downloadAsset";
import { validateReferenceItems } from "./lib/referenceValidation";
import { companyApiFacade } from "./services/companyApiFacade";
import type {
  AssetAction,
  AssetCategory,
  AssetKind,
  AuthState,
  CanvasAsset,
  CanvasProject,
  GenerationSettings,
  ReferenceItem,
  SortMode
} from "./types";

const imageCategories: AssetCategory[] = ["characters", "scenes", "props"];
const mb = 1024 * 1024;
const defaultSortModes: Record<AssetCategory, SortMode> = {
  characters: "default",
  scenes: "default",
  props: "default",
  audio: "default",
  video: "default"
};

interface ReferenceIssue {
  id: string;
  message: string;
}

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

function createReferenceFromAsset(asset: CanvasAsset): ReferenceItem {
  return {
    id: createId(`ref-${asset.id}`),
    name: asset.name,
    kind: asset.kind,
    sizeBytes: getReferenceSize(asset),
    durationSeconds: asset.durationSeconds,
    source: "asset",
    previewUrl: asset.kind === "image" ? asset.thumbnailUrl ?? asset.url : undefined
  };
}

function cloneReferenceForReuse(item: ReferenceItem): ReferenceItem {
  return {
    ...item,
    id: createId(`reuse-${item.id}`)
  };
}

function getAssetCategoryForUpload(category: AssetCategory, kind: AssetKind): AssetCategory {
  if (kind === "image") {
    return "characters";
  }

  return category;
}

function revokeObjectUrl(url: string | undefined) {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

function createAssetOrder(sourceAssets: CanvasAsset[]): Record<AssetCategory, string[]> {
  return sectionDefinitions.reduce<Record<AssetCategory, string[]>>(
    (order, section) => {
      order[section.id] = sourceAssets.filter((asset) => asset.category === section.id).map((asset) => asset.id);
      return order;
    },
    { characters: [], scenes: [], props: [], audio: [], video: [] }
  );
}

function readMediaDuration(kind: AssetKind, objectUrl: string): Promise<number | undefined> {
  if (kind === "image") {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const media = document.createElement(kind === "audio" ? "audio" : "video");
    let settled = false;
    const timeoutId = window.setTimeout(() => settle(undefined), 5000);

    function settle(duration: number | undefined) {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      media.onloadedmetadata = null;
      media.onerror = null;
      media.removeAttribute("src");
      resolve(duration);
    }

    media.preload = "metadata";
    media.onloadedmetadata = () => {
      settle(Number.isFinite(media.duration) ? media.duration : undefined);
    };
    media.onerror = () => {
      settle(undefined);
    };
    media.src = objectUrl;
  });
}

export function App() {
  const [assets, setAssets] = useState<CanvasAsset[]>(sampleAssets);
  const [expandedSections, setExpandedSections] = useState<AssetCategory[]>(
    sectionDefinitions.map((section) => section.id)
  );
  const [draggedAsset, setDraggedAsset] = useState<CanvasAsset | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>({
    aspectRatio: "9:16",
    durationSeconds: 15,
    omnireference: true
  });
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [referenceIssues, setReferenceIssues] = useState<ReferenceIssue[]>([]);
  const [previewAsset, setPreviewAsset] = useState<CanvasAsset | null>(null);
  const [canvasUrl, setCanvasUrl] = useState("http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x");
  const [authState, setAuthState] = useState<AuthState>({ status: "unknown" });
  const [project, setProject] = useState<CanvasProject | null>(null);
  const [canvasSnapshot, setCanvasSnapshot] = useState<unknown>(null);
  const [sortModes, setSortModes] = useState<Record<AssetCategory, SortMode>>(defaultSortModes);
  const [defaultAssetOrder, setDefaultAssetOrder] = useState<Record<AssetCategory, string[]>>(() =>
    createAssetOrder(sampleAssets)
  );
  const [canvasLoading, setCanvasLoading] = useState(false);
  const [canvasError, setCanvasError] = useState<string | undefined>();
  const [canvasNotice, setCanvasNotice] = useState<string | undefined>();
  const [generateStatus, setGenerateStatus] = useState<string | undefined>();
  const assetObjectUrls = useRef<Set<string>>(new Set());
  const referenceObjectUrls = useRef<Map<string, string>>(new Map());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      assetObjectUrls.current.forEach(revokeObjectUrl);
      referenceObjectUrls.current.forEach(revokeObjectUrl);
      assetObjectUrls.current.clear();
      referenceObjectUrls.current.clear();
    };
  }, []);

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
    const reference = createReferenceFromAsset(asset);

    setReferences((current) => {
      const candidateReferences = [...current, reference];
      const validation = validateReferenceItems(candidateReferences);

      if (validation.valid) {
        setReferenceIssues([]);
        return candidateReferences;
      }

      setReferenceIssues(validation.errors.map((message) => ({ id: createId("reference-error"), message })));
      return current;
    });
  }

  function reuseGeneration(asset: CanvasAsset) {
    if (!asset.generationPrompt || !asset.generationReferences?.length) {
      setGenerateStatus(`「${asset.name}」暂无可复用的生成提示词和引用`);
      return;
    }

    const nextReferences = asset.generationReferences.map(cloneReferenceForReuse);
    const validation = validateReferenceItems(nextReferences);
    setPrompt(asset.generationPrompt);

    if (validation.valid) {
      setReferenceIssues([]);
      setReferences(nextReferences);
      setGenerateStatus(`已复用「${asset.name}」的提示词和引用`);
      return;
    }

    setReferences([]);
    setReferenceIssues(validation.errors.map((message) => ({ id: createId("reference-error"), message })));
    setGenerateStatus(validation.errors.join(" / "));
  }

  function handleAssetAction(asset: CanvasAsset, action: AssetAction) {
    if (action === "preview") {
      setPreviewAsset(asset);
      return;
    }

    if (action === "download") {
      downloadAsset(asset);
      return;
    }

    if (action === "remove-subtitles") {
      setGenerateStatus(`已为「${asset.name}」创建去字幕请求预览，未提交公司接口`);
      return;
    }

    if (action === "reuse-generation") {
      reuseGeneration(asset);
      return;
    }

    insertAsset(asset);
  }

  async function handleCheckAuth() {
    setAuthState({ status: "checking" });
    const nextState = await companyApiFacade.checkAuth();
    setAuthState(nextState);
  }

  async function handleOpenLogin() {
    setAuthState({ status: "checking" });
    const nextState = await companyApiFacade.openLogin();
    setAuthState(nextState);
  }

  async function handleLoadCanvas() {
    setCanvasLoading(true);
    setCanvasError(undefined);
    setCanvasNotice(undefined);

    try {
      const result = await companyApiFacade.loadCanvasResources(canvasUrl);
      setProject(result.project);
      setCanvasSnapshot(result.snapshot);
      setAssets(result.assets);
      setSortModes(defaultSortModes);
      setDefaultAssetOrder(createAssetOrder(result.assets));
      setCanvasNotice(`已加载 ${result.assets.length} 个资源`);
    } catch (error) {
      setCanvasError(error instanceof Error ? error.message : "画布资源加载失败");
    } finally {
      setCanvasLoading(false);
    }
  }

  function handleDropAsset(category: AssetCategory) {
    if (!draggedAsset || draggedAsset.kind !== "image" || !imageCategories.includes(category)) {
      return;
    }

    setAssets((current) => current.map((asset) => (asset.id === draggedAsset.id ? { ...asset, category } : asset)));
    setDraggedAsset(null);
  }

  async function renameAsset(assetId: string, name: string) {
    setAssets((current) => current.map((asset) => (asset.id === assetId ? { ...asset, name } : asset)));
    setReferences((current) => current.map((item) => (item.id.includes(assetId) ? { ...item, name } : item)));

    if (!project || !canvasSnapshot) {
      setCanvasNotice(`已本地改名：${name}`);
      return;
    }

    try {
      const result = await companyApiFacade.renameCanvasAsset({
        projectId: project.projectId,
        snapshot: canvasSnapshot,
        assetId,
        name
      });
      setCanvasSnapshot(result.snapshot);
      setCanvasNotice(`已同步名称：${name}`);
    } catch (error) {
      setCanvasError(error instanceof Error ? error.message : "名称同步失败");
    }
  }

  function changeAssetCategory(assetId: string, category: AssetCategory) {
    setAssets((current) => current.map((asset) => (asset.id === assetId && asset.kind === "image" ? { ...asset, category } : asset)));
    setDefaultAssetOrder((current) => {
      const nextOrder = sectionDefinitions.reduce<Record<AssetCategory, string[]>>(
        (order, section) => {
          order[section.id] = current[section.id].filter((id) => id !== assetId);
          return order;
        },
        { characters: [], scenes: [], props: [], audio: [], video: [] }
      );

      nextOrder[category] = [...nextOrder[category], assetId];
      return nextOrder;
    });
  }

  function cycleSort(category: AssetCategory) {
    const currentMode = sortModes[category];
    const nextMode: SortMode = currentMode === "default" ? "asc" : currentMode === "asc" ? "desc" : "default";
    if (currentMode === "default" && nextMode === "asc") {
      setDefaultAssetOrder((current) => ({
        ...current,
        [category]: assets.filter((asset) => asset.category === category).map((asset) => asset.id)
      }));
    }
    setSortModes((current) => ({ ...current, [category]: nextMode }));

    setAssets((current) => {
      if (nextMode === "default") {
        const defaultOrder = defaultAssetOrder[category];
        return current
          .slice()
          .sort((left, right) => {
            if (left.category !== category || right.category !== category) {
              return 0;
            }

            return defaultOrder.indexOf(left.id) - defaultOrder.indexOf(right.id);
          });
      }

      const collator = new Intl.Collator("zh-Hans-CN");
      const sortedIds = current
        .filter((asset) => asset.category === category)
        .slice()
        .sort((left, right) =>
          nextMode === "asc" ? collator.compare(left.name, right.name) : collator.compare(right.name, left.name)
        )
        .map((asset) => asset.id);
      let index = 0;

      return current.map((asset) => {
        if (asset.category !== category) {
          return asset;
        }

        const nextAsset = current.find((candidate) => candidate.id === sortedIds[index]);
        index += 1;
        return nextAsset ?? asset;
      });
    });
  }

  function dropOnAsset(targetAsset: CanvasAsset) {
    if (!draggedAsset || draggedAsset.id === targetAsset.id) {
      return;
    }

    if (draggedAsset.kind === "image" && draggedAsset.category !== targetAsset.category && imageCategories.includes(targetAsset.category)) {
      setAssets((current) => current.map((asset) => (asset.id === draggedAsset.id ? { ...asset, category: targetAsset.category } : asset)));
      setDraggedAsset(null);
      return;
    }

    if (draggedAsset.category !== targetAsset.category) {
      setDraggedAsset(null);
      return;
    }

    setAssets((current) => {
      const withoutDragged = current.filter((asset) => asset.id !== draggedAsset.id);
      const targetIndex = withoutDragged.findIndex((asset) => asset.id === targetAsset.id);

      if (targetIndex < 0) {
        return current;
      }

      return [
        ...withoutDragged.slice(0, targetIndex + 1),
        draggedAsset,
        ...withoutDragged.slice(targetIndex + 1)
      ];
    });
    setDraggedAsset(null);
  }

  function handleFilesSelected(category: AssetCategory, files: FileList) {
    const fallbackKind = kindFromCategory(category);
    const createdAssets: CanvasAsset[] = Array.from(files).map((file) => {
      const kind = kindFromFile(file, fallbackKind);
      const url = URL.createObjectURL(file);
      assetObjectUrls.current.add(url);

      return {
        id: createId("local-asset"),
        name: getDisplayName(file),
        kind,
        category: getAssetCategoryForUpload(category, kind),
        url,
        sizeBytes: file.size
      };
    });

    setAssets((current) => [...current, ...createdAssets]);
    setDefaultAssetOrder((current) => {
      const nextOrder = { ...current };
      for (const asset of createdAssets) {
        nextOrder[asset.category] = [...nextOrder[asset.category], asset.id];
      }
      return nextOrder;
    });
  }

  async function handleReferenceFilesSelected(files: FileList) {
    const createdReferences = await Promise.all(
      Array.from(files).map(async (file) => {
        const id = createId("local-ref");
        const name = getDisplayName(file);
        const kind = kindFromFile(file, "image");
        const objectUrl = URL.createObjectURL(file);
        referenceObjectUrls.current.set(id, objectUrl);
        const durationSeconds = await readMediaDuration(kind, objectUrl);
        const issue =
          kind !== "image" && durationSeconds === undefined
            ? {
                id,
                message: `无法读取「${name}」的媒体时长`
              }
            : undefined;

        return {
          item: {
            id,
            name,
            kind,
            sizeBytes: file.size,
            durationSeconds,
            mimeType: file.type,
            fileName: file.name,
            source: "local-file" as const,
            previewUrl: kind === "image" ? objectUrl : undefined
          },
          issue
        };
      })
    );

    if (!mounted.current) {
      return;
    }

    const newItems = createdReferences.map(({ item }) => item);
    const issues = createdReferences.flatMap(({ issue }) => (issue ? [issue] : []));

    setReferences((current) => {
      const candidateReferences = [...current, ...newItems];
      const validation = validateReferenceItems(candidateReferences);

      if (validation.valid && issues.length === 0) {
        setReferenceIssues((currentIssues) => currentIssues.filter((issue) => !newItems.some((item) => item.id === issue.id)));
        return candidateReferences;
      }

      newItems.forEach((item) => {
        revokeObjectUrl(referenceObjectUrls.current.get(item.id));
        referenceObjectUrls.current.delete(item.id);
      });
      setReferenceIssues((currentIssues) => [
        ...currentIssues,
        ...issues,
        ...validation.errors.map((message) => ({ id: createId("reference-error"), message }))
      ]);
      return current;
    });
  }

  function removeReference(id: string) {
    revokeObjectUrl(referenceObjectUrls.current.get(id));
    referenceObjectUrls.current.delete(id);
    setReferences((current) => current.filter((item) => item.id !== id));
    setReferenceIssues((current) => current.filter((item) => item.id !== id));
  }

  function handleGeneratePreview() {
    const validation = validateReferenceItems(references);
    if (!prompt.trim()) {
      setGenerateStatus("请输入提示词");
      return;
    }

    if (!validation.valid) {
      setGenerateStatus(validation.errors.join(" / "));
      return;
    }

    buildGenerateVideoPayload({ prompt, references, settings: generationSettings });
    const generatedAsset: CanvasAsset = {
      id: createId("generated-video"),
      name: `生成视频 ${assets.filter((asset) => asset.id.startsWith("generated-video")).length + 1}`,
      kind: "video",
      category: "video",
      url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      thumbnailUrl: "https://images.unsplash.com/photo-1496062031456-07b8f162a322?auto=format&fit=crop&w=300&q=80",
      durationSeconds: generationSettings.durationSeconds,
      sizeBytes: 6_000_000,
      generationPrompt: prompt,
      generationReferences: references.map(cloneReferenceForReuse)
    };
    setAssets((current) => [...current, generatedAsset]);
    setDefaultAssetOrder((current) => ({
      ...current,
      video: [...current.video, generatedAsset.id]
    }));
    setGenerateStatus(
      `已生成 ${generationSettings.aspectRatio} · ${generationSettings.durationSeconds}s · ${
        generationSettings.omnireference ? "全能参考" : "标准参考"
      } 请求预览，未提交公司接口`
    );
  }

  return (
    <main className="app-shell">
      <AppHeader authState={authState} project={project} />

      <CanvasControls
        canvasUrl={canvasUrl}
        authState={authState}
        loading={canvasLoading}
        errorMessage={canvasError}
        notice={canvasNotice}
        onCanvasUrlChange={setCanvasUrl}
        onOpenLogin={handleOpenLogin}
        onCheckAuth={handleCheckAuth}
        onLoadCanvas={handleLoadCanvas}
      />

      <div className="asset-workspace">
        {sectionDefinitions.map((section) => (
          <AssetSection
            key={section.id}
            section={section}
            assets={assetsByCategory[section.id]}
            expanded={expandedSections.includes(section.id)}
            sortMode={sortModes[section.id]}
            onToggle={toggleSection}
            onAction={handleAssetAction}
            onRename={renameAsset}
            onChangeCategory={changeAssetCategory}
            onCycleSort={cycleSort}
            onFilesSelected={handleFilesSelected}
            onDragStart={setDraggedAsset}
            onDropAsset={handleDropAsset}
            onDropOnAsset={dropOnAsset}
          />
        ))}
      </div>

      <PromptDock
        prompt={prompt}
        references={references}
        validationErrors={referenceIssues.map((issue) => issue.message)}
        onPromptChange={setPrompt}
        onRemoveReference={removeReference}
        onLocalFilesSelected={handleReferenceFilesSelected}
        onGenerate={handleGeneratePreview}
        generateStatus={generateStatus}
        generationSettings={generationSettings}
        onGenerationSettingsChange={setGenerationSettings}
      />

      <PreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />
    </main>
  );
}
