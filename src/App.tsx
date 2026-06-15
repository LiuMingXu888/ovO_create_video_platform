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
  ReferenceItem
} from "./types";

const imageCategories: AssetCategory[] = ["characters", "scenes", "props"];
const mb = 1024 * 1024;

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
    durationSeconds: 5,
    omnireference: true
  });
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [referenceIssues, setReferenceIssues] = useState<ReferenceIssue[]>([]);
  const [previewAsset, setPreviewAsset] = useState<CanvasAsset | null>(null);
  const [canvasUrl, setCanvasUrl] = useState("http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x");
  const [authState, setAuthState] = useState<AuthState>({ status: "unknown" });
  const [project, setProject] = useState<CanvasProject | null>(null);
  const [canvasLoading, setCanvasLoading] = useState(false);
  const [canvasError, setCanvasError] = useState<string | undefined>();
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
    const token = asset.name.trim();
    const reference: ReferenceItem = {
      id: createId(`ref-${asset.id}`),
      name: asset.name,
      kind: asset.kind,
      sizeBytes: getReferenceSize(asset),
      durationSeconds: asset.durationSeconds,
      source: "asset"
    };

    setPrompt((current) => {
      const normalized = current.trim();
      return normalized ? `${normalized} ${token}` : token;
    });
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

    try {
      const result = await companyApiFacade.loadCanvasResources(canvasUrl);
      setProject(result.project);
      setAssets(result.assets);
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

  function renameAsset(assetId: string, name: string) {
    setAssets((current) => current.map((asset) => (asset.id === assetId ? { ...asset, name } : asset)));
    setReferences((current) => current.map((item) => (item.id.includes(assetId) ? { ...item, name } : item)));
  }

  function sortAssetsByName(category: AssetCategory) {
    setAssets((current) => {
      const collator = new Intl.Collator("zh-Hans-CN");
      const sortedIds = current
        .filter((asset) => asset.category === category)
        .slice()
        .sort((left, right) => collator.compare(left.name, right.name))
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
            source: "local-file" as const
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
            onToggle={toggleSection}
            onAction={handleAssetAction}
            onRename={renameAsset}
            onSortByName={sortAssetsByName}
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
