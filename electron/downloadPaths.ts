import path from "node:path";

export interface SaveAssetInput {
  url: string;
  fileName: string;
  category?: string;
  categoryLabel?: string;
}

interface CreateCategorizedDownloadPlanInput {
  downloadsPath: string;
  timestampFolderName: string;
  assets: SaveAssetInput[];
}

export interface CategorizedDownloadItem {
  url: string;
  fileName: string;
  categoryDirectoryPath: string;
  destinationPath: string;
}

export interface CategorizedDownloadPlan {
  directoryPath: string;
  items: CategorizedDownloadItem[];
}

const categoryLabels: Record<string, string> = {
  characters: "人物",
  scenes: "场景",
  props: "道具",
  audio: "音频",
  video: "视频"
};

export function createCategorizedDownloadPlan(input: CreateCategorizedDownloadPlanInput): CategorizedDownloadPlan {
  const directoryPath = path.join(input.downloadsPath, input.timestampFolderName);
  const items = input.assets.map((asset) => {
    const categoryDirectoryName = sanitizePathPart(asset.categoryLabel ?? categoryLabels[asset.category ?? ""] ?? "资源");
    const fileName = sanitizePathPart(asset.fileName.trim() || "asset");
    const categoryDirectoryPath = path.join(directoryPath, categoryDirectoryName);

    return {
      url: asset.url,
      fileName,
      categoryDirectoryPath,
      destinationPath: path.join(categoryDirectoryPath, fileName)
    };
  });

  return {
    directoryPath,
    items
  };
}

export function sanitizePathPart(value: string) {
  const trimmed = value.trim() || "asset";
  return trimmed.replace(/[/:*?"<>|]/g, "_");
}
