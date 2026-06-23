# 图片生成轮询持久化 + 默认排序 + 引用清空 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 图片生成提交后立即清空引用+提示词；所有分类默认按生成时间降序；图片生成加 30 分钟轮询(1.5s/次、打印控制台)、实时持久化到 Electron 本地文件、应用重开自动续轮询，所有画布改动操作实时落盘。

**Architecture:** 新增一个 Electron 本地文件存储层(主进程 IPC + preload + 渲染端封装 `localCanvasStore`)，按 projectId 存一份"完整资产 + 进行中任务"的 JSON 到 userData 目录。App 在每次画布改动后并列调用本地落盘；启动/加载时读本地文件，按"远端为准、进行中任务本地优先"的规则合并，并对未超时的进行中任务自动续轮询。

**Tech Stack:** Electron 37 (main/preload, ESM `.ts` + CJS `.cts`)、React 18 + TypeScript、Vitest + Testing Library、Vite。

## Global Constraints

- 分支：`feature/ui-shell`（worktree 路径 `/Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell`）。
- 版本号：完成后 `package.json` version 0.1.5 → **0.1.6**。
- 远端推送：`git@gitee.com:siberian-aries/ov-o_create_video_platform.git`。
- 图片生成超时：**30 分钟**（轮询 1.5s/次 → maxAttempts 1200）。
- 持久化介质：Electron 本地文件，路径 `path.join(app.getPath("userData"), "canvas-store", "<projectId>.json")`。
- 存储 schema 含 `schemaVersion` 字段（初始 = 1），读取时按版本迁移。
- 合并判定键：`asset.id`（= nodeId）。`ready` 优先于 `generating`；两边都 ready 取 `createdAt`/`updatedAt` 较新者。
- 写文件失败不阻断主流程，仅 `console.warn`。
- 所有 `console.log` 轮询打印需带前缀 `[图片生成]`，便于过滤。
- 测试命令：`npm run test -- --run`（Vitest 单次）。构建：`npm run build`。

---

## 文件结构

- 新建 `electron/canvasStore.ts`：主进程本地文件读写（目录创建、读、写、错误处理）。
- 修改 `electron/main.ts`：注册 `ovo:local-store:read/write` 两个 ipcMain.handle。
- 修改 `electron/preload.cts`：暴露 `localStore.read/write`。
- 修改 `src/vite-env.d.ts`：补 `window.ovoDesktop.localStore` 类型。
- 新建 `src/lib/localCanvasStore.ts`：schema 定义、读写封装、版本迁移、合并规则（纯函数 + 薄 IPC 封装，便于单测）。
- 新建 `src/lib/localCanvasStore.test.ts`：迁移 + 合并规则单测。
- 修改 `src/api/imageGenerationClient.ts`：maxAttempts → 1200、轮询回调打印；新增 `pollImageResult`（仅轮询、不重提交，供续轮询用）。
- 修改 `src/services/companyApiFacade.ts`：暴露 `pollImageResult`。
- 修改 `src/App.tsx`：调整1（清空引用）、调整2（默认排序）、调整3（30min 超时 + 落盘 + 续轮询 + 启动恢复）。
- 修改 `src/App.test.tsx`：同步断言。

---

## Task 1: 全部分类默认按生成时间降序（调整2）

**Files:**
- Modify: `src/App.tsx:44-50`（`defaultSortModes`）
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: 既有 `SortMode` 类型、`sortCategoryAssets`、`getGeneratedTime`。
- Produces: 无新接口。

- [ ] **Step 1: 写失败测试**

在 `src/App.test.tsx` 末尾追加（验证非视频分类也默认降序）。先确认现有测试如何挂载 App 与触发加载，复用同一 helper。测试断言：加载含两个角色图（createdAt 一早一晚）后，角色区第一个渲染的是较晚 createdAt 的资产。

```tsx
test("非视频分类默认按生成时间降序", async () => {
  // 复用本文件已有的渲染+加载 helper（参照现有 "加载画布资源" 测试）
  // 准备两个 characters 资产：早 createdAt = 2026-01-01，晚 = 2026-02-01
  // 加载后，characters 区第一个卡片应为 2026-02-01 的资产
  // 用 within(charactersSection).getAllByRole(...) 取顺序
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- --run src/App.test.tsx`
Expected: FAIL（当前 characters 默认 `default`，顺序非降序）

