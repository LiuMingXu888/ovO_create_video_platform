# ovO 画布同步修复 + 顶栏/画布按钮重构 实施计划（v0.1.11）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复音频/视频不同步到公司画布、图片占位符竞态、本地上传冲掉生成中占位符三个 bug；重构顶栏登录按钮与画布打开按钮（拆三模式）。

**Architecture:** 前端 React（`src/App.tsx` + `src/components/*`），节点写入逻辑在 `src/api/uploadClient.ts`，Electron 主进程在 `electron/*`。画布节点按公司端原生 schema 对齐 `data.status`/字段；占位符竞态用 `assetsRef.current` 即时同步消除；三个画布按钮经新 IPC `ovo:canvas:open` + `openCanvasWindow(url,mode)` 分发。

**Tech Stack:** TypeScript、React、Vitest、Electron、Vite。

## Global Constraints

- 分支 `feature/ui-shell`，worktree `/Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell`。
- 所有 git/文件命令对 worktree 用 `git -C <绝对路径>` + `dangerouslyDisableSandbox`（macOS TCC 限制 ~/Documents）。
- 版本号 `package.json`：`0.1.10 → 0.1.11`（最后一个任务统一 bump）。
- 完成后推 gitee `git@gitee.com:siberian-aries/ov-o_create_video_platform.git`。
- 收尾前必须全绿：`npm test`、`npx tsc --noEmit`（app）、`npx tsc -p tsconfig.node.json --noEmit`（electron）、`npm run build`。
- audio/video `status:"idle"` 为强假设，打包后需人工实测确认（见 Task 9 验证清单）。

---

### Task 1: 画布节点 schema 对齐（音频/视频不同步修复）

**Files:**
- Modify: `src/api/uploadClient.ts`（`baseNode` ~258-289、`createCompanyAudioNode` ~172-178、`createCompanyVideoNode` ~180-200、`MEASURED_BY_KIND` ~43-47）
- Test: `src/api/uploadClient.test.ts`（若不存在则创建）

**Interfaces:**
- Consumes: `CanvasAsset`（`src/types`）、`createAssetNode(asset)`、`baseNode(asset, fields)`、`compactRecord`。
- Produces: `createCompanyImageNode/AudioNode/VideoNode(asset) → CompanyNode`，其中 `node.type==="image"` 时 `data.status==="completed"`；`type` 为 `"audio"|"video"` 时 `data.status==="idle"`；audio 节点 `data.isCustomUpload===true`；video 节点 `data.model==="Seedance 2.0"`。

- [ ] **Step 1: 写失败测试**

创建/追加 `src/api/uploadClient.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { createCompanyAudioNode, createCompanyVideoNode, createCompanyImageNode } from "./uploadClient";
import type { CanvasAsset } from "../types";

const base = (over: Partial<CanvasAsset>): CanvasAsset => ({
  id: "a1", name: "n", kind: "image", category: "scenes", url: "http://x/y", status: "ready", ...over
});

describe("company node schema 对齐公司端原生", () => {
  it("image 完成态 status=completed + imageSource=upload", () => {
    const n = createCompanyImageNode(base({ kind: "image", category: "scenes" }));
    expect(n.data.status).toBe("completed");
    expect(n.data.imageSource).toBe("upload");
  });
  it("audio 完成态 status=idle + isCustomUpload=true + 占位字段为 null", () => {
    const n = createCompanyAudioNode(base({ kind: "audio", category: "audio" }));
    expect(n.data.status).toBe("idle");
    expect(n.data.isCustomUpload).toBe(true);
    expect(n.data.voicePresetId).toBeNull();
    expect(n.data.voiceName).toBeNull();
    expect(n.data.gender).toBeNull();
    expect(n.data.ageGroup).toBeNull();
  });
  it("video 完成态 status=idle + model=Seedance 2.0", () => {
    const n = createCompanyVideoNode(base({ kind: "video", category: "video" }));
    expect(n.data.status).toBe("idle");
    expect(n.data.model).toBe("Seedance 2.0");
  });
  it("生成中占位 status 不被强转为完成值", () => {
    const n = createCompanyVideoNode(base({ kind: "video", category: "video", status: "generating" }));
    expect(n.data.status).toBe("generating");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell && npx vitest run src/api/uploadClient.test.ts`
Expected: FAIL（audio status 当前是 completed、缺 isCustomUpload；video model 是 endpoint id）

