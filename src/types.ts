export type AssetKind = "image" | "audio" | "video";

export type AssetCategory = "characters" | "scenes" | "props" | "audio" | "video";

export type AssetAction = "preview" | "download" | "insert";

export interface CanvasAsset {
  id: string;
  name: string;
  kind: AssetKind;
  category: AssetCategory;
  url: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  sizeBytes?: number;
}

export interface ReferenceItem {
  id: string;
  name: string;
  kind: AssetKind;
  sizeBytes: number;
  durationSeconds?: number;
  source: "asset" | "local-file";
}

export interface SectionDefinition {
  id: AssetCategory;
  title: string;
  accepts: AssetKind[];
}
