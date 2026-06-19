# Gitee Manual Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual Gitee-based update flow for the packaged Windows ovO desktop app and a Gitee-only patch release command.

**Architecture:** The Electron main process talks to Gitee Release APIs, downloads the installer to a temp directory, and launches it on user command. The sandboxed preload exposes a small updater bridge to React, while React owns only button state, labels, version display, and progress rendering. The release script bumps patch versions, builds Windows artifacts, pushes only to `gitee`, creates a Gitee Release, and uploads the installer plus `latest.yml`.

**Tech Stack:** Electron, React, TypeScript, Vite, Vitest, Electron Builder, Gitee OpenAPI v5.

---

## File Structure

- Create `.worktrees/ui-shell/electron/giteeReleaseUpdater.ts`
  - Owns Gitee API URLs, semantic version comparison, release/attachment parsing, Windows support checks, update download, and installer launch.
- Create `.worktrees/ui-shell/electron/giteeReleaseUpdater.test.ts`
  - Unit tests for version comparison, update detection, Gitee URL selection, missing asset errors, and download progress.
- Modify `.worktrees/ui-shell/electron/main.ts`
  - Registers updater IPC handlers and forwards progress/status events to the renderer.
- Modify `.worktrees/ui-shell/electron/preload.cts`
  - Exposes `window.ovoDesktop.updater` methods and event listeners.
- Modify `.worktrees/ui-shell/src/vite-env.d.ts`
  - Adds renderer-visible updater types.
- Create `.worktrees/ui-shell/src/update/manualUpdateState.ts`
  - Pure reducer/helpers for labels and state transitions.
- Create `.worktrees/ui-shell/src/update/manualUpdateState.test.ts`
  - Unit tests for button labels and state transitions.
- Modify `.worktrees/ui-shell/src/components/AppHeader.tsx`
  - Shows version badge next to `ovO` and adds the update button between credits and account.
- Modify `.worktrees/ui-shell/src/App.tsx`
  - Wires updater bridge calls into app state and passes props to `AppHeader`.
- Modify `.worktrees/ui-shell/src/App.test.tsx`
  - Tests version display, button placement, development-mode message, and update state transitions.
- Modify `.worktrees/ui-shell/src/styles.css`
  - Adds version badge and update button styling.
- Create `.worktrees/ui-shell/scripts/release-patch.mjs`
  - Bumps patch version, builds Windows artifacts, commits/tags, pushes only to `gitee`, and uploads release assets.
- Create `.worktrees/ui-shell/scripts/releasePatchCore.mjs`
  - Testable release helper functions.
- Create `.worktrees/ui-shell/scripts/releasePatchCore.test.mjs`
  - Unit tests for version bumping, dirty-worktree refusal, remote validation, and asset selection.
- Modify `.worktrees/ui-shell/package.json`
  - Adds `release:patch` and ensures Windows packaging produces NSIS metadata.

## Task 1: Add Gitee Release Updater Core

**Files:**
- Create: `.worktrees/ui-shell/electron/giteeReleaseUpdater.ts`
- Create: `.worktrees/ui-shell/electron/giteeReleaseUpdater.test.ts`

- [ ] **Step 1: Write failing tests for version comparison and release selection**

Create `.worktrees/ui-shell/electron/giteeReleaseUpdater.test.ts` with:

