import { app, shell } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const GITEE_OWNER = "siberian-aries";
export const GITEE_REPO = "ov-o_create_video_platform";

const GITEE_API_BASE = `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}`;

export interface GiteeRelease {
  id: number;
  tag_name?: string;
  name?: string;
}

export interface GiteeAttachFile {
  id: number;
  name: string;
  browser_download_url?: string;
}

export interface UpdateAsset {
  name: string;
  url: string;
}

export interface UpdateInfo {
  releaseId: number;
  tagName: string;
  version: string;
  installerName: string;
  installerUrl: string;
  latestYmlUrl: string;
  filePath?: string;
}

export type UpdateCheckResult =
  | {
      ok: true;
      status: "latest";
      currentVersion: string;
      latestVersion: string;
      message: string;
    }
  | {
      ok: true;
      status: "available";
      currentVersion: string;
      latestVersion: string;
      update: UpdateInfo;
      message: string;
    }
  | {
      ok: false;
      status: "unsupported" | "error";
      currentVersion: string;
      message: string;
      detail?: string;
    };

export interface UpdateDownloadResult {
  ok: boolean;
  status: "downloaded" | "error";
  filePath?: string;
  message: string;
}

export interface UpdateInstallResult {
  ok: boolean;
  message: string;
}

interface UpdaterOptions {
  currentVersion?: string;
  fetcher?: typeof fetch;
  isPackaged?: boolean;
  platform?: NodeJS.Platform;
  tempRoot?: string;
  openPath?: (filePath: string) => Promise<string>;
  quit?: () => void;
  onProgress?: (progress: { percent: number; transferred: number; total?: number }) => void;
}

export function compareSemver(left: string, right: string) {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);

  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

export function findRequiredUpdateAssets(files: GiteeAttachFile[]) {
  const installer = files.find((file) => /ovO-\d+\.\d+\.\d+-x64-setup\.exe$/i.test(file.name));
  const latestYml = files.find((file) => file.name === "latest.yml");

  if (!installer?.browser_download_url || !latestYml?.browser_download_url) {
    console.error("[updater] missing assets; have:", files.map((f) => f.name));
    throw new Error(`更新包不完整 (assets: ${files.map((f) => f.name).join(",") || "none"})`);
  }

  return {
    installer: { name: installer.name, url: installer.browser_download_url },
    latestYml: { name: latestYml.name, url: latestYml.browser_download_url }
  };
}

