# Company API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first safe company API integration slice: parse canvas URLs, check auth state, load a canvas snapshot through a mockable client, normalize resources into the existing UI, and prepare typed upload/generation/task helpers without triggering paid or state-changing calls automatically.

**Architecture:** Keep private company API access behind small typed modules. UI components call app-level handlers, handlers call services, services call a mockable `ApiTransport`. The first executable milestone uses mock transport in tests and real transport only from explicit UI actions.

**Tech Stack:** Electron, React, TypeScript, Vite, Vitest, Testing Library, browser `fetch`, Electron preload IPC shape.

---

## Source Documents

- `docs/superpowers/specs/2026-06-15-company-api-integration-design.md`
- `docs/002-canvas-shell-requirements-and-api-discovery.md`
- `docs/001-local-video-generator-design.md`

## Scope For This Plan

This plan implements the safe read path and typed foundations:

- Canvas URL parser.
- Auth/session status model.
- Mockable API transport.
- Auth, canvas snapshot, upload payload, generation payload, and polling helpers.
- Snapshot resource normalization.
- UI controls for canvas URL input, auth check, load canvas, and status/error display.
- Generate button wiring that validates inputs and builds a payload, but does not submit real generation unless a later plan enables the API call.

This plan does not run real upload, real generation, or real subtitle removal against the company account. Those side-effecting flows get separate plans after resource loading is verified.

## File Structure

Create these files:

- `src/api/endpoints.ts` - endpoint path builders and base URL helpers.
- `src/api/transport.ts` - `ApiTransport` interface, JSON/FormData helpers, and fetch transport.
- `src/api/authClient.ts` - `GET /api/auth/me` client.
- `src/api/canvasClient.ts` - `GET /api/projects/{projectId}/snapshot` client.
- `src/api/uploadClient.ts` - upload FormData/payload builders only.
- `src/api/generationClient.ts` - generation payload builder and task polling helper.
- `src/api/subtitleClient.ts` - subtitle-removal payload builder and task polling helper.
- `src/api/mockFixtures.ts` - sanitized mock auth and snapshot responses for tests.
- `src/lib/canvasUrl.ts` - canvas URL parser.
- `src/lib/assetNormalizer.ts` - converts API assets/snapshot resources to `CanvasAsset[]`.
- `src/lib/downloadAsset.ts` - move existing download behavior out of `App.tsx`.
- `src/services/canvasLoader.ts` - orchestrates parse URL, auth check, snapshot load, and normalization.
- `src/services/companyApiFacade.ts` - production facade used by the UI.
- `src/components/CanvasControls.tsx` - canvas URL, auth/load buttons, and status panel.
- `src/vite-env.d.ts` - typed `window.ovoDesktop` surface.
- Matching test files under the same folders.

Modify these files:

- `src/types.ts` - add API/session/task/project types.
- `src/App.tsx` - wire controls, load-state, normalized assets, and moved download helper.
- `src/App.test.tsx` - add integration-style UI tests with mocked facade.
- `src/components/AppHeader.tsx` - accept account/project props instead of hard-coded `23176`.
- `src/components/GeneratePanel.tsx` - accept disabled/loading/status props and callback.
- `src/components/PromptDock.tsx` - pass generate props to `GeneratePanel`.
- `src/styles.css` - add styles for controls/status panels.
- `electron/preload.ts` - expose a typed placeholder API for future Electron-side session methods.

## Task 1: Add Canvas URL Parser

**Files:**
- Create: `src/lib/canvasUrl.ts`
- Create: `src/lib/canvasUrl.test.ts`

- [ ] **Step 1: Write the failing parser tests**

Create `src/lib/canvasUrl.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseCanvasUrl } from "./canvasUrl";

describe("parseCanvasUrl", () => {
  it("extracts the project id from a qijing canvas URL", () => {
    expect(parseCanvasUrl("http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x")).toEqual({
      ok: true,
      projectId: "cmq6fwhft0bg5m2l5u78zby8x",
      normalizedUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x"
    });
  });

  it("accepts canvas URLs with query strings", () => {
    expect(parseCanvasUrl("https://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x?from=share")).toEqual({
      ok: true,
      projectId: "cmq6fwhft0bg5m2l5u78zby8x",
      normalizedUrl: "https://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x"
    });
  });

  it("rejects non-canvas URLs", () => {
    expect(parseCanvasUrl("https://qijing.kjjhz.cn/projects/cmq6fwhft0bg5m2l5u78zby8x")).toEqual({
      ok: false,
      error: "请输入有效的画布地址"
    });
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npm test -- src/lib/canvasUrl.test.ts
```

Expected:

- Fails because `src/lib/canvasUrl.ts` does not exist.

- [ ] **Step 3: Implement parser**

Create `src/lib/canvasUrl.ts`:

```ts
export type CanvasUrlParseResult =
  | {
      ok: true;
      projectId: string;
      normalizedUrl: string;
    }
  | {
      ok: false;
      error: string;
    };

export function parseCanvasUrl(value: string): CanvasUrlParseResult {
  try {
    const url = new URL(value.trim());
    const parts = url.pathname.split("/").filter(Boolean);
    const canvasIndex = parts.indexOf("canvas");
    const projectId = canvasIndex >= 0 ? parts[canvasIndex + 1] : undefined;

    if (!projectId) {
      return { ok: false, error: "请输入有效的画布地址" };
    }

    return {
      ok: true,
      projectId,
      normalizedUrl: `${url.origin}/canvas/${projectId}`
    };
  } catch {
    return { ok: false, error: "请输入有效的画布地址" };
  }
}
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
npm test -- src/lib/canvasUrl.test.ts
```

Expected:

- 3 tests pass.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/lib/canvasUrl.ts src/lib/canvasUrl.test.ts
git commit -m "feat: parse canvas urls"
git push origin feature/ui-shell
git ls-remote origin refs/heads/feature/ui-shell
```

Expected:

- Commit and push succeed.
- Remote hash matches local `git log -1 --oneline`.

## Task 2: Add Shared API Types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Write type-only definitions**

Append these exports to `src/types.ts`:

```ts
export interface CanvasProject {
  projectId: string;
  canvasUrl: string;
  title?: string;
  loadedAt: string;
}