```ts
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("electron", () => ({
  app: {
    getVersion: () => "0.1.0",
    isPackaged: false,
    quit: vi.fn()
  },
  shell: {
    openPath: vi.fn(async () => "")
  }
}));

import {
  compareSemver,
  createGiteeReleaseUpdater,
  findRequiredUpdateAssets,
  GITEE_OWNER,
  GITEE_REPO
} from "./giteeReleaseUpdater.js";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init
  });
}

describe("Gitee release updater", () => {
  it("compares patch versions numerically", () => {
    expect(compareSemver("0.1.2", "0.1.10")).toBeLessThan(0);
    expect(compareSemver("0.2.0", "0.1.99")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
  });

  it("selects the NSIS installer and latest.yml from Gitee release attachments", () => {
    const assets = findRequiredUpdateAssets([
      {
        id: 11,
        name: "ovO-0.1.2-x64-portable.exe",
        browser_download_url: "https://gitee.com/download/portable"
      },
      {
        id: 12,
        name: "latest.yml",
        browser_download_url: "https://gitee.com/download/latest"
      },
      {
        id: 13,
        name: "ovO-0.1.2-x64-setup.exe",
        browser_download_url: "https://gitee.com/download/setup"
      }
    ]);

    expect(assets.installer.name).toBe("ovO-0.1.2-x64-setup.exe");
    expect(assets.installer.url).toBe("https://gitee.com/download/setup");
    expect(assets.latestYml.name).toBe("latest.yml");
  });

  it("returns latest when Gitee has no newer release", async () => {
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toContain(`/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/releases/latest`);
      return jsonResponse({ id: 5, tag_name: "v0.1.0", name: "v0.1.0" });
    });
    const updater = createGiteeReleaseUpdater({
      currentVersion: "0.1.0",
      fetcher,
      isPackaged: true,
      platform: "win32"
    });

    await expect(updater.checkForUpdates()).resolves.toEqual({
      ok: true,
      status: "latest",
      currentVersion: "0.1.0",
      latestVersion: "0.1.0",
      message: "当前已是最新版本 v0.1.0"
    });
  });

  it("returns available update info with Gitee attachment download URLs", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/releases/latest")) {
        return jsonResponse({ id: 7, tag_name: "v0.1.2", name: "v0.1.2" });
      }

      if (url.includes("/releases/7/attach_files")) {
        return jsonResponse([
          {
            id: 21,
            name: "latest.yml",
            browser_download_url: "https://gitee.com/latest.yml"
          },
          {
            id: 22,
            name: "ovO-0.1.2-x64-setup.exe",
            browser_download_url: "https://gitee.com/setup.exe"
          }
        ]);
      }

      throw new Error(`unexpected url ${url}`);
    });
    const updater = createGiteeReleaseUpdater({
      currentVersion: "0.1.1",
      fetcher,
      isPackaged: true,
      platform: "win32"
    });

    await expect(updater.checkForUpdates()).resolves.toMatchObject({
      ok: true,
      status: "available",
      currentVersion: "0.1.1",
      latestVersion: "0.1.2",
      update: {
        releaseId: 7,
        tagName: "v0.1.2",
        installerName: "ovO-0.1.2-x64-setup.exe",
        installerUrl: "https://gitee.com/setup.exe",
        latestYmlUrl: "https://gitee.com/latest.yml"
      }
    });
  });

  it("normalizes missing update package errors", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/releases/latest")) {
        return jsonResponse({ id: 7, tag_name: "v0.1.2", name: "v0.1.2" });
      }

      return jsonResponse([{ id: 21, name: "latest.yml", browser_download_url: "https://gitee.com/latest.yml" }]);
    });
    const updater = createGiteeReleaseUpdater({
      currentVersion: "0.1.1",
      fetcher,
      isPackaged: true,
      platform: "win32"
    });

    await expect(updater.checkForUpdates()).resolves.toEqual({
      ok: false,
      status: "error",
      currentVersion: "0.1.1",
      message: "更新包不完整"
    });
  });

  it("short-circuits in development mode", async () => {
    const updater = createGiteeReleaseUpdater({
      currentVersion: "0.1.1",
      fetcher: vi.fn(),
      isPackaged: false,
      platform: "darwin"
    });

    await expect(updater.checkForUpdates()).resolves.toEqual({
      ok: false,
      status: "unsupported",
      currentVersion: "0.1.1",
      message: "开发模式不检查更新"
    });
  });

  it("downloads the installer and reports progress", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ovo-updater-test-"));
    const progress: number[] = [];
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/releases/latest")) {
        return jsonResponse({ id: 7, tag_name: "v0.1.2", name: "v0.1.2" });
      }

      if (url.includes("/releases/7/attach_files")) {
        return jsonResponse([
          {
            id: 21,
            name: "latest.yml",
            browser_download_url: "https://gitee.com/latest.yml"
          },
          {
            id: 22,
            name: "ovO-0.1.2-x64-setup.exe",
            browser_download_url: "https://gitee.com/setup.exe"
          }
        ]);
      }

      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]));
            controller.enqueue(new Uint8Array([3, 4]));
            controller.close();
          }
        }),
        {
          headers: { "content-length": "4" }
        }
      );
    });
    const updater = createGiteeReleaseUpdater({
      currentVersion: "0.1.1",
      fetcher,
      isPackaged: true,
      platform: "win32",
      tempRoot,
      onProgress: ({ percent }) => progress.push(percent)
    });

    await updater.checkForUpdates();
    const result = await updater.downloadUpdate();

    expect(result.ok).toBe(true);
    expect(result.filePath).toBe(path.join(tempRoot, "0.1.2", "ovO-0.1.2-x64-setup.exe"));
    expect(fs.readFileSync(result.filePath as string)).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(progress).toEqual([50, 100]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
npm test -- electron/giteeReleaseUpdater.test.ts
```

Expected: FAIL because `electron/giteeReleaseUpdater.ts` does not exist.

- [ ] **Step 3: Implement the updater core**

Create `.worktrees/ui-shell/electron/giteeReleaseUpdater.ts`:

```ts
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
    };

export interface UpdateDownloadResult {
  ok: boolean;
  status: "downloaded" | "error";
  filePath?: string;
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
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
}

export function findRequiredUpdateAssets(files: GiteeAttachFile[]) {
  const installer = files.find((file) => /ovO-\d+\.\d+\.\d+-x64-setup\.exe$/i.test(file.name));
  const latestYml = files.find((file) => file.name === "latest.yml");

  if (!installer?.browser_download_url || !latestYml?.browser_download_url) {
    throw new Error("更新包不完整");
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
    if (!isPackaged || platform !== "win32") {
      return {
        ok: false,
        status: "unsupported",
        currentVersion,
        message: "开发模式不检查更新"
      };
    }

    try {
      const latestRelease = await fetchJson<GiteeRelease>(`${GITEE_API_BASE}/releases/latest`);
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

      const attachments = await fetchJson<GiteeAttachFile[]>(`${GITEE_API_BASE}/releases/${latestRelease.id}/attach_files`);
      const assets = findRequiredUpdateAssets(attachments);
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
      return {
        ok: false,
        status: "error",
        currentVersion,
        message: normalizeUpdateError(error)
      };
    }
  }

  async function downloadUpdate(update = latestUpdate): Promise<UpdateDownloadResult> {
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

  async function installUpdate() {
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

  async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetcher(url, { headers: { accept: "application/json" } });
    if (!response.ok) {
      throw new Error(response.status === 404 ? "更新包不完整" : "无法连接 Gitee，请检查网络或稍后重试");
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
  return value
    .replace(/^v/i, "")
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0) as [number, number, number];
}

function versionFromRelease(release: GiteeRelease) {
  const rawVersion = release.tag_name ?? release.name ?? "";
  const version = rawVersion.replace(/^v/i, "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("更新包不完整");
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
  let transferred = 0;

  const writable = fs.createWriteStream(filePath);
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("下载失败，可重试");
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      transferred += value.byteLength;
      await new Promise<void>((resolve, reject) => {
        writable.write(Buffer.from(value), (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
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
```

- [ ] **Step 4: Run updater core tests**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
npm test -- electron/giteeReleaseUpdater.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit updater core**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
git add electron/giteeReleaseUpdater.ts electron/giteeReleaseUpdater.test.ts
git commit -m "feat: add gitee release updater core"
```

Expected: commit succeeds with only the two updater files staged.

## Task 2: Wire Electron IPC And Preload Bridge

**Files:**
- Modify: `.worktrees/ui-shell/electron/main.ts`
- Modify: `.worktrees/ui-shell/electron/preload.cts`
- Modify: `.worktrees/ui-shell/src/vite-env.d.ts`
- Modify: `.worktrees/ui-shell/electron/mainLifecycle.test.ts`
- Modify: `.worktrees/ui-shell/electron/preloadBuild.test.ts`

- [ ] **Step 1: Write failing Electron bridge tests**

Append to `.worktrees/ui-shell/electron/mainLifecycle.test.ts`:

```ts
  it("registers manual updater IPC handlers", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "electron/main.ts"), "utf8");

    expect(source).toContain('ipcMain.handle("ovo:updater:get-current-version"');
    expect(source).toContain('ipcMain.handle("ovo:updater:check-for-updates"');
    expect(source).toContain('ipcMain.handle("ovo:updater:download-update"');
    expect(source).toContain('ipcMain.handle("ovo:updater:install-update"');
    expect(source).toContain("createGiteeReleaseUpdater");
  });
```

Append to `.worktrees/ui-shell/electron/preloadBuild.test.ts`:

```ts
  it("exposes a sandbox-safe updater bridge", () => {
    const preloadSource = fs.readFileSync(path.join(process.cwd(), "electron/preload.cts"), "utf8");

    expect(preloadSource).toContain("updater:");
    expect(preloadSource).toContain("getCurrentVersion");
    expect(preloadSource).toContain('ipcRenderer.invoke("ovo:updater:get-current-version")');
    expect(preloadSource).toContain('ipcRenderer.invoke("ovo:updater:check-for-updates")');
    expect(preloadSource).toContain('ipcRenderer.invoke("ovo:updater:download-update")');
    expect(preloadSource).toContain('ipcRenderer.invoke("ovo:updater:install-update")');
    expect(preloadSource).toContain('ipcRenderer.on("ovo:updater:progress"');
  });
```

- [ ] **Step 2: Run bridge tests to verify they fail**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
npm test -- electron/mainLifecycle.test.ts electron/preloadBuild.test.ts
```

Expected: FAIL because updater IPC is not registered yet.

- [ ] **Step 3: Modify Electron main process**

In `.worktrees/ui-shell/electron/main.ts`, add the import:

```ts
import { createGiteeReleaseUpdater } from "./giteeReleaseUpdater.js";
```

Inside `app.whenReady().then(() => { ... })`, before `createMainWindow();`, add:

```ts
  const updater = createGiteeReleaseUpdater({
    onProgress: (progress) => {
      for (const browserWindow of BrowserWindow.getAllWindows()) {
        browserWindow.webContents.send("ovo:updater:progress", progress);
      }
    }
  });

  ipcMain.handle("ovo:updater:get-current-version", () => app.getVersion());
  ipcMain.handle("ovo:updater:check-for-updates", () => updater.checkForUpdates());
  ipcMain.handle("ovo:updater:download-update", () => updater.downloadUpdate());
  ipcMain.handle("ovo:updater:install-update", () => updater.installUpdate());
```

- [ ] **Step 4: Modify preload bridge**

In `.worktrees/ui-shell/electron/preload.cts`, replace the current hard-coded `version: "0.1.0"` with an updater-aware bridge:

```ts
contextBridge.exposeInMainWorld("ovoDesktop", {
  version: "0.1.0",
  updater: {
    getCurrentVersion: () => ipcRenderer.invoke("ovo:updater:get-current-version"),
    checkForUpdates: () => ipcRenderer.invoke("ovo:updater:check-for-updates"),
    downloadUpdate: () => ipcRenderer.invoke("ovo:updater:download-update"),
    installUpdate: () => ipcRenderer.invoke("ovo:updater:install-update"),
    onProgress: (listener: (progress: { percent: number; transferred: number; total?: number }) => void) => {
      const handler = (_event: unknown, progress: { percent: number; transferred: number; total?: number }) => {
        listener(progress);
      };
      ipcRenderer.on("ovo:updater:progress", handler);
      return () => ipcRenderer.removeListener("ovo:updater:progress", handler);
    }
  },
  auth: {
```