export function createGiteeReleaseUpdater(options: UpdaterOptions = {}) {
  const currentVersion = options.currentVersion ?? app.getVersion();
  const fetcher = options.fetcher ?? fetch;
  const isPackaged = options.isPackaged ?? app.isPackaged;
  const platform = options.platform ?? process.platform;
  const tempRoot = options.tempRoot ?? path.join(os.tmpdir(), "ovo-updates");
  const openPath = options.openPath ?? shell.openPath;
  const quit = options.quit ?? (() => app.quit());
  let latestUpdate: UpdateInfo | undefined;
  let downloadedUpdate: UpdateInfo | undefined;

  async function checkForUpdates(): Promise<UpdateCheckResult> {
    console.log("[updater] checkForUpdates", { isPackaged, platform, currentVersion });
    latestUpdate = undefined;
    downloadedUpdate = undefined;

    if (!isPackaged || platform !== "win32") {
      console.log("[updater] skipped: dev/non-win32");
      return {
        ok: false,
        status: "unsupported",
        currentVersion,
        message: "开发模式不检查更新"
      };
    }

    try {
      const latestRelease = await fetchJson<GiteeRelease>(`${GITEE_API_BASE}/releases/latest`, {
        allowNotFound: true
      });

      // Gitee returns 404 on /releases/latest when the repo has no published
      // release yet. That is not a broken package — there is simply nothing to
      // update to, so report "already latest" instead of a scary error.
      if (!latestRelease) {
        return {
          ok: true,
          status: "latest",
          currentVersion,
          latestVersion: currentVersion,
          message: `当前已是最新版本 v${currentVersion}`
        };
      }

      const latestVersion = versionFromRelease(latestRelease);

      if (compareSemver(currentVersion, latestVersion) >= 0) {
        return {
          ok: true,
          status: "latest",
          currentVersion,
          latestVersion,
          message: `当前已是最新版本 v${currentVersion}`
        };
      }

      const attachments = await fetchJson<GiteeAttachFile[]>(
        `${GITEE_API_BASE}/releases/${latestRelease.id}/attach_files`
      );
      const assets = findRequiredUpdateAssets(attachments ?? []);
      latestUpdate = {
        releaseId: latestRelease.id,
        tagName: latestRelease.tag_name ?? `v${latestVersion}`,
        version: latestVersion,
        installerName: assets.installer.name,
        installerUrl: assets.installer.url,
        latestYmlUrl: assets.latestYml.url
      };

      return {
        ok: true,
        status: "available",
        currentVersion,
        latestVersion,
        update: latestUpdate,
        message: `发现新版本 v${latestVersion}`
      };
    } catch (error) {
      const detail =
        error instanceof Error ? `${error.message}${error.stack ? "\n" + error.stack : ""}` : String(error);
      console.error("[updater] checkForUpdates error", detail);
      return {
        ok: false,
        status: "error",
        currentVersion,
        message: normalizeUpdateError(error),
        detail
      };
    }
  }

  async function downloadUpdate(update = latestUpdate): Promise<UpdateDownloadResult> {
    console.log("[updater] downloadUpdate", update?.installerUrl);
    if (!update) {
      return {
        ok: false,
        status: "error",
        message: "请先检查更新"
      };
    }

    try {
      const response = await fetcher(update.installerUrl);
      if (!response.ok || !response.body) {
        throw new Error(`下载安装包失败：${response.status}`);
      }

      const targetDir = path.join(tempRoot, update.version);
      fs.mkdirSync(targetDir, { recursive: true });
      const filePath = path.join(targetDir, update.installerName);
      await writeResponseToFile(response, filePath, options.onProgress);
      downloadedUpdate = { ...update, filePath };

      return {
        ok: true,
        status: "downloaded",
        filePath,
        message: "更新已下载"
      };
    } catch (error) {
      return {
        ok: false,
        status: "error",
        message: normalizeUpdateError(error, "下载失败，可重试")
      };
    }
  }

  async function installUpdate(): Promise<UpdateInstallResult> {
    if (!downloadedUpdate?.filePath) {
      return {
        ok: false,
        message: "请先下载更新"
      };
    }

    const openError = await openPath(downloadedUpdate.filePath);
    if (openError) {
      return {
        ok: false,
        message: openError
      };
    }

    setTimeout(quit, 1000);
    return {
      ok: true,
      message: "正在启动安装程序"
    };
  }

  async function fetchJson<T>(url: string, options: { allowNotFound: true }): Promise<T | null>;
  async function fetchJson<T>(url: string, options?: { allowNotFound?: false }): Promise<T>;
  async function fetchJson<T>(url: string, options?: { allowNotFound?: boolean }): Promise<T | null> {
    console.log("[updater] fetchJson", url);
    const response = await fetcher(url, { headers: { accept: "application/json" } });
    if (!response.ok) {
      if (options?.allowNotFound && response.status === 404) {
        return null;
      }
      console.error("[updater] fetchJson failed", url, response.status);
      const detail = `HTTP ${response.status} @ ${url}`;
      throw new Error(response.status === 404 ? `更新包不完整 (${detail})` : `无法连接 Gitee (${detail})`);
    }

    return (await response.json()) as T;
  }

  return {
    checkForUpdates,
    downloadUpdate,
    installUpdate
  };
}

function normalizeVersion(value: string) {
  const parts = value
    .replace(/^v/i, "")
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);

  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0] as const;
}

function versionFromRelease(release: GiteeRelease) {
  const rawVersion = release.tag_name ?? release.name ?? "";
  const version = rawVersion.replace(/^v/i, "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error("[updater] bad tag/version:", rawVersion);
    throw new Error(`更新包不完整 (tag: ${rawVersion || "empty"})`);
  }

  return version;
}

function normalizeUpdateError(error: unknown, fallback = "无法连接 Gitee，请检查网络或稍后重试") {
  if (error instanceof Error && error.message) {
    if (error.message.includes("更新包不完整")) {
      return "更新包不完整";
    }

    if (error.message.includes("下载失败")) {
      return "下载失败，可重试";
    }
  }

  return fallback;
}

async function writeResponseToFile(
  response: Response,
  filePath: string,
  onProgress?: (progress: { percent: number; transferred: number; total?: number }) => void
) {
  const totalHeader = response.headers.get("content-length");
  const total = totalHeader ? Number.parseInt(totalHeader, 10) : undefined;
  const reader = response.body?.getReader();
  let transferred = 0;

  if (!reader) {
    throw new Error("下载失败，可重试");
  }

  const writable = fs.createWriteStream(filePath);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      transferred += value.byteLength;
      await writeChunk(writable, value);

      if (total && onProgress) {
        onProgress({
          transferred,
          total,
          percent: Math.min(100, Math.round((transferred / total) * 100))
        });
      }
    }
  } finally {
    await new Promise<void>((resolve) => writable.end(resolve));
  }
}

function writeChunk(writable: fs.WriteStream, value: Uint8Array) {
  return new Promise<void>((resolve, reject) => {
    writable.write(Buffer.from(value), (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
