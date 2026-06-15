import { app, BrowserView, BrowserWindow, clipboard, ipcMain, session } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { summarizeCapture, type SanitizedApiSummary } from "./apiDiscovery.js";
import {
  checkCompanySession,
  COMPANY_ORIGIN,
  COMPANY_SESSION_PARTITION,
  TARGET_CANVAS_URL,
  validateCompanyApiPath,
  type CompanySessionResult
} from "./companySessionClient.js";
import { createStoragePaths } from "./storagePaths.js";

const LOGIN_POLL_INTERVAL_MS = 2000;
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const LOGIN_TOOLBAR_HEIGHT = 48;

export interface InspectCanvasResult {
  ok: boolean;
  message?: string;
  summaries?: SanitizedApiSummary[];
  sanitizedMapPath?: string;
}

export interface CompanyApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

export interface CompanyApiRequestResult {
  ok: boolean;
  status: number;
  data?: unknown;
  message?: string;
}

export interface CompanyUploadInput {
  fileName: string;
  mimeType?: string;
  bytes: ArrayBuffer;
  prefix: string;
  projectId?: string;
}

export interface SaveAssetInput {
  url: string;
  fileName: string;
}

export interface SaveAssetsInput {
  assets: SaveAssetInput[];
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

function createLoginToolbarUrl(initialUrl: string, actionChannel: string, urlChannel: string) {
  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #f4f5f7;
        color: #1f2937;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .bar {
        display: grid;
        grid-template-columns: 32px 32px minmax(0, 1fr) 66px 42px;
        gap: 6px;
        align-items: center;
        height: 48px;
        padding: 7px 10px;
        border-bottom: 1px solid #d9dde5;
      }
      button, input {
        height: 32px;
        border: 1px solid #cfd5df;
        border-radius: 7px;
        background: #fff;
        color: #1f2937;
        font-size: 13px;
      }
      button { cursor: pointer; }
      input {
        min-width: 0;
        padding: 0 10px;
        outline: none;
      }
    </style>
  </head>
  <body>
    <div class="bar">
      <button type="button" data-action="back" title="后退">←</button>
      <button type="button" data-action="forward" title="前进">→</button>
      <input id="address" readonly value="${escapeHtml(initialUrl)}" aria-label="当前网址" />
      <button type="button" data-action="copy" title="复制当前网址">复制</button>
      <button type="button" data-action="reload" title="刷新">↻</button>
    </div>
    <script>
      const { ipcRenderer } = require("electron");
      const address = document.getElementById("address");
      document.querySelectorAll("button[data-action]").forEach((button) => {
        button.addEventListener("click", () => ipcRenderer.send(${JSON.stringify(actionChannel)}, button.dataset.action));
      });
      address.addEventListener("click", () => address.select());
      ipcRenderer.on(${JSON.stringify(urlChannel)}, (_event, url) => {
        address.value = url || "";
      });
    </script>
  </body>
</html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function openLoginWindow(): Promise<CompanySessionResult> {
  const loginWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    title: "登录公司账号",
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true
    }
  });
  const loginView = new BrowserView({
    webPreferences: {
      partition: COMPANY_SESSION_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const actionChannel = `ovo:login-window:${loginWindow.id}:action`;
  const urlChannel = `ovo:login-window:${loginWindow.id}:url`;

  function resizeLoginView() {
    if (loginWindow.isDestroyed()) {
      return;
    }

    const [width, height] = loginWindow.getContentSize();
    loginView.setBounds({
      x: 0,
      y: LOGIN_TOOLBAR_HEIGHT,
      width,
      height: Math.max(0, height - LOGIN_TOOLBAR_HEIGHT)
    });
  }

  function updateToolbarUrl() {
    if (loginWindow.isDestroyed()) {
      return;
    }

    loginWindow.webContents.send(urlChannel, loginView.webContents.getURL());
  }

  ipcMain.on(actionChannel, (_event, action: string) => {
    if (action === "back" && loginView.webContents.canGoBack()) {
      loginView.webContents.goBack();
      return;
    }

    if (action === "forward" && loginView.webContents.canGoForward()) {
      loginView.webContents.goForward();
      return;
    }

    if (action === "reload") {
      loginView.webContents.reload();
      return;
    }

    if (action === "copy") {
      clipboard.writeText(loginView.webContents.getURL());
    }
  });

  loginWindow.setBrowserView(loginView);
  loginWindow.on("resize", resizeLoginView);
  loginWindow.on("maximize", resizeLoginView);
  loginWindow.on("unmaximize", resizeLoginView);
  loginView.webContents.on("did-navigate", updateToolbarUrl);
  loginView.webContents.on("did-navigate-in-page", updateToolbarUrl);
  loginView.webContents.on("did-start-navigation", updateToolbarUrl);

  resizeLoginView();
  await loginWindow.loadURL(createLoginToolbarUrl(COMPANY_ORIGIN, actionChannel, urlChannel));
  await loginView.webContents.loadURL(COMPANY_ORIGIN);
  updateToolbarUrl();

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
      ipcMain.removeAllListeners(actionChannel);
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

export async function requestCompanyApi(pathname: string, options: CompanyApiRequestOptions = {}): Promise<CompanyApiRequestResult> {
  const validation = validateCompanyApiPath(pathname);
  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      message: validation.message
    };
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    ...options.headers
  };
  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    headers
  };

  if (options.body !== undefined) {
    headers["content-type"] = headers["content-type"] ?? "application/json";
    requestInit.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetchWithCompanySession(`${COMPANY_ORIGIN}${pathname}`, requestInit);
    const data = await safeJson(response);

    return {
      ok: response.ok,
      status: response.status,
      data,
      message: response.ok ? undefined : getResponseMessage(data, response.status)
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : "公司接口请求失败"
    };
  }
}