Keep the existing `auth`, `discovery`, `api`, and `file` objects unchanged after this insertion. The `version` field remains as a fallback for development tests; Task 3 will make the renderer prefer `updater.getCurrentVersion()`.

- [ ] **Step 5: Add updater types to renderer globals**

In `.worktrees/ui-shell/src/vite-env.d.ts`, add these types above `interface Window`:

```ts
type OvoUpdateProgress = {
  percent: number;
  transferred: number;
  total?: number;
};

type OvoUpdateInfo = {
  releaseId: number;
  tagName: string;
  version: string;
  installerName: string;
  installerUrl: string;
  latestYmlUrl: string;
  filePath?: string;
};

type OvoUpdateCheckResult =
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
      update: OvoUpdateInfo;
      message: string;
    }
  | {
      ok: false;
      status: "unsupported" | "error";
      currentVersion: string;
      message: string;
    };

type OvoUpdateDownloadResult = {
  ok: boolean;
  status: "downloaded" | "error";
  filePath?: string;
  message: string;
};
```

Then add `updater` inside `Window["ovoDesktop"]`:

```ts
    updater?: {
      getCurrentVersion: () => Promise<string>;
      checkForUpdates: () => Promise<OvoUpdateCheckResult>;
      downloadUpdate: () => Promise<OvoUpdateDownloadResult>;
      installUpdate: () => Promise<{ ok: boolean; message: string }>;
      onProgress: (listener: (progress: OvoUpdateProgress) => void) => () => void;
    };
```

- [ ] **Step 6: Run bridge tests and typecheck**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
npm test -- electron/mainLifecycle.test.ts electron/preloadBuild.test.ts
npm run build
```

Expected:

- Vitest passes.
- TypeScript and Vite build pass.

- [ ] **Step 7: Commit Electron bridge**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
git add electron/main.ts electron/mainLifecycle.test.ts electron/preload.cts electron/preloadBuild.test.ts src/vite-env.d.ts
git commit -m "feat: expose manual updater bridge"
```

Expected: commit succeeds.

## Task 3: Add Header Version Badge And Manual Update UI

**Files:**
- Create: `.worktrees/ui-shell/src/update/manualUpdateState.ts`
- Create: `.worktrees/ui-shell/src/update/manualUpdateState.test.ts`
- Modify: `.worktrees/ui-shell/src/components/AppHeader.tsx`
- Modify: `.worktrees/ui-shell/src/App.tsx`
- Modify: `.worktrees/ui-shell/src/App.test.tsx`
- Modify: `.worktrees/ui-shell/src/styles.css`

- [ ] **Step 1: Write failing reducer tests**

Create `.worktrees/ui-shell/src/update/manualUpdateState.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getManualUpdateButtonLabel, manualUpdateReducer, type ManualUpdateState } from "./manualUpdateState";

describe("manual update state", () => {
  it("labels every visible updater phase", () => {
    const states: Array<[ManualUpdateState, string]> = [
      [{ phase: "idle" }, "更新"],
      [{ phase: "checking" }, "检查中..."],
      [{ phase: "available", latestVersion: "0.1.2", message: "发现新版本 v0.1.2" }, "下载更新"],
      [{ phase: "downloading", percent: 45 }, "45%"],
      [{ phase: "downloaded", filePath: "C:/Temp/ovO.exe" }, "重启安装"],
      [{ phase: "latest", message: "当前已是最新版本 v0.1.1" }, "已是最新"],
      [{ phase: "error", message: "无法连接 Gitee，请检查网络或稍后重试" }, "更新失败"],
      [{ phase: "unsupported", message: "开发模式不检查更新" }, "开发模式"]
    ];

    for (const [state, label] of states) {
      expect(getManualUpdateButtonLabel(state)).toBe(label);
    }
  });

  it("transitions from checking to available when Gitee has a newer release", () => {
    const next = manualUpdateReducer(
      { phase: "checking" },
      {
        type: "check-result",
        result: {
          ok: true,
          status: "available",
          currentVersion: "0.1.1",
          latestVersion: "0.1.2",
          message: "发现新版本 v0.1.2",
          update: {
            releaseId: 7,
            tagName: "v0.1.2",
            version: "0.1.2",
            installerName: "ovO-0.1.2-x64-setup.exe",
            installerUrl: "https://gitee.com/setup.exe",
            latestYmlUrl: "https://gitee.com/latest.yml"
          }
        }
      }
    );

    expect(next).toEqual({
      phase: "available",
      latestVersion: "0.1.2",
      message: "发现新版本 v0.1.2"
    });
  });
});
```

