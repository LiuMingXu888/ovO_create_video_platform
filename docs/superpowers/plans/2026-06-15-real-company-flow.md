# Real Company Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the local Electron app to the real company canvas flow so it can log in with the user's account, discover authenticated API shapes, load real canvas resources, and run user-approved upload/generation/subtitle tests.

**Architecture:** Electron main owns login windows, private storage, authenticated fetch, request capture, and side-effect API calls. The React renderer talks through a narrow `window.ovoDesktop` IPC surface and never receives cookies or raw secrets. Chrome/Playwright discovery evidence is saved only under ignored `storage/`; committed code contains types, sanitizers, and sanitized summaries only.

**Tech Stack:** Electron, React, TypeScript, Vite, Vitest, Testing Library, Playwright, Node `fs`, browser/Electron `fetch`.

---

## Authorization Boundary

The user has explicitly approved spending credits to test the whole real flow. This plan may run real upload, generation, and subtitle-removal requests when needed to answer these questions:

- Which cookies/headers are required for Electron-side authenticated `fetch`?
- Whether `GET /api/projects/{projectId}/snapshot` contains all resource URLs or needs asset enrichment.
- Whether upload requires both storage upload and asset registration for every media type.
- The exact production model string for Seedance 2.0.
- Whether subtitle removal should use `/api/subtitle-remove` or `/api/subtitle-remove/ark`.
- Whether successful generation needs `POST /api/asset/persist-task`.

Still forbidden:

- Do not commit cookies, tokens, HAR files, raw response bodies, signed media URLs, local storage state, generated media, or company project data.
- Do not delete/restore projects, logout the user's session, or write canvas snapshots unless the user separately asks for that exact action.
- Do not bypass company authentication or inspect password stores.

## Current Workspace

- Branch: `feature/ui-shell`
- Worktree: `/Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell`
- Existing safe API modules:
  - `src/api/endpoints.ts`
  - `src/api/transport.ts`
  - `src/api/authClient.ts`
  - `src/api/canvasClient.ts`
  - `src/api/uploadClient.ts`
  - `src/api/generationClient.ts`
  - `src/api/subtitleClient.ts`
  - `src/services/canvasLoader.ts`
  - `src/services/companyApiFacade.ts`
- Existing docs:
  - `docs/superpowers/specs/2026-06-15-authenticated-api-discovery-design.md`
  - `docs/superpowers/specs/2026-06-15-company-api-integration-design.md`

## Task 1: Add Real Flow Plan Commit

**Files:**
- Create: `docs/superpowers/plans/2026-06-15-real-company-flow.md`

- [ ] **Step 1: Save this implementation plan**

Ensure this file exists and includes the authorization boundary above.

- [ ] **Step 2: Verify plan has no unfinished markers**

Run:

```bash
rg -n "T[B]D|T[O]DO|f[i]ll in" docs/superpowers/plans/2026-06-15-real-company-flow.md
```

Expected:

- No output.

- [ ] **Step 3: Commit and push**

Run:

```bash
git add docs/superpowers/plans/2026-06-15-real-company-flow.md
git commit -m "docs: plan real company flow integration"
git push origin feature/ui-shell
git ls-remote origin refs/heads/feature/ui-shell
```

Expected:

- Commit and push succeed.

## Task 2: Add Playwright Dependency And Private Storage Helpers

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `electron/storagePaths.ts`
- Create: `electron/storagePaths.test.ts`
- Create: `electron/secretRedactor.ts`
- Create: `electron/secretRedactor.test.ts`

- [ ] **Step 1: Install Playwright**

Run:

```bash
npm install playwright
```

Expected:

- `package.json` includes `playwright`.
- `package-lock.json` updates.

- [ ] **Step 2: Write failing storage path tests**

Create `electron/storagePaths.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createStoragePaths } from "./storagePaths";

describe("createStoragePaths", () => {
  it("keeps private API and auth material under the app storage root", () => {
    expect(createStoragePaths("/tmp/ovo-test")).toEqual({
      rootDir: "/tmp/ovo-test",
      authDir: "/tmp/ovo-test/auth",
      storageStatePath: "/tmp/ovo-test/auth/storage-state.json",
      apiDir: "/tmp/ovo-test/api",
      capturesDir: "/tmp/ovo-test/api/captures",
      sanitizedApiMapPath: "/tmp/ovo-test/api/sanitized-api-map.json",
      assetsDir: "/tmp/ovo-test/assets",
      outputsDir: "/tmp/ovo-test/outputs"
    });
  });
});
```