- [ ] **Step 3: 改 `baseNode` status 按 kind 区分**

将 `baseNode`（`src/api/uploadClient.ts` ~263）的 status 计算：

```ts
  // 完成态(ready/无 status)的渲染状态按公司端原生枚举区分:image→completed,
  // audio/video→idle(公司端完成态用 idle);进行中/失败保留自身,避免误标完成。
  const completedStatusByKind: Record<AssetKind, string> = {
    image: "completed",
    audio: "idle",
    video: "idle"
  };
  const status = !asset.status || asset.status === "ready" ? completedStatusByKind[asset.kind] : asset.status;
```

- [ ] **Step 4: 补 audio/video 原生字段**

`createCompanyAudioNode`（~172）：

```ts
export function createCompanyAudioNode(asset: CanvasAsset): CompanyNode {
  return baseNode(asset, {
    audioUrl: asset.url,
    duration: asset.durationSeconds,
    durationSeconds: asset.durationSeconds,
    isCustomUpload: true,
    voicePresetId: null,
    voiceName: null,
    gender: null,
    ageGroup: null
  });
}
```

`createCompanyVideoNode`（~180）把 `model: "ep-20260319213857-htd7q"` 改为 `model: "Seedance 2.0"`（删除原 `modelName` 行避免重复，或保留 `modelName: "Seedance 2.0"`）。

`MEASURED_BY_KIND`（~43）video 高度 `587 → 588`。

> 注意：`compactRecord` 会过滤 `undefined` 但**保留 `null`**，故 `voicePresetId: null` 等会写入。已确认（`Object.entries(...).filter(([,v]) => v !== undefined)`）。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/api/uploadClient.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell add src/api/uploadClient.ts src/api/uploadClient.test.ts
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell commit -m "fix(canvas-sync): 音频/视频节点对齐公司端原生 schema(status=idle+原生字段)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---
### Task 2: 占位符竞态修复（图片/视频/去字幕提交段）

**Files:**
- Modify: `src/App.tsx`（图片 ~1620、视频 ~1466-1478、去字幕 ~754-755、工厂 `createGeneratedVideoPlaceholder` ~691、`createSubtitlePlaceholder` 序号无需改）
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `assetsRef`（`useRef(assets)`，~331）、`setAssets`、`persistCanvasHistoryEntry`。
- Produces: 三个 handler 提交占位符后 `assetsRef.current` 即刻含新占位符；连续提交不互相覆盖。

- [ ] **Step 1: 写失败测试**

在 `src/App.test.tsx` 追加（用现有 deferred 工具风格）：连续提交两个图片生成任务，断言提交后资产列表含两个 generating 占位符。参考现有"keeps the generation placeholder when a concurrent subtitle removal finishes first"用例的 mock 结构编写：

```ts
it("keeps both image placeholders when two image tasks are submitted back-to-back", async () => {
  // 用 deferred 让两次 generateImage 都停在 pending；先后触发两次提交,
  // 断言 screen 上出现两个"生成中"图片占位(getAllByText/查 generating 计数=2)。
  // 关键:第二次提交不得把第一次占位符覆盖掉。
});
```

> 实现细节按 `App.test.tsx` 既有 mock（`companyApiFacade.generateImage` 等）补全；测试需断言两个占位符 id 同时存在。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/App.test.tsx -t "back-to-back"`
Expected: FAIL（第二次提交读到旧 ref，只剩一个占位符）

- [ ] **Step 3: 图片提交段即时同步 ref**

`src/App.tsx` ~1620，在 `setAssets(assetsWithPlaceholder)` 前加一行：

```ts
    const assetsWithPlaceholder = [...assetsRef.current, placeholder];
    assetsRef.current = assetsWithPlaceholder;
    setAssets(assetsWithPlaceholder);
```

- [ ] **Step 4: 视频提交段改用 ref + 即时同步**

`src/App.tsx` ~1478，把 `[...assets, generatedAsset]` 改为 ref 并即时同步：

```ts
    const assetsWithPlaceholder = [...assetsRef.current, generatedAsset];
    assetsRef.current = assetsWithPlaceholder;
    setAssets(assetsWithPlaceholder);