- [ ] **Step 3: 改 defaultSortModes**

`src/App.tsx:44`：

```ts
const defaultSortModes: Record<AssetCategory, SortMode> = {
  characters: "generated-desc",
  scenes: "generated-desc",
  props: "generated-desc",
  audio: "generated-desc",
  video: "generated-desc"
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- --run src/App.test.tsx`
Expected: PASS。同时确认既有排序相关测试未因默认值改变而回归失败；若有断言依赖旧默认顺序，按新降序语义修正断言。

- [ ] **Step 5: 提交**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(sort): default all asset categories to generated-desc"
```

---

## Task 2: 生成图片后立即清空引用+提示词（调整1）

**Files:**
- Modify: `src/App.tsx`（`handleGenerateImage`，约 1435-1537）
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: 既有 `references`/`setReferences`/`setReferenceIssues`/`prompt`/`setPrompt`。
- Produces: 无新接口。

- [ ] **Step 1: 写失败测试**

在 `src/App.test.tsx` 追加：填入提示词 + 添加一个图片引用后点击"生成图片"，断言提示词输入框被清空、引用列表为空。Mock `companyApiFacade.generateImage` 返回一个挂起 Promise（保证测试在"提交后、完成前"断言清空已发生）。

```tsx
test("生成图片提交后立即清空提示词与引用", async () => {
  // mock generateImage 返回 never-resolving promise
  // 填提示词、添加一条 image reference
  // 点击 "生成图片"
  // 断言 prompt 输入框 value === "" 且引用区无项
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- --run src/App.test.tsx`
Expected: FAIL（引用未清空）

- [ ] **Step 3: 改 handleGenerateImage**

在 `src/App.tsx` `handleGenerateImage` 内，提交前先用局部变量保存引用，再清空状态；后续 `referenceImageUrls` 改为基于局部变量计算。

提交前段（现有 1458 `setPrompt("")` 处）改为：

```ts
const submittedReferences = references;
setPrompt("");
setReferences([]);
setReferenceIssues([]);
```

并将原 1469-1472 的 `referenceImageUrls` 计算源从 `references` 改为 `submittedReferences`：

```ts
const referenceImageUrls = submittedReferences
  .filter((reference) => reference.kind === "image")
  .map((reference) => reference.url)
  .filter((url): url is string => typeof url === "string" && /^https?:/i.test(url));
```

注意 `placeholder.generationReferences` 在 `createGeneratedImagePlaceholder` 内已基于当时的 `references` 生成（在清空前调用），不受影响——确认 placeholder 创建（1450）在清空（新代码）之前执行。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- --run src/App.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(image-gen): clear prompt and references on submit"
```

---

## Task 3: 图片轮询 30 分钟超时 + 控制台打印 + 续轮询入口

**Files:**
- Modify: `src/api/imageGenerationClient.ts`
- Test: `src/api/imageGenerationClient.test.ts`（若不存在则新建）

**Interfaces:**
- Consumes: 既有 `PollOptions`、`ApiTransport`、`pollImageQueueUntilComplete`、`extractImageUrl`、`GenerateImageResult`。
- Produces:
  - `DEFAULT_IMAGE_GENERATION_POLL_OPTIONS` 改为 `{ intervalMs: 1500, maxAttempts: 1200 }`。
  - 新增 `export async function pollImageResult(transport: ApiTransport, input: { projectId: string; nodeId: string; taskId?: string }, options?: PollOptions): Promise<GenerateImageResult>` —— 仅轮询队列、不重提交 POST，用于应用重开后续轮询。返回 `{ taskId, imageUrl }`。
  - 轮询每次迭代 `console.log("[图片生成] 轮询", { attempt, status, nodeId, taskId })`。

- [ ] **Step 1: 写失败测试**

`src/api/imageGenerationClient.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";
import { pollImageResult, DEFAULT_IMAGE_GENERATION_POLL_OPTIONS } from "./imageGenerationClient";

describe("pollImageResult", () => {
  it("仅轮询队列直到拿到 imageUrl，不调用 generate-image POST", async () => {
    const request = vi.fn()
      // 第一次队列查询：running
      .mockResolvedValueOnce({ items: [{ nodeId: "n1", status: "running" }] })
      // 第二次队列查询：succeeded + url
      .mockResolvedValueOnce({ items: [{ nodeId: "n1", status: "succeeded", imageUrl: "https://x/i.png" }] });
    const transport = { request } as any;
    const result = await pollImageResult(
      transport,
      { projectId: "p1", nodeId: "n1", taskId: "n1" },
      { intervalMs: 0, maxAttempts: 5 }
    );
    expect(result.imageUrl).toBe("https://x/i.png");
    // 不应出现对 generate-image 提交端点的 POST
    const calledPaths = request.mock.calls.map((c) => String(c[0]));
    expect(calledPaths.some((p) => p.includes("generate-image") && !p.includes("task"))).toBe(false);
  });
});

describe("DEFAULT_IMAGE_GENERATION_POLL_OPTIONS", () => {
  it("默认 30 分钟（1.5s × 1200）", () => {
    expect(DEFAULT_IMAGE_GENERATION_POLL_OPTIONS).toEqual({ intervalMs: 1500, maxAttempts: 1200 });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- --run src/api/imageGenerationClient.test.ts`
Expected: FAIL（`pollImageResult` 未定义 / 默认值仍为 600）

- [ ] **Step 3: 改默认值 + 加打印 + 加 pollImageResult**

`imageGenerationClient.ts:6`：

```ts
export const DEFAULT_IMAGE_GENERATION_POLL_OPTIONS: PollOptions = { intervalMs: 1500, maxAttempts: 1200 };
```

在 `pollImageQueueUntilComplete` 的 for 循环体顶部（取到 `taskResult` 后）加打印：

```ts
console.log("[图片生成] 轮询", {
  attempt,
  status: taskResult?.status ?? "pending",
  nodeId,
  taskId
});
```

新增导出函数（放在 `pollImageQueueUntilComplete` 之后）：

```ts
export async function pollImageResult(
  transport: ApiTransport,
  input: { projectId: string; nodeId: string; taskId?: string },
  options: PollOptions = DEFAULT_IMAGE_GENERATION_POLL_OPTIONS
): Promise<GenerateImageResult> {
  const queueTaskId = input.taskId ?? input.nodeId;
  const pollResult = await pollImageQueueUntilComplete(
    transport,
    input.projectId,
    input.nodeId,
    queueTaskId,
    options,
    input.taskId
  );
  const imageUrl = extractImageUrl(pollResult);
  if (!imageUrl) {
    throw new Error("续轮询成功但接口未返回图片地址");
  }
  return { taskId: queueTaskId, imageUrl };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- --run src/api/imageGenerationClient.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/api/imageGenerationClient.ts src/api/imageGenerationClient.test.ts
git commit -m "feat(image-gen): 30min poll timeout, console logging, pollImageResult resume entry"
```

---

## Task 4: companyApiFacade 暴露 pollImageResult

**Files:**
- Modify: `src/services/companyApiFacade.ts`

**Interfaces:**
- Consumes: Task 3 的 `pollImageResult`、既有 `desktopTransport`/`transport` 选择逻辑。
- Produces: `companyApiFacade.pollImageResult(input: { projectId: string; nodeId: string; taskId?: string }): Promise<{ taskId: string; imageUrl: string }>`。

- [ ] **Step 1: 加 import**

`src/services/companyApiFacade.ts:4` 附近：

```ts
import { generateImage as generateImageWithTransport, pollImageResult as pollImageResultWithTransport } from "../api/imageGenerationClient";
```

- [ ] **Step 2: 在 facade 对象加方法**

在 `generateImage`（约 91-97）之后追加：

```ts
pollImageResult: (input: { projectId: string; nodeId: string; taskId?: string }) =>
  pollImageResultWithTransport(window.ovoDesktop ? desktopTransport : transport, input),
```

- [ ] **Step 3: 构建验证类型**

Run: `npm run build`
Expected: 编译通过（无类型错误）

- [ ] **Step 4: 提交**

```bash
git add src/services/companyApiFacade.ts
git commit -m "feat(facade): expose pollImageResult for resume polling"
```

---

## Task 5: Electron 本地文件存储（主进程 + preload + 类型）

**Files:**
- Create: `electron/canvasStore.ts`
- Modify: `electron/main.ts`、`electron/preload.cts`、`src/vite-env.d.ts`

**Interfaces:**
- Produces:
  - 主进程：`readCanvasStore(projectId: string): Promise<unknown | null>`、`writeCanvasStore(projectId: string, data: unknown): Promise<{ ok: boolean }>`。
  - IPC 通道：`ovo:local-store:read`（参数 projectId，返回 `unknown | null`）、`ovo:local-store:write`（参数 projectId + data，返回 `{ ok: boolean }`）。
  - preload：`window.ovoDesktop.localStore.read(projectId)` / `.write(projectId, data)`。

- [ ] **Step 1: 新建 electron/canvasStore.ts**

```ts
import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";

function storeDir() {
  return path.join(app.getPath("userData"), "canvas-store");
}

function storeFile(projectId: string) {
  // projectId 已是服务端 id，做基本清洗避免路径穿越
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(storeDir(), `${safe}.json`);
}

export async function readCanvasStore(projectId: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(storeFile(projectId), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeCanvasStore(projectId: string, data: unknown): Promise<{ ok: boolean }> {
  try {
    await fs.mkdir(storeDir(), { recursive: true });
    await fs.writeFile(storeFile(projectId), JSON.stringify(data), "utf8");
    return { ok: true };
  } catch (error) {
    console.warn("[canvasStore] 写入失败", error);
    return { ok: false };
  }
}
```

- [ ] **Step 2: main.ts 注册 IPC**

`electron/main.ts`：import 区加 `import { readCanvasStore, writeCanvasStore } from "./canvasStore.js";`，并在 `app.whenReady()` 内（约第 63 行 save-assets handler 之后）加：

```ts
ipcMain.handle("ovo:local-store:read", (_event, projectId: string) => readCanvasStore(projectId));
ipcMain.handle("ovo:local-store:write", (_event, projectId: string, data: unknown) =>
  writeCanvasStore(projectId, data)
);
```

- [ ] **Step 3: preload.cts 暴露**

`electron/preload.cts` 的 `exposeInMainWorld` 对象内 `file: {...}`（约 50 行）之后加：

```ts
  ,
  localStore: {
    read: (projectId: string) => ipcRenderer.invoke("ovo:local-store:read", projectId),
    write: (projectId: string, data: unknown) => ipcRenderer.invoke("ovo:local-store:write", projectId, data)
  }
```

- [ ] **Step 4: vite-env.d.ts 加类型**

`src/vite-env.d.ts` 的 `ovoDesktop` 对象类型内、`file:` 块之后加：

```ts
    localStore?: {
      read: (projectId: string) => Promise<unknown | null>;
      write: (projectId: string, data: unknown) => Promise<{ ok: boolean }>;
    };
```

- [ ] **Step 5: 构建验证**

Run: `npm run build`
Expected: `tsc -p tsconfig.json && tsc -p tsconfig.node.json && vite build` 全部通过（含 electron 的 node 配置）。

- [ ] **Step 6: 提交**

```bash
git add electron/canvasStore.ts electron/main.ts electron/preload.cts src/vite-env.d.ts
git commit -m "feat(electron): local canvas store IPC (read/write to userData)"
```

---

## Task 6: localCanvasStore 渲染端封装（schema + 迁移 + 合并，纯函数 TDD）

**Files:**
- Create: `src/lib/localCanvasStore.ts`
- Test: `src/lib/localCanvasStore.test.ts`

**Interfaces:**
- Consumes: `CanvasAsset`、`AssetCategory`（来自 `../types`）；`window.ovoDesktop.localStore`。
- Produces:
  - 类型 `LocalCanvasStore`、`PendingTask`（见下）。
  - `CURRENT_SCHEMA_VERSION = 1`。
  - `migrateLocalCanvasStore(raw: unknown): LocalCanvasStore | null` —— 解析+迁移，无法识别返回 null。
  - `mergeCanvasState(local: LocalCanvasStore | null, remote: { assets: CanvasAsset[] }): { assets: CanvasAsset[]; pendingTasks: PendingTask[] }` —— 远端为准、进行中本地优先。
  - `readLocalCanvas(projectId: string): Promise<LocalCanvasStore | null>`。
  - `writeLocalCanvas(store: LocalCanvasStore): Promise<void>`（失败仅 console.warn）。
  - `buildLocalCanvasStore(input: { projectId; canvasName; canvasUrl; assets; pendingTasks }): LocalCanvasStore`。

类型定义（写在文件顶部）：

```ts
import type { AssetCategory, CanvasAsset } from "../types";

export const CURRENT_SCHEMA_VERSION = 1;

export interface PendingTask {
  nodeId: string;
  taskId?: string;
  kind: "image" | "video";
  category: AssetCategory;
  prompt: string;
  startTime: number;
  status: "submitting" | "queued" | "running";
}

export interface LocalCanvasStore {
  schemaVersion: number;
  projectId: string;
  canvasName: string;
  canvasUrl: string;
  assets: CanvasAsset[];
  pendingTasks: PendingTask[];
  updatedAt: string;
}
```

- [ ] **Step 1: 写失败测试**

`src/lib/localCanvasStore.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { migrateLocalCanvasStore, mergeCanvasState, buildLocalCanvasStore, CURRENT_SCHEMA_VERSION } from "./localCanvasStore";
import type { CanvasAsset } from "../types";

const baseAsset = (over: Partial<CanvasAsset>): CanvasAsset => ({
  id: "a1", name: "x", kind: "image", category: "characters", url: "u", sizeBytes: 0, ...over
});

describe("migrateLocalCanvasStore", () => {
  it("接受当前版本对象", () => {
    const store = buildLocalCanvasStore({
      projectId: "p1", canvasName: "n", canvasUrl: "c", assets: [], pendingTasks: []
    });
    expect(migrateLocalCanvasStore(store)?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
  it("无 schemaVersion 的旧对象补成当前版本", () => {
    const legacy = { projectId: "p1", canvasName: "n", canvasUrl: "c", assets: [], pendingTasks: [], updatedAt: "t" };
    const migrated = migrateLocalCanvasStore(legacy);
    expect(migrated?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
  it("非对象返回 null", () => {
    expect(migrateLocalCanvasStore(null)).toBeNull();
    expect(migrateLocalCanvasStore("x")).toBeNull();
  });
});

describe("mergeCanvasState", () => {
  it("远端 ready 覆盖本地、清除对应 pendingTask", () => {
    const local = buildLocalCanvasStore({
      projectId: "p1", canvasName: "n", canvasUrl: "c",
      assets: [baseAsset({ id: "n1", status: "generating" })],
      pendingTasks: [{ nodeId: "n1", kind: "image", category: "characters", prompt: "p", startTime: 1, status: "running" }]
    });
    const remote = { assets: [baseAsset({ id: "n1", status: "ready", url: "remote" })] };
    const merged = mergeCanvasState(local, remote);
    expect(merged.assets.find((a) => a.id === "n1")?.status).toBe("ready");
    expect(merged.pendingTasks.find((t) => t.nodeId === "n1")).toBeUndefined();
  });
  it("远端无该 nodeId 时保留本地 generating 资产与 pendingTask", () => {
    const local = buildLocalCanvasStore({
      projectId: "p1", canvasName: "n", canvasUrl: "c",
      assets: [baseAsset({ id: "n1", status: "generating" })],
      pendingTasks: [{ nodeId: "n1", kind: "image", category: "characters", prompt: "p", startTime: 1, status: "running" }]
    });
    const merged = mergeCanvasState(local, { assets: [] });
    expect(merged.assets.find((a) => a.id === "n1")?.status).toBe("generating");
    expect(merged.pendingTasks).toHaveLength(1);
  });
  it("local 为 null 时直接用远端、无 pending", () => {
    const merged = mergeCanvasState(null, { assets: [baseAsset({ id: "n1", status: "ready" })] });
    expect(merged.assets).toHaveLength(1);
    expect(merged.pendingTasks).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- --run src/lib/localCanvasStore.test.ts`
Expected: FAIL（模块/函数未定义）

- [ ] **Step 3: 实现 localCanvasStore.ts**

在类型定义下方实现（合并规则：以远端 assets 为基底，按 id 用 Map 索引本地；远端缺失但本地 generating 的资产补进结果；pendingTasks 仅保留"远端不存在该 id 或远端该 id 非 ready"的项）：

```ts
export function buildLocalCanvasStore(input: {
  projectId: string;
  canvasName: string;
  canvasUrl: string;
  assets: CanvasAsset[];
  pendingTasks: PendingTask[];
}): LocalCanvasStore {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectId: input.projectId,
    canvasName: input.canvasName,
    canvasUrl: input.canvasUrl,
    assets: input.assets,
    pendingTasks: input.pendingTasks,
    updatedAt: new Date().toISOString()
  };
}

export function migrateLocalCanvasStore(raw: unknown): LocalCanvasStore | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  if (typeof value.projectId !== "string" || !Array.isArray(value.assets)) {
    return null;
  }
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectId: value.projectId,
    canvasName: typeof value.canvasName === "string" ? value.canvasName : "未命名画布",
    canvasUrl: typeof value.canvasUrl === "string" ? value.canvasUrl : "",
    assets: value.assets as CanvasAsset[],
    pendingTasks: Array.isArray(value.pendingTasks) ? (value.pendingTasks as PendingTask[]) : [],
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString()
  };
}

export function mergeCanvasState(
  local: LocalCanvasStore | null,
  remote: { assets: CanvasAsset[] }
): { assets: CanvasAsset[]; pendingTasks: PendingTask[] } {
  if (!local) {
    return { assets: remote.assets, pendingTasks: [] };
  }

  const remoteById = new Map(remote.assets.map((asset) => [asset.id, asset]));
  const mergedAssets = [...remote.assets];

  // 远端缺失但本地仍 generating 的资产补回
  for (const localAsset of local.assets) {
    if (!remoteById.has(localAsset.id) && localAsset.status === "generating") {
      mergedAssets.push(localAsset);
    }
  }

  // 进行中任务：远端已 ready 的清除，其余保留
  const pendingTasks = local.pendingTasks.filter((task) => {
    const remoteAsset = remoteById.get(task.nodeId);
    return !(remoteAsset && remoteAsset.status === "ready");
  });

  return { assets: mergedAssets, pendingTasks };
}

export async function readLocalCanvas(projectId: string): Promise<LocalCanvasStore | null> {
  const store = window.ovoDesktop?.localStore;
  if (!store) {
    return null;
  }
  try {
    const raw = await store.read(projectId);
    return migrateLocalCanvasStore(raw);
  } catch (error) {
    console.warn("[localCanvasStore] 读取失败", error);
    return null;
  }
}

export async function writeLocalCanvas(store: LocalCanvasStore): Promise<void> {
  const api = window.ovoDesktop?.localStore;
  if (!api) {
    return;
  }
  try {
    await api.write(store.projectId, store);
  } catch (error) {
    console.warn("[localCanvasStore] 写入失败", error);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- --run src/lib/localCanvasStore.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/localCanvasStore.ts src/lib/localCanvasStore.test.ts
git commit -m "feat(local-store): schema migration + remote-wins merge for canvas cache"
```

---

## Task 7: App 接入实时落盘 + 启动恢复 + 图片续轮询（调整3）

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: Task 4 `companyApiFacade.pollImageResult`；Task 6 `readLocalCanvas`/`writeLocalCanvas`/`buildLocalCanvasStore`/`mergeCanvasState`/`PendingTask`。
- Produces: App 内部 helper `persistLocalCanvasFull(...)`、`resumePendingImageTasks(...)`，无对外接口。

实现说明：本任务较大，按子步骤推进。`pendingTasks` 用一个 `useRef<PendingTask[]>` 维护（避免频繁 re-render），落盘时读取 ref。30 分钟超时常量 `IMAGE_GENERATION_TIMEOUT_MS = 30 * 60 * 1000`。

- [ ] **Step 1: 引入依赖与 helper**

`src/App.tsx` 顶部 import 加：

```ts
import { readLocalCanvas, writeLocalCanvas, buildLocalCanvasStore, mergeCanvasState, type PendingTask } from "./lib/localCanvasStore";
```

在组件内（`persistCanvasHistoryEntry` 定义附近，约 424）加 pendingTasks ref 与落盘 helper：

```ts
const pendingTasksRef = useRef<PendingTask[]>([]);
const IMAGE_GENERATION_TIMEOUT_MS = 30 * 60 * 1000;

function persistLocalCanvasFull(nextProject = project, nextName = canvasName, nextUrl = canvasUrl, nextAssets = assetsRef.current) {
  if (!nextProject?.projectId) {
    return;
  }
  void writeLocalCanvas(
    buildLocalCanvasStore({
      projectId: nextProject.projectId,
      canvasName: nextName,
      canvasUrl: nextUrl,
      assets: nextAssets,
      pendingTasks: pendingTasksRef.current
    })
  );
}
```

- [ ] **Step 2: 在所有改动点并列调用落盘**

在以下既有 `persistCanvasHistoryEntry(...)` 调用之后，并列加一行 `persistLocalCanvasFull(...)`（同参数语义）：
- `loadCanvasFromUrl` 成功分支（975-986 之间，setAssets 之后）
- `handleGeneratePreview` 提交占位（1314）、成功（1395）
- `handleGenerateImage` 提交占位（1453）、成功（1511）
- `renameAsset`（1006 setAssets 后）
- `changeAssetCategory`（1037 setAssets 后）
- 去字幕相关 setAssets 后（702/729/834/860）

每处形如：

```ts
persistLocalCanvasFull(project, canvasName, getCanvasUrlFromProject(project) || canvasUrl, nextAssets);
```

（用该处已有的 assets 变量名；若该处用 `assetsWithPlaceholder`/`completedAssets`/`nextAssets` 则传对应变量。）

- [ ] **Step 3: 图片生成维护 pendingTasks + 30min 超时**

在 `handleGenerateImage` 内：提交占位后向 ref 添加任务；成功/失败/超时时移除。在 `setAssets(assetsWithPlaceholder)`（1452）后加：

```ts
pendingTasksRef.current = [
  ...pendingTasksRef.current,
  {
    nodeId: placeholder.id,
    kind: "image",
    category: assetCategory,
    prompt: promptText,
    startTime,
    status: "submitting"
  }
];
```

（注：`startTime` 当前在 1460 定义，需将其上移到此 push 之前。）

加 30 分钟超时（参照视频 1335-1349 的 setTimeout 模式），超时回调内置占位为 failed、移除 pendingTask、`clearInterval(progressInterval)`：

```ts
const timeoutId = setTimeout(() => {
  clearInterval(progressInterval);
  pendingTasksRef.current = pendingTasksRef.current.filter((t) => t.nodeId !== placeholder.id);
  setAssets((current) => current.map((asset) =>
    asset.id === placeholder.id
      ? { ...asset, status: "failed" as const, errorMessage: "生成超时（超过30分钟），请检查网络或重试" }
      : asset
  ));
  updateActivityMessage(generationActivityId, "生成超时（超过30分钟），请检查网络或重试");
  persistLocalCanvasFull();
}, IMAGE_GENERATION_TIMEOUT_MS);
```

在 `generateImage` 返回后第一步 `clearTimeout(timeoutId)`。成功分支末尾与 catch 分支均加：

```ts
pendingTasksRef.current = pendingTasksRef.current.filter((t) => t.nodeId !== placeholder.id);
persistLocalCanvasFull();
```

catch 分支也要 `clearTimeout(timeoutId)`。

- [ ] **Step 4: 拿到 taskId 后回填 pendingTask**

`generateImage` 成功返回 `result`（含 `taskId`）后，成功写资产前，回填：

```ts
pendingTasksRef.current = pendingTasksRef.current.map((t) =>
  t.nodeId === placeholder.id ? { ...t, taskId: result.taskId, status: "running" } : t
);
persistLocalCanvasFull();
```

（这样即便随后崩溃，落盘里已带 taskId，可精确续轮询。）

- [ ] **Step 5: 启动恢复 + 续轮询 helper**

加 helper：

```ts
async function resumePendingImageTasks(loadedProject: typeof project, merged: { pendingTasks: PendingTask[] }) {
  if (!loadedProject?.projectId) {
    return;
  }
  for (const task of merged.pendingTasks) {
    if (task.kind !== "image") {
      continue;
    }
    if (Date.now() - task.startTime > IMAGE_GENERATION_TIMEOUT_MS) {
      setAssets((current) => current.map((asset) =>
        asset.id === task.nodeId
          ? { ...asset, status: "failed" as const, errorMessage: "生成超时（超过30分钟），请检查网络或重试" }
          : asset
      ));
      pendingTasksRef.current = pendingTasksRef.current.filter((t) => t.nodeId !== task.nodeId);
      persistLocalCanvasFull();
      continue;
    }
    void companyApiFacade
      .pollImageResult({ projectId: loadedProject.projectId, nodeId: task.nodeId, taskId: task.taskId })
      .then((result) => {
        if (!mounted.current) return;
        setAssets((current) => current.map((asset) =>
          asset.id === task.nodeId ? { ...asset, url: result.imageUrl, status: "ready" as const } : asset
        ));
        pendingTasksRef.current = pendingTasksRef.current.filter((t) => t.nodeId !== task.nodeId);
        persistLocalCanvasFull();
        addActivityMessage(`已恢复并完成图片生成：${task.nodeId}`);
      })
      .catch((error) => {
        if (!mounted.current) return;
        setAssets((current) => current.map((asset) =>
          asset.id === task.nodeId
            ? { ...asset, status: "failed" as const, errorMessage: error instanceof Error ? error.message : "续轮询失败" }
            : asset
        ));
        pendingTasksRef.current = pendingTasksRef.current.filter((t) => t.nodeId !== task.nodeId);
        persistLocalCanvasFull();
      });
  }
}
```

在 `loadCanvasFromUrl` 成功分支：读本地、合并、把合并结果用于 setAssets 与 pendingTasksRef，并触发续轮询。在 `setAssets(nextAssets)`（974）替换为合并逻辑：

```ts
const localStore = await readLocalCanvas(result.project.projectId);
const merged = mergeCanvasState(localStore, { assets: nextAssets });
pendingTasksRef.current = merged.pendingTasks;
setProject(result.project);
setCanvasSnapshot(result.snapshot);
setAssets(merged.assets);
// ...其余既有 setCanvasName/setSortModes/setDefaultAssetOrder/历史 upsert 不变，
// defaultAssetOrder 用 merged.assets 计算
setDefaultAssetOrder(createAssetOrder(merged.assets));
persistLocalCanvasFull(result.project, nextCanvasName, result.project.canvasUrl, merged.assets);
void resumePendingImageTasks(result.project, merged);
```

- [ ] **Step 6: 写测试（续轮询恢复）**

`src/App.test.tsx` 追加：mock `window.ovoDesktop.localStore.read` 返回一个含 image pendingTask（带 taskId、startTime=now）的 store；mock `companyApiFacade.pollImageResult` resolve 一个 imageUrl；触发加载后断言该节点最终 status ready / 显示生成图。

```tsx
test("启动加载后自动续轮询未完成的图片任务", async () => {
  // mock localStore.read -> { schemaVersion:1, projectId, assets:[generating n1], pendingTasks:[{nodeId:n1,taskId,kind:image,...startTime:Date.now()}] }
  // mock loadCanvasResources -> 远端无 n1（仍在生成）
  // mock pollImageResult -> { taskId, imageUrl: "https://x/done.png" }
  // 点击加载画布资源
  // await waitFor: n1 资产 status 变 ready / 图片 src 为 done.png
});
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npm run test -- --run src/App.test.tsx`
Expected: PASS（含新测试与既有测试）

- [ ] **Step 8: 全量构建 + 测试**

Run: `npm run build && npm run test -- --run`
Expected: 构建通过，全部测试 PASS

- [ ] **Step 9: 提交**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(image-gen): persist full canvas + pending tasks, resume polling on reopen"
```

---

## Task 8: 版本 bump + 推送 gitee

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 改版本号**

`package.json` version `0.1.5` → `0.1.6`。

- [ ] **Step 2: 最终验证**

Run: `npm run build && npm run test -- --run`
Expected: 全绿。

- [ ] **Step 3: 提交并推送**

```bash
git add package.json
git commit -m "chore: bump version to 0.1.6"
git push origin feature/ui-shell
```

Expected: 推送成功到 gitee `feature/ui-shell`。

---

## Self-Review 结论

- **Spec 覆盖**：调整1→Task2；调整2→Task1；调整3（轮询/超时/打印→Task3、facade→Task4、本地存储→Task5/6、落盘+续轮询+启动恢复→Task7）；版本+推送→Task8；调整4已取消（无任务，符合 spec）。
- **占位符扫描**：无 TBD/TODO；所有代码步骤含完整代码。测试步骤含可运行断言骨架（依赖 App.test.tsx 既有 helper，已注明复用）。
- **类型一致性**：`pollImageResult` 签名在 Task3 定义、Task4/Task7 一致引用；`PendingTask`/`LocalCanvasStore`/`mergeCanvasState`/`buildLocalCanvasStore` 在 Task6 定义、Task7 一致引用；`window.ovoDesktop.localStore` 在 Task5 声明、Task6 使用一致。

## 风险与边界（来自 spec）

- 存量资产无 `createdAt` → 排序回退默认位置，不补真实生成时间。
- 多端同改 → 以点击"加载画布资源"为准。
- 提交后未拿 taskId 即关闭 → `pollImageResult` 用 nodeId 作为 queueTaskId 兜底轮询队列。
- 写文件失败 → console.warn，不阻断主流程。