- [ ] **Step 3: Write failing redactor tests**

Create `electron/secretRedactor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { redactSecrets } from "./secretRedactor";

describe("redactSecrets", () => {
  it("redacts cookies, authorization headers, token-like fields, and signed URL query values", () => {
    expect(
      redactSecrets({
        headers: {
          cookie: "qijing_session=secret",
          authorization: "Bearer secret",
          "x-safe": "ok"
        },
        body: {
          accessToken: "secret",
          nested: {
            refresh_token: "secret",
            name: "safe"
          },
          fileUrl: "https://example.com/a.mp4?Expires=1&Signature=secret&x-oss-security-token=secret"
        }
      })
    ).toEqual({
      headers: {
        cookie: "[REDACTED]",
        authorization: "[REDACTED]",
        "x-safe": "ok"
      },
      body: {
        accessToken: "[REDACTED]",
        nested: {
          refresh_token: "[REDACTED]",
          name: "safe"
        },
        fileUrl: "https://example.com/a.mp4?Expires=[REDACTED]&Signature=[REDACTED]&x-oss-security-token=[REDACTED]"
      }
    });
  });
});
```

- [ ] **Step 4: Run RED**

Run:

```bash
npm test -- electron/storagePaths.test.ts electron/secretRedactor.test.ts
```

Expected:

- Fails because implementation files do not exist.

- [ ] **Step 5: Implement storage paths**

Create `electron/storagePaths.ts`:

```ts
import path from "node:path";

export interface StoragePaths {
  rootDir: string;
  authDir: string;
  storageStatePath: string;
  apiDir: string;
  capturesDir: string;
  sanitizedApiMapPath: string;
  assetsDir: string;
  outputsDir: string;
}

export function createStoragePaths(rootDir: string): StoragePaths {
  const authDir = path.join(rootDir, "auth");
  const apiDir = path.join(rootDir, "api");

  return {
    rootDir,
    authDir,
    storageStatePath: path.join(authDir, "storage-state.json"),
    apiDir,
    capturesDir: path.join(apiDir, "captures"),
    sanitizedApiMapPath: path.join(apiDir, "sanitized-api-map.json"),
    assetsDir: path.join(rootDir, "assets"),
    outputsDir: path.join(rootDir, "outputs")
  };
}
```

- [ ] **Step 6: Implement secret redactor**

Create `electron/secretRedactor.ts`:

```ts
const SECRET_KEY_PATTERN = /(cookie|authorization|token|secret|session|signature|credential|password)/i;
const SIGNED_URL_QUERY_PATTERN = /(token|signature|expires|security|credential|policy)/i;

export function redactSecrets<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown, key?: string): unknown {
  if (key && SECRET_KEY_PATTERN.test(key)) {
    return "[REDACTED]";
  }

  if (typeof value === "string") {
    return redactSignedUrl(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        redactValue(entryValue, entryKey)
      ])
    );
  }

  return value;
}

function redactSignedUrl(value: string) {
  try {
    const url = new URL(value);
    for (const key of Array.from(url.searchParams.keys())) {
      if (SIGNED_URL_QUERY_PATTERN.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return url.toString();
  } catch {
    return value;
  }
}
```

- [ ] **Step 7: Run GREEN**

Run:

```bash
npm test -- electron/storagePaths.test.ts electron/secretRedactor.test.ts
npm run build
```

Expected:

- Tests pass.
- Build passes.

- [ ] **Step 8: Commit and push**

Run:

```bash
git add package.json package-lock.json electron/storagePaths.ts electron/storagePaths.test.ts electron/secretRedactor.ts electron/secretRedactor.test.ts
git commit -m "feat: add private storage and redaction helpers"
git push origin feature/ui-shell
```

Expected:

- Commit and push succeed.

## Task 3: Add Discovery Classifier And Sanitized Capture Types

**Files:**
- Create: `electron/apiDiscovery.ts`
- Create: `electron/apiDiscovery.test.ts`

- [ ] **Step 1: Write failing classifier tests**

