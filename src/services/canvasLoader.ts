import { loadProjectSnapshot, removeAssetFromSnapshot, renameAssetInSnapshot, saveProjectSnapshot } from "../api/canvasClient";
import { addAssetNodeToSnapshot } from "../api/uploadClient";
import type { ApiTransport } from "../api/transport";
import { normalizeSnapshotAssets } from "../lib/assetNormalizer";
import { parseCanvasUrl } from "../lib/canvasUrl";
import type { AssetCategory, AssetKind, CanvasAsset, CanvasProject } from "../types";

export interface LoadedCanvasResources {
  project: CanvasProject;
  assets: ReturnType<typeof normalizeSnapshotAssets>;
  snapshot: unknown;
}

export async function loadCanvasResources(transport: ApiTransport, canvasUrl: string): Promise<LoadedCanvasResources> {
  const parsed = parseCanvasUrl(canvasUrl);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  const snapshot = await loadProjectSnapshot(transport, parsed.projectId);
  const title = getSnapshotTitle(snapshot);

  return {
    project: {
      projectId: parsed.projectId,
      canvasUrl: parsed.normalizedUrl,
      title,
      loadedAt: new Date().toISOString()
    },
    assets: normalizeSnapshotAssets(snapshot),
    snapshot
  };
}

export async function renameCanvasAsset(
  transport: ApiTransport,
  input: { projectId: string; snapshot: unknown; assetId: string; name: string }
) {
  const renamed = renameAssetInSnapshot(input.snapshot, input.assetId, input.name);
  if (!renamed.updated) {
    throw new Error("未找到可同步的画布资源节点");
  }

  await saveProjectSnapshot(transport, input.projectId, renamed.snapshot);
  return {
    ok: true,
    snapshot: renamed.snapshot
  };
}

export async function deleteCanvasAsset(
  transport: ApiTransport,
  input: { projectId: string; snapshot: unknown; assetId: string }
) {
  const removed = removeAssetFromSnapshot(input.snapshot, input.assetId);
  if (!removed.updated) {
    throw new Error("未找到可同步删除的画布资源节点");
  }

  await saveProjectSnapshot(transport, input.projectId, removed.snapshot);
  return {
    ok: true,
    snapshot: removed.snapshot
  };
}

export async function saveCanvasAsset(
  transport: ApiTransport,
  input: {
    projectId: string;
    snapshot: unknown;
    id?: string;
    name: string;
    kind: AssetKind;
    category: AssetCategory;
    url: string;
    thumbnailUrl?: string;
    durationSeconds?: number;
    sizeBytes?: number;
    generationPrompt?: string;
    generationReferences?: CanvasAsset["generationReferences"];
  }
) {
  const asset: CanvasAsset = {
    id: input.id ?? createNodeId(input.kind),
    name: input.name,
    kind: input.kind,
    category: input.category,
    url: input.url,
    thumbnailUrl: input.thumbnailUrl,
    durationSeconds: input.durationSeconds,
    sizeBytes: input.sizeBytes,
    createdAt: new Date().toISOString(),
    status: "ready",
    generationPrompt: input.generationPrompt,
    generationReferences: input.generationReferences
  };
  const snapshot = addAssetNodeToSnapshot(input.snapshot, asset);

  await saveProjectSnapshot(transport, input.projectId, snapshot);
  return {
    ok: true,
    asset,
    snapshot
  };
}

function getSnapshotTitle(snapshot: unknown) {
  if (typeof snapshot === "object" && snapshot !== null && "title" in snapshot && typeof snapshot.title === "string") {
    return snapshot.title;
  }

  return undefined;
}

function createNodeId(kind: AssetKind) {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `saved-${kind}-${randomPart}`;
}
