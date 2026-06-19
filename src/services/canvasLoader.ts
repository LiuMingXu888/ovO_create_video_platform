import {
  loadProjectSnapshot,
  removeAssetFromSnapshot,
  renameAssetInSnapshot,
  saveProjectSnapshot,
  saveProjectSnapshotAndVerify
} from "../api/canvasClient";
import { addAssetNodeToSnapshot } from "../api/uploadClient";
import type { ApiTransport } from "../api/transport";
import { removeSubtitles, type SubtitleRemovalResult } from "../api/subtitleClient";
import { normalizeSnapshotAssets } from "../lib/assetNormalizer";
import { ensureDefaultAssetPrefix } from "../lib/assetNamePrefix";
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
  const normalized = await normalizeAndSyncAssetPrefixes(transport, parsed.projectId, snapshot);

  return {
    project: {
      projectId: parsed.projectId,
      canvasUrl: parsed.normalizedUrl,
      title,
      loadedAt: new Date().toISOString()
    },
    assets: normalized.assets,
    snapshot: normalized.snapshot
  };
}

export function normalizeLoadedAssetsWithPrefixes(assets: CanvasAsset[]) {
  return assets.map((asset) => ensureDefaultAssetPrefix(asset));
}

async function normalizeAndSyncAssetPrefixes(transport: ApiTransport, projectId: string, snapshot: unknown) {
  const rawAssets = normalizeSnapshotAssets(snapshot);
  let nextSnapshot = snapshot;
  const assets: CanvasAsset[] = [];

  for (const rawAsset of rawAssets) {
    const normalized = ensureDefaultAssetPrefix(rawAsset);
    assets.push(stripRenameMarker(normalized));

    if (normalized.renamed) {
      const renamed = renameAssetInSnapshot(nextSnapshot, rawAsset.id, normalized.name);
      if (renamed.updated) {
        await saveProjectSnapshot(transport, projectId, renamed.snapshot);
        nextSnapshot = renamed.snapshot;
      }
    }
  }

  return { assets, snapshot: nextSnapshot };
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
    providerVideoUrl?: string;
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
    providerVideoUrl: input.providerVideoUrl,
    thumbnailUrl: input.thumbnailUrl,
    durationSeconds: input.durationSeconds,
    sizeBytes: input.sizeBytes,
    createdAt: new Date().toISOString(),
    status: "ready",
    generationPrompt: input.generationPrompt,
    generationReferences: input.generationReferences
  };
  const latestSnapshot = await loadProjectSnapshot(transport, input.projectId);
  const snapshot = addAssetNodeToSnapshot(latestSnapshot, asset);

  const verifiedSnapshot = await saveProjectSnapshotAndVerify(transport, input.projectId, snapshot, asset.id);
  return {
    ok: true,
    asset,
    snapshot: verifiedSnapshot
  };
}

export async function removeCanvasAssetSubtitles(
  transport: ApiTransport,
  input: {
    projectId: string;
    sourceAsset: CanvasAsset;
    placeholderAsset: CanvasAsset;
    generationPrompt?: string;
    generationReferences?: CanvasAsset["generationReferences"];
  }
) {
  const latestSnapshot = await loadProjectSnapshot(transport, input.projectId);
  const placeholderSnapshot = addAssetNodeToSnapshot(latestSnapshot, input.placeholderAsset);
  await saveProjectSnapshotAndVerify(transport, input.projectId, placeholderSnapshot, input.placeholderAsset.id);

  const result = await removeSubtitles(transport, input.sourceAsset, { intervalMs: 1500, maxAttempts: 1400 });
  const completedAsset = createSubtitleRemovedAsset(input.placeholderAsset, result);
  const completionLatestSnapshot = await loadProjectSnapshot(transport, input.projectId);
  const completedSnapshot = addAssetNodeToSnapshot(completionLatestSnapshot, completedAsset);
  const verifiedSnapshot = await saveProjectSnapshotAndVerify(transport, input.projectId, completedSnapshot, completedAsset.id);

  return {
    ok: true,
    asset: completedAsset,
    snapshot: verifiedSnapshot,
    result
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

function createSubtitleRemovedAsset(placeholderAsset: CanvasAsset, result: SubtitleRemovalResult): CanvasAsset {
  return {
    ...placeholderAsset,
    url: result.videoUrl,
    providerVideoUrl: result.providerVideoUrl,
    status: "ready"
  };
}

function stripRenameMarker(asset: CanvasAsset & { renamed?: boolean }): CanvasAsset {
  const { renamed: _renamed, ...cleanAsset } = asset;
  return cleanAsset;
}