```

并把工厂 `createGeneratedVideoPlaceholder`（~691）的序号 `assets.filter(...)` 改为 `assetsRef.current.filter(...)`。

- [ ] **Step 5: 去字幕提交段改用 ref + 即时同步**

`src/App.tsx` ~755：

```ts
    const placeholder = createSubtitlePlaceholder(asset);
    const assetsWithPlaceholder = [...assetsRef.current, placeholder];
    assetsRef.current = assetsWithPlaceholder;
    setAssets(assetsWithPlaceholder);
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run src/App.test.tsx -t "back-to-back"` 且回归 `npx vitest run src/App.test.tsx -t "concurrent subtitle"`
Expected: PASS（含旧并发回归）

- [ ] **Step 7: 提交**

```bash
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell add src/App.tsx src/App.test.tsx
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell commit -m "fix(placeholder): 三 handler 提交占位后即时同步 assetsRef 消除连续提交竞态

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 本地上传保留生成中占位符

**Files:**
- Modify: `src/App.tsx`（`handleFilesSelected` 成功段 ~1329-1333）
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `normalizeSnapshotAssets(nextSnapshot)`、`assetsRef.current`、`createAssetOrder`。
- Produces: 上传完成后 `status:"generating"` 的占位符被合并保留，不被服务端快照重建覆盖。

- [ ] **Step 1: 写失败测试**

`src/App.test.tsx` 追加：先让一个视频生成处于 generating（deferred pending），再触发 `handleFilesSelected` 上传一张图片成功（mock `uploadCanvasAsset` 返回不含该占位符的快照），断言上传后生成中视频占位符仍在列表。

```ts
it("keeps in-flight generating placeholders after a local upload", async () => {
  // 1) 启动视频生成(pending) → 出现"生成中"占位
  // 2) 触发本地上传图片成功(mock 返回的快照只含上传图)
  // 3) 断言"生成中"视频占位仍存在
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/App.test.tsx -t "in-flight generating"`
Expected: FAIL（占位符被 normalizeSnapshotAssets 覆盖丢失）

- [ ] **Step 3: 合并生成中占位符**

`src/App.tsx` ~1329，替换成功段：

```ts
        const uploadedAssets = normalizeSnapshotAssets(nextSnapshot);
        const generatingPlaceholders = assetsRef.current.filter((asset) => asset.status === "generating");
        const mergedAssets = [...uploadedAssets, ...generatingPlaceholders];
        setCanvasSnapshot(nextSnapshot);
        assetsRef.current = mergedAssets;
        setAssets(mergedAssets);
        setDefaultAssetOrder((current) => {
          const next = createAssetOrder(mergedAssets);
          return next;
        });
        persistCanvasHistoryEntry(getCanvasUrlFromProject(project) || canvasUrl, canvasName, project, mergedAssets);
        addActivityMessage(`已同步上传 ${uploadedAssets.length} 个资源`);
```

