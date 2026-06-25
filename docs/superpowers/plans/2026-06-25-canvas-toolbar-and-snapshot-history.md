# ovO 画布地址栏 + 打开奇境 + 快照历史 实施计划（v0.1.12）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给三个公司画布窗口加地址栏；新增「打开奇境」按钮；UI 改三列布局；新增画布快照自动/手动保存与恢复（含推回服务端）。

**Architecture:** Electron 主进程 `electron/`（新增持久化 canvasSnapshotStore、地址栏复用 attachBrowserToolbar、IPC 注册、before-quit flush）；渲染端 `src/App.tsx`（snapshotStateRef、自动/手动保存、恢复流程、flush 监听）；纯逻辑 `src/lib/canvasSnapshots.ts`（可单测）；UI `src/components/CanvasControls.tsx` + CSS。

**Tech Stack:** TypeScript、React、Vitest、Electron、Vite。

## Global Constraints

- 分支 `feature/ui-shell`，worktree `/Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell`。
- 所有 git/文件命令对 worktree 用 `git -C <绝对路径>` + `dangerouslyDisableSandbox`（macOS TCC 限制 ~/Documents）。
- 版本号 `package.json`：`0.1.11 → 0.1.12`（Task 8 统一 bump）。
- 完成后推 gitee `git@gitee.com:siberian-aries/ov-o_create_video_platform.git`。
- 收尾前必须全绿：`npm test`、`npx tsc --noEmit`、`npx tsc -p tsconfig.node.json --noEmit`、`npm run build`。

---

### Task 1: 快照纯逻辑（`src/lib/canvasSnapshots.ts` + 单测）

**Files:**
- Create: `src/lib/canvasSnapshots.ts`
- Create: `src/lib/canvasSnapshots.test.ts`

**Interfaces:**
- Produces:
  - `SnapshotEntry { id; createdAt; projectId; canvasName; canvasUrl; assets: CanvasAsset[]; canvasSnapshot: unknown; assetCount: number }`
  - `SnapshotMeta { id; createdAt; canvasName; assetCount }`
  - `buildSnapshotEntry(input: Omit<SnapshotEntry,'id'|'createdAt'|'assetCount'>, now: Date): SnapshotEntry`
  - `formatSnapshotTimestamp(createdAt: string): string` → `YYYY年MM月DD日 HH:mm:ss`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/canvasSnapshots.test.ts
import { describe, expect, it } from "vitest";
import { buildSnapshotEntry, formatSnapshotTimestamp } from "./canvasSnapshots";

describe("buildSnapshotEntry", () => {
  it("id 由 createdAt 派生，assetCount 正确", () => {
    const now = new Date("2026-06-25T10:00:00.000Z");
    const entry = buildSnapshotEntry(
      { projectId: "p1", canvasName: "test", canvasUrl: "http://x", assets: [{} as never, {} as never], canvasSnapshot: {} },
      now
    );
    expect(entry.createdAt).toBe("2026-06-25T10:00:00.000Z");
    expect(entry.id).toContain("2026-06-25");
    expect(entry.assetCount).toBe(2);
  });
});

describe("formatSnapshotTimestamp", () => {
  it("格式化为 YYYY年MM月DD日 HH:mm:ss（本地时间）", () => {
    // 使用固定 ISO 字符串，只测格式结构（不测时区偏移具体值）
    const result = formatSnapshotTimestamp("2026-06-25T10:00:00.000Z");
    expect(result).toMatch(/\d{4}年\d{2}月\d{2}日 \d{2}:\d{2}:\d{2}/);
  });
});
```

- [ ] **Step 2: 实现**

```ts
// src/lib/canvasSnapshots.ts
import type { CanvasAsset } from "../types";

export interface SnapshotEntry {
  id: string;
  createdAt: string;
  projectId: string;
  canvasName: string;
  canvasUrl: string;
  assets: CanvasAsset[];
  canvasSnapshot: unknown;
  assetCount: number;
}

export interface SnapshotMeta {
  id: string;
  createdAt: string;
  canvasName: string;
  assetCount: number;
}

