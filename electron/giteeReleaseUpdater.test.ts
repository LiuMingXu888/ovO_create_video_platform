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

type FetchInput = Parameters<typeof fetch>[0];

function fetchInputHref(input: FetchInput) {
  return input instanceof Request ? input.url : String(input);
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
    const fetcher: typeof fetch = vi.fn(async (input: FetchInput) => {
      const url = fetchInputHref(input);
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

  it("clears stale available update state when a later check finds no update", async () => {
    let latestVersion = "v0.1.2";
    const fetcher: typeof fetch = vi.fn(async (input: FetchInput) => {
      const url = fetchInputHref(input);
      if (url.includes("/releases/latest")) {
        return jsonResponse({ id: 7, tag_name: latestVersion, name: latestVersion });
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
      status: "available"
    });

    latestVersion = "v0.1.1";
    await expect(updater.checkForUpdates()).resolves.toMatchObject({
      ok: true,
      status: "latest"
    });
    await expect(updater.downloadUpdate()).resolves.toEqual({
      ok: false,
      status: "error",
      message: "请先检查更新"
    });
  });

  it("returns available update info with Gitee attachment download URLs", async () => {
    const fetcher: typeof fetch = vi.fn(async (input: FetchInput) => {
      const url = fetchInputHref(input);
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
    const fetcher: typeof fetch = vi.fn(async (input: FetchInput) => {
      const url = fetchInputHref(input);
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

    await expect(updater.checkForUpdates()).resolves.toMatchObject({
      ok: false,
      status: "error",
      currentVersion: "0.1.1",
      message: "更新包不完整"
    });
  });

  it("surfaces the original error detail on check failure", async () => {
    const updater = createGiteeReleaseUpdater({
      currentVersion: "0.1.1",
      isPackaged: true,
      platform: "win32",
      fetcher: (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch
    });
    const result = await updater.checkForUpdates();
    expect(result.ok).toBe(false);
    if (!result.ok && result.status === "error") {
      expect(result.message).toContain("Gitee");
      expect(result.detail).toContain("503");
    } else {
      throw new Error("expected error result");
    }
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
    const fetcher: typeof fetch = vi.fn(async (input: FetchInput) => {
      const url = fetchInputHref(input);
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

  it("opens the downloaded installer and quits after launching it", async () => {
    vi.useFakeTimers();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ovo-updater-install-test-"));
    const openPath = vi.fn(async () => "");
    const quit = vi.fn();
    const fetcher: typeof fetch = vi.fn(async () => {
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
            controller.close();
          }
        }),
        {
          headers: { "content-length": "1" }
        }
      );
    });
    const updater = createGiteeReleaseUpdater({
      currentVersion: "0.1.1",
      fetcher,
      isPackaged: true,
      platform: "win32",
      tempRoot,
      openPath,
      quit
    });
    const update = {
      releaseId: 7,
      tagName: "v0.1.2",
      version: "0.1.2",
      installerName: "ovO-0.1.2-x64-setup.exe",
      installerUrl: "https://gitee.com/setup.exe",
      latestYmlUrl: "https://gitee.com/latest.yml"
    };

    const downloadResult = await updater.downloadUpdate(update);
    const installResult = await updater.installUpdate();

    expect(downloadResult.ok).toBe(true);
    expect(openPath).toHaveBeenCalledWith(path.join(tempRoot, "0.1.2", "ovO-0.1.2-x64-setup.exe"));
    expect(installResult).toEqual({
      ok: true,
      message: "正在启动安装程序"
    });
    expect(quit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(quit).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