> `createAssetOrder(mergedAssets)` 会把占位符 id 纳入排序，避免顺序丢失（占位符 category 为 video/image，函数按 category 归类）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/App.test.tsx -t "in-flight generating"`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell add src/App.tsx src/App.test.tsx
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell commit -m "fix(upload): 本地上传完成后保留生成中占位符不被快照重建覆盖

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: Electron `openCanvasWindow(url, mode)` 三模式 IPC

**Files:**
- Modify: `electron/companySession.ts`（`inspectCanvas` ~627-725 重构出公共窗口创建 + 新增 `openCanvasWindow`）
- Modify: `electron/main.ts`（新增 `ovo:canvas:open` handler ~58 区域，import）
- Modify: `electron/preload.cts`（`discovery` 加 `openCanvas` ~30-31）

**Interfaces:**
- Consumes: `attachApiCapture(webContents)`、`normalizeCompanyWindowUrl`、`TARGET_CANVAS_URL`、`waitForNetworkCapture`、`getStoragePaths`。
- Produces: `openCanvasWindow(canvasUrl: string, mode: "plain"|"devtools"|"capture") → Promise<InspectCanvasResult>`；IPC `ovo:canvas:open`；`window.ovoDesktop.discovery.openCanvas(url, mode)`。

- [ ] **Step 1: 重构 `inspectCanvas`，抽出 `openCanvasWindow`**

`electron/companySession.ts`：把 `inspectCanvas` 改为薄封装，新增 `openCanvasWindow`。保留现有窗口/BrowserView/auto-reload 逻辑，仅按 mode 分支挂载：

```ts
export async function openCanvasWindow(
  canvasUrl = TARGET_CANVAS_URL,
  mode: "plain" | "devtools" | "capture" = "capture"
): Promise<InspectCanvasResult> {
  const paths = getStoragePaths();
  const initialUrl = normalizeCompanyWindowUrl(canvasUrl);
  const windowTitle =
    mode === "capture" ? "ovO 接口诊断" : mode === "devtools" ? "公司画布 (DevTools)" : "公司画布";
  const inspectWindow = new BrowserWindow({
    width: 1400,
    height: 950,
    title: windowTitle,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
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
    if (inspectWindow.isDestroyed()) return;
    const [width, height] = inspectWindow.getContentSize();
    inspectView.setBounds({ x: 0, y: 0, width, height });
  }

  const MAX_AUTO_RELOADS = 2;
  let autoReloadCount = 0;
  function autoReload(reason: string) {
    if (inspectWindow.isDestroyed() || inspectView.webContents.isDestroyed()) return;
    if (autoReloadCount >= MAX_AUTO_RELOADS) return;
    autoReloadCount += 1;
    console.warn(`[公司画布] ${reason}，自动重新加载 (第 ${autoReloadCount} 次)`);
    void inspectView.webContents.loadURL(initialUrl).catch(() => undefined);
  }
  inspectView.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    autoReload(`页面加载失败 (${code} ${desc} @ ${url})`);
  });
  inspectView.webContents.on("render-process-gone", (_e, details) => {
    autoReload(`渲染进程退出 (${details.reason})`);
  });

  inspectWindow.setBrowserView(inspectView);
  inspectWindow.on("resize", resizeInspectView);
  inspectWindow.on("maximize", resizeInspectView);
  inspectWindow.on("unmaximize", resizeInspectView);
  resizeInspectView();

  // capture 与 DevTools 在同一 webContents 上互斥:只有 capture 模式挂 CDP,
  // 只有 devtools 模式开 DevTools,plain 模式两者都不做。
  const apiCapture = mode === "capture" ? await attachApiCapture(inspectView.webContents) : null;
  inspectWindow.on("closed", () => {
    apiCapture?.detach();
  });

  try {
    await inspectView.webContents.loadURL(initialUrl);
  } catch (error) {
    console.warn("[公司画布] 首次加载失败，重试一次：", error);
    if (!inspectView.webContents.isDestroyed()) {
      await inspectView.webContents.loadURL(initialUrl).catch(() => undefined);
    }
  }

  if (mode === "devtools") {
    inspectView.webContents.openDevTools({ mode: "detach" });
  }

  if (mode !== "capture") {
    return { ok: true };
  }

  await waitForNetworkCapture();
  const summaries = apiCapture!.getSummaries();
  return {
    ok: true,
    summaries,
    sanitizedMapPath: paths.sanitizedApiMapPath,
    rawCapturePath: apiCapture!.rawCapturePath
  };
}

export async function inspectCanvas(canvasUrl = TARGET_CANVAS_URL): Promise<InspectCanvasResult> {
  return openCanvasWindow(canvasUrl, "capture");
}
```

> 删除原 `inspectCanvas` 的旧函数体（已被上面替换）。确认 `COMPANY_SESSION_PARTITION`、`waitForNetworkCapture`、`getStoragePaths`、`attachApiCapture` 均在文件作用域内可用（原 inspectCanvas 已用，无需新 import）。

- [ ] **Step 2: main.ts 注册 IPC**

`electron/main.ts` import 行加入 `openCanvasWindow`（与 `inspectCanvas` 同 from `./companySession.js`）；在 ~58 后加：

```ts
  ipcMain.handle("ovo:canvas:open", (_event, canvasUrl: string, mode: "plain" | "devtools" | "capture") =>
    openCanvasWindow(canvasUrl, mode)
  );
```

- [ ] **Step 3: preload 暴露**

`electron/preload.cts` `discovery`（~30）：

```ts
  discovery: {
    inspectCanvas: (canvasUrl: string) => ipcRenderer.invoke("ovo:discovery:inspect-canvas", canvasUrl),
    openCanvas: (canvasUrl: string, mode: "plain" | "devtools" | "capture") =>
      ipcRenderer.invoke("ovo:canvas:open", canvasUrl, mode)
  },