export function buildSnapshotEntry(
  input: Omit<SnapshotEntry, "id" | "createdAt" | "assetCount">,
  now: Date
): SnapshotEntry {
  const createdAt = now.toISOString();
  const id = createdAt.replace(/[:.]/g, "-");
  return { ...input, id, createdAt, assetCount: input.assets.length };
}

export function formatSnapshotTimestamp(createdAt: string): string {
  const d = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
```

- [ ] **Step 3: 运行测试确认绿**

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell && npm test -- --reporter=verbose canvasSnapshots
```

---

### Task 2: 快照持久层（`electron/canvasSnapshotStore.ts`）

**Files:**
- Create: `electron/canvasSnapshotStore.ts`

**Interfaces:**
- Consumes: `app.getPath('userData')`，`electron/canvasStore.ts` 中 projectId 清洗模式（用 `replace(/[^a-zA-Z0-9_-]/g, '_')`）。
- Produces:
  - `listSnapshots(projectId): SnapshotMeta[]`（按 createdAt 倒序）
  - `appendSnapshot(projectId, entry: SnapshotEntry): Promise<SnapshotMeta[]>`（串行写，环形缓冲最多 6 份）
  - `getSnapshot(projectId, id): SnapshotEntry | null`

- [ ] **Step 1: 实现**

```ts
// electron/canvasSnapshotStore.ts
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { SnapshotEntry, SnapshotMeta } from "../src/lib/canvasSnapshots";

const MAX_SNAPSHOTS = 6;

function safeId(projectId: string) {
  return projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function snapshotFile(projectId: string) {
  const dir = path.join(app.getPath("userData"), "canvas-snapshots");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${safeId(projectId)}.json`);
}

function readEntries(projectId: string): SnapshotEntry[] {
  try {
    return JSON.parse(fs.readFileSync(snapshotFile(projectId), "utf-8")).entries ?? [];
  } catch {
    return [];
  }
}

function toMeta(e: SnapshotEntry): SnapshotMeta {
  return { id: e.id, createdAt: e.createdAt, canvasName: e.canvasName, assetCount: e.assetCount };
}

export function listSnapshots(projectId: string): SnapshotMeta[] {
  return readEntries(projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toMeta);
}

export function getSnapshot(projectId: string, id: string): SnapshotEntry | null {
  return readEntries(projectId).find((e) => e.id === id) ?? null;
}

// 串行写队列，防止并发 read-modify-write 互相覆盖
let writeQueue: Promise<void> = Promise.resolve();

export function appendSnapshot(projectId: string, entry: SnapshotEntry): Promise<SnapshotMeta[]> {
  writeQueue = writeQueue.then(() => {
    const entries = readEntries(projectId);
    entries.push(entry);
    entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const trimmed = entries.slice(-MAX_SNAPSHOTS);
    fs.writeFileSync(snapshotFile(projectId), JSON.stringify({ entries: trimmed }));
  });
  return writeQueue.then(() =>
    readEntries(projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toMeta)
  );
}
```

---

### Task 3: IPC 注册 + preload 暴露

**Files:**
- Modify: `electron/main.ts`（注册三个 snapshot IPC handler）
- Modify: `electron/preload.cts`（暴露 `ovoDesktop.snapshots`，version 改 0.1.12）

**Interfaces:**
- Consumes: `listSnapshots / appendSnapshot / getSnapshot`（Task 2）
- Produces: 渲染端可调用 `window.ovoDesktop.snapshots.list(projectId)` / `.append(projectId, entry)` / `.get(projectId, id)`

- [ ] **Step 1: main.ts 注册**

在 `electron/main.ts` 中，在其他 `ipcMain.handle` 附近添加：
```ts
import { listSnapshots, appendSnapshot, getSnapshot } from "./canvasSnapshotStore";

