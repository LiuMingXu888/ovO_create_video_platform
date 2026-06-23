import type { AssetCategory, CanvasAsset } from "../types";

export const CURRENT_SCHEMA_VERSION = 1;

export interface PendingTask {
  nodeId: string;
  taskId?: string;
  kind: "image" | "video";
  category: AssetCategory;
  prompt: string;
  startTime: number;
  status: "submitting" | "queued" | "running";
}

export interface LocalCanvasStore {
  schemaVersion: number;
  projectId: string;
  canvasName: string;
  canvasUrl: string;
  assets: CanvasAsset[];
  pendingTasks: PendingTask[];
  updatedAt: string;
}

export function buildLocalCanvasStore(input: {
  projectId: string;
  canvasName: string;
  canvasUrl: string;
  assets: CanvasAsset[];
  pendingTasks: PendingTask[];
}): LocalCanvasStore {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectId: input.projectId,
    canvasName: input.canvasName,
    canvasUrl: input.canvasUrl,
    assets: input.assets,
    pendingTasks: input.pendingTasks,
    updatedAt: new Date().toISOString()
  };
}

export function migrateLocalCanvasStore(raw: unknown): LocalCanvasStore | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const value = raw as Record<string, unknown>;
  if (typeof value.projectId !== "string" || !Array.isArray(value.assets)) {
    return null;
  }

  // 未来 schemaVersion 升级时, 在此按版本补迁移逻辑; 缺失字段一律补默认值。
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectId: value.projectId,
    canvasName: typeof value.canvasName === "string" ? value.canvasName : "未命名画布",
    canvasUrl: typeof value.canvasUrl === "string" ? value.canvasUrl : "",
    assets: value.assets as CanvasAsset[],
    pendingTasks: Array.isArray(value.pendingTasks) ? (value.pendingTasks as PendingTask[]) : [],
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString()
  };
}

// 远端为事实源: 以远端 assets 为基底, 仅补回远端缺失但本地仍在生成的占位资产;
// 进行中任务里, 远端已 ready 的清除, 其余保留以便续轮询。
export function mergeCanvasState(
  local: LocalCanvasStore | null,
  remote: { assets: CanvasAsset[] }
): { assets: CanvasAsset[]; pendingTasks: PendingTask[] } {
  if (!local) {
    return { assets: remote.assets, pendingTasks: [] };
  }

  const remoteById = new Map(remote.assets.map((asset) => [asset.id, asset]));
  const mergedAssets = [...remote.assets];

  for (const localAsset of local.assets) {
    if (!remoteById.has(localAsset.id) && localAsset.status === "generating") {
      mergedAssets.push(localAsset);
    }
  }

  const pendingTasks = local.pendingTasks.filter((task) => {
    const remoteAsset = remoteById.get(task.nodeId);
    return !(remoteAsset && remoteAsset.status === "ready");
  });

  return { assets: mergedAssets, pendingTasks };
}

export async function readLocalCanvas(projectId: string): Promise<LocalCanvasStore | null> {
  const store = window.ovoDesktop?.localStore;
  if (!store || !projectId) {
    return null;
  }

  try {
    const raw = await store.read(projectId);
    return migrateLocalCanvasStore(raw);
  } catch (error) {
    console.warn("[localCanvasStore] 读取失败", error);
    return null;
  }
}

export async function writeLocalCanvas(store: LocalCanvasStore): Promise<void> {
  const api = window.ovoDesktop?.localStore;
  if (!api || !store.projectId) {
    return;
  }

  try {
    await api.write(store.projectId, store);
  } catch (error) {
    console.warn("[localCanvasStore] 写入失败", error);
  }
}
