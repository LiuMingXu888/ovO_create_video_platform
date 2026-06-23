import { app, BrowserView, BrowserWindow, clipboard, ipcMain, session } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { summarizeCapture, type RawApiCapture, type SanitizedApiSummary } from "./apiDiscovery.js";
import {
  checkCompanySession,
  COMPANY_ORIGIN,
  COMPANY_SESSION_PARTITION,
  normalizeCompanyWindowUrl,
  TARGET_CANVAS_URL,
  validateCompanyApiPath,
  type CompanySessionResult
} from "./companySessionClient.js";
import { createCategorizedDownloadPlan, createDownloadFolderName, sanitizePathPart, type SaveAssetInput } from "./downloadPaths.js";
import { createStoragePaths } from "./storagePaths.js";

const LOGIN_POLL_INTERVAL_MS = 2000;
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const LOGIN_TOOLBAR_HEIGHT = 48;

export interface InspectCanvasResult {
  ok: boolean;
  message?: string;
  summaries?: SanitizedApiSummary[];
  sanitizedMapPath?: string;
  rawCapturePath?: string;
}

interface PendingCapture {
  method: string;
  url: string;
  requestBody?: unknown;
  status?: number;
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

interface ApiCaptureHandle {
  detach: () => void;
  rawCapturePath: string;
  getSummaries: () => SanitizedApiSummary[];
  getCaptures: () => RawApiCapture[];
}

function parseMaybeJson(text: string | undefined): unknown {
  if (text === undefined || text === "") {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Attaches the Chrome DevTools Protocol Network domain to the company page's
// webContents and persists every captured /api/* call — including the full
// request and RESPONSE bodies — to the on-disk storage paths (captures/ +
// sanitized map). The older session.webRequest listener could only see
// status/headers, never the response body, which is why diagnosis files used to
// record requests with no response content. CDP's Network.getResponseBody is the
// only reliable way to read response bodies in Electron.
//
// NOTE: a webContents can host only ONE debugger client at a time, so attaching
// here is mutually exclusive with an open DevTools window on the same page. We
// prioritise capture: callers should not auto-open DevTools on the captured page.
async function attachApiCapture(webContents: Electron.WebContents): Promise<ApiCaptureHandle> {
  const paths = getStoragePaths();
  await fs.mkdir(paths.capturesDir, { recursive: true });
  const captures: RawApiCapture[] = [];
  const pending = new Map<string, PendingCapture>();
  const rawCapturePath = path.join(paths.capturesDir, `capture-${createTimestampFolderName(new Date())}.json`);

  let attached = false;
  try {
    webContents.debugger.attach("1.3");
    attached = true;
  } catch (error) {
    console.warn("[接口诊断] 无法挂载调试器（可能 DevTools 已打开），将无法记录响应内容：", error);
  }

  const messageListener = (_event: Electron.Event, method: string, params: Record<string, unknown>) => {
    void handleDebuggerMessage(method, params);
  };

  async function handleDebuggerMessage(method: string, params: Record<string, unknown>) {
    if (method === "Network.requestWillBeSent") {
      const request = params.request as { url?: string; method?: string; postData?: string } | undefined;
      const requestId = params.requestId as string | undefined;
      if (!requestId || !request?.url || !isCompanyApiUrl(request.url)) {
        return;
      }
      pending.set(requestId, {
        method: request.method ?? "GET",
        url: request.url,
        requestBody: parseMaybeJson(request.postData)
      });
      return;
    }

    if (method === "Network.responseReceived") {
      const requestId = params.requestId as string | undefined;
      const response = params.response as { status?: number } | undefined;
      if (!requestId) {
        return;
      }
      const entry = pending.get(requestId);
      if (entry) {
        entry.status = response?.status;
      }
      return;
    }

    if (method === "Network.loadingFinished" || method === "Network.loadingFailed") {
      const requestId = params.requestId as string | undefined;
      if (!requestId) {
        return;
      }
      const entry = pending.get(requestId);
      if (!entry) {
        return;
      }
      pending.delete(requestId);

      let responseBody: unknown;
      try {
        const result = (await webContents.debugger.sendCommand("Network.getResponseBody", { requestId })) as {
          body?: string;
          base64Encoded?: boolean;
        };
        if (result.base64Encoded) {
          responseBody = { "[binary-base64]": result.body ?? "" };
        } else {
          responseBody = parseMaybeJson(result.body);
        }
      } catch {
        // 204 / redirects / aborted requests have no retrievable body — record the call anyway.
        responseBody = undefined;
      }

      captures.push({
        method: entry.method,
        url: entry.url,
        status: entry.status,
        requestBody: entry.requestBody,
        responseBody
      });
      void persistCurrentCaptures();
    }
  }

  if (attached) {
    webContents.debugger.on("message", messageListener);
    try {
      await webContents.debugger.sendCommand("Network.enable");
    } catch (error) {
      console.warn("[接口诊断] 启用 Network 域失败：", error);
    }
  }

  async function persistCurrentCaptures() {
    const capturedAt = new Date().toISOString();
    await fs.writeFile(rawCapturePath, JSON.stringify({ capturedAt, captures }, null, 2));
    await fs.writeFile(paths.sanitizedApiMapPath, JSON.stringify({ capturedAt, captures: captures.map(summarizeCapture) }, null, 2));
  }

  return {
    detach() {
      if (!attached) {
        return;
      }
      try {
        webContents.debugger.off("message", messageListener);
        if (webContents.debugger.isAttached()) {
          webContents.debugger.detach();
        }
      } catch {
        // already detached (e.g. DevTools took over the slot)
      }
    },
    rawCapturePath,
    getSummaries: () => captures.map(summarizeCapture),
    getCaptures: () => captures
  };
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
        grid-template-columns: 32px 32px minmax(0, 1fr) 52px 66px 42px;
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
      <input id="address" value="${escapeHtml(initialUrl)}" placeholder="粘贴要查看的分享链接，回车前往" aria-label="当前网址" />
      <button type="button" data-action="go" title="前往输入的网址">前往</button>
      <button type="button" data-action="copy" title="复制当前网址">复制</button>
      <button type="button" data-action="reload" title="刷新">↻</button>
    </div>
    <script>
      const { ipcRenderer } = require("electron");
      const address = document.getElementById("address");
      function sendGo() {
        const value = address.value.trim();
        if (value) {
          ipcRenderer.send(${JSON.stringify(actionChannel)}, "go:" + value);
        }
      }
      document.querySelectorAll("button[data-action]").forEach((button) => {
        button.addEventListener("click", () => {
          if (button.dataset.action === "go") {
            sendGo();
            return;
          }
          ipcRenderer.send(${JSON.stringify(actionChannel)}, button.dataset.action);
        });
      });
      address.addEventListener("focus", () => address.select());
      address.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          sendGo();
        }
      });
      ipcRenderer.on(${JSON.stringify(urlChannel)}, (_event, url) => {
        if (document.activeElement !== address) {
          address.value = url || "";
        }
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

export async function openLoginWindow(targetUrl = COMPANY_ORIGIN): Promise<CompanySessionResult> {
  const initialUrl = normalizeCompanyWindowUrl(targetUrl);
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

    if (action.startsWith("go:")) {
      const target = normalizeCompanyWindowUrl(action.slice(3));
      void loginView.webContents.loadURL(target).catch(() => undefined);
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

  // 接口诊断 is now folded into the login window: record every /api/* call —
  // including full request and response bodies — to the same on-disk storage
  // paths via the CDP Network domain. The debugger and an open DevTools window
  // are mutually exclusive on one page, so we no longer auto-open DevTools here:
  // capturing the response bodies is the whole point of this window.
  const apiCapture = await attachApiCapture(loginView.webContents);

  resizeLoginView();
  await loginWindow.loadURL(createLoginToolbarUrl(initialUrl, actionChannel, urlChannel));
  await loginView.webContents.loadURL(initialUrl);
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
      apiCapture.detach();
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
  const fileName = sanitizePathPart(input.fileName);
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
  const directoryName = createDownloadFolderName(new Date());
  const plan = createCategorizedDownloadPlan({
    downloadsPath: app.getPath("downloads"),
    timestampFolderName: directoryName,
    assets: input.assets
  });

  try {
    await fs.mkdir(plan.directoryPath, { recursive: true });

    for (const item of plan.items) {
      const response = await fetchWithCompanySession(item.url);
      if (!response.ok) {
        return {
          ok: false,
          message: `下载 ${item.fileName} 失败 (${response.status})`
        };
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      await fs.mkdir(item.categoryDirectoryPath, { recursive: true });
      await fs.writeFile(item.destinationPath, bytes);
    }

    return {
      ok: true,
      directoryPath: plan.directoryPath
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
  const initialUrl = normalizeCompanyWindowUrl(canvasUrl);
  const inspectWindow = new BrowserWindow({
    width: 1400,
    height: 950,
    title: "ovO 接口诊断",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const inspectView = new BrowserView({
    webPreferences: {
      partition: COMPANY_SESSION_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  function resizeInspectView() {
    if (inspectWindow.isDestroyed()) {
      return;
    }

    const [width, height] = inspectWindow.getContentSize();
    inspectView.setBounds({ x: 0, y: 0, width, height });
  }

  // The embedded company SPA occasionally errors on its first paint (the same
  // "white screen until you refresh" the web app shows). Auto-reload once on a
  // load failure or a render-process crash so 接口诊断 recovers without the user
  // having to close and reopen the window. A guard caps retries to avoid loops.
  const MAX_AUTO_RELOADS = 2;
  let autoReloadCount = 0;
  function autoReload(reason: string) {
    if (inspectWindow.isDestroyed() || inspectView.webContents.isDestroyed()) {
      return;
    }
    if (autoReloadCount >= MAX_AUTO_RELOADS) {
      return;
    }
    autoReloadCount += 1;
    console.warn(`[接口诊断] ${reason}，自动重新加载 (第 ${autoReloadCount} 次)`);
    void inspectView.webContents.loadURL(initialUrl).catch(() => undefined);
  }

  inspectView.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // -3 (ERR_ABORTED) fires for normal client-side navigations; ignore it.
    if (!isMainFrame || errorCode === -3) {
      return;
    }
    autoReload(`页面加载失败 (${errorCode} ${errorDescription} @ ${validatedURL})`);
  });
  inspectView.webContents.on("render-process-gone", (_event, details) => {
    autoReload(`渲染进程退出 (${details.reason})`);
  });

  inspectWindow.setBrowserView(inspectView);
  inspectWindow.on("resize", resizeInspectView);
  inspectWindow.on("maximize", resizeInspectView);
  inspectWindow.on("unmaximize", resizeInspectView);
  resizeInspectView();

  // Attach the CDP-based capture now that the page's webContents exists. This
  // records full request AND response bodies. The debugger is mutually exclusive
  // with an open DevTools window on the same page, so we don't auto-open DevTools
  // here — capturing the responses is the purpose of this window.
  const apiCapture = await attachApiCapture(inspectView.webContents);
  inspectWindow.on("closed", () => {
    apiCapture.detach();
  });

  try {
    await inspectView.webContents.loadURL(initialUrl);
  } catch (error) {
    // Initial load rejected (network blip / aborted). Retry once before giving
    // up so a transient failure doesn't surface as an empty diagnosis window.
    console.warn("[接口诊断] 首次加载失败，重试一次：", error);
    if (!inspectView.webContents.isDestroyed()) {
      await inspectView.webContents.loadURL(initialUrl).catch(() => undefined);
    }
  }
  await waitForNetworkCapture();

  const summaries = apiCapture.getSummaries();

  return {
    ok: true,
    summaries,
    sanitizedMapPath: paths.sanitizedApiMapPath,
    rawCapturePath: apiCapture.rawCapturePath
  };
}

function isCompanyApiUrl(value: string) {
  try {
    const url = new URL(value);
    return url.origin === COMPANY_ORIGIN && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

async function waitForNetworkCapture() {
  await new Promise((resolve) => setTimeout(resolve, 4000));
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

function createTimestampFolderName(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes()
  )}${pad(date.getSeconds())}`;
}