- [ ] **Step 2: Run reducer tests to verify they fail**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
npm test -- src/update/manualUpdateState.test.ts
```

Expected: FAIL because `manualUpdateState.ts` does not exist.

- [ ] **Step 3: Implement reducer helpers**

Create `.worktrees/ui-shell/src/update/manualUpdateState.ts`:

```ts
export type ManualUpdateState =
  | { phase: "idle"; message?: string }
  | { phase: "checking"; message?: string }
  | { phase: "available"; latestVersion: string; message: string }
  | { phase: "downloading"; percent: number; message?: string }
  | { phase: "downloaded"; filePath: string; message?: string }
  | { phase: "latest"; message: string }
  | { phase: "unsupported"; message: string }
  | { phase: "error"; message: string };

type CheckResult =
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
      message: string;
      update?: unknown;
    }
  | {
      ok: false;
      status: "unsupported" | "error";
      currentVersion: string;
      message: string;
    };

export type ManualUpdateAction =
  | { type: "start-check" }
  | { type: "check-result"; result: CheckResult }
  | { type: "start-download" }
  | { type: "download-progress"; percent: number }
  | { type: "downloaded"; filePath: string; message?: string }
  | { type: "install-error"; message: string }
  | { type: "reset" };

export function manualUpdateReducer(_state: ManualUpdateState, action: ManualUpdateAction): ManualUpdateState {
  switch (action.type) {
    case "start-check":
      return { phase: "checking" };
    case "check-result":
      if (!action.result.ok) {
        return action.result.status === "unsupported"
          ? { phase: "unsupported", message: action.result.message }
          : { phase: "error", message: action.result.message };
      }

      if (action.result.status === "latest") {
        return { phase: "latest", message: action.result.message };
      }

      return {
        phase: "available",
        latestVersion: action.result.latestVersion,
        message: action.result.message
      };
    case "start-download":
      return { phase: "downloading", percent: 0 };
    case "download-progress":
      return { phase: "downloading", percent: action.percent };
    case "downloaded":
      return { phase: "downloaded", filePath: action.filePath, message: action.message };
    case "install-error":
      return { phase: "error", message: action.message };
    case "reset":
      return { phase: "idle" };
  }
}

export function getManualUpdateButtonLabel(state: ManualUpdateState) {
  switch (state.phase) {
    case "idle":
      return "更新";
    case "checking":
      return "检查中...";
    case "available":
      return "下载更新";
    case "downloading":
      return `${state.percent}%`;
    case "downloaded":
      return "重启安装";
    case "latest":
      return "已是最新";
    case "unsupported":
      return "开发模式";
    case "error":
      return "更新失败";
  }
}

export function isManualUpdateBusy(state: ManualUpdateState) {
  return state.phase === "checking" || state.phase === "downloading";
}
```

- [ ] **Step 4: Modify `AppHeader` props and layout**

In `.worktrees/ui-shell/src/components/AppHeader.tsx`, update the imports:

```ts
import { Coins, Download, LogOut, MousePointer2, RefreshCw, SquareCheck, UserRound, X } from "lucide-react";
import { getManualUpdateButtonLabel, isManualUpdateBusy, type ManualUpdateState } from "../update/manualUpdateState";
```

Add props:

```ts
  appVersion?: string;
  updateState?: ManualUpdateState;
  onUpdateClick?: () => void;
```

Destructure them with defaults:

```ts
  appVersion = "0.1.0",
  updateState = { phase: "idle" },
  onUpdateClick,
```

Inside the brand block, replace the subtitle span:

```tsx
        <span className="brand-version">v{appVersion}</span>
```

Between the credit pill and account button, insert:

```tsx
        <button
          type="button"
          className={`header-tool-button update-button update-button-${updateState.phase}`}
          aria-label="手动更新"
          title={updateState.message ?? "从 Gitee 检查更新"}
          onClick={onUpdateClick}
          disabled={isManualUpdateBusy(updateState)}
        >
          <RefreshCw size={16} />
          <span>{getManualUpdateButtonLabel(updateState)}</span>
        </button>
```

- [ ] **Step 5: Wire update state in `App.tsx`**

In `.worktrees/ui-shell/src/App.tsx`, update imports:

```ts
import { manualUpdateReducer, type ManualUpdateState } from "./update/manualUpdateState";
```

Add state near other `useState` calls:

```ts
  const [appVersion, setAppVersion] = useState(() => window.ovoDesktop?.version ?? "0.1.0");
  const [updateState, dispatchUpdate] = useReducer(manualUpdateReducer, { phase: "idle" } satisfies ManualUpdateState);
