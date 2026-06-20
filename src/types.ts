export type AssetKind = "image" | "audio" | "video";

export type AssetCategory = "characters" | "scenes" | "props" | "audio" | "video";

export type AssetAction =
  | "preview"
  | "download"
  | "insert"
  | "rename"
  | "remove-subtitles"
  | "toggle-play"
  | "delete"
  | "reuse-generation";

export type SortMode = "default" | "generated-asc" | "generated-desc" | "name-asc" | "name-desc";

export interface GenerationSettings {
  aspectRatio: "9:16" | "16:9" | "1:1";
  durationSeconds: number;
  omnireference: boolean;
  webSearch: boolean;
}

export interface CanvasAsset {
  id: string;
  name: string;
  kind: AssetKind;
  category: AssetCategory;
  url: string;
  providerVideoUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  sizeBytes?: number;
  createdAt?: string;
  generationStartedAt?: string;
  model?: string;
  status?: "ready" | "generating" | "failed";
  statusLabel?: string;
  errorMessage?: string;
  generationPrompt?: string;
  generationReferences?: ReferenceItem[];
}

export interface ReferenceItem {
  id: string;
  name: string;
  kind: AssetKind;
  url?: string;
  sizeBytes: number;
  durationSeconds?: number;
  mimeType?: string;
  fileName?: string;
  previewUrl?: string;
  source: "asset" | "local-file";
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
  source: "snapshot" | "asset-list" | "upload";
  rawType?: string;
}

export interface AuthUser {
  id?: string;
  name?: string;
  account?: string;
  avatarUrl?: string;
  creditBalance?: number;
  credits?: number;
  credit?: number;
  points?: number;
  balance?: number;
  remainingCredits?: number;
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