export interface ApiAsset {
  id?: string;
  name: string;
  kind: AssetKind;
  url: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  sizeBytes?: number;
  source: "snapshot" | "asset-list" | "upload";
  rawType?: string;
}

export interface AuthUser {
  id?: string;
  name?: string;
  account?: string;
  avatarUrl?: string;
}

export type AuthState =
  | { status: "unknown"; user?: undefined; message?: undefined }
  | { status: "checking"; user?: undefined; message?: undefined }
  | { status: "authenticated"; user: AuthUser; message?: undefined }
  | { status: "unauthenticated"; user?: undefined; message: string };

export interface LocalTask {
  id: string;
  projectId: string;
  type: "generate-video" | "subtitle-remove";
  status: "queued" | "running" | "succeeded" | "failed";
  serverTaskId?: string;
  createdAt: string;
  updatedAt: string;
  outputUrl?: string;
  errorMessage?: string;
}

export interface ApiError {
  status?: number;
  message: string;
  code?: string;
  detail?: unknown;
}
```

- [ ] **Step 2: Run typecheck/build**

Run:

```bash
npm run build
```

Expected:

- TypeScript and Vite build pass.

- [ ] **Step 3: Commit and push**

Run:

```bash
git add src/types.ts
git commit -m "feat: add company api domain types"
git push origin feature/ui-shell
```

Expected:

- Commit and push succeed.

## Task 3: Add Endpoint Builders And Transport

**Files:**
- Create: `src/api/endpoints.ts`
- Create: `src/api/endpoints.test.ts`
- Create: `src/api/transport.ts`
- Create: `src/api/transport.test.ts`

- [ ] **Step 1: Write endpoint tests**

Create `src/api/endpoints.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { apiPath, endpoints } from "./endpoints";

describe("endpoints", () => {
  it("builds auth, snapshot, generation, and subtitle paths", () => {
    expect(endpoints.authMe()).toBe("/api/auth/me");
    expect(endpoints.projectSnapshot("project-1")).toBe("/api/projects/project-1/snapshot");
    expect(endpoints.generateVideo()).toBe("/api/generate-video");
    expect(endpoints.generateVideoTask("task-1")).toBe("/api/generate-video/task-1");
    expect(endpoints.subtitleRemove()).toBe("/api/subtitle-remove");
    expect(endpoints.subtitleRemoveTask("task-2")).toBe("/api/subtitle-remove/task-2");
  });

  it("prefixes API paths with a base origin", () => {
    expect(apiPath("https://qijing.kjjhz.cn", "/api/auth/me")).toBe("https://qijing.kjjhz.cn/api/auth/me");
  });
});
```

- [ ] **Step 2: Write transport tests**

Create `src/api/transport.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { FetchApiTransport } from "./transport";

describe("FetchApiTransport", () => {
  it("returns parsed JSON for successful requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true })
    });
    const transport = new FetchApiTransport("https://qijing.kjjhz.cn", fetchMock as unknown as typeof fetch);

    await expect(transport.request("/api/auth/me")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("https://qijing.kjjhz.cn/api/auth/me", {
      body: undefined,
      credentials: "include",
      headers: { Accept: "application/json" },
      method: "GET"
    });
  });

  it("throws a readable error for failed requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Unauthorized" })
    });
    const transport = new FetchApiTransport("https://qijing.kjjhz.cn", fetchMock as unknown as typeof fetch);

    await expect(transport.request("/api/auth/me")).rejects.toMatchObject({
      status: 401,
      message: "Unauthorized"
    });
  });
});
```

- [ ] **Step 3: Run RED**

Run:

```bash
npm test -- src/api/endpoints.test.ts src/api/transport.test.ts
```

Expected:

- Fails because implementation files do not exist.

- [ ] **Step 4: Implement endpoint builders**

Create `src/api/endpoints.ts`:

```ts
export const COMPANY_API_ORIGIN = "https://qijing.kjjhz.cn";

export function apiPath(origin: string, path: string) {
  return `${origin.replace(/\/$/, "")}${path}`;
}