```

Change the first React import from:

```ts
import { useEffect, useMemo, useRef, useState } from "react";
```

to:

```ts
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
```

Add an effect after the cleanup effect:

```ts
  useEffect(() => {
    let cancelled = false;

    void window.ovoDesktop?.updater?.getCurrentVersion().then((version) => {
      if (!cancelled) {
        setAppVersion(version);
      }
    });

    const unsubscribe = window.ovoDesktop?.updater?.onProgress((progress) => {
      dispatchUpdate({ type: "download-progress", percent: progress.percent });
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);
```

Add this handler before the JSX return:

```ts
  async function handleManualUpdateClick() {
    const updater = window.ovoDesktop?.updater;
    if (!updater) {
      dispatchUpdate({ type: "check-result", result: { ok: false, status: "unsupported", currentVersion: appVersion, message: "开发模式不检查更新" } });
      return;
    }

    if (updateState.phase === "available") {
      dispatchUpdate({ type: "start-download" });
      const result = await updater.downloadUpdate();
      if (result.ok && result.filePath) {
        dispatchUpdate({ type: "downloaded", filePath: result.filePath, message: result.message });
        return;
      }

      dispatchUpdate({ type: "install-error", message: result.message });
      return;
    }

    if (updateState.phase === "downloaded") {
      const result = await updater.installUpdate();
      if (!result.ok) {
        dispatchUpdate({ type: "install-error", message: result.message });
      }
      return;
    }

    dispatchUpdate({ type: "start-check" });
    const result = await updater.checkForUpdates();
    dispatchUpdate({ type: "check-result", result });
  }
```

Pass props to `AppHeader`:

```tsx
        appVersion={appVersion}
        updateState={updateState}
        onUpdateClick={handleManualUpdateClick}
```

- [ ] **Step 6: Add UI tests**

In the existing `beforeEach` in `.worktrees/ui-shell/src/App.test.tsx`, add this line after `localStorage.clear();` so updater mocks do not leak between tests:

```ts
  window.ovoDesktop = undefined;
```

Then append to `.worktrees/ui-shell/src/App.test.tsx`:

```ts
  it("shows the app version beside the ovO logo and places update between credits and account", async () => {
    window.ovoDesktop = {
      version: "0.1.0",
      updater: {
        getCurrentVersion: vi.fn(async () => "0.1.7"),
        checkForUpdates: vi.fn(),
        downloadUpdate: vi.fn(),
        installUpdate: vi.fn(),
        onProgress: vi.fn(() => () => undefined)
      },
      auth: {
        openLoginWindow: vi.fn(),
        checkSession: vi.fn(),
        clearSession: vi.fn()
      },
      discovery: {
        inspectCanvas: vi.fn()
      },
      api: {
        request: vi.fn(),
        uploadFile: vi.fn()
      },
      file: {
        saveAsset: vi.fn()
      }
    };

    render(<App />);

    expect(await screen.findByText("v0.1.7")).toBeInTheDocument();
    const headerText = document.querySelector(".header-actions")?.textContent ?? "";
    expect(headerText.indexOf("--")).toBeLessThan(headerText.indexOf("更新"));
    expect(headerText.indexOf("更新")).toBeLessThan(headerText.indexOf("未登录"));
  });

  it("checks Gitee updates manually and switches to download state", async () => {
    const checkForUpdates = vi.fn(async () => ({
      ok: true,
      status: "available" as const,
      currentVersion: "0.1.1",
      latestVersion: "0.1.2",
      message: "发现新版本 v0.1.2",
      update: {
        releaseId: 7,
        tagName: "v0.1.2",
        version: "0.1.2",
        installerName: "ovO-0.1.2-x64-setup.exe",
        installerUrl: "https://gitee.com/setup.exe",
        latestYmlUrl: "https://gitee.com/latest.yml"
      }
    }));
    window.ovoDesktop = {
      version: "0.1.1",
      updater: {
        getCurrentVersion: vi.fn(async () => "0.1.1"),
        checkForUpdates,
        downloadUpdate: vi.fn(),
        installUpdate: vi.fn(),
        onProgress: vi.fn(() => () => undefined)
      },
      auth: {
        openLoginWindow: vi.fn(),
        checkSession: vi.fn(),
        clearSession: vi.fn()
      },
      discovery: {
        inspectCanvas: vi.fn()
      },
      api: {
        request: vi.fn(),
        uploadFile: vi.fn()
      },
      file: {
        saveAsset: vi.fn()
      }
    };

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "手动更新" }));

    expect(await screen.findByRole("button", { name: "手动更新" })).toHaveTextContent("下载更新");
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 7: Add CSS**

In `.worktrees/ui-shell/src/styles.css`, replace `.brand-subtitle,` selector with:

```css
.brand-version,
```

Replace `.brand-subtitle` rules if present with:

```css
.brand-version {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border: 1px solid #d7d4cc;
  border-radius: 999px;
  background: #ffffff;
  color: #68705f;
  font-size: 12px;
  font-weight: 700;
}
```

Add near `.header-tool-button`:

```css
.update-button {
  min-width: 92px;
}

.update-button-available,
.update-button-downloaded {
  border-color: #e24f57;
  color: #e24f57;
}

.update-button-error {
  border-color: #c2410c;
  color: #c2410c;
}
```

- [ ] **Step 8: Run UI tests**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
npm test -- src/update/manualUpdateState.test.ts src/App.test.tsx -t "manual update|app version|checks Gitee updates"
npm run build
```

Expected:

- New update state tests pass.
- New App tests pass.
- Build passes.

- [ ] **Step 9: Commit UI work**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
git add src/update/manualUpdateState.ts src/update/manualUpdateState.test.ts src/components/AppHeader.tsx src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: add manual update header control"
```

Expected: commit succeeds.

## Task 4: Add Gitee-Only Patch Release Script

**Files:**
- Create: `.worktrees/ui-shell/scripts/releasePatchCore.mjs`
- Create: `.worktrees/ui-shell/scripts/releasePatchCore.test.mjs`
- Create: `.worktrees/ui-shell/scripts/release-patch.mjs`
- Modify: `.worktrees/ui-shell/package.json`

- [ ] **Step 1: Write failing release helper tests**

Create `.worktrees/ui-shell/scripts/releasePatchCore.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import {
  bumpPatchVersion,
  findReleaseAssets,
  giteeApiPath,
  validateCleanStatus,
  validateGiteeOnlyRemote
} from "./releasePatchCore.mjs";

describe("release patch core", () => {
  it("bumps patch versions", () => {
    expect(bumpPatchVersion("0.1.0")).toBe("0.1.1");
    expect(bumpPatchVersion("1.2.9")).toBe("1.2.10");
  });

  it("refuses dirty worktrees", () => {
    expect(() => validateCleanStatus(" M src/App.tsx\n")).toThrow("发布前工作区必须干净");
    expect(() => validateCleanStatus("")).not.toThrow();
  });

  it("validates the gitee remote and ignores github remotes", () => {
    const remotes = [
      "gitee\tgit@gitee.com:siberian-aries/ov-o_create_video_platform.git (fetch)",
      "gitee\tgit@gitee.com:siberian-aries/ov-o_create_video_platform.git (push)",
      "origin\tgit@github.com:LiuMingXu888/ovO_create_video_platform.git (push)"
    ].join("\n");

    expect(validateGiteeOnlyRemote(remotes)).toBe("git@gitee.com:siberian-aries/ov-o_create_video_platform.git");
  });

  it("builds Gitee OpenAPI paths", () => {
    expect(giteeApiPath("/releases")).toBe(
      "https://gitee.com/api/v5/repos/siberian-aries/ov-o_create_video_platform/releases"
    );
  });

  it("finds the installer and latest.yml artifacts", () => {
    const assets = findReleaseAssets(["release/windows/ovO-0.1.2-x64-setup.exe", "release/windows/latest.yml"]);

    expect(assets.installerPath).toBe("release/windows/ovO-0.1.2-x64-setup.exe");
    expect(assets.latestYmlPath).toBe("release/windows/latest.yml");
  });
});
```

- [ ] **Step 2: Run release helper tests to verify they fail**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
npm test -- scripts/releasePatchCore.test.mjs
```

Expected: FAIL because `releasePatchCore.mjs` does not exist.

- [ ] **Step 3: Implement release helper core**

Create `.worktrees/ui-shell/scripts/releasePatchCore.mjs`:

```js
export const GITEE_OWNER = "siberian-aries";
export const GITEE_REPO = "ov-o_create_video_platform";
export const GITEE_REMOTE_URL = "git@gitee.com:siberian-aries/ov-o_create_video_platform.git";

export function bumpPatchVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`版本号格式不正确：${version}`);
  }

  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

