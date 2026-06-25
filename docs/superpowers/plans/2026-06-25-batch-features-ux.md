# 批量 UX 功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 feature/ui-shell 上交付一批 ovO 客户端 UX 功能（轻提示、资源搜索、设置页、文字化引用、提示词模态框、续轮询修复、预览缩放、标题与滑竿样式），打包 v0.2.2 推 gitee。

**Architecture:** React + Vite renderer（`src/`）+ Electron main（`electron/`），IPC 用 `ipcMain.handle` / `contextBridge` 暴露到 `window.ovoDesktop`。新功能尽量拆成独立小组件与纯函数 lib，App.tsx 仅做装配与状态联动。

**Tech Stack:** React 18、TypeScript、Vite、Electron 37（Chromium 128）、Vitest + @testing-library/react、lucide-react 图标。

## Global Constraints

- 分支：`feature/ui-shell`（worktree：`/Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell`）。
- 测试命令：`npm test`（= `vitest run --passWithNoTests`）。单测试文件：`npx vitest run <path> -t <name>`。
- Chromium 128：**禁用** `border-shape` / CSS `shape()`（不支持）。
- 测试文件与源码同目录、`*.test.ts(x)` 命名。
- 提交粒度小、信息中文前缀（feat/fix/style/docs/refactor）。
- 完成后 bump 版本 **v0.2.1 → v0.2.2**（`package.json` + `package-lock.json`），推 gitee `siberian-aries/ov-o_create_video_platform`。
- 提交结尾不强制 Co-Authored-By（仓库历史无该约定）。

---

## File Structure（决策锁定）

- `src/lib/referenceText.ts`(+`.test.ts`)：`getReferenceLabel` + `buildReferenceText` 纯函数（从 PromptDock 抽出）。
- `src/components/ToastHost.tsx`(+`.test.tsx`)：toast 容器 + `ToastProvider`/`useToast`。
- `src/components/SettingsModal.tsx`(+`.test.tsx`)：下载路径设置弹窗。
- `src/components/PromptInfoModal.tsx`(+`.test.tsx`)：提示词模态框。
- `src/components/AssetSearch.tsx`(+`.test.tsx`)：资源搜索框 + 结果面板。
- `src/lib/assetSearch.ts`(+`.test.ts`)：搜索过滤 + 分组排序纯函数。
- `src/lib/appSettings.ts`：renderer 侧 settings 读写封装（调 IPC）。
- `electron/appSettingsStore.ts`(+`.test.ts`)：main 侧 settings.json 读写 + 下载目录解析。
- 修改：`electron/main.ts`、`electron/preload.cts`、`electron/companySession.ts`、`src/App.tsx`、`src/components/PromptDock.tsx`、`src/components/AssetCard.tsx`、`src/components/AppHeader.tsx`、`src/components/PreviewModal.tsx`、`src/components/GeneratePanel.tsx`、`src/types.ts`、`src/styles.css`。
- 字体：`resources/fonts/Shrikhand-Regular.woff2`（内置）。

---

## Task 1: 抽取并实现 `referenceText`（文字化引用纯函数）

**Files:**
- Create: `src/lib/referenceText.ts`, `src/lib/referenceText.test.ts`
- Modify: `src/components/PromptDock.tsx`（改为 import）

**Interfaces:**
- Produces:
  - `getReferenceLabel(item: ReferenceItem, references: ReferenceItem[]): string` —— 图片N/视频N/音频N
  - `buildReferenceText(references: ReferenceItem[]): string` —— 按 name 精确分组的文字化串

- [ ] **Step 1: Write the failing test**

`src/lib/referenceText.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildReferenceText, getReferenceLabel } from "./referenceText";
import type { ReferenceItem } from "../types";

function ref(id: string, name: string, kind: ReferenceItem["kind"]): ReferenceItem {
  return { id, name, kind, sizeBytes: 0, source: "asset" };
}

describe("getReferenceLabel", () => {
  it("labels by per-kind index", () => {
    const refs = [ref("a", "小李", "image"), ref("b", "小张", "image"), ref("c", "小李", "audio")];
    expect(getReferenceLabel(refs[1], refs)).toBe("图片2");
    expect(getReferenceLabel(refs[2], refs)).toBe("音频1");
  });
});

describe("buildReferenceText", () => {
  it("groups by exact name, preserves first-appearance order, joins labels then 、", () => {
    const refs = [
      ref("1", "小李", "image"),   // 图片1
      ref("2", "小张", "image"),   // 图片2
      ref("3", "小王", "image"),   // 图片3
      ref("4", "小李家", "image"), // 图片4
      ref("5", "小张家", "image"), // 图片5
      ref("6", "小李", "audio"),   // 音频1
      ref("7", "小张", "audio"),   // 音频2
      ref("8", "视频节点", "video") // 视频1
    ];
    expect(buildReferenceText(refs)).toBe(
      "图片1音频1是小李、图片2音频2是小张、图片3是小王、图片4是小李家、图片5是小张家、视频1是视频节点"
    );
  });

  it("returns empty string for no references", () => {
    expect(buildReferenceText([])).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/referenceText.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: Write minimal implementation**

`src/lib/referenceText.ts`:
```ts
import type { ReferenceItem } from "../types";

export function getReferenceLabel(item: ReferenceItem, references: ReferenceItem[]): string {
  const sameKindIndex =
    references.filter((reference) => reference.kind === item.kind).findIndex((reference) => reference.id === item.id) + 1;
  if (item.kind === "image") return `图片${sameKindIndex}`;
  if (item.kind === "video") return `视频${sameKindIndex}`;
  return `音频${sameKindIndex}`;
}