export const endpoints = {
  authMe: () => "/api/auth/me",
  projectSnapshot: (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/snapshot`,
  assetList: () => "/api/asset/list?statuses=Active&pageSize=100",
  uploadFile: () => "/api/upload-file",
  uploadPublic: () => "/api/upload-public",
  assetUpload: () => "/api/asset/upload",
  generateVideo: () => "/api/generate-video",
  generateVideoTask: (taskId: string) => `/api/generate-video/${encodeURIComponent(taskId)}`,
  subtitleRemove: () => "/api/subtitle-remove",
  subtitleRemoveTask: (taskId: string) => `/api/subtitle-remove/${encodeURIComponent(taskId)}`
};
```

- [ ] **Step 5: Implement transport**

Create `src/api/transport.ts`:

```ts
import type { ApiError } from "../types";
import { COMPANY_API_ORIGIN, apiPath } from "./endpoints";

export interface ApiTransport {
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>;
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

export class FetchApiTransport implements ApiTransport {
  constructor(
    private readonly origin = COMPANY_API_ORIGIN,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...options.headers
    };
    let body: BodyInit | undefined;

    if (options.body instanceof FormData) {
      body = options.body;
    } else if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const response = await this.fetcher(apiPath(this.origin, path), {
      method: options.method ?? "GET",
      credentials: "include",
      headers,
      body
    });

    const data = await safeJson(response);

    if (!response.ok) {
      const message = getErrorMessage(data, response.status);
      const error: ApiError = { status: response.status, message, detail: data };
      throw error;
    }

    return data as T;
  }
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getErrorMessage(data: unknown, status: number) {
  if (isRecord(data)) {
    const message = data.error ?? data.message ?? data.errorDetail;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return `请求失败 (${status})`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
```

- [ ] **Step 6: Run GREEN**

Run:

```bash
npm test -- src/api/endpoints.test.ts src/api/transport.test.ts
```

Expected:

- Endpoint and transport tests pass.

- [ ] **Step 7: Commit and push**

Run:

```bash
git add src/api/endpoints.ts src/api/endpoints.test.ts src/api/transport.ts src/api/transport.test.ts
git commit -m "feat: add company api transport"
git push origin feature/ui-shell
```

Expected:

- Commit and push succeed.

## Task 4: Add Auth Client And Header State

**Files:**
- Create: `src/api/authClient.ts`
- Create: `src/api/authClient.test.ts`
- Modify: `src/components/AppHeader.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write auth client tests**

Create `src/api/authClient.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ApiTransport } from "./transport";
import { checkAuth } from "./authClient";

describe("checkAuth", () => {
  it("maps successful auth responses to authenticated state", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockResolvedValue({ id: "u1", account: "23176", name: "23176" })
    };

    await expect(checkAuth(transport)).resolves.toEqual({
      status: "authenticated",
      user: { id: "u1", account: "23176", name: "23176" }
    });
  });

  it("maps auth failures to unauthenticated state", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockRejectedValue({ status: 401, message: "Unauthorized" })
    };

    await expect(checkAuth(transport)).resolves.toEqual({
      status: "unauthenticated",
      message: "登录已失效，请重新登录"
    });
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npm test -- src/api/authClient.test.ts
```

Expected:

- Fails because `authClient.ts` does not exist.

- [ ] **Step 3: Implement auth client**

Create `src/api/authClient.ts`:

```ts
import type { AuthState, AuthUser } from "../types";
import { endpoints } from "./endpoints";
import type { ApiTransport } from "./transport";

export async function checkAuth(transport: ApiTransport): Promise<AuthState> {
  try {
    const user = await transport.request<AuthUser>(endpoints.authMe());
    return { status: "authenticated", user };
  } catch {
    return { status: "unauthenticated", message: "登录已失效，请重新登录" };
  }
}
```

- [ ] **Step 4: Update AppHeader props**

Modify `src/components/AppHeader.tsx` to:

```tsx
import { Download, Play, UserRound } from "lucide-react";
import type { AuthState, CanvasProject } from "../types";

interface AppHeaderProps {
  authState?: AuthState;
  project?: CanvasProject | null;
}

export function AppHeader({ authState = { status: "unknown" }, project = null }: AppHeaderProps) {
  const accountLabel =
    authState.status === "authenticated"
      ? authState.user.account ?? authState.user.name ?? "已登录"
      : authState.status === "checking"
        ? "检查中"
        : "未登录";

  return (
    <header className="app-header">
      <div className="brand" aria-label="ovO">
        <span className="brand-mark">ovO</span>
        <span className="brand-subtitle">Create Video</span>
      </div>

      <div className="project-title">
        <span>{project?.title ?? "未命名项目"}</span>
        <small>{project ? project.projectId : "本地壳子 · 公司 API 待接入"}</small>
      </div>

      <div className="header-actions">
        <button type="button" className="icon-button" title="预览" aria-label="预览">
          <Play size={18} />
        </button>
        <button type="button" className="icon-button" title="下载" aria-label="下载">
          <Download size={18} />
        </button>
        <button type="button" className="account-button" title="账户">
          <UserRound size={18} />
          <span>{accountLabel}</span>
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Update shell test expectation**

In `src/App.test.tsx`, update the first render test to expect `未登录` instead of hard-coded `23176`:

```ts
expect(screen.getByText("未登录")).toBeInTheDocument();
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- src/api/authClient.test.ts src/App.test.tsx
```

Expected:

- Auth client tests pass.
- App shell tests pass.

- [ ] **Step 7: Commit and push**

Run:

```bash
git add src/api/authClient.ts src/api/authClient.test.ts src/components/AppHeader.tsx src/App.test.tsx
git commit -m "feat: add auth status mapping"
git push origin feature/ui-shell
```

Expected:

- Commit and push succeed.

## Task 5: Add Snapshot Client And Resource Normalizer

**Files:**
- Create: `src/api/canvasClient.ts`
- Create: `src/api/canvasClient.test.ts`
- Create: `src/api/mockFixtures.ts`
- Create: `src/lib/assetNormalizer.ts`
- Create: `src/lib/assetNormalizer.test.ts`

- [ ] **Step 1: Write snapshot client tests**

Create `src/api/canvasClient.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ApiTransport } from "./transport";
import { loadProjectSnapshot } from "./canvasClient";

describe("loadProjectSnapshot", () => {
  it("loads snapshot by project id", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockResolvedValue({ title: "测试项目", nodes: [] })
    };

    await expect(loadProjectSnapshot(transport, "project-1")).resolves.toEqual({ title: "测试项目", nodes: [] });
    expect(transport.request).toHaveBeenCalledWith("/api/projects/project-1/snapshot");
  });
});
```

- [ ] **Step 2: Write normalizer tests**

Create `src/lib/assetNormalizer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mockSnapshotResponse } from "../api/mockFixtures";
import { normalizeSnapshotAssets } from "./assetNormalizer";

describe("normalizeSnapshotAssets", () => {
  it("maps images to characters, audio to audio, and video to video", () => {
    expect(normalizeSnapshotAssets(mockSnapshotResponse)).toEqual([
      {
        id: "img-1",
        name: "男主秦扬人脸参考",
        kind: "image",
        category: "characters",
        url: "https://example.com/man.png",
        thumbnailUrl: "https://example.com/man-thumb.png",
        sizeBytes: 1024
      },
      {
        id: "audio-1",
        name: "紧张背景音乐",
        kind: "audio",
        category: "audio",
        url: "https://example.com/bgm.mp3",
        durationSeconds: 12,
        sizeBytes: 2048
      },
      {
        id: "video-1",
        name: "开场参考视频",
        kind: "video",
        category: "video",
        url: "https://example.com/opening.mp4",
        thumbnailUrl: "https://example.com/opening.jpg",
        durationSeconds: 5,
        sizeBytes: 4096
      }
    ]);
  });

  it("ignores records without a usable URL", () => {
    expect(normalizeSnapshotAssets({ assets: [{ id: "bad", name: "bad", type: "image" }] })).toEqual([]);
  });
});
```

- [ ] **Step 3: Run RED**

Run:

```bash
npm test -- src/api/canvasClient.test.ts src/lib/assetNormalizer.test.ts
```

Expected:

- Fails because implementation files do not exist.

- [ ] **Step 4: Add mock fixture**

Create `src/api/mockFixtures.ts`:

```ts
export const mockSnapshotResponse = {
  title: "测试项目",
  assets: [
    {
      id: "img-1",
      name: "男主秦扬人脸参考",
      type: "image",
      url: "https://example.com/man.png",
      thumbnailUrl: "https://example.com/man-thumb.png",
      sizeBytes: 1024
    },
    {
      id: "audio-1",
      name: "紧张背景音乐",
      type: "audio",
      url: "https://example.com/bgm.mp3",
      durationSeconds: 12,
      sizeBytes: 2048
    },
    {
      id: "video-1",
      name: "开场参考视频",
      type: "video",
      url: "https://example.com/opening.mp4",
      thumbnailUrl: "https://example.com/opening.jpg",
      durationSeconds: 5,
      sizeBytes: 4096
    }
  ]
};
```

- [ ] **Step 5: Implement snapshot client**

Create `src/api/canvasClient.ts`:

```ts
import { endpoints } from "./endpoints";
import type { ApiTransport } from "./transport";

export async function loadProjectSnapshot(transport: ApiTransport, projectId: string): Promise<unknown> {
  return transport.request(endpoints.projectSnapshot(projectId));
}
```

- [ ] **Step 6: Implement normalizer**

Create `src/lib/assetNormalizer.ts`:

```ts
import type { AssetCategory, AssetKind, CanvasAsset } from "../types";

interface RawAssetRecord {
  id?: string;
  name?: string;
  title?: string;
  type?: string;
  kind?: string;
  url?: string;
  publicUrl?: string;
  src?: string;
  thumbnailUrl?: string;
  coverUrl?: string;
  durationSeconds?: number;
  duration?: number;
  sizeBytes?: number;
  size?: number;
}

export function normalizeSnapshotAssets(snapshot: unknown): CanvasAsset[] {
  return collectRawAssets(snapshot)
    .map(normalizeRawAsset)
    .filter((asset): asset is CanvasAsset => Boolean(asset));
}

function collectRawAssets(value: unknown): RawAssetRecord[] {
  if (!isRecord(value)) {
    return [];
  }

  const directAssets = value.assets;
  if (Array.isArray(directAssets)) {
    return directAssets.filter(isRecord) as RawAssetRecord[];
  }

  const nodes = value.nodes;
  if (Array.isArray(nodes)) {
    return nodes.filter(isRecord) as RawAssetRecord[];
  }

  return [];
}

function normalizeRawAsset(record: RawAssetRecord): CanvasAsset | null {
  const url = record.url ?? record.publicUrl ?? record.src;
  const kind = normalizeKind(record.kind ?? record.type ?? url);

  if (!url || !kind) {
    return null;
  }

  return {
    id: record.id ?? `${kind}-${url}`,
    name: record.name ?? record.title ?? fallbackName(url),
    kind,
    category: categoryForKind(kind),
    url,
    thumbnailUrl: record.thumbnailUrl ?? record.coverUrl,
    durationSeconds: record.durationSeconds ?? record.duration,
    sizeBytes: record.sizeBytes ?? record.size
  };
}

function normalizeKind(value: unknown): AssetKind | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized.includes("image") || /\.(png|jpe?g|webp)(\?|$)/.test(normalized)) {
    return "image";
  }
  if (normalized.includes("audio") || /\.(mp3|wav)(\?|$)/.test(normalized)) {
    return "audio";
  }
  if (normalized.includes("video") || /\.(mp4|mov)(\?|$)/.test(normalized)) {
    return "video";
  }

  return null;
}

function categoryForKind(kind: AssetKind): AssetCategory {
  if (kind === "image") {
    return "characters";
  }

  return kind;
}

function fallbackName(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const fileName = pathname.split("/").filter(Boolean).at(-1) ?? "asset";
    return decodeURIComponent(fileName).replace(/\.[^.]+$/, "");
  } catch {
    return "asset";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
```

- [ ] **Step 7: Run GREEN**

Run:

```bash
npm test -- src/api/canvasClient.test.ts src/lib/assetNormalizer.test.ts
```

Expected:

- Snapshot client and normalizer tests pass.

- [ ] **Step 8: Commit and push**

Run:

```bash
git add src/api/canvasClient.ts src/api/canvasClient.test.ts src/api/mockFixtures.ts src/lib/assetNormalizer.ts src/lib/assetNormalizer.test.ts
git commit -m "feat: normalize canvas snapshot assets"
git push origin feature/ui-shell
```

Expected:

- Commit and push succeed.

## Task 6: Add Canvas Loader Service

**Files:**
- Create: `src/services/canvasLoader.ts`
- Create: `src/services/canvasLoader.test.ts`

- [ ] **Step 1: Write loader tests**

Create `src/services/canvasLoader.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { mockSnapshotResponse } from "../api/mockFixtures";
import type { ApiTransport } from "../api/transport";
import { loadCanvasResources } from "./canvasLoader";

describe("loadCanvasResources", () => {
  it("loads and normalizes resources for a valid canvas URL", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockResolvedValue(mockSnapshotResponse)
    };

    await expect(
      loadCanvasResources(transport, "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x")
    ).resolves.toMatchObject({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "测试项目"
      },
      assets: [
        { name: "男主秦扬人脸参考", category: "characters" },
        { name: "紧张背景音乐", category: "audio" },
        { name: "开场参考视频", category: "video" }
      ]
    });
  });

  it("returns a readable error for invalid canvas URLs", async () => {
    const transport: ApiTransport = {
      request: vi.fn()
    };

    await expect(loadCanvasResources(transport, "bad-url")).rejects.toMatchObject({
      message: "请输入有效的画布地址"
    });
    expect(transport.request).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npm test -- src/services/canvasLoader.test.ts
```

Expected:

- Fails because `canvasLoader.ts` does not exist.

- [ ] **Step 3: Implement loader**

Create `src/services/canvasLoader.ts`:

```ts
import { loadProjectSnapshot } from "../api/canvasClient";
import type { ApiTransport } from "../api/transport";
import { normalizeSnapshotAssets } from "../lib/assetNormalizer";
import { parseCanvasUrl } from "../lib/canvasUrl";
import type { CanvasProject } from "../types";

export interface LoadedCanvasResources {
  project: CanvasProject;
  assets: ReturnType<typeof normalizeSnapshotAssets>;
}

export async function loadCanvasResources(transport: ApiTransport, canvasUrl: string): Promise<LoadedCanvasResources> {
  const parsed = parseCanvasUrl(canvasUrl);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  const snapshot = await loadProjectSnapshot(transport, parsed.projectId);
  const title = getSnapshotTitle(snapshot);

  return {
    project: {
      projectId: parsed.projectId,
      canvasUrl: parsed.normalizedUrl,
      title,
      loadedAt: new Date().toISOString()
    },
    assets: normalizeSnapshotAssets(snapshot)
  };
}

function getSnapshotTitle(snapshot: unknown) {
  if (typeof snapshot === "object" && snapshot !== null && "title" in snapshot && typeof snapshot.title === "string") {
    return snapshot.title;
  }

  return undefined;
}
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
npm test -- src/services/canvasLoader.test.ts
```

Expected:

- Loader tests pass.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/services/canvasLoader.ts src/services/canvasLoader.test.ts
git commit -m "feat: add canvas resource loader"
git push origin feature/ui-shell
```

Expected:

- Commit and push succeed.

## Task 7: Add UI Canvas Controls With Mocked Facade

**Files:**
- Create: `src/services/companyApiFacade.ts`
- Create: `src/components/CanvasControls.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Create facade**

Create `src/services/companyApiFacade.ts`:

```ts
import { checkAuth } from "../api/authClient";
import { FetchApiTransport } from "../api/transport";
import { loadCanvasResources } from "./canvasLoader";

const transport = new FetchApiTransport();

export const companyApiFacade = {
  checkAuth: () => checkAuth(transport),
  loadCanvasResources: (canvasUrl: string) => loadCanvasResources(transport, canvasUrl)
};
```

- [ ] **Step 2: Create CanvasControls component**

Create `src/components/CanvasControls.tsx`:

```tsx
import { Link, Loader2, LogIn, RefreshCw } from "lucide-react";
import type { AuthState } from "../types";

interface CanvasControlsProps {
  canvasUrl: string;
  authState: AuthState;
  loading: boolean;
  errorMessage?: string;
  onCanvasUrlChange: (value: string) => void;
  onCheckAuth: () => void;
  onLoadCanvas: () => void;
}

export function CanvasControls({
  canvasUrl,
  authState,
  loading,
  errorMessage,
  onCanvasUrlChange,
  onCheckAuth,
  onLoadCanvas
}: CanvasControlsProps) {
  const authLabel =
    authState.status === "authenticated"
      ? `已登录：${authState.user.account ?? authState.user.name ?? "公司账号"}`
      : authState.status === "checking"
        ? "正在检查登录态"
        : authState.status === "unauthenticated"
          ? authState.message
          : "未检查登录态";

  return (
    <section className="canvas-controls" aria-label="画布加载">
      <div className="canvas-url-field">
        <Link size={18} />
        <input
          value={canvasUrl}
          onChange={(event) => onCanvasUrlChange(event.currentTarget.value)}
          placeholder="粘贴画布地址，例如 http://qijing.kjjhz.cn/canvas/..."
        />
      </div>

      <div className="canvas-control-actions">
        <button type="button" className="secondary-button" onClick={onCheckAuth} disabled={loading}>
          {authState.status === "checking" ? <Loader2 size={16} /> : <LogIn size={16} />}
          <span>检查登录态</span>
        </button>
        <button type="button" className="primary-button" onClick={onLoadCanvas} disabled={loading}>
          {loading ? <Loader2 size={16} /> : <RefreshCw size={16} />}
          <span>加载画布资源</span>
        </button>
      </div>

      <div className="canvas-status-line">{loading ? "正在连接公司接口" : authLabel}</div>
      {errorMessage && <div className="canvas-error-line">{errorMessage}</div>}
    </section>
  );
}
```

- [ ] **Step 3: Write UI tests before wiring**

At the top of `src/App.test.tsx`, keep all imports together. Add this mock before importing `App`:

```ts
vi.mock("./services/companyApiFacade", () => ({
  companyApiFacade: {
    checkAuth: vi.fn(),
    loadCanvasResources: vi.fn()
  }
}));

import { companyApiFacade } from "./services/companyApiFacade";
import { App } from "./App";
```

The import area should still contain the existing imports for `PromptDock` and `ReferenceItem`.

Append these tests inside the existing `describe("App shell", () => { ... })` block:

```ts
it("checks auth state from the company API facade", async () => {
  vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
    status: "authenticated",
    user: { account: "23176" }
  });

  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "检查登录态" }));

  expect(await screen.findByText("已登录：23176")).toBeInTheDocument();
  expect(screen.getByText("23176")).toBeInTheDocument();
});

it("loads canvas resources into the existing grid", async () => {
  vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
    project: {
      projectId: "cmq6fwhft0bg5m2l5u78zby8x",
      canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
      title: "接口项目",
      loadedAt: "2026-06-15T00:00:00.000Z"
    },
    assets: [
      {
        id: "api-image",
        name: "接口图片",
        kind: "image",
        category: "characters",
        url: "https://example.com/image.png"
      }
    ]
  });

  render(<App />);

  fireEvent.change(screen.getByPlaceholderText("粘贴画布地址，例如 http://qijing.kjjhz.cn/canvas/..."), {
    target: { value: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x" }
  });
  fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));

  expect(await screen.findByText("接口图片")).toBeInTheDocument();
  expect(screen.getByText("接口项目")).toBeInTheDocument();
});
```

Important: do not add a second `import { App } from "./App"` later in the file.

- [ ] **Step 4: Run RED**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected:

- Fails because `CanvasControls` is not wired into `App.tsx`.

- [ ] **Step 5: Wire App state**

Modify `src/App.tsx`:

- Import `CanvasControls`, `companyApiFacade`, and `AuthState`/`CanvasProject`.
- Add state:

```ts
const [canvasUrl, setCanvasUrl] = useState("http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x");
const [authState, setAuthState] = useState<AuthState>({ status: "unknown" });
const [project, setProject] = useState<CanvasProject | null>(null);
const [canvasLoading, setCanvasLoading] = useState(false);
const [canvasError, setCanvasError] = useState<string | undefined>();
```

- Add handlers:

```ts
async function handleCheckAuth() {
  setAuthState({ status: "checking" });
  const nextState = await companyApiFacade.checkAuth();
  setAuthState(nextState);
}

async function handleLoadCanvas() {
  setCanvasLoading(true);
  setCanvasError(undefined);

  try {
    const result = await companyApiFacade.loadCanvasResources(canvasUrl);
    setProject(result.project);
    setAssets(result.assets);
  } catch (error) {
    setCanvasError(error instanceof Error ? error.message : "画布资源加载失败");
  } finally {
    setCanvasLoading(false);
  }
}
```

- Change header:

```tsx
<AppHeader authState={authState} project={project} />
```

- Render controls below header:

```tsx
<CanvasControls
  canvasUrl={canvasUrl}
  authState={authState}
  loading={canvasLoading}
  errorMessage={canvasError}
  onCanvasUrlChange={setCanvasUrl}
  onCheckAuth={handleCheckAuth}
  onLoadCanvas={handleLoadCanvas}
/>
```

- [ ] **Step 6: Add styles**

Append to `src/styles.css`:

```css
.canvas-controls {
  display: grid;
  max-width: 1260px;
  gap: 10px;
  margin: 18px auto 0;
  padding: 0 18px;
}

.canvas-url-field {
  display: grid;
  grid-template-columns: 22px 1fr;
  align-items: center;
  gap: 8px;
  border: 1px solid #d7d4cc;
  border-radius: 8px;
  background: #ffffff;
  padding: 10px 12px;
}

.canvas-url-field input {
  min-width: 0;
  border: 0;
  outline: none;
  color: #202734;
}

.canvas-control-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.primary-button,
.secondary-button {
  display: inline-flex;
  height: 36px;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  padding: 0 12px;
  cursor: pointer;
}

.primary-button {
  border: 1px solid #d94c54;
  background: #d94c54;
  color: #ffffff;
}

.secondary-button {
  border: 1px solid #d7d4cc;
  background: #ffffff;
  color: #2c3442;
}

.primary-button:disabled,
.secondary-button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.canvas-status-line,
.canvas-error-line {
  font-size: 12px;
}

.canvas-status-line {
  color: #68705f;
}

.canvas-error-line {
  color: #b4232d;
}
```

- [ ] **Step 7: Run GREEN**

Run:

```bash
npm test -- src/App.test.tsx
npm run build
```

Expected:

- App tests and build pass.

- [ ] **Step 8: Commit and push**

Run:

```bash
git add src/services/companyApiFacade.ts src/components/CanvasControls.tsx src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: wire canvas resource loading controls"
git push origin feature/ui-shell
```

Expected:

- Commit and push succeed.

## Task 8: Move Download Helper Out Of App

**Files:**
- Create: `src/lib/downloadAsset.ts`
- Create: `src/lib/downloadAsset.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write download helper tests**

Create `src/lib/downloadAsset.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadAsset } from "./downloadAsset";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("downloadAsset", () => {
  it("downloads remote assets through a temporary blob URL", async () => {
    const blob = new Blob(["asset"], { type: "image/png" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }));
    const createObjectURL = vi.fn(() => "blob:download");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const anchor = document.createElement("a");
    const click = vi.fn();
    vi.spyOn(anchor, "click").mockImplementation(click);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName === "a") {
        return anchor;
      }
      return Document.prototype.createElement.call(document, tagName, options);
    }) as typeof document.createElement);

    await downloadAsset({
      id: "asset-1",
      name: "素材",
      kind: "image",
      category: "characters",
      url: "https://example.com/image.png"
    });

    expect(anchor.href).toBe("blob:download");
    expect(anchor.download).toBe("素材.png");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:download");
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npm test -- src/lib/downloadAsset.test.ts
```

Expected:

- Fails because helper file does not exist.

- [ ] **Step 3: Move helper implementation**

Create `src/lib/downloadAsset.ts` by moving the existing `extractUrlExtension`, `getDownloadFileName`, `triggerDownload`, and `downloadAsset` functions from `src/App.tsx`.

Use this file:

```ts
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
```

- [ ] **Step 4: Import helper in App**

In `src/App.tsx`:

- Remove local `extractUrlExtension`, `getDownloadFileName`, `triggerDownload`, and `downloadAsset`.
- Add:

```ts
import { downloadAsset } from "./lib/downloadAsset";
```

- [ ] **Step 5: Remove duplicated App download test**

In `src/App.test.tsx`, delete the test named:

```ts
it("downloads remote assets by converting them to a local blob first", async () => {
```

The behavior is now covered by `src/lib/downloadAsset.test.ts`.

- [ ] **Step 6: Run GREEN**

Run:

```bash
npm test -- src/lib/downloadAsset.test.ts src/App.test.tsx
npm run build
```

Expected:

- Download helper tests, App tests, and build pass.

- [ ] **Step 7: Commit and push**

Run:

```bash
git add src/lib/downloadAsset.ts src/lib/downloadAsset.test.ts src/App.tsx src/App.test.tsx
git commit -m "refactor: move asset download helper"
git push origin feature/ui-shell
```

Expected:

- Commit and push succeed.

## Task 9: Add Upload Payload Builders

**Files:**
- Create: `src/api/uploadClient.ts`
- Create: `src/api/uploadClient.test.ts`

- [ ] **Step 1: Write upload tests**

Create `src/api/uploadClient.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAssetUploadPayload, buildUploadFormData, getUploadPrefix } from "./uploadClient";

describe("uploadClient payload builders", () => {
  it("uses the filename without extension as upload prefix", () => {
    expect(getUploadPrefix(new File(["x"], "green-box.png", { type: "image/png" }))).toBe("green-box");
  });

  it("builds upload FormData with file, prefix, and projectId", () => {
    const file = new File(["x"], "green-box.png", { type: "image/png" });
    const formData = buildUploadFormData(file, "project-1");

    expect(formData.get("file")).toBe(file);
    expect(formData.get("prefix")).toBe("green-box");
    expect(formData.get("projectId")).toBe("project-1");
  });

  it("builds asset metadata for registration", () => {
    expect(
      buildAssetUploadPayload({
        name: "green-box",
        kind: "image",
        publicUrl: "https://example.com/green-box.png",
        projectId: "project-1"
      })
    ).toEqual({
      name: "green-box",
      type: "image",
      url: "https://example.com/green-box.png",
      projectId: "project-1"
    });
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npm test -- src/api/uploadClient.test.ts
```

Expected:

- Fails because `uploadClient.ts` does not exist.

- [ ] **Step 3: Implement upload builders**

Create `src/api/uploadClient.ts`:

```ts
import type { AssetKind } from "../types";

interface BuildAssetUploadPayloadInput {
  name: string;
  kind: AssetKind;
  publicUrl: string;
  projectId?: string;
}

export function getUploadPrefix(file: File) {
  return file.name.replace(/\.[^.]+$/, "");
}

export function buildUploadFormData(file: File, projectId?: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("prefix", getUploadPrefix(file));

  if (projectId) {
    formData.append("projectId", projectId);
  }

  return formData;
}

export function buildAssetUploadPayload(input: BuildAssetUploadPayloadInput) {
  return {
    name: input.name,
    type: input.kind,
    url: input.publicUrl,
    projectId: input.projectId
  };
}
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
npm test -- src/api/uploadClient.test.ts
```

Expected:

- Upload builder tests pass.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/api/uploadClient.ts src/api/uploadClient.test.ts
git commit -m "feat: add upload payload builders"
git push origin feature/ui-shell
```

Expected:

- Commit and push succeed.

## Task 10: Add Generation Payload And Polling Helpers

**Files:**
- Create: `src/api/generationClient.ts`
- Create: `src/api/generationClient.test.ts`

- [ ] **Step 1: Write generation tests**

Create `src/api/generationClient.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ReferenceItem } from "../types";
import type { ApiTransport } from "./transport";
import { buildGenerateVideoPayload, pollTaskUntilComplete } from "./generationClient";

const refs: ReferenceItem[] = [
  { id: "img", name: "图", kind: "image", sizeBytes: 1, source: "asset" },
  { id: "vid", name: "视频", kind: "video", sizeBytes: 1, durationSeconds: 4, source: "asset" },
  { id: "aud", name: "音频", kind: "audio", sizeBytes: 1, durationSeconds: 5, source: "asset" }
];

describe("buildGenerateVideoPayload", () => {
  it("uses default Seedance settings and groups references by kind", () => {
    expect(buildGenerateVideoPayload({ prompt: "生成一段视频", references: refs })).toEqual({
      prompt: "生成一段视频",
      model: "Seedance 2.0",
      aspectRatio: "9:16",
      resolution: "720p",
      referenceImages: ["图"],
      referenceVideos: ["视频"],
      referenceAudios: ["音频"]
    });
  });
});

describe("pollTaskUntilComplete", () => {
  it("stops when the task succeeds", async () => {
    const transport: ApiTransport = {
      request: vi.fn()
        .mockResolvedValueOnce({ status: "running" })
        .mockResolvedValueOnce({ status: "succeeded", outputUrl: "https://example.com/out.mp4" })
    };

    await expect(pollTaskUntilComplete(transport, "/api/generate-video/task-1", { intervalMs: 0, maxAttempts: 3 }))
      .resolves.toEqual({ status: "succeeded", outputUrl: "https://example.com/out.mp4" });
  });

  it("fails after max attempts", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockResolvedValue({ status: "running" })
    };

    await expect(pollTaskUntilComplete(transport, "/api/generate-video/task-1", { intervalMs: 0, maxAttempts: 2 }))
      .rejects.toThrow("任务轮询超时");
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npm test -- src/api/generationClient.test.ts
```

Expected:

- Fails because `generationClient.ts` does not exist.

- [ ] **Step 3: Implement generation helper**

Create `src/api/generationClient.ts`:

```ts
import type { ReferenceItem } from "../types";
import type { ApiTransport } from "./transport";

interface BuildGenerateVideoPayloadInput {
  prompt: string;
  references: ReferenceItem[];
}

export function buildGenerateVideoPayload(input: BuildGenerateVideoPayloadInput) {
  return {
    prompt: input.prompt,
    model: "Seedance 2.0",
    aspectRatio: "9:16",
    resolution: "720p",
    referenceImages: input.references.filter((item) => item.kind === "image").map((item) => item.name),
    referenceVideos: input.references.filter((item) => item.kind === "video").map((item) => item.name),
    referenceAudios: input.references.filter((item) => item.kind === "audio").map((item) => item.name)
  };
}

export interface PollOptions {
  intervalMs: number;
  maxAttempts: number;
}

export async function pollTaskUntilComplete(
  transport: ApiTransport,
  path: string,
  options: PollOptions = { intervalMs: 1500, maxAttempts: 80 }
) {
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    const result = await transport.request<{ status?: string; outputUrl?: string; errorMessage?: string }>(path);

    if (result.status === "succeeded" || result.status === "failed") {
      return result;
    }

    if (options.intervalMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, options.intervalMs));
    }
  }

  throw new Error("任务轮询超时");
}
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
npm test -- src/api/generationClient.test.ts
```

Expected:

- Generation tests pass.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/api/generationClient.ts src/api/generationClient.test.ts
git commit -m "feat: add generation payload helpers"
git push origin feature/ui-shell
```

Expected:

- Commit and push succeed.

## Task 11: Wire Generate Button To Local Payload Preview Only

**Files:**
- Modify: `src/components/GeneratePanel.tsx`
- Modify: `src/components/PromptDock.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write App test**

Add to `src/App.test.tsx`:

```ts
it("builds a local generation payload preview without submitting the company API", async () => {
  render(<App />);

  fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
  fireEvent.click(screen.getByRole("button", { name: "生成视频" }));

  expect(await screen.findByText("已生成请求预览，未提交公司接口")).toBeInTheDocument();
  expect(screen.getByText(/Seedance 2.0/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected:

- Fails because generate button is not wired.

- [ ] **Step 3: Update GeneratePanel props**

Modify `src/components/GeneratePanel.tsx`:

```tsx
import { CaptionsOff, Sparkles } from "lucide-react";

interface GeneratePanelProps {
  onGenerate: () => void;
  disabled?: boolean;
  statusMessage?: string;
}

export function GeneratePanel({ onGenerate, disabled = false, statusMessage }: GeneratePanelProps) {
  return (
    <aside className="generate-panel" aria-label="生成设置">
      <div>
        <strong>Seedance 2.0</strong>
        <span>9:16 · 720p</span>
      </div>
      <label className="toggle-line">
        <input type="checkbox" />
        <CaptionsOff size={16} />
        <span>去除字幕</span>
      </label>
      <button type="button" className="generate-button" onClick={onGenerate} disabled={disabled}>
        <Sparkles size={18} />
        <span>生成视频</span>
      </button>
      {statusMessage && <div className="generate-status">{statusMessage}</div>}
    </aside>
  );
}
```

- [ ] **Step 4: Update PromptDock props**

Modify `src/components/PromptDock.tsx`:

- Add props:

```ts
onGenerate: () => void;
generateDisabled?: boolean;
generateStatus?: string;
```

- Pass them to `GeneratePanel`:

```tsx
<GeneratePanel onGenerate={onGenerate} disabled={generateDisabled} statusMessage={generateStatus} />
```

- [ ] **Step 5: Update App generate preview**

In `src/App.tsx`:

- Import `buildGenerateVideoPayload`.
- Add state:

```ts
const [generateStatus, setGenerateStatus] = useState<string | undefined>();
```

- Add handler:

```ts
function handleGeneratePreview() {
  const validation = validateReferenceItems(references);
  if (!prompt.trim()) {
    setGenerateStatus("请输入提示词");
    return;
  }

  if (!validation.valid) {
    setGenerateStatus(validation.errors.join(" / "));
    return;
  }

  buildGenerateVideoPayload({ prompt, references });
  setGenerateStatus("已生成请求预览，未提交公司接口");
}
```

- Pass to `PromptDock`:

```tsx
onGenerate={handleGeneratePreview}
generateStatus={generateStatus}
```

- [ ] **Step 6: Add status style**

Append to `src/styles.css`:

```css
.generate-status {
  color: #68705f;
  font-size: 12px;
}
```

- [ ] **Step 7: Run GREEN**

Run:

```bash
npm test -- src/App.test.tsx
npm run build
```

Expected:

- App tests and build pass.

- [ ] **Step 8: Commit and push**

Run:

```bash
git add src/components/GeneratePanel.tsx src/components/PromptDock.tsx src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: preview generation payload locally"
git push origin feature/ui-shell
```

Expected:

- Commit and push succeed.

## Task 12: Add Subtitle Payload Helpers

**Files:**
- Create: `src/api/subtitleClient.ts`
- Create: `src/api/subtitleClient.test.ts`

- [ ] **Step 1: Write subtitle tests**

Create `src/api/subtitleClient.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSubtitleRemovePayload } from "./subtitleClient";

describe("buildSubtitleRemovePayload", () => {
  it("builds payload from a source video URL", () => {
    expect(buildSubtitleRemovePayload("https://example.com/video.mp4")).toEqual({
      videoUrl: "https://example.com/video.mp4"
    });
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npm test -- src/api/subtitleClient.test.ts
```

Expected:

- Fails because `subtitleClient.ts` does not exist.

- [ ] **Step 3: Implement helper**

Create `src/api/subtitleClient.ts`:

```ts
export function buildSubtitleRemovePayload(videoUrl: string) {
  return { videoUrl };
}
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
npm test -- src/api/subtitleClient.test.ts
```

Expected:

- Subtitle helper test passes.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/api/subtitleClient.ts src/api/subtitleClient.test.ts
git commit -m "feat: add subtitle removal payload helper"
git push origin feature/ui-shell
```

Expected:

- Commit and push succeed.

## Task 13: Add Electron Preload Type Surface

**Files:**
- Modify: `electron/preload.ts`
- Create: `src/vite-env.d.ts`

- [ ] **Step 1: Update preload placeholder**

Modify `electron/preload.ts`:

```ts
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("ovoDesktop", {
  version: "0.1.0",
  auth: {
    openLoginWindow: async () => ({ ok: false, message: "登录窗口将在下一阶段接入" }),
    clearSession: async () => ({ ok: true })
  }
});
```

- [ ] **Step 2: Add renderer type definition**

Create `src/vite-env.d.ts`:

```ts
interface Window {
  ovoDesktop?: {
    version: string;
    auth: {
      openLoginWindow: () => Promise<{ ok: boolean; message?: string }>;
      clearSession: () => Promise<{ ok: boolean; message?: string }>;
    };
  };
}
```

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected:

- TypeScript and Vite build pass.

- [ ] **Step 4: Commit and push**

Run:

```bash
git add electron/preload.ts src/vite-env.d.ts
git commit -m "feat: expose desktop auth placeholders"
git push origin feature/ui-shell
```

Expected:

- Commit and push succeed.

## Task 14: Final Verification

**Files:**
- No new files unless verification reveals issues.

- [ ] **Step 1: Run full tests**

Run:

```bash
npm test
```

Expected:

- All Vitest tests pass.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected:

- TypeScript and Vite production build pass.

- [ ] **Step 3: Run browser verification**

Run local dev server:

```bash
npm run dev
```

Open the printed local URL and verify:

- Header shows unauthenticated state by default.
- Canvas URL input is visible.
- "检查登录态" button is visible.
- "加载画布资源" button is visible.
- Loading a mocked or reachable API response path does not break the existing five-section layout.
- Resource cards remain `9:16` and six-column on desktop.
- Existing prompt/reference behaviors still work.
- Generate button shows local preview status and does not submit company API.

- [ ] **Step 4: Inspect git state**

Run:

```bash
git status --short --branch
git ls-remote origin refs/heads/feature/ui-shell
```

Expected:

- Worktree is clean.
- Remote branch hash matches local `HEAD`.

- [ ] **Step 5: Report status**

Report:

- Latest commit hash.
- Test result.
- Build result.
- Browser verification notes.
- Any remaining open questions for real company API verification.
