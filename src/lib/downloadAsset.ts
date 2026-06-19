import type { CanvasAsset } from "../types";

const categoryLabels: Record<CanvasAsset["category"], string> = {
  characters: "人物",
  scenes: "场景",
  props: "道具",
  audio: "音频",
  video: "视频"
};

export async function downloadAsset(asset: CanvasAsset) {
  const fileName = getDownloadFileName(asset);

  if (window.ovoDesktop?.file) {
    const result = await window.ovoDesktop.file.saveAsset({ url: asset.url, fileName });
    if (!result.ok) {
      throw new Error(result.message ?? "下载失败");
    }
    return;
  }

  if (asset.url.startsWith("blob:")) {
    triggerDownload(asset.url, fileName);
    return;
  }

  try {
    const response = await fetch(asset.url);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, fileName);
    URL.revokeObjectURL(objectUrl);
  } catch {
    triggerDownload(asset.url, fileName);
  }
}

export async function downloadAssets(assets: CanvasAsset[]) {
  const inputs = assets.map((asset) => ({
    url: asset.url,
    fileName: getDownloadFileName(asset),
    category: asset.category,
    categoryLabel: categoryLabels[asset.category]
  }));

  if (window.ovoDesktop?.file.saveAssets) {
    const result = await window.ovoDesktop.file.saveAssets({ assets: inputs });
    if (!result.ok) {
      throw new Error(result.message ?? "批量下载失败");
    }
    return;
  }

  for (const asset of assets) {
    await downloadAsset(asset);
  }
}

function getDownloadFileName(asset: CanvasAsset) {
  const displayName = asset.name.trim() || "asset";

  if (/\.[A-Za-z0-9]{2,5}$/.test(displayName)) {
    return displayName;
  }

  return `${displayName}${extractUrlExtension(asset.url)}`;
}

function extractUrlExtension(url: string) {
  try {
    const pathname = new URL(url, document.baseURI).pathname;
    return pathname.match(/\.[A-Za-z0-9]{2,5}$/)?.[0] ?? "";
  } catch {
    return "";
  }
}

function triggerDownload(url: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
