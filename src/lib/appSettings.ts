export async function loadDownloadDir(): Promise<string> {
  const result = await window.ovoDesktop?.settings?.get?.();
  return result?.downloadDir ?? "";
}

export async function saveDownloadDir(downloadDir: string): Promise<void> {
  await window.ovoDesktop?.settings?.set?.({ downloadDir });
}

export async function pickFolder(): Promise<string | null> {
  const result = await window.ovoDesktop?.dialog?.selectFolder?.();
  if (!result || result.canceled || !result.path) return null;
  return result.path;
}
