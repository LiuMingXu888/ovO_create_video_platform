import { endpoints } from "./endpoints";
import { saveProjectSnapshot } from "./canvasClient";
import type { ApiTransport } from "./transport";
import type { AssetCategory, AssetKind, CanvasAsset } from "../types";

interface BuildAssetUploadPayloadInput {
  name: string;
  kind: AssetKind;
  publicUrl: string;
  projectId?: string;
}

interface UploadFileResponse {
  publicUrl?: string;
  url?: string;
  key?: string;
  fileSize?: number;
  size?: number;
}

interface UploadCanvasAssetInput {
  projectId: string;
  snapshot: unknown;
  file: File;
  name: string;
  kind: AssetKind;
  category: AssetCategory;
}

export function getUploadPrefix(file: File) {
  return file.name.replace(/\.[^.]+$/, "");
}

export function buildUploadFormData(file: File, projectId?: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("prefix", getUploadPrefix(file));

  if (projectId) {
    formData.append("projectId", projectId);
  }

  return formData;
}

export function buildAssetUploadPayload(input: BuildAssetUploadPayloadInput) {
  return {
    name: input.name,
    type: input.kind,
    url: input.publicUrl,
    projectId: input.projectId
  };
}

export async function uploadCanvasAsset(transport: ApiTransport, input: UploadCanvasAssetInput) {
  const uploadResult = await transport.request<UploadFileResponse>(endpoints.uploadFile(), {
    method: "POST",
    body: buildUploadFormData(input.file, input.projectId)
  });
  const publicUrl = uploadResult.publicUrl ?? uploadResult.url;

  if (!publicUrl) {
    throw new Error("上传成功但公司接口未返回资源地址");
  }

  const asset = createUploadedAsset(input, publicUrl, uploadResult.fileSize ?? uploadResult.size ?? input.file.size);
  const snapshot = addAssetNodeToSnapshot(input.snapshot, asset);
  await saveProjectSnapshot(transport, input.projectId, snapshot);

  return {
    ok: true,
    asset,
    snapshot
  };
}

export function addAssetNodeToSnapshot(snapshot: unknown, asset: CanvasAsset) {
  const cloned = structuredClone(snapshot);
  const snapshotBody = getSnapshotBody(cloned);
  const nodes = Array.isArray(snapshotBody.nodes) ? [...snapshotBody.nodes] : [];
  snapshotBody.nodes = [...nodes, createAssetNode(asset)];
  return cloned;
}

function getSnapshotBody(snapshot: unknown): Record<string, unknown> {
  if (isRecord(snapshot) && isRecord(snapshot.snapshot)) {
    return snapshot.snapshot;
  }

  if (isRecord(snapshot)) {
    return snapshot;
  }

  return { nodes: [] };
}

function createUploadedAsset(input: UploadCanvasAssetInput, publicUrl: string, sizeBytes?: number): CanvasAsset {
  return {
    id: createNodeId(input.kind),
    name: input.name,
    kind: input.kind,
    category: input.category,
    url: publicUrl,
    sizeBytes
  };
}

function createAssetNode(asset: CanvasAsset) {
  const mediaField = asset.kind === "image" ? "imageUrl" : asset.kind === "audio" ? "audioUrl" : "videoUrl";

  return {
    id: asset.id,
    type: `${asset.kind}-node`,
    x: 0,
    y: 0,
    position: { x: 0, y: 0 },
    data: {
      id: asset.id,
      assetId: asset.id,
      name: asset.name,
      type: asset.kind,
      kind: asset.kind,
      category: asset.category,
      [mediaField]: asset.url,
      sizeBytes: asset.sizeBytes,
      durationSeconds: asset.durationSeconds,
      duration: asset.durationSeconds,
      thumbnailUrl: asset.thumbnailUrl,
      createdAt: asset.createdAt,
      status: asset.status,
      generationPrompt: asset.generationPrompt,
      generationReferences: asset.generationReferences
    }
  };
}

function createNodeId(kind: AssetKind) {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `uploaded-${kind}-${randomPart}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