export function buildReferenceText(references: ReferenceItem[]): string {
  const groups: { name: string; labels: string[] }[] = [];
  for (const item of references) {
    const label = getReferenceLabel(item, references);
    const existing = groups.find((group) => group.name === item.name);
    if (existing) {
      existing.labels.push(label);
    } else {
      groups.push({ name: item.name, labels: [label] });
    }
  }
  return groups.map((group) => `${group.labels.join("")}是${group.name}`).join("、");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/referenceText.test.ts`
Expected: PASS

- [ ] **Step 5: Refactor PromptDock to import**

`src/components/PromptDock.tsx`：删除文件内本地 `function getReferenceLabel(...)`（28-40 行），改为顶部 `import { getReferenceLabel } from "../lib/referenceText";`。调用处 `getReferenceLabel(item, references)` 不变。

- [ ] **Step 6: Run full tests + commit**

Run: `npm test`
Expected: PASS

```bash
git add src/lib/referenceText.ts src/lib/referenceText.test.ts src/components/PromptDock.tsx
git commit -m "feat: 抽取 referenceText 纯函数(文字化引用)"
```

---

## Task 2: 轻提示 Toast 系统（feat1）

**Files:**
- Create: `src/components/ToastHost.tsx`, `src/components/ToastHost.test.tsx`
- Modify: `src/App.tsx`（包裹 Provider + 触发点）, `src/styles.css`

**Interfaces:**
- Produces:
  - `ToastProvider({ children }): JSX.Element`
  - `useToast(): { showToast(message: string, variant?: "success" | "error"): void }`
- Consumes（Task ≥2 内的 App 触发）：`showToast("已下载 ...")` 等。

- [ ] **Step 1: Write the failing test**

`src/components/ToastHost.test.tsx`:
```tsx
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./ToastHost";

function Trigger() {
  const { showToast } = useToast();
  return <button onClick={() => showToast("已下载 2 个")}>go</button>;
}

describe("ToastHost", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows a toast then auto-dismisses after 2.5s", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    act(() => {
      screen.getByText("go").click();
    });
    expect(screen.getByText("已下载 2 个")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.queryByText("已下载 2 个")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ToastHost.test.tsx`
Expected: FAIL（模块不存在）

- [ ] **Step 3: Write implementation**

`src/components/ToastHost.tsx`:
```tsx
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

interface ToastItem {
  id: number;
  message: string;
  variant: "success" | "error";
}

interface ToastApi {
  showToast: (message: string, variant?: "success" | "error") => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const TOAST_DURATION_MS = 2500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, variant: "success" | "error" = "success") => {
    const id = (idRef.current += 1);
    setToasts((current) => [...current, { id, message, variant }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  const api = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.variant}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { showToast: () => undefined };
  }
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ToastHost.test.tsx`
Expected: PASS

- [ ] **Step 5: Add CSS**

`src/styles.css` 末尾追加：
```css
.toast-host {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 1000;
  pointer-events: none;
}
.toast {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  color: #fff;
  box-shadow: 0 4px 16px #0004;
  animation: toast-in 0.18s ease-out;
}
.toast-success { background: #2f855a; }
.toast-error { background: #c53030; }
@keyframes toast-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 6: Wire Provider + triggers in App**

`src/main.tsx`：用 `ToastProvider` 包裹 `<App />`（保留现有 StrictMode 等结构，最外层包一层 Provider）。

`src/App.tsx`：在 App 组件内 `const { showToast } = useToast();`，在以下成功落地处调用：
- `renameAsset` 成功后：`showToast("已重命名");`
- 单个删除 `handleDeleteAsset` 成功后：`showToast("已删除");`
- 批量删除 `handleDeleteSelected` 成功后：`showToast(\`已删除 ${count} 个\`);`
- 批量下载 `handleDownloadSelected` 成功后（已有 activity）：`showToast(\`已下载 ${selectedAssets.length} 个\`);`
- 单个下载（`handleAssetAction` 内 download 分支成功后）：`showToast("已下载");`
- 图片 ready（`resumePendingImageTasks` 与 `handleGenerateImage` 完成分支）：`showToast("图片生成完成");`
- 视频 ready（视频生成完成分支）：`showToast("视频生成完成");`

> 注意：`useToast` 必须在 Provider 子树内调用；App 是 Provider 的 child，满足。

- [ ] **Step 7: Run full tests + commit**

Run: `npm test`
Expected: PASS

```bash
git add src/components/ToastHost.tsx src/components/ToastHost.test.tsx src/App.tsx src/main.tsx src/styles.css
git commit -m "feat: 轻提示 toast(下载/重命名/删除/生成成功 2.5s)"
```

---

## Task 3: 文字化引用按钮替换本地上传（feat4）

**Files:**
- Modify: `src/components/PromptDock.tsx`, `src/styles.css`
- Test: `src/components/PromptDock.test.tsx`（已存在，新增用例）

**Interfaces:**
- Consumes: `buildReferenceText`（Task 1）, props `prompt`, `onPromptChange`, `references`。
- 移除：`onLocalFilesSelected` 的 UI 触发（保留 prop 签名以免 App 报错；App 端在 Task 末尾清理）。

- [ ] **Step 1: Write the failing test**

`src/components/PromptDock.test.tsx` 追加：
```tsx
it("文字化引用按钮把分组文本插到提示词第一行", async () => {
  const onPromptChange = vi.fn();
  const references = [
    { id: "1", name: "小李", kind: "image", sizeBytes: 0, source: "asset" },
    { id: "2", name: "小李", kind: "audio", sizeBytes: 0, source: "asset" }
  ] as const;
  render(
    <PromptDock
      {...baseProps}
      prompt="原有提示词"
      references={references as any}
      onPromptChange={onPromptChange}
    />
  );
  await userEvent.click(screen.getByRole("button", { name: "文字化引用到提示词" }));
  expect(onPromptChange).toHaveBeenCalledWith("图片1音频1是小李\n原有提示词");
});
```
> 若文件无 `baseProps`/`userEvent`，按文件现有测试写法补齐（`import userEvent from "@testing-library/user-event"`，并复用现有渲染 props 工厂）。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PromptDock.test.tsx -t 文字化引用`
Expected: FAIL（无该按钮）

- [ ] **Step 3: Replace the local-upload label with a button**

`src/components/PromptDock.tsx`：把 `reference-strip` 内的 `<label className="reference-add">…<input type="file">…<ImagePlus/></label>`（67-82 行）整体替换为：
```tsx
<button
  type="button"
  className="reference-add reference-textify"
  title="文字化引用到提示词"
  aria-label="文字化引用到提示词"
  disabled={references.length === 0}
  onClick={() => {
    const text = buildReferenceText(references);
    if (text) {
      onPromptChange(`${text}\n${prompt}`);
    }
  }}
>
  <ListPlus size={20} />
</button>
```
顶部 import 调整：`import { ListPlus, X } from "lucide-react";`（移除 `ImagePlus`），并 `import { buildReferenceText, getReferenceLabel } from "../lib/referenceText";`。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/PromptDock.test.tsx -t 文字化引用`
Expected: PASS

- [ ] **Step 5: Clean up App local-file reference wiring**

`src/App.tsx`：移除传给 `PromptDock` 的 `onLocalFilesSelected={handleReferenceFilesSelected}`（1929 行附近），并删除/保留 `handleReferenceFilesSelected`（若无其他引用则删除其定义与相关 import）。同时把 `PromptDock` 的 `onLocalFilesSelected` prop 改为可选并删除其 reference-strip 用法（已在 Step 3 删除）。

- [ ] **Step 6: Run full tests + commit**

Run: `npm test`
Expected: PASS

```bash
git add src/components/PromptDock.tsx src/components/PromptDock.test.tsx src/App.tsx src/styles.css
git commit -m "feat: 文字化引用按钮替换本地图片上传(feat4)"
```

---

## Task 4: Electron 设置存储 + 下载目录可配置 + IPC（feat3 后端）

**Files:**
- Create: `electron/appSettingsStore.ts`, `electron/appSettingsStore.test.ts`
- Modify: `electron/main.ts`, `electron/preload.cts`, `electron/companySession.ts`

**Interfaces:**
- Produces（main）：
  - `readAppSettings(): { downloadDir: string }`（读 userData/settings.json，缺省 `{ downloadDir: "" }`）
  - `writeAppSettings(input: { downloadDir: string }): { ok: true }`
  - `resolveDownloadDir(downloadsFallback: string, configuredDir: string): string` —— 纯函数：空串/不存在→fallback
- Produces（preload→renderer `window.ovoDesktop`）：
  - `settings.get(): Promise<{ downloadDir: string }>`
  - `settings.set(input): Promise<{ ok: boolean }>`
  - `dialog.selectFolder(): Promise<{ canceled: boolean; path?: string }>`

- [ ] **Step 1: Write the failing test (pure resolver)**

`electron/appSettingsStore.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { resolveDownloadDir } from "./appSettingsStore.js";

describe("resolveDownloadDir", () => {
  it("uses configured dir when non-empty", () => {
    expect(resolveDownloadDir("/Users/mac/Downloads", "/tmp/out")).toBe("/tmp/out");
  });
  it("falls back to downloads when empty", () => {
    expect(resolveDownloadDir("/Users/mac/Downloads", "")).toBe("/Users/mac/Downloads");
    expect(resolveDownloadDir("/Users/mac/Downloads", "   ")).toBe("/Users/mac/Downloads");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/appSettingsStore.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement store**

`electron/appSettingsStore.ts`:
```ts
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface AppSettings {
  downloadDir: string;
}

function settingsFilePath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

export function readAppSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { downloadDir: typeof parsed.downloadDir === "string" ? parsed.downloadDir : "" };
  } catch {
    return { downloadDir: "" };
  }
}

export function writeAppSettings(input: AppSettings): { ok: true } {
  fs.mkdirSync(path.dirname(settingsFilePath()), { recursive: true });
  fs.writeFileSync(settingsFilePath(), JSON.stringify({ downloadDir: input.downloadDir ?? "" }, null, 2), "utf-8");
  return { ok: true };
}

export function resolveDownloadDir(downloadsFallback: string, configuredDir: string): string {
  const trimmed = (configuredDir ?? "").trim();
  return trimmed.length > 0 ? trimmed : downloadsFallback;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/appSettingsStore.test.ts`
Expected: PASS

- [ ] **Step 5: Use configured dir in saveAsset\* (companySession.ts)**

`electron/companySession.ts`：
- 顶部 `import { readAppSettings, resolveDownloadDir } from "./appSettingsStore.js";`
- `saveAssetToDownloads`（549-551 行）：把 `const destinationPath = path.join(app.getPath("downloads"), fileName);` 改为
```ts
const baseDir = resolveDownloadDir(app.getPath("downloads"), readAppSettings().downloadDir);
const destinationPath = path.join(baseDir, fileName);
```
- `saveAssetsToDownloads`（577-580 行）：把传入的 `downloadsPath: app.getPath("downloads")` 改为
```ts
downloadsPath: resolveDownloadDir(app.getPath("downloads"), readAppSettings().downloadDir),
```

- [ ] **Step 6: Add IPC handlers (main.ts)**

`electron/main.ts`：
- import：`import { readAppSettings, writeAppSettings } from "./appSettingsStore.js";` 和 `dialog` 加入 `electron` 顶部 import。
- 在其它 `ipcMain.handle` 旁追加：
```ts
ipcMain.handle("ovo:settings:get", () => readAppSettings());
ipcMain.handle("ovo:settings:set", (_e, input: { downloadDir: string }) => writeAppSettings({ downloadDir: input?.downloadDir ?? "" }));
ipcMain.handle("ovo:dialog:select-folder", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  return { canceled: false, path: result.filePaths[0] };
});
```

- [ ] **Step 7: Expose in preload**

`electron/preload.cts`：在 `file: {...}` 旁追加：
```ts
settings: {
  get: () => ipcRenderer.invoke("ovo:settings:get"),
  set: (input: { downloadDir: string }) => ipcRenderer.invoke("ovo:settings:set", input)
},
dialog: {
  selectFolder: () => ipcRenderer.invoke("ovo:dialog:select-folder")
},
```
并同步更新 preload 的 `window.ovoDesktop` 类型声明（若 `src/vite-env.d.ts` 或 preload 内有 d.ts，补 `settings`/`dialog` 字段）。

- [ ] **Step 8: Run full tests + commit**

Run: `npm test`
Expected: PASS

```bash
git add electron/appSettingsStore.ts electron/appSettingsStore.test.ts electron/main.ts electron/preload.cts electron/companySession.ts src/vite-env.d.ts
git commit -m "feat: 设置存储+下载目录可配置+IPC(feat3后端)"
```

---

## Task 5: 设置弹窗 + 顶栏齿轮按钮（feat3 前端）

**Files:**
- Create: `src/components/SettingsModal.tsx`, `src/components/SettingsModal.test.tsx`, `src/lib/appSettings.ts`
- Modify: `src/components/AppHeader.tsx`, `src/App.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `window.ovoDesktop.settings`, `window.ovoDesktop.dialog`（Task 4）。
- Produces: `SettingsModal` props `{ open, downloadDir, onChangeDownloadDir, onPickFolder, onSave, onClose }`；AppHeader 新增 `onOpenSettings?: () => void`。

- [ ] **Step 1: Write the failing test**

`src/components/SettingsModal.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";

describe("SettingsModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<SettingsModal open={false} downloadDir="" onChangeDownloadDir={() => {}} onPickFolder={() => {}} onSave={() => {}} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
  it("calls onSave with current value", async () => {
    const onSave = vi.fn();
    render(<SettingsModal open downloadDir="/tmp/out" onChangeDownloadDir={() => {}} onPickFolder={() => {}} onSave={onSave} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/SettingsModal.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement SettingsModal**

`src/components/SettingsModal.tsx`:
```tsx
import { FolderOpen, X } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  downloadDir: string;
  onChangeDownloadDir: (value: string) => void;
  onPickFolder: () => void;
  onSave: () => void;
  onClose: () => void;
}

export function SettingsModal({ open, downloadDir, onChangeDownloadDir, onPickFolder, onSave, onClose }: SettingsModalProps) {
  if (!open) {
    return null;
  }
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="设置">
      <div className="settings-modal">
        <button type="button" className="modal-close" onClick={onClose} title="关闭" aria-label="关闭">
          <X size={20} />
        </button>
        <h2 className="settings-title">设置</h2>
        <label className="settings-field">
          <span>下载路径</span>
          <div className="settings-field-row">
            <input
              type="text"
              value={downloadDir}
              placeholder="默认下载到系统下载文件夹"
              onChange={(event) => onChangeDownloadDir(event.currentTarget.value)}
            />
            <button type="button" className="secondary-button" onClick={onPickFolder} title="选择文件夹" aria-label="选择文件夹">
              <FolderOpen size={16} />
            </button>
          </div>
          <small>留空则下载到系统下载文件夹。</small>
        </label>
        <div className="settings-actions">
          <button type="button" className="primary-button" onClick={onSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/SettingsModal.test.tsx`
Expected: PASS

- [ ] **Step 5: renderer settings helper**

`src/lib/appSettings.ts`:
```ts
export async function loadDownloadDir(): Promise<string> {
  const result = await window.ovoDesktop?.settings?.get?.();
  return result?.downloadDir ?? "";
}

export async function saveDownloadDir(downloadDir: string): Promise<void> {
  await window.ovoDesktop?.settings?.set?.({ downloadDir });
}

export async function pickFolder(): Promise<string | null> {
  const result = await window.ovoDesktop?.dialog?.selectFolder?.();
  if (!result || result.canceled || !result.path) {
    return null;
  }
  return result.path;
}
```

- [ ] **Step 6: Header gear button**

`src/components/AppHeader.tsx`：
- import 加 `Settings` 图标（lucide-react）。
- props 加 `onOpenSettings?: () => void;`
- 在登录/退出按钮之后（`header-actions` 末尾）追加：
```tsx
<button type="button" className="header-tool-button" aria-label="设置" title="设置" onClick={onOpenSettings}>
  <Settings size={16} />
  <span>设置</span>
</button>
```

- [ ] **Step 7: Wire in App**

`src/App.tsx`：
- 状态：`const [settingsOpen, setSettingsOpen] = useState(false);` `const [downloadDir, setDownloadDir] = useState("");`
- 挂载时加载：`useEffect(() => { void loadDownloadDir().then(setDownloadDir); }, []);`
- AppHeader 传 `onOpenSettings={() => setSettingsOpen(true)}`。
- 渲染 `<SettingsModal open={settingsOpen} downloadDir={downloadDir} onChangeDownloadDir={setDownloadDir} onPickFolder={async () => { const dir = await pickFolder(); if (dir) setDownloadDir(dir); }} onSave={async () => { await saveDownloadDir(downloadDir); setSettingsOpen(false); showToast("设置已保存"); }} onClose={() => setSettingsOpen(false)} />`。
- import：`SettingsModal`、`loadDownloadDir/saveDownloadDir/pickFolder`。

- [ ] **Step 8: Run full tests + commit**

Run: `npm test`
Expected: PASS

```bash
git add src/components/SettingsModal.tsx src/components/SettingsModal.test.tsx src/lib/appSettings.ts src/components/AppHeader.tsx src/App.tsx src/styles.css
git commit -m "feat: 设置弹窗+顶栏齿轮按钮(feat3前端)"
```

---

## Task 6: 新增 `view-prompt` action + 卡片"提示词"按钮（feat5 卡片侧）

**Files:**
- Modify: `src/types.ts`, `src/components/AssetCard.tsx`
- Test: `src/components/AssetCard.test.tsx`（追加）

**Interfaces:**
- Produces: `AssetAction` 增 `"view-prompt"`；AssetCard 在 人物/场景/道具/视频 卡片次行末尾渲染"提示词"按钮，`onClick={() => onAction(asset, "view-prompt")}`，`disabled={!asset.generationPrompt}`；**音频不渲染**。

- [ ] **Step 1: Write the failing test**

`src/components/AssetCard.test.tsx` 追加：
```tsx
it("人物卡片显示提示词按钮并触发 view-prompt", async () => {
  const onAction = vi.fn();
  render(<AssetCard {...makeProps({ kind: "image", category: "characters", generationPrompt: "p" })} onAction={onAction} />);
  await userEvent.click(screen.getByRole("button", { name: /查看提示词/ }));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ category: "characters" }), "view-prompt");
});

