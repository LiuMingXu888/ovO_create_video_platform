import { endpoints } from "./endpoints";
import { loadProjectSnapshot, saveProjectSnapshotAndVerify } from "./canvasClient";
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

type CompanyNode = {
  id: string;
  type: AssetKind;
  x: number;
  y: number;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

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
  const latestSnapshot = await loadProjectSnapshot(transport, input.projectId);
  const snapshot = addAssetNodeToSnapshot(latestSnapshot, asset);
  const verifiedSnapshot = await saveProjectSnapshotAndVerify(transport, input.projectId, snapshot, asset.id);

  return {
    ok: true,
    asset,
    snapshot: verifiedSnapshot
  };
}

export function addAssetNodeToSnapshot(snapshot: unknown, asset: CanvasAsset) {
  const cloned = structuredClone(snapshot);
  const snapshotBody = getSnapshotBody(cloned);
  const nodes = Array.isArray(snapshotBody.nodes) ? [...snapshotBody.nodes] : [];
  snapshotBody.nodes = [...nodes, createAssetNode(asset)];
  return cloned;
}

export function createCompanyImageNode(asset: CanvasAsset): CompanyNode {
  return baseNode(asset, {
    imageUrl: asset.url
  });
}

export function createCompanyAudioNode(asset: CanvasAsset): CompanyNode {
  return baseNode(asset, {
    audioUrl: asset.url,
    duration: asset.durationSeconds,
    durationSeconds: asset.durationSeconds
  });
}

export function createCompanyVideoNode(asset: CanvasAsset & { providerVideoUrl?: string }): CompanyNode {
  return baseNode(asset, {
    videoUrl: asset.url,
    seedanceProviderUrl: asset.providerVideoUrl,
    videoPersisted: true,
    duration: asset.durationSeconds,
    durationSeconds: asset.durationSeconds,
    resolution: "720p",
    generateAudio: true,
    genTab: "allref",
    model: "ep-20260319213857-htd7q",
    modelName: "Seedance 2.0",
    aspectRatio: "9:16",
    generationPrompt: asset.generationPrompt,
    prompt: asset.generationPrompt,
    generationReferences: asset.generationReferences,
    referenceImages: getReferenceUrls(asset, "image"),
    referenceVideos: getReferenceUrls(asset, "video"),
    referenceAudios: getReferenceUrls(asset, "audio")
  });
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
  if (asset.kind === "image") {
    return createCompanyImageNode(asset);
  }

  if (asset.kind === "audio") {
    return createCompanyAudioNode(asset);
  }

  return createCompanyVideoNode(asset);
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

function baseNode(asset: CanvasAsset, fields: Record<string, unknown>): CompanyNode {
  return {
    id: asset.id,
    type: asset.kind,
    x: 0,
    y: 0,
    position: { x: 0, y: 0 },
    data: compactRecord({
      id: asset.id,
      assetId: asset.id,
      name: asset.name,
      label: asset.name,
      type: asset.kind,
      kind: asset.kind,
      category: asset.category,
      ...fields,
      assetUri: asset.url,
      assetStatus: "Active",
      thumbnailUrl: asset.thumbnailUrl,
      createdAt: asset.createdAt,
      status: asset.status,
      sizeBytes: asset.sizeBytes
    })
  };
}

function compactRecord(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function getReferenceUrls(asset: CanvasAsset, kind: AssetKind) {
  if (!asset.generationReferences) {
    return undefined;
  }

  return asset.generationReferences.filter((reference) => reference.kind === kind).map((reference) => reference.url ?? reference.previewUrl ?? reference.name);
}
