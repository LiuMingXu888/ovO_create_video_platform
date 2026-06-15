import { app, BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { summarizeCapture, type SanitizedApiSummary } from "./apiDiscovery.js";
import { createStoragePaths } from "./storagePaths.js";

const COMPANY_ORIGIN = "http://qijing.kjjhz.cn";
const TARGET_CANVAS_URL = "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x";

export interface CompanySessionResult {
  ok: boolean;
  message?: string;
  user?: unknown;
}

export interface InspectCanvasResult {
  ok: boolean;
  message?: string;
  summaries?: SanitizedApiSummary[];
  sanitizedMapPath?: string;
}

export function getStoragePaths() {
  return createStoragePaths(path.join(app.getPath("userData"), "storage"));
}

export async function openLoginWindow(): Promise<CompanySessionResult> {
  const loginWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    title: "登录公司账号",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  await loginWindow.loadURL(COMPANY_ORIGIN);

  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ ok: false, message: "登录窗口已打开，请登录后点击检查登录态" });
      }
    }, 3000);

    loginWindow.on("closed", () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve({ ok: false, message: "登录窗口已关闭" });
      }
    });
  });
}

export async function checkSession(): Promise<CompanySessionResult> {
  try {
    const response = await fetch(`${COMPANY_ORIGIN}/api/auth/me`, {
      credentials: "include",
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      return { ok: false, message: `登录态无效：${response.status}` };
    }

    const user = await response.json();
    return { ok: true, user };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "检查登录态失败" };
  }
}

export async function clearSession(): Promise<CompanySessionResult> {
  const paths = getStoragePaths();
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