```

> 同步更新 preload 的类型声明 `src/vite-env.d.ts`（~64 `discovery` 块，已有 `inspectCanvas`）：加 `openCanvas: (canvasUrl: string, mode: "plain" | "devtools" | "capture") => Promise<{ ok: boolean; message?: string; summaries?: unknown[]; sanitizedMapPath?: string; rawCapturePath?: string }>;`（返回类型对齐现有 `inspectCanvas` 的声明形状）。

- [ ] **Step 4: 编译验证 electron**

Run: `cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell && npx tsc -p tsconfig.node.json --noEmit`
Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell add electron/companySession.ts electron/main.ts electron/preload.cts
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell commit -m "feat(canvas): openCanvasWindow 三模式(plain/devtools/capture)+ovo:canvas:open IPC

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: facade + App 层接入 openCanvas

**Files:**
- Modify: `src/services/companyApiFacade.ts`（~109 加 `openCanvas`）
- Modify: `src/App.tsx`（新增 `handleOpenCompanyCanvas(mode)`，CanvasControls 调用处 ~1788）

**Interfaces:**
- Consumes: `window.ovoDesktop.discovery.openCanvas(url, mode)`。
- Produces: `companyApiFacade.openCanvas(url, mode) → Promise<InspectCanvasResult>`；`handleOpenCompanyCanvas(mode: "plain"|"devtools"|"capture")`。

- [ ] **Step 1: facade 加 openCanvas**

`src/services/companyApiFacade.ts`，在 `inspectCanvas` 后加：

```ts
  openCanvas: async (canvasUrl: string, mode: "plain" | "devtools" | "capture") => {
    if (!window.ovoDesktop) {
      throw new Error("请在 Electron 桌面端打开公司画布");
    }
    const result = await window.ovoDesktop.discovery.openCanvas(canvasUrl, mode);
    if (!result.ok) {
      throw new Error(result.message ?? "打开公司画布失败");
    }
    return result;
  },
```

> 留意 facade 对象末尾逗号/分号风格，匹配现有写法。

- [ ] **Step 2: App 新增 handleOpenCompanyCanvas**

`src/App.tsx`，在 `createCompanyCanvasSession`（~553）附近新增：

```ts
  async function handleOpenCompanyCanvas(mode: "plain" | "devtools" | "capture") {
    const targetUrl = getCanvasUrlFromProject(project) || canvasUrl || "http://qijing.kjjhz.cn/projects";
    try {
      const result = await companyApiFacade.openCanvas(targetUrl, mode);
      if (mode === "capture") {
        addActivityMessage(`已打开公司画布(API Fetch)并捕获 ${result.summaries?.length ?? 0} 个请求`);
      } else if (mode === "devtools") {
        addActivityMessage("已打开公司画布(DevTools)");
      } else {
        addActivityMessage("已打开公司画布");
      }
    } catch (error) {
      setCanvasError(error instanceof Error ? error.message : "打开公司画布失败");
    }
  }
```

- [ ] **Step 3: 编译验证**

Run: `npx tsc --noEmit`
Expected: 无错误（`handleOpenCompanyCanvas` 暂未被引用会报 unused？—— 若 strict noUnusedLocals 报错，本步暂忽略，Task 6 接线后消除；或先在 CanvasControls 接线再编译。推荐与 Task 6 连续执行后统一编译）

- [ ] **Step 4: 提交**

```bash
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell add src/services/companyApiFacade.ts src/App.tsx
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell commit -m "feat(canvas): facade.openCanvas + App.handleOpenCompanyCanvas 三模式接入

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---
### Task 6: CanvasControls 画布按钮重构（三按钮 + 移除登录/检查）

**Files:**
- Modify: `src/components/CanvasControls.tsx`（props interface ~5-21、解构 ~23-41、按钮区 ~106-119）
- Modify: `src/App.tsx`（CanvasControls 调用 ~1775-1792）
- Test: `src/components/CanvasControls.test.tsx`（若不存在则创建）

**Interfaces:**
- Consumes: `handleOpenCompanyCanvas(mode)`（Task 5）、`authState`、`loading`。
- Produces: CanvasControls 新 props `onOpenCompanyCanvas: (mode: "plain"|"devtools"|"capture") => void`；移除 `onOpenLogin`、`onCheckAuth`、`onCreateCompanyCanvas`。三个画布按钮 `disabled` 当 `authState.status !== "authenticated" || loading`。

- [ ] **Step 1: 写失败测试**