ipcMain.handle("ovo:snapshot:list", (_e, projectId: string) => listSnapshots(projectId));
ipcMain.handle("ovo:snapshot:append", (_e, projectId: string, entry: SnapshotEntry) => appendSnapshot(projectId, entry));
ipcMain.handle("ovo:snapshot:get", (_e, projectId: string, id: string) => getSnapshot(projectId, id));
```

- [ ] **Step 2: preload.cts 暴露**

在 `contextBridge.exposeInMainWorld("ovoDesktop", { ... })` 中追加（同时 version 改 `"0.1.12"`）：
```ts
version: "0.1.12",
snapshots: {
  list: (projectId: string) => ipcRenderer.invoke("ovo:snapshot:list", projectId),
  append: (projectId: string, entry: unknown) => ipcRenderer.invoke("ovo:snapshot:append", projectId, entry),
  get: (projectId: string, id: string) => ipcRenderer.invoke("ovo:snapshot:get", projectId, id),
},
```

- [ ] **Step 3: TypeScript 类型补全**

若项目有 `electron.d.ts` 或 `global.d.ts` 中的 `ovoDesktop` 类型声明，同步追加 `snapshots` 字段，避免 tsc 报错。

---

### Task 4: 地址栏复用（`companySession.ts`）

**Files:**
- Modify: `electron/companySession.ts`

**Interfaces:**
- Produces: `attachBrowserToolbar(win, view, initialUrl): { dispose(): void }`
- `openLoginWindow` 与 `openCanvasWindow`（plain/devtools/capture）都改用它

- [ ] **Step 1: 抽出 attachBrowserToolbar**

从 `openLoginWindow` 中把「地址栏 HTML 生成 + IPC 绑定 + did-navigate 回写 + resize 逻辑」抽为独立函数 `attachBrowserToolbar(win, view, initialUrl)`：
- 将 `createLoginToolbarUrl` 改名为 `createBrowserToolbarUrl`（或别名兼容），行为不变。
- `TOOLBAR_HEIGHT` 沿用 `LOGIN_TOOLBAR_HEIGHT`（值 48），统一命名为 `TOOLBAR_HEIGHT`（或保留现名）。
- 函数返回 `{ dispose() }` 供关闭时清理 `ipcMain.removeAllListeners(actionChannel)`。
- `openLoginWindow` 改为调用 `attachBrowserToolbar`，行为不变。

- [ ] **Step 2: openCanvasWindow 加地址栏**

在 `openCanvasWindow` 中：
1. 在 BrowserView 创建后调用 `attachBrowserToolbar(inspectWindow, inspectView, initialUrl)`。
2. `resizeInspectView` 改为从 `y = TOOLBAR_HEIGHT` 开始（现为 `y:0`）：
   ```ts
   inspectView.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(0, height - TOOLBAR_HEIGHT) });
   ```
3. `inspectWindow.on("closed")` 时调用 `dispose()`。
4. capture / devtools 的互斥逻辑（CDP / DevTools）不变。

- [ ] **Step 3: tsc electron 确认无报错**

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell && npx tsc -p tsconfig.node.json --noEmit
```

---

### Task 5: App.tsx — snapshotStateRef + takeSnapshot + 自动保存 + flush 监听

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `buildSnapshotEntry`（Task 1）、`ovoDesktop.snapshots.append`（Task 3）、`window.electron.ipcRenderer.on('ovo:snapshot:flush')` / `send('ovo:snapshot:flush-done')`
- Produces: `takeSnapshot(reason)`, `startAutoSave(projectId)`, `stopAutoSave()`；供 Task 6 恢复流程复用 `takeSnapshot`。

- [ ] **Step 1: snapshotStateRef**

紧接 `assetsRef` 下方，新增：
```ts
const snapshotStateRef = useRef<{
  projectId: string | null;
  canvasName: string;
  canvasUrl: string;
  assets: CanvasAsset[];
  canvasSnapshot: unknown;
}>({ projectId: null, canvasName: "", canvasUrl: "", assets: [], canvasSnapshot: null });
```

在已有的各 `setState` 附近同步 `snapshotStateRef.current`（projectId 跟 `project?.projectId`，其余跟各自 state 的最新值），复用 `assetsRef` 的同步模式。

- [ ] **Step 2: takeSnapshot + autoSave 控制器**