export function validateCleanStatus(status) {
  if (status.trim()) {
    throw new Error("发布前工作区必须干净");
  }
}

export function validateGiteeOnlyRemote(remoteOutput) {
  const giteePushLine = remoteOutput
    .split("\n")
    .find((line) => line.startsWith("gitee\t") && line.includes("(push)"));

  if (!giteePushLine) {
    throw new Error("缺少 gitee push 远端");
  }

  const remoteUrl = giteePushLine.split(/\s+/)[1];
  if (remoteUrl !== GITEE_REMOTE_URL) {
    throw new Error(`gitee 远端地址不正确：${remoteUrl}`);
  }

  return remoteUrl;
}

export function giteeApiPath(pathname) {
  return `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}${pathname}`;
}

export function findReleaseAssets(paths) {
  const installerPath = paths.find((filePath) => /release\/windows\/ovO-\d+\.\d+\.\d+-x64-setup\.exe$/.test(filePath));
  const latestYmlPath = paths.find((filePath) => filePath === "release/windows/latest.yml");

  if (!installerPath || !latestYmlPath) {
    throw new Error("缺少 Windows 更新产物");
  }

  return { installerPath, latestYmlPath };
}
```

- [ ] **Step 4: Implement release script**

Create `.worktrees/ui-shell/scripts/release-patch.mjs`:

```js
#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bumpPatchVersion,
  findReleaseAssets,
  giteeApiPath,
  validateCleanStatus,
  validateGiteeOnlyRemote
} from "./releasePatchCore.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const skipBuild = process.argv.includes("--skip-build");
const token = process.env.GITEE_ACCESS_TOKEN;

run();