`src/components/CanvasControls.test.tsx`：

```ts
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CanvasControls } from "./CanvasControls";

const baseProps = {
  canvasUrl: "http://qijing.kjjhz.cn/canvas/abc",
  canvasName: "测试画布",
  canvasHistory: [],
  loading: false,
  onCanvasUrlChange: vi.fn(), onCanvasNameChange: vi.fn(), onSaveCanvasName: vi.fn(),
  onSelectCanvasHistory: vi.fn(), onDeleteCanvasHistory: vi.fn(), onNewCanvas: vi.fn(),
  onOpenCompanyCanvas: vi.fn(), onLoadCanvas: vi.fn()
};

describe("CanvasControls 画布按钮", () => {
  it("渲染三个画布按钮且未登录时禁用", () => {
    render(<CanvasControls {...baseProps} authState={{ status: "unauthenticated", message: "" }} />);
    const open = screen.getByRole("button", { name: /^Open公司画布$/ });
    const dev = screen.getByRole("button", { name: /Open公司画布\(DevTools\)/ });
    const fetchBtn = screen.getByRole("button", { name: /Open公司画布\(API Fetch\)/ });
    expect(open).toBeDisabled();
    expect(dev).toBeDisabled();
    expect(fetchBtn).toBeDisabled();
  });
  it("已登录时三按钮可点并传 mode", () => {
    const onOpen = vi.fn();
    render(<CanvasControls {...baseProps} onOpenCompanyCanvas={onOpen}
      authState={{ status: "authenticated", user: { name: "u" } } as never} />);
    screen.getByRole("button", { name: /^Open公司画布$/ }).click();
    expect(onOpen).toHaveBeenCalledWith("plain");
  });
  it("不再渲染登录公司账号/检查登录态", () => {
    render(<CanvasControls {...baseProps} authState={{ status: "authenticated", user: { name: "u" } } as never} />);
    expect(screen.queryByText("登录公司账号")).toBeNull();
    expect(screen.queryByText("检查登录态")).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/CanvasControls.test.tsx`
Expected: FAIL（按钮不存在 / 旧按钮仍在）

- [ ] **Step 3: 改 props interface 与解构**

`src/components/CanvasControls.tsx`：interface 中删除 `onCreateCompanyCanvas`、`onOpenLogin`、`onCheckAuth`，新增 `onOpenCompanyCanvas: (mode: "plain" | "devtools" | "capture") => void;`。同步改解构。import 行去掉不再用的 `LogIn`，加 `ExternalLink`（lucide-react，用于画布按钮图标）。

- [ ] **Step 4: 替换按钮区**

`src/components/CanvasControls.tsx` `canvas-control-actions`（~106-119）替换为：

```tsx
        <div className="canvas-control-actions">
          {(() => {
            const canOpen = authState.status === "authenticated" && !loading;
            return (
              <>
                <button type="button" className="secondary-button" onClick={() => onOpenCompanyCanvas("plain")} disabled={!canOpen}>
                  <ExternalLink size={16} />
                  <span>Open公司画布</span>
                </button>
                <button type="button" className="secondary-button" onClick={() => onOpenCompanyCanvas("devtools")} disabled={!canOpen}>
                  <ExternalLink size={16} />
                  <span>Open公司画布(DevTools)</span>
                </button>
                <button type="button" className="secondary-button" onClick={() => onOpenCompanyCanvas("capture")} disabled={!canOpen}>
                  <ExternalLink size={16} />
                  <span>Open公司画布(API Fetch)</span>
                </button>
                <button type="button" className="primary-button" onClick={onLoadCanvas} disabled={loading}>
                  {loading ? <Loader2 size={16} /> : <RefreshCw size={16} />}
                  <span>加载画布资源</span>
                </button>
              </>
            );
          })()}
        </div>
```

> `canvas-status-line` 里 `authLabel` 仍可保留作状态提示；`authLabel` 变量定义保留不动。

- [ ] **Step 5: App 调用处接线**

`src/App.tsx` ~1788，移除 `onCreateCompanyCanvas`、`onOpenLogin`、`onCheckAuth` 三个 prop，加 `onOpenCompanyCanvas={handleOpenCompanyCanvas}`。