```ts
const autoSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

async function takeSnapshot(reason: string) {
  const s = snapshotStateRef.current;
  if (!s.projectId) return;
  const entry = buildSnapshotEntry(
    { projectId: s.projectId, canvasName: s.canvasName, canvasUrl: s.canvasUrl, assets: s.assets, canvasSnapshot: s.canvasSnapshot },
    new Date()
  );
  try {
    await window.ovoDesktop.snapshots.append(s.projectId, entry);
  } catch (e) {
    console.warn("[snapshot] append failed:", reason, e);
  }
}

function startAutoSave(projectId: string) {
  if (autoSaveIntervalRef.current) clearInterval(autoSaveIntervalRef.current);
  void takeSnapshot("load");
  autoSaveIntervalRef.current = setInterval(() => void takeSnapshot("auto"), 10 * 60 * 1000);
}

function stopAutoSave() {
  if (autoSaveIntervalRef.current) {
    clearInterval(autoSaveIntervalRef.current);
    autoSaveIntervalRef.current = null;
  }
}
```

在 `loadCanvasFromUrl` 成功设置状态之后调用 `startAutoSave(result.project.projectId)`。

- [ ] **Step 3: before-quit flush 监听**

在 App 顶层 `useEffect(() => { ... }, [])` 中：
```ts
const offFlush = window.electron?.ipcRenderer.on("ovo:snapshot:flush", () => {
  void takeSnapshot("quit").finally(() => {
    window.electron?.ipcRenderer.send("ovo:snapshot:flush-done");
  });
});
return () => { offFlush?.(); };
```

---

### Task 6: App.tsx — 恢复流程 + 手动保存 + 快照列表

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `takeSnapshot`（Task 5）、`ovoDesktop.snapshots.get/list`（Task 3）、`saveProjectSnapshot`、`loadCanvasFromUrl`、`setAssets/setCanvasName/setCanvasUrl/setCanvasSnapshot/persistLocalCanvasFull`
- Produces: `handleRestoreSnapshot(id)`, `handleManualSave()`, `snapshotHistory: SnapshotMeta[]`（state）, `refreshSnapshotHistory()`

- [ ] **Step 1: snapshotHistory state**

```ts
const [snapshotHistory, setSnapshotHistory] = useState<SnapshotMeta[]>([]);

async function refreshSnapshotHistory() {
  const pid = snapshotStateRef.current.projectId;
  if (!pid) return;
  const list = await window.ovoDesktop.snapshots.list(pid);
  setSnapshotHistory(list);
}
```

- [ ] **Step 2: handleManualSave**

```ts
async function handleManualSave() {
  await takeSnapshot("manual");
  await refreshSnapshotHistory();
}
```

- [ ] **Step 3: handleRestoreSnapshot**

```ts
async function handleRestoreSnapshot(id: string) {
  const pid = snapshotStateRef.current.projectId;
  if (!pid) return;
  try {
    // ① 先保底存一份
    await takeSnapshot("pre-restore");
    // ② 取完整快照
    const entry = await window.ovoDesktop.snapshots.get(pid, id);
    if (!entry) throw new Error("快照不存在");
    // ③ 回写本地视图
    setAssets(entry.assets);
    assetsRef.current = entry.assets;
    setCanvasName(entry.canvasName);
    setCanvasUrl(entry.canvasUrl);
    setCanvasSnapshot(entry.canvasSnapshot);
    persistLocalCanvasFull(entry.projectId ? project : null, entry.canvasName, entry.canvasUrl, entry.assets);
    // ④ 推回服务端 + 重新加载
    await saveProjectSnapshot(transport, pid, entry.canvasSnapshot);
    await loadCanvasFromUrl(entry.canvasUrl);
    addActivityMessage({ type: "info", text: `已恢复快照：${formatSnapshotTimestamp(entry.createdAt)}` });
    await refreshSnapshotHistory();
  } catch (e) {
    setCanvasError(`恢复失败：${e instanceof Error ? e.message : String(e)}`);
  }
}
```

---

### Task 7: before-quit flush（`electron/main.ts`）

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: 添加 before-quit handler**

在 `app.on("before-quit", ...)` 处（若已存在则追加，若无则新增）：
```ts
let flushed = false;
app.on("before-quit", (event) => {
  if (flushed) return;
  event.preventDefault();
  const win = mainWindow; // 只向主窗口发
  if (!win || win.isDestroyed()) { flushed = true; app.quit(); return; }
  const timer = setTimeout(() => { flushed = true; app.quit(); }, 1500);
  ipcMain.once("ovo:snapshot:flush-done", () => {
    clearTimeout(timer);
    flushed = true;
    app.quit();
  });
  win.webContents.send("ovo:snapshot:flush");
});
```

