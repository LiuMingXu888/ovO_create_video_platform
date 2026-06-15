import { app, BrowserWindow, session } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { summarizeCapture, type SanitizedApiSummary } from "./apiDiscovery.js";
import {
  checkCompanySession,
  COMPANY_ORIGIN,
  COMPANY_SESSION_PARTITION,
  TARGET_CANVAS_URL,
  type CompanySessionResult
} from "./companySessionClient.js";
import { createStoragePaths } from "./storagePaths.js";

const LOGIN_POLL_INTERVAL_MS = 2000;
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export interface InspectCanvasResult {
  ok: boolean;
  message?: string;
  summaries?: SanitizedApiSummary[];
  sanitizedMapPath?: string;
}

export function getStoragePaths() {
  return createStoragePaths(path.join(app.getPath("userData"), "storage"));
}

function getCompanySession() {
  return session.fromPartition(COMPANY_SESSION_PARTITION);
}

function fetchWithCompanySession(url: string, init?: RequestInit) {
  return getCompanySession().fetch(url, {
    ...init,
    credentials: "include"
  });
}

export async function openLoginWindow(): Promise<CompanySessionResult> {
  const loginWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    title: "登录公司账号",
    webPreferences: {
      partition: COMPANY_SESSION_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  await loginWindow.loadURL(COMPANY_ORIGIN);

  return new Promise((resolve) => {
    let resolved = false;
    let pollTimer: NodeJS.Timeout | undefined;

    function finish(result: CompanySessionResult) {
      if (resolved) {
        return;
      }

      resolved = true;
      clearTimeout(timeout);
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
      resolve(result);
    }

    async function pollSession() {
      const result = await checkSession();
      if (result.ok) {
        finish(result);
        return;
      }

      if (!loginWindow.isDestroyed()) {
        pollTimer = setTimeout(() => {
          void pollSession();
        }, LOGIN_POLL_INTERVAL_MS);
      }
    }

    const timeout = setTimeout(() => {
      if (!resolved) {
        finish({ ok: false, message: "登录窗口已打开，请登录后点击检查登录态" });
      }
    }, LOGIN_TIMEOUT_MS);

    loginWindow.on("closed", () => {
      finish({ ok: false, message: "登录窗口已关闭" });
    });

    void pollSession();
  });
}

export async function checkSession(): Promise<CompanySessionResult> {
  return checkCompanySession(fetchWithCompanySession);
}

export async function clearSession(): Promise<CompanySessionResult> {
  const paths = getStoragePaths();
  const companySession = getCompanySession();
  await companySession.clearStorageData({
    origin: COMPANY_ORIGIN,
    storages: ["cookies", "filesystem", "indexdb", "localstorage", "serviceworkers", "cachestorage"]
  });
  await companySession.clearCache();
  await fs.rm(paths.authDir, { recursive: true, force: true });
  return { ok: true };
}

export async function inspectCanvas(canvasUrl = TARGET_CANVAS_URL): Promise<InspectCanvasResult> {
  const paths = getStoragePaths();
  await fs.mkdir(paths.capturesDir, { recursive: true });

  const captures = [
    {
      method: "GET",
      url: `${COMPANY_ORIGIN}/api/auth/me`
    },
    {
      method: "GET",
      url: `${COMPANY_ORIGIN}/api/projects/${encodeURIComponent(projectIdFromCanvasUrl(canvasUrl))}/snapshot`
    }
  ].map(summarizeCapture);

  await fs.writeFile(paths.sanitizedApiMapPath, JSON.stringify({ capturedAt: new Date().toISOString(), captures }, null, 2));

  return {
    ok: true,
    summaries: captures,
    sanitizedMapPath: paths.sanitizedApiMapPath
  };
}

function projectIdFromCanvasUrl(canvasUrl: string) {
  const url = new URL(canvasUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  const canvasIndex = parts.indexOf("canvas");
  const projectId = canvasIndex >= 0 ? parts[canvasIndex + 1] : undefined;
  if (!projectId) {
    throw new Error("画布地址无效");
  }
  return projectId;
}