> `createCompanyCanvasSession`、`handleCheckAuth` 若再无其它引用会触发 noUnusedLocals。`handleOpenLogin` 仍被 AppHeader（Task 7）与 ~1118 行 `await handleOpenLogin(targetCanvasUrl)` 引用，保留。`createCompanyCanvasSession`/`handleCheckAuth` 确认无其它引用后删除（grep 验证）。

- [ ] **Step 6: 运行测试 + 编译**

Run: `npx vitest run src/components/CanvasControls.test.tsx && npx tsc --noEmit`
Expected: PASS + 无类型错误

- [ ] **Step 7: 提交**

```bash
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell add src/components/CanvasControls.tsx src/components/CanvasControls.test.tsx src/App.tsx
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell commit -m "feat(ui): 画布区改三按钮(Open/DevTools/API Fetch)+移除登录与检查按钮

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: AppHeader 右上角登录按钮重构

**Files:**
- Modify: `src/components/AppHeader.tsx`（props ~5-37、accountLabel ~38-43、按钮区 ~120-134）
- Modify: `src/App.tsx`（AppHeader 调用处，加 `onOpenLogin` prop ~1753 附近）
- Test: `src/components/AppHeader.test.tsx`（若不存在则创建）

**Interfaces:**
- Consumes: `authState`、`onLogout`、`handleOpenLogin`（App）。
- Produces: AppHeader 新 prop `onOpenLogin?: () => void`。未登录：无状态标签 + 按钮"登录账号"(onOpenLogin)；已登录：状态标签(账号名,纯展示) + 按钮"退出账户"(onLogout)；checking：标签"检查中" + 按钮 disabled。

- [ ] **Step 1: 写失败测试**

`src/components/AppHeader.test.tsx`：

```ts
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppHeader } from "./AppHeader";

