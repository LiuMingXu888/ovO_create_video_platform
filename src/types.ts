export type AssetKind = "image" | "audio" | "video";

export type AssetCategory = "characters" | "scenes" | "props" | "audio" | "video";

export type AssetAction = "preview" | "download" | "insert" | "rename" | "remove-subtitles" | "reuse-generation";

export type SortMode = "default" | "asc" | "desc";

export interface GenerationSettings {
  aspectRatio: "9:16" | "16:9" | "1:1";
  durationSeconds: number;
  omnireference: boolean;
}

export interface CanvasAsset {
  id: string;
  name: string;
  kind: AssetKind;
  category: AssetCategory;
  url: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  sizeBytes?: number;
  generationPrompt?: string;
  generationReferences?: ReferenceItem[];
}

export interface ReferenceItem {
  id: string;
  name: string;
  kind: AssetKind;
  sizeBytes: number;
  durationSeconds?: number;
  mimeType?: string;
  fileName?: string;
  source: "asset" | "local-file";
  previewUrl?: string;
}

export interface SectionDefinition {
  id: AssetCategory;
  title: string;
  accepts: AssetKind[];
}

export interface CanvasProject {
  projectId: string;
  canvasUrl: string;
  title?: string;
  loadedAt: string;
}

export interface ApiAsset {
  id?: string;
  name: string;
  kind: AssetKind;
  url: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  sizeBytes?: number;
  generationPrompt?: string;
  generationReferences?: ReferenceItem[];
  source: "snapshot" | "asset-list" | "upload";
  rawType?: string;
}

export interface AuthUser {
  id?: string;
  name?: string;
  account?: string;
  avatarUrl?: string;
}

export type AuthState =
  | { status: "unknown"; user?: undefined; message?: undefined }
  | { status: "checking"; user?: undefined; message?: undefined }
  | { status: "authenticated"; user: AuthUser; message?: undefined }
  | { status: "unauthenticated"; user?: undefined; message: string };

export interface LocalTask {
  id: string;
  projectId: string;
  type: "generate-video" | "subtitle-remove";
  status: "queued" | "running" | "succeeded" | "failed";
  serverTaskId?: string;
  createdAt: string;
  updatedAt: string;
  outputUrl?: string;
  errorMessage?: string;
}

export interface ApiError {
  status?: number;
  message: string;
  code?: string;
  detail?: unknown;
}