Create `electron/apiDiscovery.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyEndpoint, summarizeCapture } from "./apiDiscovery";

describe("classifyEndpoint", () => {
  it.each([
    ["/api/auth/me", "auth"],
    ["/api/projects/cmq/snapshot", "snapshot"],
    ["/api/asset/list?statuses=Active", "asset"],
    ["/api/upload-file", "upload"],
    ["/api/generate-video", "generation"],
    ["/api/subtitle-remove/ark", "subtitle"],
    ["/api/unknown", "unknown"]
  ] as const)("classifies %s as %s", (path, family) => {
    expect(classifyEndpoint(path)).toBe(family);
  });
});

describe("summarizeCapture", () => {
  it("keeps method, path, status, body shape, and endpoint family", () => {
    expect(
      summarizeCapture({
        method: "POST",
        url: "https://qijing.kjjhz.cn/api/generate-video",
        status: 200,
        requestBody: { prompt: "hello", referenceImages: ["a"] },
        responseBody: { taskId: "task-1", status: "queued" }
      })
    ).toEqual({
      method: "POST",
      path: "/api/generate-video",
      queryKeys: [],
      family: "generation",
      status: 200,
      requestShape: {
        prompt: "string",
        referenceImages: ["string"]
      },
      responseShape: {
        taskId: "string",
        status: "string"
      }
    });
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npm test -- electron/apiDiscovery.test.ts
```

Expected:

- Fails because `apiDiscovery.ts` does not exist.

- [ ] **Step 3: Implement classifier**

Create `electron/apiDiscovery.ts`:

```ts
import { redactSecrets } from "./secretRedactor";

export type EndpointFamily = "auth" | "snapshot" | "asset" | "upload" | "generation" | "subtitle" | "unknown";

export interface RawApiCapture {
  method: string;
  url: string;
  status?: number;
  requestBody?: unknown;
  responseBody?: unknown;
}

export interface SanitizedApiSummary {
  method: string;
  path: string;
  queryKeys: string[];
  family: EndpointFamily;
  status?: number;
  requestShape?: unknown;
  responseShape?: unknown;
}

export function classifyEndpoint(pathname: string): EndpointFamily {
  const path = pathname.split("?")[0];
  if (path === "/api/auth/me") return "auth";
  if (/^\/api\/projects\/[^/]+\/snapshot$/.test(path)) return "snapshot";
  if (path.startsWith("/api/asset/") || path === "/api/asset/list") return "asset";
  if (path === "/api/upload-file" || path === "/api/upload-public" || path === "/api/asset/upload") return "upload";
  if (path.startsWith("/api/generate-video") || path.startsWith("/api/gen-queue")) return "generation";
  if (path.startsWith("/api/subtitle-remove")) return "subtitle";
  return "unknown";
}

export function summarizeCapture(capture: RawApiCapture): SanitizedApiSummary {
  const url = new URL(capture.url);
  return {
    method: capture.method,
    path: url.pathname,
    queryKeys: Array.from(url.searchParams.keys()).sort(),
    family: classifyEndpoint(url.pathname),
    status: capture.status,
    requestShape: capture.requestBody === undefined ? undefined : shapeOf(redactSecrets(capture.requestBody)),
    responseShape: capture.responseBody === undefined ? undefined : shapeOf(redactSecrets(capture.responseBody))
  };
}

function shapeOf(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.length > 0 ? [shapeOf(value[0])] : [];
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [key, shapeOf(entryValue)])
    );
  }

  if (value === null) return "null";
  return typeof value;
}
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
npm test -- electron/apiDiscovery.test.ts
npm run build
```

Expected:

- Tests pass.
- Build passes.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add electron/apiDiscovery.ts electron/apiDiscovery.test.ts
git commit -m "feat: add sanitized api discovery summaries"
git push origin feature/ui-shell
```

Expected:

- Commit and push succeed.

## Task 4: Add Electron IPC Surface For Real Session And Discovery

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/vite-env.d.ts`
- Create: `electron/companySession.ts`

- [ ] **Step 1: Implement Electron session service**

Create `electron/companySession.ts`:

```ts
import { app, BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { createStoragePaths } from "./storagePaths";
import { summarizeCapture, type SanitizedApiSummary } from "./apiDiscovery";

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
```

- [ ] **Step 2: Wire IPC in `electron/main.ts`**

Modify imports:

```ts
import { app, BrowserWindow, ipcMain } from "electron";
import { checkSession, clearSession, inspectCanvas, openLoginWindow } from "./companySession";
```

Inside `app.whenReady().then(() => {` before `createMainWindow();` add:

```ts
  ipcMain.handle("ovo:auth:open-login-window", () => openLoginWindow());
  ipcMain.handle("ovo:auth:check-session", () => checkSession());
  ipcMain.handle("ovo:auth:clear-session", () => clearSession());
  ipcMain.handle("ovo:discovery:inspect-canvas", (_event, canvasUrl: string) => inspectCanvas(canvasUrl));
```

- [ ] **Step 3: Wire preload IPC**

Modify `electron/preload.ts`:

```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ovoDesktop", {
  version: "0.1.0",
  auth: {
    openLoginWindow: () => ipcRenderer.invoke("ovo:auth:open-login-window"),
    checkSession: () => ipcRenderer.invoke("ovo:auth:check-session"),
    clearSession: () => ipcRenderer.invoke("ovo:auth:clear-session")
  },
  discovery: {
    inspectCanvas: (canvasUrl: string) => ipcRenderer.invoke("ovo:discovery:inspect-canvas", canvasUrl)
  }
});
```

- [ ] **Step 4: Update renderer type**

Modify `src/vite-env.d.ts`:

```ts
interface Window {
  ovoDesktop?: {
    version: string;
    auth: {
      openLoginWindow: () => Promise<{ ok: boolean; message?: string; user?: unknown }>;
      checkSession: () => Promise<{ ok: boolean; message?: string; user?: unknown }>;
      clearSession: () => Promise<{ ok: boolean; message?: string }>;
    };
    discovery: {
      inspectCanvas: (canvasUrl: string) => Promise<{
        ok: boolean;
        message?: string;
        summaries?: Array<{
          method: string;
          path: string;
          family: string;
          status?: number;
        }>;
        sanitizedMapPath?: string;
      }>;
    };
  };
}
```

- [ ] **Step 5: Build**

Run:

```bash
npm run build
```

Expected:

- Build passes.

- [ ] **Step 6: Commit and push**

Run:

```bash
git add electron/main.ts electron/preload.ts electron/companySession.ts src/vite-env.d.ts
git commit -m "feat: expose real session discovery ipc"
git push origin feature/ui-shell
```

Expected:

- Commit and push succeed.

## Task 5: Run Real Chrome Discovery And Answer Interface Questions

**Files:**
- Create ignored local files only under `storage/` if needed.
- Modify: `docs/002-canvas-shell-requirements-and-api-discovery.md`

- [ ] **Step 1: Use Chrome with existing logged-in session**

Open:

```text
http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x
```

Capture network metadata and front-end request shapes. Do not inspect Chrome cookies/localStorage/password stores.

- [ ] **Step 2: Identify read path**

Confirm:

- required browser request headers that are safe to mention, such as `accept`, `content-type`, `referer`, and whether credentials/cookies are browser-managed
- whether snapshot response includes resource URLs
- whether asset list/detail is needed for enrichment

- [ ] **Step 3: Run side-effect tests with user-approved credit spend**

Use the app or company UI to trigger:

- a small file upload if needed
- a minimal generation request
- subtitle removal on a generated or existing short video

Capture only sanitized endpoint sequence and field names.

- [ ] **Step 4: Update discovery document**

Append a section to `docs/002-canvas-shell-requirements-and-api-discovery.md`:

```md
## Real Flow Verification Result

Date: 2026-06-15

### Electron Fetch Auth

...

### Snapshot Resource Coverage

...

### Upload Sequence

...

### Generation

...

### Subtitle Removal

...

### Persist Task

...
```

- [ ] **Step 5: Commit and push**

Run:

```bash
git add docs/002-canvas-shell-requirements-and-api-discovery.md
git commit -m "docs: record real company api flow findings"
git push origin feature/ui-shell
```

Expected:

- Commit and push succeed.
- No ignored/private capture files are staged.

## Task 6: Final Verification

**Files:**
- No new files unless verification reveals an issue.

- [ ] **Step 1: Run tests**

Run:

```bash
npm test
```

Expected:

- All tests pass.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected:

- Build passes.

- [ ] **Step 3: Check git status**

Run:

```bash
git status --short --branch
```

Expected:

- Clean worktree on `feature/ui-shell`.