export async function uploadCompanyFile(pathname: string, input: CompanyUploadInput): Promise<CompanyApiRequestResult> {
  const validation = validateCompanyApiPath(pathname);
  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      message: validation.message
    };
  }

  try {
    const formData = new FormData();
    const blob = new Blob([input.bytes], { type: input.mimeType || "application/octet-stream" });
    formData.append("file", blob, input.fileName);
    formData.append("prefix", input.prefix);

    if (input.projectId) {
      formData.append("projectId", input.projectId);
    }

    const response = await fetchWithCompanySession(`${COMPANY_ORIGIN}${pathname}`, {
      method: "POST",
      body: formData,
      headers: {
        accept: "application/json"
      }
    });
    const data = await safeJson(response);

    return {
      ok: response.ok,
      status: response.status,
      data,
      message: response.ok ? undefined : getResponseMessage(data, response.status)
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : "公司文件上传失败"
    };
  }
}

export async function saveAssetToDownloads(input: SaveAssetInput) {
  const fileName = sanitizeFileName(input.fileName);
  const destinationPath = path.join(app.getPath("downloads"), fileName);

  try {
    const response = await fetchWithCompanySession(input.url);
    if (!response.ok) {
      return {
        ok: false,
        message: `下载失败 (${response.status})`
      };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(destinationPath, bytes);

    return {
      ok: true,
      path: destinationPath
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "保存下载文件失败"
    };
  }
}

export async function saveAssetsToDownloads(input: SaveAssetsInput) {
  const directoryName = createTimestampFolderName(new Date());
  const directoryPath = path.join(app.getPath("downloads"), directoryName);

  try {
    await fs.mkdir(directoryPath, { recursive: true });

    for (const asset of input.assets) {
      const response = await fetchWithCompanySession(asset.url);
      if (!response.ok) {
        return {
          ok: false,
          message: `下载 ${asset.fileName} 失败 (${response.status})`
        };
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(path.join(directoryPath, sanitizeFileName(asset.fileName)), bytes);
    }

    return {
      ok: true,
      directoryPath
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "批量保存下载文件失败"
    };
  }
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

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getResponseMessage(data: unknown, status: number) {
  if (typeof data === "object" && data !== null) {
    const record = data as Record<string, unknown>;
    const message = record.error ?? record.message ?? record.errorDetail;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return `请求失败 (${status})`;
}

function sanitizeFileName(fileName: string) {
  const trimmed = fileName.trim() || "asset";
  return trimmed.replace(/[/:*?"<>|]/g, "_");
}

function createTimestampFolderName(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes()
  )}${pad(date.getSeconds())}`;
}