it("音频卡片不显示提示词按钮", () => {
  render(<AssetCard {...makeProps({ kind: "audio", category: "audio" })} />);
  expect(screen.queryByRole("button", { name: /查看提示词/ })).toBeNull();
});
```
> `makeProps` 按 AssetCard.test 现有工厂；若无则参照现有用例补一个最小 props 工厂。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/AssetCard.test.tsx -t 提示词`
Expected: FAIL

- [ ] **Step 3: Add the type + button**

`src/types.ts`：`AssetAction` 增加 `| "view-prompt"`。

`src/components/AssetCard.tsx`：
- import 加 `MessageSquareText`（lucide-react）。
- 在 `asset-card-secondary-actions` 内 删除按钮之后（280 行前后），追加（仅非音频）：
```tsx
{asset.kind !== "audio" && (
  <button
    type="button"
    title={asset.generationPrompt ? "查看提示词" : "暂无生成提示词"}
    aria-label={`查看提示词 ${asset.name}`}
    disabled={!asset.generationPrompt}
    onClick={() => onAction(asset, "view-prompt")}
  >
    <MessageSquareText size={15} />
  </button>
)}
```
> 次行整体顺序对照设计：人物/场景=分类移动按钮→复用→删除→提示词；视频=播放→复用→去字幕→删除→提示词；音频=播放→删除（无提示词）。当前删除按钮在末尾，故"提示词"放在删除之后即可满足"删除→提示词"顺序。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/AssetCard.test.tsx -t 提示词`
Expected: PASS

- [ ] **Step 5: Run full tests + commit**

Run: `npm test`
Expected: PASS

```bash
git add src/types.ts src/components/AssetCard.tsx src/components/AssetCard.test.tsx
git commit -m "feat: 卡片新增查看提示词按钮+view-prompt(feat5卡片侧)"
```

---

## Task 7: 提示词模态框（feat5 模态框 + App 装配）

**Files:**
- Create: `src/components/PromptInfoModal.tsx`, `src/components/PromptInfoModal.test.tsx`
- Modify: `src/App.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `CanvasAsset.generationReferences`, `generationPrompt`；App 的 `handleAssetAction` 在 `action === "view-prompt"` 时 `setPromptInfoAsset(asset)`。
- Produces: `PromptInfoModal({ asset, onClose })`：顶部横向缩略图条(generationReferences) + 下方提示词(列表化) + 右上关闭。

