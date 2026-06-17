import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { AssetSection } from "./components/AssetSection";
import { CanvasControls } from "./components/CanvasControls";
import { PreviewModal } from "./components/PreviewModal";
import { PromptDock } from "./components/PromptDock";
import { sampleAssets, sectionDefinitions } from "./data/sampleAssets";
import {
  applyCanvasAssetLayout,
  createCanvasAssetLayout,
  loadCanvasHistory,
  type CanvasHistoryEntry,
  renameCanvasHistoryEntry,
  saveCanvasHistory,
  updateCanvasHistoryLayout,
  upsertCanvasHistoryEntry
} from "./lib/canvasHistory";
import { downloadAsset, downloadAssets } from "./lib/downloadAsset";
import { normalizeSnapshotAssets } from "./lib/assetNormalizer";
import { getCategoryForAssetName } from "./lib/assetCategory";
import { replaceAssetCategoryPrefix } from "./lib/assetNamePrefix";
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
  video: "generated-desc"
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
    url: asset.url,
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
    return category;
  }

  return category;
}

function getPrefixedAssetNameForCategory(name: string, kind: AssetKind, category: AssetCategory) {
  if ((kind === "image" && imageCategories.includes(category)) || kind === "audio") {
    return replaceAssetCategoryPrefix(name, category);
  }

  return name;
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

function getCanvasUrlFromProject(project?: CanvasProject | null) {
  return project?.canvasUrl ?? "";
}

function getGeneratedTime(asset: CanvasAsset, defaultIndex: number) {
  const timestamp = asset.createdAt ? Date.parse(asset.createdAt) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : defaultIndex;
}

function sortCategoryAssets(assets: CanvasAsset[], category: AssetCategory, mode: SortMode, defaultOrder: string[]) {
  if (mode === "default") {
    const defaultRank = new Map(defaultOrder.map((assetId, index) => [assetId, index]));
    return assets
      .slice()
      .sort((left, right) => (defaultRank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (defaultRank.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  }

  const collator = new Intl.Collator("zh-Hans-CN");
  return assets.slice().sort((left, right) => {
    if (mode === "name-asc") {
      return collator.compare(left.name, right.name);
    }

    if (mode === "name-desc") {
      return collator.compare(right.name, left.name);
    }

    const leftDefaultIndex = defaultOrder.includes(left.id) ? defaultOrder.indexOf(left.id) : assets.indexOf(left);
    const rightDefaultIndex = defaultOrder.includes(right.id) ? defaultOrder.indexOf(right.id) : assets.indexOf(right);
    const leftTime = getGeneratedTime(left, leftDefaultIndex);
    const rightTime = getGeneratedTime(right, rightDefaultIndex);
    return mode === "generated-asc" ? leftTime - rightTime : rightTime - leftTime;
  });
}

function isSharedCanvasUrl(value: string) {
  try {
    const url = new URL(value);
    return url.pathname.split("/").filter(Boolean)[0] === "share";
  } catch {
    return false;
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
    durationSeconds: 15,
    omnireference: true
  });
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [referenceIssues, setReferenceIssues] = useState<ReferenceIssue[]>([]);
  const [previewAsset, setPreviewAsset] = useState<CanvasAsset | null>(null);
  const [canvasUrl, setCanvasUrl] = useState("http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x");
  const [canvasName, setCanvasName] = useState("未命名画布");
  const [canvasHistory, setCanvasHistory] = useState(() => loadCanvasHistory());
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
  const [playingAssetId, setPlayingAssetId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(() => new Set());
  const assetObjectUrls = useRef<Set<string>>(new Set());
  const referenceObjectUrls = useRef<Map<string, string>>(new Map());
  const mediaElements = useRef<Map<string, HTMLMediaElement>>(new Map());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      assetObjectUrls.current.forEach(revokeObjectUrl);
      referenceObjectUrls.current.forEach(revokeObjectUrl);
      mediaElements.current.forEach((element) => element.pause());
      assetObjectUrls.current.clear();
      referenceObjectUrls.current.clear();
      mediaElements.current.clear();
    };
  }, []);

  useEffect(() => {
    saveCanvasHistory(canvasHistory);
  }, [canvasHistory]);

  const assetsByCategory = useMemo(() => {
    return sectionDefinitions.reduce<Record<AssetCategory, CanvasAsset[]>>(
      (groups, section) => {
        const categoryAssets = assets.filter((asset) => asset.category === section.id);
        groups[section.id] = sortCategoryAssets(categoryAssets, section.id, sortModes[section.id], defaultAssetOrder[section.id]);
        return groups;
      },
      { characters: [], scenes: [], props: [], audio: [], video: [] }
    );
  }, [assets, defaultAssetOrder, sortModes]);

  const previewAssets = useMemo(
    () =>
      sectionDefinitions.flatMap((section) =>
        assetsByCategory[section.id].filter((asset) => asset.status !== "generating" && asset.status !== "failed")
      ),
    [assetsByCategory]
  );
  const previewIndex = previewAsset ? previewAssets.findIndex((asset) => asset.id === previewAsset.id) : -1;

  function toggleSection(category: AssetCategory) {
    setExpandedSections((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category]
    );
  }

  function persistCanvasHistoryEntry(nextUrl = canvasUrl, nextName = canvasName, nextProject = project, nextAssets = assets) {
    setCanvasHistory((current) => {
      const nextEntries = upsertCanvasHistoryEntry(current, {
        url: nextUrl,
        project: nextProject,
        name: nextName,
        layout: createCanvasAssetLayout(nextAssets)
      });
      return nextEntries;
    });
  }

  function handleCanvasUrlChange(value: string) {
    setCanvasUrl(value);
    const historyEntry = canvasHistory.find((entry) => entry.url === value);
    if (historyEntry) {
      setCanvasName(historyEntry.name);
    }
  }

  function handleSaveCanvasName() {
    const nextName = canvasName.trim() || "未命名画布";
    setCanvasName(nextName);
    setCanvasHistory((current) => {
      const currentUrl = getCanvasUrlFromProject(project) || canvasUrl;
      const renamedEntries = current.some((entry) => entry.url === currentUrl)
        ? renameCanvasHistoryEntry(current, currentUrl, nextName)
        : current;
      return upsertCanvasHistoryEntry(renamedEntries, {
        url: currentUrl,
        project,
        name: nextName,
        layout: createCanvasAssetLayout(assets)
      });
    });
    setCanvasNotice(`已保存画布名称：${nextName}`);
  }

  function selectCanvasHistory(entry: CanvasHistoryEntry) {
    setCanvasUrl(entry.url);
    setCanvasName(entry.name);
    setProject((current) =>
      current && (current.canvasUrl === entry.url || current.projectId === entry.projectId)
        ? { ...current, title: entry.name }
        : current
    );
  }

  function deleteCanvasHistory(entry: CanvasHistoryEntry) {
    const confirmed = window.confirm(`确定要删除历史画布「${entry.name}」吗？`);
    if (!confirmed) {
      return;
    }

    setCanvasHistory((current) => current.filter((item) => item !== entry));
    if (entry.url === canvasUrl || (project?.projectId && entry.projectId === project.projectId)) {
      setCanvasNotice(`已删除历史画布：${entry.name}`);
    }
  }

  const displayProject = project ? { ...project, title: canvasName || project.title } : project;

  function createNewCanvasSession() {
    setCanvasUrl("");
    setCanvasName("未命名画布");
    setProject(null);
    setCanvasSnapshot(null);
    setCanvasError(undefined);
    setCanvasNotice(undefined);
  }

  async function createCompanyCanvasSession() {
    setCanvasLoading(true);
    setCanvasError(undefined);
    setCanvasNotice(undefined);

    try {
      const nextProject = await companyApiFacade.createCompanyCanvas();
      setCanvasUrl(nextProject.canvasUrl);
      setCanvasName(nextProject.title ?? "未命名画布");
      setProject(nextProject);
      setCanvasSnapshot(null);
      setAssets([]);
      setDefaultAssetOrder(createAssetOrder([]));
      setCanvasHistory((current) =>
        upsertCanvasHistoryEntry(current, {
          url: nextProject.canvasUrl,
          project: nextProject,
          name: nextProject.title ?? "未命名画布",
          layout: createCanvasAssetLayout([])
        })
      );
      setCanvasNotice("已新建公司画布");
      await loadCanvasFromUrl(nextProject.canvasUrl);
    } catch (error) {
      try {
        const result = await companyApiFacade.inspectCanvas("http://qijing.kjjhz.cn/projects");
        setCanvasNotice(`已打开公司新建流程并捕获 ${result.summaries?.length ?? 0} 个请求，请在内置浏览器完成新建后复制画布地址`);
      } catch {
        setCanvasError(error instanceof Error ? error.message : "新建公司画布失败");
      }
    } finally {
      setCanvasLoading(false);
    }
  }

  async function handleLogout() {
    setAuthState({ status: "checking" });
    const nextState = await companyApiFacade.logout();
    setAuthState(nextState);
    setProject(null);
    setCanvasSnapshot(null);
    setAssets(sampleAssets);
    setDefaultAssetOrder(createAssetOrder(sampleAssets));
    setPrompt("");
    setReferences([]);
    setReferenceIssues([]);
    setCanvasNotice("已退出登录");
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

  function createGeneratedVideoPlaceholder() {
    const placeholderId = createId("generated-video");
    return {
      id: placeholderId,
      name: `生成视频 ${assets.filter((asset) => asset.id.startsWith("generated-video")).length + 1}`,
      kind: "video" as const,
      category: "video" as const,
      url: "",
      thumbnailUrl: undefined,
      durationSeconds: generationSettings.durationSeconds,
      sizeBytes: 0,
      createdAt: new Date().toISOString(),
      status: "generating" as const,
      statusLabel: "生成中",
      generationPrompt: prompt,
      generationReferences: references.map(cloneReferenceForReuse)
    };
  }

  function createSubtitlePlaceholder(asset: CanvasAsset): CanvasAsset {
    return {
      id: createId("subtitle-video"),
      name: `去字幕-${asset.name}`,
      kind: "video",
      category: "video",
      url: "",
      thumbnailUrl: asset.thumbnailUrl,
      durationSeconds: asset.durationSeconds,
      sizeBytes: 0,
      createdAt: new Date().toISOString(),
      status: "generating",
      statusLabel: "去字幕中",
      generationPrompt: asset.generationPrompt,
      generationReferences: asset.generationReferences
    };
  }

  async function handleRemoveSubtitles(asset: CanvasAsset) {
    if (asset.kind !== "video") {
      return;
    }

    if (!project || !canvasSnapshot) {
      setGenerateStatus(`请先加载公司画布后再去字幕：${asset.name}`);
      return;
    }

    const placeholder = createSubtitlePlaceholder(asset);
    const assetsWithPlaceholder = [...assets, placeholder];
    setAssets(assetsWithPlaceholder);
    setDefaultAssetOrder((current) => ({
      ...current,
      video: [...current.video, placeholder.id]
    }));
    persistCanvasHistoryEntry(getCanvasUrlFromProject(project) || canvasUrl, canvasName, project, assetsWithPlaceholder);
    setGenerateStatus(`去字幕中：${placeholder.name}`);

    try {
      const result = await companyApiFacade.removeSubtitles({
        projectId: project.projectId,
        sourceAsset: asset,
        placeholderAsset: placeholder
      });

      if (!mounted.current) {
        return;
      }

      const completedAssets = assetsWithPlaceholder.map((item) => (item.id === placeholder.id ? result.asset : item));
      setCanvasSnapshot(result.snapshot);
      setAssets(completedAssets);
      persistCanvasHistoryEntry(getCanvasUrlFromProject(project) || canvasUrl, canvasName, project, completedAssets);
      setGenerateStatus(`已完成去字幕：${placeholder.name}`);
    } catch (error) {
      if (!mounted.current) {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : "去字幕失败";
      setAssets((current) =>
        current.map((item) =>
          item.id === placeholder.id
            ? {
                ...item,
                status: "failed" as const,
                errorMessage
              }
            : item
        )
      );
      setGenerateStatus(errorMessage);
    }
  }

  function handleAssetAction(asset: CanvasAsset, action: AssetAction) {
    if (action === "preview") {
      setPreviewAsset(asset);
      return;
    }

    if (action === "toggle-play") {
      void togglePlayback(asset);
      return;
    }

    if (action === "download") {
      downloadAsset(asset);
      return;
    }

    if (action === "remove-subtitles") {
      void handleRemoveSubtitles(asset);
      return;
    }

    if (action === "delete") {
      void handleDeleteAsset(asset);
      return;
    }

    if (action === "reuse-generation") {
      reuseGeneration(asset);
      return;
    }

    insertAsset(asset);
  }

  function toggleSelectionMode() {
    setSelectionMode(true);
  }

  function cancelSelectionMode() {
    setSelectionMode(false);
    setSelectedAssetIds(new Set());
  }

  function changeAssetSelection(assetId: string, selected: boolean) {
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(assetId);
      } else {
        next.delete(assetId);
      }
      return next;
    });
  }

  async function handleDownloadSelected() {
    const selectedAssets = assets.filter((asset) => selectedAssetIds.has(asset.id));
    if (selectedAssets.length === 0) {
      return;
    }

    try {
      await downloadAssets(selectedAssets);
      setCanvasNotice(`已下载 ${selectedAssets.length} 个资源`);
    } catch (error) {
      setCanvasError(error instanceof Error ? error.message : "批量下载失败");
    }
  }

  async function handleDeleteAsset(asset: CanvasAsset) {
    const confirmed = window.confirm(`确定要删除「${asset.name}」吗？`);
    if (!confirmed) {
      return;
    }

    if (!project || !canvasSnapshot) {
      setAssets((current) => {
        const nextAssets = current.filter((item) => item.id !== asset.id);
        persistCanvasHistoryEntry(canvasUrl, canvasName, project, nextAssets);
        return nextAssets;
      });
      setDefaultAssetOrder((current) => {
        const nextOrder = sectionDefinitions.reduce<Record<AssetCategory, string[]>>(
          (order, section) => {
            order[section.id] = current[section.id].filter((id) => id !== asset.id);
            return order;
          },
          { characters: [], scenes: [], props: [], audio: [], video: [] }
        );

        return nextOrder;
      });
      return;
    }

    try {
      const result = await companyApiFacade.deleteCanvasAsset({
        projectId: project.projectId,
        snapshot: canvasSnapshot,
        assetId: asset.id
      });
      setCanvasSnapshot(result.snapshot);
      setAssets((current) => {
        const nextAssets = current.filter((item) => item.id !== asset.id);
        persistCanvasHistoryEntry(getCanvasUrlFromProject(project) || canvasUrl, canvasName, project, nextAssets);
        return nextAssets;
      });
      setDefaultAssetOrder((current) => {
        const nextOrder = sectionDefinitions.reduce<Record<AssetCategory, string[]>>(
          (order, section) => {
            order[section.id] = current[section.id].filter((id) => id !== asset.id);
            return order;
          },
          { characters: [], scenes: [], props: [], audio: [], video: [] }
        );

        return nextOrder;
      });
      setCanvasNotice(`已删除「${asset.name}」`);
    } catch (error) {
      setCanvasError(error instanceof Error ? error.message : "删除同步失败");
    }
  }

  async function togglePlayback(asset: CanvasAsset) {
    if (asset.kind === "image") {
      return;
    }

    const targetElement = mediaElements.current.get(asset.id);
    if (!targetElement) {
      return;
    }

    if (playingAssetId === asset.id) {
      targetElement.pause();
      setPlayingAssetId(null);
      return;
    }

    targetElement.muted = false;
    targetElement.volume = 1;

    mediaElements.current.forEach((element, assetId) => {
      if (assetId !== asset.id) {
        element.pause();
      }
    });

    setPlayingAssetId(asset.id);

    try {
      await targetElement.play();
    } catch (error) {
      setPlayingAssetId((current) => (current === asset.id ? null : current));
      setCanvasError(error instanceof Error ? error.message : "媒体播放失败");
    }
  }

  function registerMediaElement(assetId: string, element: HTMLMediaElement | null) {
    if (!element) {
      mediaElements.current.delete(assetId);
      return;
    }

    mediaElements.current.set(assetId, element);
  }

  function handleMediaEnded(assetId: string) {
    const element = mediaElements.current.get(assetId);
    if (element) {
      element.currentTime = 0;
      element.pause();
    }
    setPlayingAssetId((current) => (current === assetId ? null : current));
  }

  async function handleCheckAuth() {
    setAuthState({ status: "checking" });
    await refreshAuthState();
  }

  async function handleOpenLogin(targetUrl?: string) {
    setAuthState({ status: "checking" });
    const nextState = await companyApiFacade.openLogin(targetUrl);
    setAuthState(nextState);
    await refreshAuthState();
  }

  async function refreshAuthState() {
    const nextState = await companyApiFacade.checkAuth();
    if (mounted.current && nextState) {
      setAuthState(nextState);
    }
    return nextState;
  }

  async function handleLoadCanvas() {
    await loadCanvasFromUrl(canvasUrl);
  }

  async function loadCanvasFromUrl(targetCanvasUrl: string) {
    setCanvasLoading(true);
    setCanvasError(undefined);
    setCanvasNotice(undefined);

    try {
      if (isSharedCanvasUrl(targetCanvasUrl)) {
        await handleOpenLogin(targetCanvasUrl);
        setCanvasNotice("分享链接已打开，请在窗口里点击查看，再复制进入后的画布地址重新加载");
        return;
      }

      const result = await companyApiFacade.loadCanvasResources(targetCanvasUrl);
      const historyEntry = canvasHistory.find((entry) => entry.url === result.project.canvasUrl || entry.projectId === result.project.projectId);
      const nextAssets = applyCanvasAssetLayout(result.assets, historyEntry?.layout);
      const nextCanvasName = historyEntry?.name ?? result.project.title ?? "未命名画布";
      setProject(result.project);
      setCanvasSnapshot(result.snapshot);
      setAssets(nextAssets);
      setCanvasName(nextCanvasName);
      setSortModes(defaultSortModes);
      setDefaultAssetOrder(createAssetOrder(nextAssets));
      setCanvasHistory((current) =>
        upsertCanvasHistoryEntry(current, {
          url: result.project.canvasUrl,
          project: result.project,
          name: nextCanvasName,
          layout: createCanvasAssetLayout(nextAssets)
        })
      );
      setCanvasNotice(`已加载 ${result.assets.length} 个资源`);
    } catch (error) {
      setCanvasError(error instanceof Error ? error.message : "画布资源加载失败");
    } finally {
      setCanvasLoading(false);
    }
  }

  async function handleInspectCanvas() {
    setCanvasLoading(true);
    setCanvasError(undefined);
    setCanvasNotice(undefined);

    try {
      const result = await companyApiFacade.inspectCanvas(canvasUrl);
      setCanvasNotice(`接口诊断已捕获 ${result.summaries?.length ?? 0} 个请求`);
    } catch (error) {
      setCanvasError(error instanceof Error ? error.message : "接口诊断失败");
    } finally {
      setCanvasLoading(false);
    }
  }

  function handleDropAsset(category: AssetCategory) {
    if (!draggedAsset || draggedAsset.kind !== "image" || !imageCategories.includes(category)) {
      return;
    }

    if (draggedAsset.category !== category) {
      void changeAssetCategory(draggedAsset.id, category);
    }
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

  async function changeAssetCategory(assetId: string, category: AssetCategory) {
    const targetAsset = assets.find((asset) => asset.id === assetId);
    if (!targetAsset || targetAsset.kind !== "image") {
      return;
    }

    const nextName = replaceAssetCategoryPrefix(targetAsset.name, category);
    const nextAsset = { ...targetAsset, name: nextName, category };
    const nextAssets = assets.map((asset) => (asset.id === assetId ? nextAsset : asset));
    setAssets(nextAssets);
    setReferences((current) => current.map((item) => (item.id.includes(assetId) ? { ...item, name: nextName } : item)));
    setCanvasHistory((history) =>
      updateCanvasHistoryLayout(history, {
        url: getCanvasUrlFromProject(project) || canvasUrl,
        project,
        assets: nextAssets,
        fallbackName: canvasName
      })
    );
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

    if (!project || !canvasSnapshot) {
      return;
    }

    try {
      const result = await companyApiFacade.renameCanvasAsset({
        projectId: project.projectId,
        snapshot: canvasSnapshot,
        assetId,
        name: nextName
      });
      setCanvasSnapshot(result.snapshot);
      setCanvasNotice(`已同步分类：${nextName}`);
    } catch (error) {
      setCanvasError(error instanceof Error ? error.message : "分类同步失败");
    }
  }

  function changeSortMode(category: AssetCategory, mode: SortMode) {
    setSortModes((current) => ({ ...current, [category]: mode }));
  }

  function dropOnAsset(targetAsset: CanvasAsset) {
    if (!draggedAsset || draggedAsset.id === targetAsset.id) {
      return;
    }

    if (draggedAsset.kind === "image" && draggedAsset.category !== targetAsset.category && imageCategories.includes(targetAsset.category)) {
      void changeAssetCategory(draggedAsset.id, targetAsset.category);
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

      const nextAssets = [
        ...withoutDragged.slice(0, targetIndex + 1),
        draggedAsset,
        ...withoutDragged.slice(targetIndex + 1)
      ];
      setDefaultAssetOrder(createAssetOrder(nextAssets));
      setCanvasHistory((history) =>
        updateCanvasHistoryLayout(history, {
          url: getCanvasUrlFromProject(project) || canvasUrl,
          project,
          assets: nextAssets,
          fallbackName: canvasName
        })
      );
      return nextAssets;
    });
    setDraggedAsset(null);
  }

  async function handleFilesSelected(category: AssetCategory, files: FileList) {
    const fallbackKind = kindFromCategory(category);
    const uploadInputs = Array.from(files).map((file) => ({
      file,
      kind: kindFromFile(file, fallbackKind),
      name: getDisplayName(file)
    }));

    if (project && canvasSnapshot) {
      setCanvasError(undefined);
      setCanvasNotice(`正在上传 ${uploadInputs.length} 个资源`);

      try {
        const uploadedAssets: CanvasAsset[] = [];
        let nextSnapshot: unknown = canvasSnapshot;

        for (const input of uploadInputs) {
          const assetCategory = input.kind === "image" ? getCategoryForAssetName(input.kind, input.name, category) : category;
          const uploadCategory = getAssetCategoryForUpload(assetCategory, input.kind);
          const uploadName = getPrefixedAssetNameForCategory(input.name, input.kind, uploadCategory);
          const result = await companyApiFacade.uploadCanvasAsset({
            projectId: project.projectId,
            snapshot: nextSnapshot,
            file: input.file,
            name: uploadName,
            kind: input.kind,
            category: uploadCategory
          });

          nextSnapshot = result.snapshot;
          uploadedAssets.push(result.asset);
        }

        if (!mounted.current) {
          return;
        }

        const normalizedAssets = normalizeSnapshotAssets(nextSnapshot);
        setCanvasSnapshot(nextSnapshot);
        setAssets(normalizedAssets);
        setDefaultAssetOrder(createAssetOrder(normalizedAssets));
        persistCanvasHistoryEntry(getCanvasUrlFromProject(project) || canvasUrl, canvasName, project, normalizedAssets);
        setCanvasNotice(`已同步上传 ${uploadedAssets.length} 个资源`);
      } catch (error) {
        if (!mounted.current) {
          return;
        }

        setCanvasError(error instanceof Error ? error.message : "资源上传同步失败");
      }

      return;
    }

    const createdAssets: CanvasAsset[] = uploadInputs.map(({ file, kind, name }) => {
      const assetCategory = kind === "image" ? getCategoryForAssetName(kind, name) : category;
      const uploadCategory = getAssetCategoryForUpload(assetCategory, kind);
      const url = URL.createObjectURL(file);
      assetObjectUrls.current.add(url);

      return {
        id: createId("local-asset"),
        name: getPrefixedAssetNameForCategory(name, kind, uploadCategory),
        kind,
        category: uploadCategory,
        url,
        sizeBytes: file.size,
        createdAt: new Date().toISOString(),
        status: "ready"
      };
    });

    setAssets((current) => {
      const nextAssets = [...current, ...createdAssets];
      persistCanvasHistoryEntry(canvasUrl, canvasName, project, nextAssets);
      return nextAssets;
    });
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
            url: objectUrl,
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

  async function handleGeneratePreview() {
    await refreshAuthState();
    const validation = validateReferenceItems(references);
    const promptText = prompt.trim();
    if (!promptText.trim()) {
      setGenerateStatus("请输入提示词");
      return;
    }

    if (!validation.valid) {
      setGenerateStatus(validation.errors.join(" / "));
      return;
    }

    if (project && references.every((reference) => reference.kind !== "image")) {
      setGenerateStatus("真实生成至少需要 1 张参考图，请先添加图片参考素材");
      return;
    }

    const submittedReferences = references;
    const savedReferences = references.map(cloneReferenceForReuse);
    const generatedAsset: CanvasAsset = project
      ? createGeneratedVideoPlaceholder()
      : {
          ...createGeneratedVideoPlaceholder(),
          url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
          thumbnailUrl: "https://images.unsplash.com/photo-1496062031456-07b8f162a322?auto=format&fit=crop&w=300&q=80",
          sizeBytes: 6_000_000,
          status: "ready"
        };
    const assetsWithPlaceholder = [...assets, generatedAsset];

    setAssets(assetsWithPlaceholder);
    persistCanvasHistoryEntry(canvasUrl, canvasName, project, assetsWithPlaceholder);
    setDefaultAssetOrder((current) => ({
      ...current,
      video: [...current.video, generatedAsset.id]
    }));
    setPrompt("");
    setReferences([]);
    setReferenceIssues([]);

    if (project) {
      setGenerateStatus(`正在生成真实视频：${generatedAsset.name}`);

      try {
        const result = await companyApiFacade.generateVideo({
          projectId: project.projectId,
          prompt: promptText,
          references: submittedReferences,
          settings: generationSettings
        });

        if (!mounted.current) {
          return;
        }

        const savedResult = await companyApiFacade.saveCanvasAsset({
          projectId: project.projectId,
          snapshot: canvasSnapshot,
          id: generatedAsset.id,
          name: generatedAsset.name,
          kind: "video",
          category: "video",
          url: result.videoUrl,
          providerVideoUrl: result.providerVideoUrl,
          durationSeconds: generatedAsset.durationSeconds,
          generationPrompt: promptText,
          generationReferences: savedReferences
        });

        const completedAsset = {
          ...generatedAsset,
          ...savedResult.asset,
          url: savedResult.asset.url,
          status: "ready" as const
        };
        const completedAssets = assetsWithPlaceholder.map((asset) =>
          asset.id === generatedAsset.id ? completedAsset : asset
        );
        setCanvasSnapshot(savedResult.snapshot);
        setAssets(completedAssets);
        persistCanvasHistoryEntry(getCanvasUrlFromProject(project) || canvasUrl, canvasName, project, completedAssets);
        setGenerateStatus(`已生成真实视频：${generatedAsset.name}`);
        await refreshAuthState();
      } catch (error) {
        if (!mounted.current) {
          return;
        }

        const errorMessage = error instanceof Error ? error.message : "视频生成失败";
        setAssets((current) =>
          current.map((asset) =>
            asset.id === generatedAsset.id
              ? {
                  ...asset,
                  status: "failed" as const,
                  errorMessage
                }
              : asset
          )
        );
        setGenerateStatus(errorMessage);
        await refreshAuthState();
      }

      return;
    }

    setGenerateStatus(
      `已生成 ${generationSettings.aspectRatio} · ${generationSettings.durationSeconds}s · ${
        generationSettings.omnireference ? "全能参考" : "标准参考"
      } 请求预览，未提交公司接口`
    );
    await refreshAuthState();
  }

  return (
    <main className="app-shell">
      <AppHeader
        authState={authState}
        project={displayProject}
        selectionMode={selectionMode}
        selectedCount={selectedAssetIds.size}
        onToggleSelectionMode={toggleSelectionMode}
        onCancelSelectionMode={cancelSelectionMode}
        onDownloadSelected={handleDownloadSelected}
        onLogout={handleLogout}
      />

      <CanvasControls
        canvasUrl={canvasUrl}
        canvasName={canvasName}
        canvasHistory={canvasHistory}
        authState={authState}
        loading={canvasLoading}
        errorMessage={canvasError}
        notice={canvasNotice}
        onCanvasUrlChange={handleCanvasUrlChange}
        onCanvasNameChange={setCanvasName}
        onSaveCanvasName={handleSaveCanvasName}
        onSelectCanvasHistory={selectCanvasHistory}
        onDeleteCanvasHistory={deleteCanvasHistory}
        onNewCanvas={createNewCanvasSession}
        onCreateCompanyCanvas={createCompanyCanvasSession}
        onOpenLogin={handleOpenLogin}
        onCheckAuth={handleCheckAuth}
        onLoadCanvas={handleLoadCanvas}
        onInspectCanvas={handleInspectCanvas}
      />

      <div className="asset-workspace">
        {sectionDefinitions.map((section) => (
          <AssetSection
            key={section.id}
            section={section}
            assets={assetsByCategory[section.id]}
            expanded={expandedSections.includes(section.id)}
            sortMode={sortModes[section.id]}
            playingAssetId={playingAssetId}
            onToggle={toggleSection}
            onAction={handleAssetAction}
            onRename={renameAsset}
            onChangeCategory={changeAssetCategory}
            onMediaElement={registerMediaElement}
            onMediaEnded={handleMediaEnded}
            onSortModeChange={changeSortMode}
            onFilesSelected={handleFilesSelected}
            onDragStart={setDraggedAsset}
            onDropAsset={handleDropAsset}
            onDropOnAsset={dropOnAsset}
            selectionMode={selectionMode}
            selectedAssetIds={selectedAssetIds}
            onSelectionChange={changeAssetSelection}
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

      <PreviewModal
        asset={previewAsset}
        onClose={() => setPreviewAsset(null)}
        hasPrevious={previewIndex > 0}
        hasNext={previewIndex >= 0 && previewIndex < previewAssets.length - 1}
        onPrevious={() => {
          if (previewIndex > 0) {
            setPreviewAsset(previewAssets[previewIndex - 1]);
          }
        }}
        onNext={() => {
          if (previewIndex >= 0 && previewIndex < previewAssets.length - 1) {
            setPreviewAsset(previewAssets[previewIndex + 1]);
          }
        }}
      />
    </main>
  );
}