async function run() {
  validateCleanStatus(git(["status", "--short"]));
  validateGiteeOnlyRemote(git(["remote", "-v"]));

  if (!token && !dryRun) {
    throw new Error("缺少 GITEE_ACCESS_TOKEN，无法创建 Gitee Release");
  }

  const packagePath = path.join(repoRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const nextVersion = bumpPatchVersion(packageJson.version);
  log(`准备发布 v${nextVersion}`);

  command("npm", ["version", nextVersion, "--no-git-tag-version"]);

  if (!skipBuild) {
    command("npm", ["run", "dist:win:installer"]);
  }

  const releaseFiles = listReleaseFiles();
  const assets = findReleaseAssets(releaseFiles);
  const tagName = `v${nextVersion}`;

  if (dryRun) {
    log(`dry-run: would commit, tag, push gitee, and upload ${assets.installerPath}, ${assets.latestYmlPath}`);
    return;
  }

  git(["add", "package.json", "package-lock.json"]);
  git(["commit", "-m", `chore: release ${tagName}`]);
  git(["tag", tagName]);
  git(["push", "gitee", "main"]);
  git(["push", "gitee", tagName]);

  const release = await createRelease(tagName);
  await uploadAttachFile(release.id, assets.latestYmlPath);
  await uploadAttachFile(release.id, assets.installerPath);

  log(`已发布 ${tagName} 到 Gitee Release`);
}

function git(args) {
  return command("git", args);
}

function command(commandName, args) {
  const output = execFileSync(commandName, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return output;
}

function listReleaseFiles() {
  const releaseDir = path.join(repoRoot, "release", "windows");
  if (!fs.existsSync(releaseDir)) {
    return [];
  }

  return fs.readdirSync(releaseDir).map((name) => `release/windows/${name}`);
}

async function createRelease(tagName) {
  const form = new FormData();
  form.set("access_token", token);
  form.set("tag_name", tagName);
  form.set("name", tagName);
  form.set("body", `ovO ${tagName}`);
  form.set("target_commitish", "main");
  form.set("prerelease", "false");

  const response = await fetch(giteeApiPath("/releases"), {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    throw new Error(`创建 Gitee Release 失败：${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function uploadAttachFile(releaseId, relativePath) {
  const form = new FormData();
  form.set("access_token", token);
  form.set("file", new Blob([fs.readFileSync(path.join(repoRoot, relativePath))]), path.basename(relativePath));

  const response = await fetch(giteeApiPath(`/releases/${releaseId}/attach_files`), {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    throw new Error(`上传 ${relativePath} 失败：${response.status} ${await response.text()}`);
  }
}

function log(message) {
  console.log(message);
}
```

- [ ] **Step 5: Add package script**

In `.worktrees/ui-shell/package.json`, add:

```json
"release:patch": "node scripts/release-patch.mjs"
```

Keep existing Windows build scripts unchanged.

- [ ] **Step 6: Run release helper tests and dry-run**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
npm test -- scripts/releasePatchCore.test.mjs
node scripts/release-patch.mjs --dry-run --skip-build
```

Expected:

- Tests pass.
- Dry run either succeeds if the worktree is clean or prints `发布前工作区必须干净` if uncommitted implementation changes remain. After committing Task 4 files, rerun dry-run and expect success.

- [ ] **Step 7: Commit release script**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
git add scripts/releasePatchCore.mjs scripts/releasePatchCore.test.mjs scripts/release-patch.mjs package.json
git commit -m "feat: add gitee patch release script"
```

Expected: commit succeeds.

## Task 5: Final Integration Verification And Gitee Sync

**Files:**
- Read: `.worktrees/ui-shell/docs/windows-usage.md`
- Modify only if useful: `.worktrees/ui-shell/docs/windows-usage.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
npm test -- electron/giteeReleaseUpdater.test.ts electron/mainLifecycle.test.ts electron/preloadBuild.test.ts src/update/manualUpdateState.test.ts scripts/releasePatchCore.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full test suite**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
npm test
```

Expected: all Vitest tests pass.

- [ ] **Step 3: Run production build**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 4: Run release dry-run from a clean worktree**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
node scripts/release-patch.mjs --dry-run --skip-build
```

Expected: dry run reports it would commit, tag, push `gitee`, and upload `latest.yml` plus the setup installer. It must not mention pushing `origin` or GitHub.

- [ ] **Step 5: Verify remotes**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
git remote -v
```

Expected:

```text
gitee  git@gitee.com:siberian-aries/ov-o_create_video_platform.git (fetch)
gitee  git@gitee.com:siberian-aries/ov-o_create_video_platform.git (push)
origin ...
```

The release script uses only `gitee`, even if `origin` exists.

- [ ] **Step 6: Optional Windows package smoke build**

Run when a Windows-capable builder is available:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
npm run dist:win:installer
```

Expected:

- `release/windows/latest.yml` exists.
- `release/windows/ovO-<version>-x64-setup.exe` exists.

- [ ] **Step 7: Commit any docs update**

If `docs/windows-usage.md` was updated, run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
git add docs/windows-usage.md
git commit -m "docs: document gitee manual updates"
```

Expected: commit succeeds only if docs changed.

- [ ] **Step 8: Push implementation branch to Gitee**

Run:

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
git push gitee feature/ui-shell
```

Expected: the implementation branch is on Gitee. Do not push GitHub.

## Manual Acceptance Checklist

- Header shows `ovO vX.Y.Z`.
- Update button is between the credit pill and account button.
- In development mode, clicking update shows or reports `开发模式不检查更新`.
- Packaged Windows app checks Gitee Release only.
- Missing Gitee Release or missing attachments surfaces `更新包不完整`.
- New release downloads the NSIS setup installer.
- Clicking `重启安装` launches the installer and quits the app after launch.
- Release script bumps patch version and pushes only to `gitee`.
- Windows users never need GitHub, Git, Node, npm, or a source checkout.