- [ ] **Step 1: Write the failing test**

`src/components/PromptInfoModal.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromptInfoModal } from "./PromptInfoModal";
import type { CanvasAsset } from "../types";

const asset: CanvasAsset = {
  id: "n1", name: "小李", kind: "image", category: "characters", url: "x",
  generationPrompt: "第一句\n第二句",
  generationReferences: [{ id: "r1", name: "参考A", kind: "image", sizeBytes: 0, source: "asset", previewUrl: "p" }]
};

describe("PromptInfoModal", () => {
  it("returns null without asset", () => {
    const { container } = render(<PromptInfoModal asset={null} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
  it("shows references and prompt lines", () => {
    render(<PromptInfoModal asset={asset} onClose={vi.fn()} />);
    expect(screen.getByText("第一句")).toBeTruthy();
    expect(screen.getByText("第二句")).toBeTruthy();
    expect(screen.getByAltText("参考A")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PromptInfoModal.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement modal**

`src/components/PromptInfoModal.tsx`:
```tsx
import { X } from "lucide-react";
import type { CanvasAsset } from "../types";

interface PromptInfoModalProps {
  asset: CanvasAsset | null;
  onClose: () => void;
}

export function PromptInfoModal({ asset, onClose }: PromptInfoModalProps) {
  if (!asset) {
    return null;
  }
  const lines = (asset.generationPrompt ?? "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  const references = asset.generationReferences ?? [];
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${asset.name} 提示词`}>
      <div className="preview-modal prompt-info-modal" onWheel={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} title="关闭" aria-label="关闭">
          <X size={20} />
        </button>
        <h2 className="preview-title" title={asset.name}>{asset.name} · 提示词</h2>
        <div className="prompt-info-thumbs" aria-label="生成引用素材">
          {references.length === 0 ? (
            <span className="prompt-info-empty">无引用素材</span>
          ) : (
            references.map((reference) => (
              <div key={reference.id} className={`prompt-info-thumb prompt-info-thumb-${reference.kind}`} title={reference.name}>
                {reference.previewUrl ? (
                  <img src={reference.previewUrl} alt={reference.name} />
                ) : (
                  <span>{reference.name}</span>
                )}
              </div>
            ))
          )}
        </div>
        <ul className="prompt-info-prompt" aria-label="提示词内容">
          {lines.length === 0 ? <li className="prompt-info-empty">无提示词</li> : lines.map((line, index) => <li key={index}>{line}</li>)}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/PromptInfoModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Add CSS（与 preview-modal 同尺寸；缩略图横向滚动；提示词列表可滚动）**

`src/styles.css` 追加：
```css
.prompt-info-modal { display: flex; flex-direction: column; gap: 12px; }
.prompt-info-thumbs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.prompt-info-thumb { flex: 0 0 auto; width: 96px; height: 96px; border-radius: 8px; overflow: hidden; background: #00000010; display: grid; place-items: center; }
.prompt-info-thumb img { width: 100%; height: 100%; object-fit: cover; }
.prompt-info-thumb span { font-size: 12px; padding: 4px; text-align: center; }
.prompt-info-prompt { margin: 0; padding-left: 18px; overflow-y: auto; max-height: 50vh; line-height: 1.6; }
.prompt-info-empty { color: #888; }
```

- [ ] **Step 6: Wire in App**

`src/App.tsx`：
- 状态：`const [promptInfoAsset, setPromptInfoAsset] = useState<CanvasAsset | null>(null);`
- `handleAssetAction`：增加分支 `if (action === "view-prompt") { setPromptInfoAsset(asset); return; }`
- 渲染：`<PromptInfoModal asset={promptInfoAsset} onClose={() => setPromptInfoAsset(null)} />`
- import `PromptInfoModal`。

- [ ] **Step 7: Run full tests + commit**

Run: `npm test`
Expected: PASS

```bash
git add src/components/PromptInfoModal.tsx src/components/PromptInfoModal.test.tsx src/App.tsx src/styles.css
git commit -m "feat: 提示词模态框(横向引用缩略图+提示词列表)(feat5)"
```

---

## Task 8: 资源搜索（feat2）

**Files:**
- Create: `src/lib/assetSearch.ts`, `src/lib/assetSearch.test.ts`, `src/components/AssetSearch.tsx`, `src/components/AssetSearch.test.tsx`
- Modify: `src/App.tsx`, `src/styles.css`

**Interfaces:**
- Produces:
  - `searchAssets(assets: CanvasAsset[], query: string): { category: AssetCategory; title: string; items: CanvasAsset[] }[]` —— 子串模糊匹配 name；按 人物>场景>道具>音频>视频 分组；空 query → 空数组。
  - `AssetSearch({ assets, onAction, onPreview })`：输入框 + 结果面板。
- Consumes: App 的 `handleAssetAction`（insert/preview/download/delete）。预览导航集在搜索预览态切到结果集。

- [ ] **Step 1: Write the failing test (pure)**

`src/lib/assetSearch.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { searchAssets } from "./assetSearch";
import type { CanvasAsset } from "../types";

function a(id: string, name: string, category: CanvasAsset["category"], kind: CanvasAsset["kind"]): CanvasAsset {
  return { id, name, kind, category, url: "u" };
}

describe("searchAssets", () => {
  const assets = [
    a("1", "小李", "characters", "image"),
    a("2", "小李家", "scenes", "image"),
    a("3", "道具刀", "props", "image"),
    a("4", "小李配音", "audio", "audio"),
    a("5", "开场视频", "video", "video")
  ];
  it("empty query returns empty", () => {
    expect(searchAssets(assets, "")).toEqual([]);
  });
  it("fuzzy matches by name, grouped in fixed order", () => {
    const groups = searchAssets(assets, "小李");
    expect(groups.map((g) => g.category)).toEqual(["characters", "scenes", "audio"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["1"]);
    expect(groups[2].items.map((i) => i.id)).toEqual(["4"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/assetSearch.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement searchAssets**

`src/lib/assetSearch.ts`:
```ts
import type { AssetCategory, CanvasAsset } from "../types";

const ORDER: { category: AssetCategory; title: string }[] = [
  { category: "characters", title: "人物" },
  { category: "scenes", title: "场景" },
  { category: "props", title: "道具" },
  { category: "audio", title: "音频" },
  { category: "video", title: "视频" }
];

export function searchAssets(assets: CanvasAsset[], query: string) {
  const q = query.trim().toLowerCase();
  if (q.length === 0) {
    return [];
  }
  return ORDER.map(({ category, title }) => ({
    category,
    title,
    items: assets.filter((asset) => asset.category === category && asset.name.toLowerCase().includes(q))
  })).filter((group) => group.items.length > 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/assetSearch.test.ts`
Expected: PASS

- [ ] **Step 5: Write AssetSearch component test**

`src/components/AssetSearch.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AssetSearch } from "./AssetSearch";
import type { CanvasAsset } from "../types";

const assets: CanvasAsset[] = [
  { id: "1", name: "小李", kind: "image", category: "characters", url: "u" },
  { id: "2", name: "小李配音", kind: "audio", category: "audio", url: "u" }
];

describe("AssetSearch", () => {
  it("typing shows grouped results with actions", async () => {
    const onAction = vi.fn();
    render(<AssetSearch assets={assets} onAction={onAction} onPreview={vi.fn()} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "搜索资源" }), "小李");
    expect(screen.getByText("人物")).toBeTruthy();
    expect(screen.getByText("音频")).toBeTruthy();
    expect(screen.getAllByText("小李").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Implement AssetSearch**

`src/components/AssetSearch.tsx`:
```tsx
import { Download, Maximize2, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { searchAssets } from "../lib/assetSearch";
import type { AssetAction, CanvasAsset } from "../types";

interface AssetSearchProps {
  assets: CanvasAsset[];
  onAction: (asset: CanvasAsset, action: AssetAction) => void;
  onPreview: (asset: CanvasAsset, results: CanvasAsset[]) => void;
}

export function AssetSearch({ assets, onAction, onPreview }: AssetSearchProps) {
  const [query, setQuery] = useState("");
  const groups = searchAssets(assets, query);
  const flat = groups.flatMap((group) => group.items);

  return (
    <div className="asset-search">
      <div className="asset-search-input">
        <Search size={15} />
        <input
          type="search"
          role="searchbox"
          aria-label="搜索资源"
          placeholder="搜索资源名称"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      {query.trim() && (
        <div className="asset-search-results" aria-label="搜索结果">
          {groups.length === 0 ? (
            <div className="asset-search-empty">无匹配</div>
          ) : (
            groups.map((group) => (
              <div key={group.category} className="asset-search-group">
                <div className="asset-search-group-title">{group.title}</div>
                {group.items.map((asset) => (
                  <div key={asset.id} className="asset-search-row">
                    <span className="asset-search-name" title={asset.name}>{asset.name}</span>
                    <div className="asset-search-actions">
                      <button type="button" title="加入引用" aria-label={`加入引用 ${asset.name}`} onClick={() => onAction(asset, "insert")}><Plus size={14} /></button>
                      <button type="button" title="放大预览" aria-label={`放大预览 ${asset.name}`} onClick={() => onPreview(asset, flat)}><Maximize2 size={14} /></button>
                      <button type="button" title="下载" aria-label={`下载 ${asset.name}`} onClick={() => onAction(asset, "download")}><Download size={14} /></button>
                      <button type="button" title="删除" aria-label={`删除 ${asset.name}`} onClick={() => onAction(asset, "delete")}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Run component test**

Run: `npx vitest run src/components/AssetSearch.test.tsx`
Expected: PASS

- [ ] **Step 8: Wire into App + preview-over-results**

`src/App.tsx`：
- 在 `asset-workspace` 容器上方（CanvasControls 之后、`asset-workspace` 之前）插入右对齐容器：
```tsx
<div className="asset-search-bar">
  <AssetSearch
    assets={assets}
    onAction={handleAssetAction}
    onPreview={(asset, results) => {
      setPreviewAssets(results);
      setPreviewAsset(asset);
    }}
  />
</div>
```
- 预览导航集：当前 `previewAssets` 来自分类全量；新增 state `const [previewAssets, setPreviewAssets] = useState<CanvasAsset[]>([])` 若尚未独立（核对现有 `previewAssets`/`previewIndex` 来源——若是 useMemo 派生，则改为：搜索预览时用一个 `searchPreviewResults` state 覆盖导航集；普通卡片预览时清空它回到默认派生）。最小实现：新增 `searchResults` state，`previewAssets = searchResults ?? defaultPreviewAssets`，卡片预览路径 `setSearchResults(null)`，搜索预览路径 `setSearchResults(results)`。
- import `AssetSearch`。

> 核对点：阅读 App 中 `previewAssets`/`previewIndex` 现有定义，按上面"最小实现"接入，确保普通预览不受影响、搜索预览只在结果集内上下切。

- [ ] **Step 9: Add CSS**

`src/styles.css` 追加：
```css
.asset-search-bar { display: flex; justify-content: flex-end; padding: 4px 8px; }
.asset-search { position: relative; width: 280px; }
.asset-search-input { display: flex; align-items: center; gap: 6px; border: 1px solid #d0d0d0; border-radius: 8px; padding: 4px 8px; background: #fff; }
.asset-search-input input { border: none; outline: none; flex: 1; background: transparent; }
.asset-search-results { position: absolute; right: 0; top: 110%; width: 360px; max-height: 60vh; overflow-y: auto; background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; box-shadow: 0 8px 28px #0003; z-index: 50; padding: 6px; }
.asset-search-group-title { font-size: 12px; font-weight: 600; color: #547980; padding: 6px 8px 2px; }
.asset-search-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 8px; border-radius: 6px; }
.asset-search-row:hover { background: #f3f3f3; }
.asset-search-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-search-actions { display: flex; gap: 4px; flex: 0 0 auto; }
.asset-search-empty { padding: 12px; color: #888; text-align: center; }
```

- [ ] **Step 10: Run full tests + commit**

Run: `npm test`
Expected: PASS

```bash
git add src/lib/assetSearch.ts src/lib/assetSearch.test.ts src/components/AssetSearch.tsx src/components/AssetSearch.test.tsx src/App.tsx src/styles.css
git commit -m "feat: 资源搜索(分组结果+引用/预览/下载/删除)(feat2)"
```

---

## Task 9: 预览缩放 + 背景滚动隔离（fix2）

**Files:**
- Modify: `src/components/PreviewModal.tsx`, `src/styles.css`
- Test: `src/components/PreviewModal.test.tsx`（新建或追加）

**Interfaces:**
- PreviewModal 内部维护 `scale` 状态：`Ctrl+wheel` 调整（1–4，步进 0.25），切换 asset/关闭复位；`wheel` 时 `preventDefault`（阻止背景滚动）。

- [ ] **Step 1: Write the failing test**

`src/components/PreviewModal.test.tsx`（若不存在则新建）：
```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PreviewModal } from "./PreviewModal";
import type { CanvasAsset } from "../types";

const img: CanvasAsset = { id: "i1", name: "图", kind: "image", category: "characters", url: "u" };

describe("PreviewModal zoom", () => {
  it("ctrl+wheel up scales the image up", () => {
    render(<PreviewModal asset={img} onClose={() => {}} />);
    const media = screen.getByAltText("图") as HTMLImageElement;
    fireEvent.wheel(media, { deltaY: -100, ctrlKey: true });
    expect(media.style.transform).toContain("scale(1.25)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PreviewModal.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement zoom + scroll lock**

`src/components/PreviewModal.tsx`：
- 顶部 state：`const [scale, setScale] = useState(1);`
- `useEffect(() => { setScale(1); }, [asset?.id]);`
- 在 `preview-frame` 容器加 `onWheel`：
```tsx
<div
  className="preview-frame"
  onWheel={(event) => {
    event.preventDefault();
    if (event.ctrlKey && asset.kind === "image") {
      setScale((current) => {
        const next = current + (event.deltaY < 0 ? 0.25 : -0.25);
        return Math.min(4, Math.max(1, Number(next.toFixed(2))));
      });
    }
  }}
>
```
- 图片元素加 `style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}`。
- backdrop 容器 `modal-backdrop` 也加 `onWheel={(event) => event.preventDefault()}`（兜底阻止背景滚动）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/PreviewModal.test.tsx`
Expected: PASS

- [ ] **Step 5: CSS（防止放大溢出遮挡，frame 裁剪）**

`src/styles.css`：确保 `.preview-frame { overflow: hidden; }`（若已有则跳过），`.preview-media { transition: transform 0.08s ease-out; }`。

- [ ] **Step 6: Run full tests + commit**

Run: `npm test`
Expected: PASS

```bash
git add src/components/PreviewModal.tsx src/components/PreviewModal.test.tsx src/styles.css
git commit -m "fix: 预览Ctrl+滚轮缩放+背景列表不滚动(fix2)"
```

---

## Task 10: ovO 标题样式（ui1）

**Files:**
- Create: `resources/fonts/Shrikhand-Regular.woff2`
- Modify: `src/styles.css`, `src/components/AppHeader.tsx`（如需 class）

- [ ] **Step 1: 下载并内置 Shrikhand 字体**

Run（在 worktree 根）：
```bash
mkdir -p resources/fonts
curl -L -o /tmp/shrikhand.css "https://fonts.googleapis.com/css2?family=Shrikhand&display=swap"
WOFF2_URL=$(grep -oE "https://[^)]+\.woff2" /tmp/shrikhand.css | head -1)
curl -L -o resources/fonts/Shrikhand-Regular.woff2 "$WOFF2_URL"
ls -l resources/fonts/Shrikhand-Regular.woff2
```
Expected: 文件存在且 > 10KB。若 curl 不通，告知用户用 `!` 手动下载到该路径。

- [ ] **Step 2: 确认字体打包路径可被 renderer 引用**

确认 Vite 能解析（资源放 `src/assets/fonts/` 更稳妥）。本计划改放 `src/assets/fonts/Shrikhand-Regular.woff2`，在 styles.css 用相对 `@font-face` 引用：
```bash
mkdir -p src/assets/fonts && mv resources/fonts/Shrikhand-Regular.woff2 src/assets/fonts/ && rmdir resources/fonts 2>/dev/null || true
```

- [ ] **Step 3: 应用样式**

`src/styles.css` 追加：
```css
@font-face {
  font-family: "Shrikhand";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("./assets/fonts/Shrikhand-Regular.woff2") format("woff2");
}
.brand-mark {
  --stroke-width: 6px;
  font-family: "Shrikhand", serif;
  color: #f7f7f7;
  -webkit-text-stroke: var(--stroke-width) transparent;
  background-image: linear-gradient(90deg, #c1deff 12%, #f2c9de 24%, #f1ccac 36%, #eae189 48%, #aae5b2 60%, #ffffffcc 72%, #decdff 84%, #c1deff);
  background-size: 150% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  filter: drop-shadow(2px 2px 6px #0005);
  transition: background-position 0.3s, scale 0.3s, filter 0.3s;
  will-change: background-position, scale, filter;
  cursor: crosshair;
}
.brand-mark:hover {
  background-position: 100% 0;
  scale: 1.05;
  filter: drop-shadow(2px 2px 8px #0003);
}
```
> `--stroke-width` 比原 20px 缩小到 6px 适配顶栏字号；如顶栏字号过小可微调。

- [ ] **Step 4: 视觉冒烟（构建）**

Run: `npm run build`
Expected: 构建成功，无字体解析报错。（运行时效果在 Task 13 打包冒烟时一并人工确认。）

- [ ] **Step 5: Run full tests + commit**

Run: `npm test`
Expected: PASS（AppHeader.test 仍通过；若断言 brand-mark 文本则不受影响）

```bash
git add src/assets/fonts/Shrikhand-Regular.woff2 src/styles.css
git commit -m "style: ovO 标题渐变描边+内置Shrikhand字体(ui1)"
```

---

## Task 11: 等效波浪时长滑竿（ui2）

**Files:**
- Modify: `src/components/GeneratePanel.tsx`, `src/styles.css`

**Interfaces:**
- 给时长 `input[type=range]` 加 class `wavy-range`；样式作用域限定该 class，不污染其他 range。

- [ ] **Step 1: 加 class**

`src/components/GeneratePanel.tsx`：时长 `<input type="range" ... />`（66-80 行）加 `className="wavy-range"`。

- [ ] **Step 2: 实现波浪轨道 + 圆球 thumb（Chromium 128 可跑）**

`src/styles.css` 追加：
```css
.wavy-range {
  --c: #547980;
  --bg: #ebe8d5;
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 28px;
  background: transparent;
  cursor: pointer;
}
/* 波浪轨道：用 SVG 背景画一条波浪线 */
.wavy-range::-webkit-slider-runnable-track {
  height: 28px;
  background-repeat: repeat-x;
  background-position: center;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='28'><path d='M0 14 Q 10 4 20 14 T 40 14' fill='none' stroke='%23547980' stroke-width='3'/></svg>");
}
.wavy-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  margin-top: -7px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg);
  border: 3px solid var(--bg);
  box-shadow: 0 0 0 6px var(--c) inset, 0 0 0 2px var(--bg);
  transition: box-shadow 0.3s;
}
.wavy-range:active::-webkit-slider-thumb,
.wavy-range:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 14px var(--c) inset, 0 0 0 2px var(--bg);
}
```
> 仅依赖 `-webkit-slider-runnable-track` / `-webkit-slider-thumb` + SVG data-URI 背景，均在 Chromium 128 可用。波浪为视觉近似，不追求原版 view-timeline 跟随。

- [ ] **Step 3: 构建冒烟**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 4: Run full tests + commit**

Run: `npm test`
Expected: PASS（GeneratePanel.test 仍通过；range 行为不变）

```bash
git add src/components/GeneratePanel.tsx src/styles.css
git commit -m "style: 等效波浪时长滑竿(Chromium128可跑)(ui2)"
```

---

## Task 12: 修复重启后图片卡"生成中"且不再轮询（fix1）

**Files:**
- Modify: 视真因而定（候选：`src/App.tsx` resume/persist 路径、`src/lib/localCanvasStore.ts` merge、`src/api/*imageGenerationClient*` 轮询）
- Test: 对应纯函数/逻辑补回归

> 本任务用 **systematic-debugging**：先复现并定位真因，再最小修复，禁止凭猜改。

- [ ] **Step 1: 复现 + 收集证据**

- 在 ovO 里发起一次图片生成 → 立即退出重开 → 观察占位是否卡"生成中"。
- 用 9333 裸 CDP（参考 `/tmp/cdp_eval.py`）或诊断窗口看：重开后是否有对 `/api/generate-image/{taskId}` 的轮询请求。
- 检查本地 store：`/Users/mac/Library/Application Support/ovO/storage`（或 userData 下 canvas-store）里该 project 的 `pendingTasks` 是否非空、`taskId` 是否存在；占位 asset id 是否等于 `pendingTasks[].nodeId`。

- [ ] **Step 2: 写出真因假设并验证**

按证据锁定以下之一（或其他）：
- (A) `pendingTasks` 未持久化/被覆盖 → 重开后为空，resume 无事可做。
- (B) `pollImageResult` 单次返回/依赖丢失内存态 → 不再轮询。
- (C) 占位 id 与 nodeId/远端 ready 资产 id 不一致 → 占位永不被替换。
- 在代码中用最小日志或单测确认假设（例如对 `mergeCanvasState`、`resumePendingImageTasks` 的输入做断言）。

- [ ] **Step 3: 写回归测试（针对定位到的真因层）**

示例（若真因是 merge/persist 丢任务）：在 `src/lib/localCanvasStore.test.ts` 增用例，断言"本地有 generating 占位 + 对应 pendingTask、远端无该资产"时 `mergeCanvasState` 返回的 `pendingTasks` 非空且包含该 nodeId。
示例（若真因是 resume 未轮询）：抽出 resume 的可测纯逻辑并断言"未超时 + 有 taskId"时会进入轮询分支（mock `pollImageResult` 被调用）。

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run <对应 test 文件>`
Expected: FAIL（暴露真因）

- [ ] **Step 5: 最小修复**

按真因改最小代码（例：persist 时确保 pendingTasks 不被空数组覆盖；或 resume 改为真正循环轮询；或对齐占位 id）。不扩大改动面。

- [ ] **Step 6: Run test to verify it passes + 手动复现确认**

Run: `npx vitest run <对应 test 文件>` → PASS
再在 ovO 手动复现 Step 1 场景，确认重开后恢复轮询并最终 ready/failed，`showToast("图片生成完成")` 正常（与 Task 2 衔接）。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix: 重启后图片续轮询失效(真因:<填写定位结论>)(fix1)"
```

---

## Task 13: 版本 bump + 全量验证 + 推 gitee

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 全绿。

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 3: 人工冒烟（关键路径）**

逐项确认：toast 出现/消失；搜索分组结果与四个操作；设置弹窗保存路径并实际下载到该目录；文字化引用插入第一行；卡片提示词按钮→模态框（音频无按钮）；Ctrl+滚轮缩放且背景不滚；标题渐变；波浪滑竿；**fix1 复现已修**。

- [ ] **Step 4: bump 版本**

`package.json` `"version": "0.2.1"` → `"0.2.2"`；同步 `package-lock.json` 顶层与 packages[""] 的 version。
Run: `node -e "console.log(require('./package.json').version)"` → `0.2.2`

- [ ] **Step 5: Commit + 推 gitee**

```bash
git add package.json package-lock.json
git commit -m "chore: v0.2.2 批量UX功能"
git push gitee feature/ui-shell
```
Expected: 推送成功（远端 `git@gitee.com:siberian-aries/ov-o_create_video_platform.git`）。若无 `gitee` remote：`git remote -v` 确认后用对应 remote 名。

---

## Self-Review（覆盖核对）

- feat1 轻提示 → Task 2 ✅
- feat2 搜索 → Task 8 ✅
- feat3 设置（含下载目录可配置）→ Task 4 + 5 ✅
- feat4 文字化引用替换本地上传 → Task 1 + 3 ✅
- feat5 提示词模态框 + 卡片按钮（音频除外）→ Task 6 + 7 ✅
- 卡片图标顺序（删除→提示词）→ Task 6 ✅
- fix1 续轮询 → Task 12 ✅
- fix2 缩放 + 背景不滚 → Task 9 ✅
- ui1 标题 → Task 10 ✅
- ui2 波浪滑竿 → Task 11 ✅
- 版本 v0.2.2 + 推送 → Task 13 ✅

类型一致性：`view-prompt`（Task 6 定义，Task 7 消费）、`buildReferenceText`/`getReferenceLabel`（Task 1 定义，Task 3 消费）、`searchAssets`（Task 8 内自洽）、`settings`/`dialog` IPC（Task 4 定义，Task 5 消费）一致。

依赖顺序：Task 1→3、4→5、6→7、(2 的 showToast 被 5/12 复用)。建议按编号顺序执行。