describe("AppHeader 登录区", () => {
  it("未登录:无账号标签,按钮显示登录账号", () => {
    const onOpenLogin = vi.fn();
    render(<AppHeader authState={{ status: "unauthenticated", message: "" }} onOpenLogin={onOpenLogin} />);
    expect(screen.getByRole("button", { name: "登录账号" })).toBeInTheDocument();
    expect(screen.queryByText("已登录")).toBeNull();
    screen.getByRole("button", { name: "登录账号" }).click();
    expect(onOpenLogin).toHaveBeenCalled();
  });
  it("已登录:显示账号标签 + 退出账户按钮", () => {
    const onLogout = vi.fn();
    render(<AppHeader authState={{ status: "authenticated", user: { account: "acc1", name: "n" } } as never} onLogout={onLogout} />);
    expect(screen.getByText("acc1")).toBeInTheDocument();
    screen.getByRole("button", { name: "退出账户" }).click();
    expect(onLogout).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/AppHeader.test.tsx`
Expected: FAIL

- [ ] **Step 3: 加 onOpenLogin prop**

`src/components/AppHeader.tsx`：interface 加 `onOpenLogin?: () => void;`，解构加 `onOpenLogin`。import 加 `LogIn`（lucide-react）。

- [ ] **Step 4: 替换账户/退出按钮区**

`src/components/AppHeader.tsx` ~120-134 替换为：

```tsx
        {authState.status === "authenticated" && (
          <div className="account-button" title="账户" aria-label={`已登录 ${accountLabel}`}>
            <UserRound size={18} />
            <span>{accountLabel}</span>
          </div>
        )}
        {authState.status === "checking" && (
          <div className="account-button" title="账户">
            <UserRound size={18} />
            <span>检查中</span>
          </div>
        )}
        {authState.status === "authenticated" ? (
          <button
            type="button"
            className="header-tool-button"
            aria-label="退出账户"
            title="退出账户"
            onClick={onLogout}
          >
            <LogOut size={16} />
            <span>退出账户</span>
          </button>
        ) : (
          <button
            type="button"
            className="header-tool-button"
            aria-label="登录账号"
            title="登录账号"
            onClick={onOpenLogin}
            disabled={authState.status === "checking"}
          >
            <LogIn size={16} />
            <span>登录账号</span>
          </button>
        )}
```

> `accountLabel` 现有定义已是账号名（authenticated 分支），保留不动。

- [ ] **Step 5: App 调用接线**

`src/App.tsx` AppHeader 调用处（~1753 区域）加 `onOpenLogin={() => handleOpenLogin()}`。

- [ ] **Step 6: 运行测试 + 编译**

Run: `npx vitest run src/components/AppHeader.test.tsx && npx tsc --noEmit`
Expected: PASS + 无类型错误

- [ ] **Step 7: 提交**

```bash
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell add src/components/AppHeader.tsx src/components/AppHeader.test.tsx src/App.tsx
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell commit -m "feat(ui): 顶栏登录区改 状态标签(仅登录显示)+登录账号/退出账户切换

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: canvas 名称/链接 input 宽度 50%

**Files:**
- Modify: `src/styles.css`（`.canvas-name-row`、`.canvas-url-field`）

**Interfaces:**
- Consumes: 无。
- Produces: 两 input 容器宽度约 50%，对号按钮紧贴名称 input。

- [ ] **Step 1: 定位现有样式**

Run: `grep -n "canvas-name-row\|canvas-url-field\|icon-only-button" /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell/src/styles.css`
Expected: 找到现有规则行号

- [ ] **Step 2: 改宽度**

现有布局：`.canvas-name-row` 是 `display:grid; grid-template-columns: minmax(0,1fr) 36px;`（input + 36px 对号按钮），`.canvas-url-field` 是 `display:grid; grid-template-columns: 22px 1fr;`。对号已紧贴（grid 第二列 36px）。只需把两容器整体收窄到 50%：在 `.canvas-name-row`（~293）和 `.canvas-url-field`（~310）各加一行 `max-width: 50%;`（不改 grid 列定义，对号仍贴紧）：

```css
.canvas-name-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px;
  gap: 8px;
  max-width: 50%;
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
  max-width: 50%;
}
```

> 仅追加 `max-width: 50%;` 一行到各自规则；其余声明保持不变。对号按钮因 grid 第二列固定 36px 本就紧贴 input，无需额外改动。

- [ ] **Step 3: 构建验证**

Run: `cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell && npm run build`
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell add src/styles.css
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell commit -m "style(ui): 画布名称/链接输入框宽度改 50%,对号按钮贴紧

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 版本号 bump + 全量验证 + 推送 gitee

**Files:**
- Modify: `package.json`（`version` 0.1.10 → 0.1.11）

**Interfaces:**
- Consumes: 全部前置任务。
- Produces: v0.1.11 推送到 gitee `feature/ui-shell`。

- [ ] **Step 1: bump 版本**

`package.json` `"version": "0.1.10"` → `"0.1.11"`。

- [ ] **Step 2: 全量验证**

Run（全绿才继续）:
```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
npm test
npx tsc --noEmit
npx tsc -p tsconfig.node.json --noEmit
npm run build
```
Expected: 测试全过、两处 tsc 无错、build 成功。任何失败先修复再继续。

- [ ] **Step 3: 提交版本号**

```bash
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell add package.json
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell commit -m "chore: bump version to 0.1.11

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: 推送 gitee**

```bash
git -C /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell push gitee feature/ui-shell
```
Expected: 推送成功（确认 remote `gitee` 指向 `git@gitee.com:siberian-aries/ov-o_create_video_platform.git`；若无该 remote 名，用 `git -C <path> remote -v` 核对实际名称）

- [ ] **Step 5: 人工验证清单（打包后由用户实测）**

1. 连续提交两个图片任务 → 两占位符各就各位，不串位。
2. 本地上传音频 → 打开公司画布能看到音频节点。**（验证 status:"idle" 假设）**
3. 生成视频完成 → 打开公司画布能看到视频节点；关闭重开仍在。**（验证 status:"idle" 假设）**
4. 视频生成中时本地上传图片 → 生成中占位符不消失。
5. 顶栏：未登录显示"登录账号"、无状态标签；登录后显示账号标签 + "退出账户"。
6. 三个画布按钮：plain 无抓包、devtools 自动开 DevTools、API Fetch 写 storage/api；未登录禁用。
7. input 宽度约半屏，对号贴紧。

> 若验证 2/3 失败（音频/视频仍不显示），据新抓的 capture 调整 `uploadClient.ts` 的 audio/video `data.status` 与字段，回到 Task 1 迭代。

---

## 附：执行注意
- 每个任务独立可测、独立提交。
- Task 5 的编译验证建议与 Task 6 连续执行（handleOpenCompanyCanvas 在 Task 6 才被引用，避免 noUnusedLocals 误报）。
- 删除函数前用 grep 确认无其它引用（`createCompanyCanvasSession`、`handleCheckAuth`）。



