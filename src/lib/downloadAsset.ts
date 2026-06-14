import type { CanvasAsset } from "../types";

export async function downloadAsset(asset: CanvasAsset) {
  const fileName = getDownloadFileName(asset);

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

function getDownloadFileName(asset: CanvasAsset) {
  const displayName = asset.name.trim() || "asset";

  if (/\.[A-Za-z0-9]{2,5}$/.test(displayName)) {
    return displayName;
  }

  return `${displayName}${extractUrlExtension(asset.url)}`;
}

function extractUrlExtension(url: string) {
  try {
    const pathname = new URL(url, window.location.href).pathname;
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