---

### Task 8: UI 重构（`CanvasControls.tsx` + CSS + 打开奇境按钮）

**Files:**
- Modify: `src/components/CanvasControls.tsx`（或对应 UI 组件文件）
- Modify: 对应 CSS 文件（`src/app.css` / `src/components/CanvasControls.css`）

**Interfaces:**
- 新增 props：`onSaveSnapshot()` / `snapshotHistory: SnapshotMeta[]` / `onOpenSnapshotHistory()` / `onRestoreSnapshot(id: string)` / `onOpenQijing()`
- 删除 props：无（只增不删，按钮内容/位置调整）

- [ ] **Step 1: 布局改三列**

`.canvas-controls` 由现有 2 列改为：
```css
.canvas-controls {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) auto;
  align-items: start;
  gap: 8px;
}
```

- [ ] **Step 2: 中列重排**

中列从上到下：
1. 名称行（不变）
2. 地址行：`[url-field | 打开奇境按钮]`（flex row，按钮贴右侧）
3. 动作行：`获取画布资源 》 保存记录 》 恢复历史记录`（三按钮 flex row）
4. 状态行 / 错误行（不变）

- [ ] **Step 3: 右列**

右列从上到下竖排：
- `Open公司画布`（plain）
- `Open公司画布(DevTools)`
- `Open公司画布(API Fetch)`

顶部与名称框 `align-self: start` 对齐。

- [ ] **Step 4: 恢复历史 popover**

`恢复历史记录` 按钮：点击展开一个内联下拉区（absolute 定位，z-index 足够），列出 `snapshotHistory`（最多 6 项），每项显示 `formatSnapshotTimestamp(item.createdAt) + " (" + item.assetCount + " 个资源)"` 可点击；空列表显示「暂无历史记录」。popover 打开时调用 `onOpenSnapshotHistory()`。

- [ ] **Step 5: App.tsx 传入新 props**

将 `handleManualSave`、`snapshotHistory`、`refreshSnapshotHistory`、`handleRestoreSnapshot`、`openQijing`（调用 `openCanvasWindow("http://qijing.kjjhz.cn/", "plain")`）传给 `<CanvasControls>`。

---

### Task 9: 版本号 + 测试 + 构建 + 推送

**Files:**
- Modify: `package.json`（version 0.1.11 → 0.1.12）

- [ ] **Step 1: bump 版本号**

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell && \
  node -e "const p=require('./package.json');p.version='0.1.12';require('fs').writeFileSync('./package.json',JSON.stringify(p,null,2)+'\n')"
```

- [ ] **Step 2: 全量测试**

```bash
npm test
```

- [ ] **Step 3: tsc 全量检查**

```bash
npx tsc --noEmit && npx tsc -p tsconfig.node.json --noEmit
```

- [ ] **Step 4: 构建**

```bash
npm run build
```

- [ ] **Step 5: commit + 推 gitee**

```bash
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell add -A && \
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell commit -m "feat: canvas toolbar + snapshot history v0.1.12

- attachBrowserToolbar: plain/devtools/capture 三窗口加地址栏
- 打开奇境按钮（plain 模式带地址栏）
- CanvasControls 三列布局（左历史/中动作+奇境/右三按钮）
- canvasSnapshotStore: 本地磁盘环形缓冲最多6份，串行写
- 自动保存（加载立即存1份+每10min）、手动保存、退出前保存
- 恢复：先存保底→回写本地→推服务端→重新加载

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" && \
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell push gitee feature/ui-shell
```

---

## 任务依赖顺序

```
Task 1 (纯逻辑)
Task 2 (持久层)
  ↓
Task 3 (IPC)    Task 4 (地址栏)
  ↓
Task 5 (auto-save) → Task 6 (恢复) → Task 7 (before-quit)
  ↓
Task 8 (UI)
  ↓
Task 9 (版本+测试+推送)
```

Task 1/2/4 可并行；Task 3 需 Task 2；Task 5/6/7 需 Task 3；Task 8 需 Task 5/6；Task 9 最后。
