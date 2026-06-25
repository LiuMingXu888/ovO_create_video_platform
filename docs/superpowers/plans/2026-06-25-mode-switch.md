# 顶栏模式切换（自由 / 工作流）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在顶栏版本号右侧加一个「自由 / 工作流」模式切换开关，切到工作流时下方页面只显示「这是工作流页面」。

**Architecture:** App.tsx 新增 `appMode` 组件 state（不持久化），条件渲染下半部分视图；新建受控组件 `ModeSwitch`（方案1滑块动画，translateX）接入 `AppHeader` 的 `.brand` 区；样式加在 styles.css。

**Tech Stack:** React + TypeScript + Vite + Vitest + @testing-library/react；纯 CSS 动画。

## Global Constraints

- 目标发布版本号：`0.2.1`（package.json version、commit、tag 一致）。
- 分支：`feature/ui-shell`，远端推送到 gitee。
- 模式 state 不持久化（不写 localStorage），每次启动默认 `free`。
- 绿色只作用在 switch 开关轨道本身（翠绿 `#16a34a`），工作流页面背景保持米白 `#f6f7f4`。
- switch 文字用中文 `自由` / `工作流`；滑块动画用 `transform: translateX()` + `transition`。
- 顶栏其余结构（项目标题/积分/更新/登录）完全不动。
- 测试命令：`npm test`（vitest run）。构建：`npm run build`。

---

### Task 1: ModeSwitch 受控组件 + 测试

**Files:**
- Create: `src/components/ModeSwitch.tsx`
- Test: `src/components/ModeSwitch.test.tsx`

**Interfaces:**
- Consumes: 无（叶子组件）。
- Produces: `ModeSwitch` 组件，props `{ mode: "free" | "workflow"; onModeChange: (mode: "free" | "workflow") => void }`。导出命名 `ModeSwitch`。模式类型字面量 `"free" | "workflow"` 后续 Task 2/3 复用。

- [ ] **Step 1: 写失败测试**

`src/components/ModeSwitch.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModeSwitch } from "./ModeSwitch";

describe("ModeSwitch 模式切换", () => {
  it("free 模式:aria-checked=false,点击回调传 workflow", () => {
    const onModeChange = vi.fn();
    render(<ModeSwitch mode="free" onModeChange={onModeChange} />);
    const sw = screen.getByRole("switch", { name: "模式切换" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    sw.click();
    expect(onModeChange).toHaveBeenCalledWith("workflow");
  });

  it("workflow 模式:aria-checked=true,点击回调传 free", () => {
    const onModeChange = vi.fn();
    render(<ModeSwitch mode="workflow" onModeChange={onModeChange} />);
    const sw = screen.getByRole("switch", { name: "模式切换" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    sw.click();
    expect(onModeChange).toHaveBeenCalledWith("free");
  });

  it("两个文字标签都渲染", () => {
    render(<ModeSwitch mode="free" onModeChange={() => {}} />);
    expect(screen.getByText("自由")).toBeInTheDocument();
    expect(screen.getByText("工作流")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/components/ModeSwitch.test.tsx`
Expected: FAIL（无法解析 `./ModeSwitch`）

- [ ] **Step 3: 写最小实现**

`src/components/ModeSwitch.tsx`:

```tsx
export type AppMode = "free" | "workflow";

interface ModeSwitchProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

export function ModeSwitch({ mode, onModeChange }: ModeSwitchProps) {
  const isWorkflow = mode === "workflow";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isWorkflow}
      aria-label="模式切换"
      className={`mode-switch${isWorkflow ? " mode-switch--workflow" : ""}`}
      onClick={() => onModeChange(isWorkflow ? "free" : "workflow")}
    >
      <span className="mode-switch-thumb" aria-hidden="true" />
      <span className="mode-switch-label mode-switch-label--free">自由</span>
      <span className="mode-switch-label mode-switch-label--workflow">工作流</span>
    </button>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/components/ModeSwitch.test.tsx`
Expected: PASS（3 passed）

- [ ] **Step 5: 提交**

```bash
git add src/components/ModeSwitch.tsx src/components/ModeSwitch.test.tsx
git commit -m "feat: ModeSwitch 受控开关组件 (自由/工作流)"
```

---

### Task 2: AppHeader 接入 ModeSwitch

**Files:**
- Modify: `src/components/AppHeader.tsx`（import、props、`.brand` 内渲染）

**Interfaces:**
- Consumes: Task 1 的 `ModeSwitch`、`AppMode`。
- Produces: `AppHeaderProps` 新增 `appMode?: AppMode`、`onModeChange?: (mode: AppMode) => void`。Task 3 通过这两个 prop 接线。

- [ ] **Step 1: 改 import 与 props 类型**

`src/components/AppHeader.tsx` 顶部 import 区加：

```tsx
import { ModeSwitch, type AppMode } from "./ModeSwitch";
```

`AppHeaderProps` interface 内（在 `appVersion?` 附近）加两行：

```tsx
  appMode?: AppMode;
  onModeChange?: (mode: AppMode) => void;
```

函数签名解构（在 `appVersion = "0.1.1",` 之后）加：

```tsx
  appMode = "free",
  onModeChange,
```

- [ ] **Step 2: 在 .brand 内渲染 ModeSwitch**

把 `.brand` 块改为（在 `brand-version` 之后插入 ModeSwitch）：

```tsx
      <div className="brand" aria-label="ovO">
        <span className="brand-mark">ovO</span>
        <span className="brand-version">v{appVersion}</span>
        {onModeChange ? <ModeSwitch mode={appMode} onModeChange={onModeChange} /> : null}
      </div>
```

- [ ] **Step 3: 运行类型检查 + 现有 header 测试**

Run: `npx vitest run src/components/AppHeader.test.tsx`
Expected: PASS（现有用例不传 onModeChange，ModeSwitch 不渲染，旧断言不受影响）

- [ ] **Step 4: 提交**

```bash
git add src/components/AppHeader.tsx
git commit -m "feat: AppHeader 接入模式切换开关"
```

---

### Task 3: App.tsx 接线 appMode + 条件渲染下半视图

**Files:**
- Modify: `src/App.tsx`（state、AppHeader props、return 条件渲染）

**Interfaces:**
- Consumes: Task 2 的 `appMode` / `onModeChange` props；`AppMode` 类型。
- Produces: 运行期可切换的两种视图。

- [ ] **Step 1: 引入类型 + 新增 state**

`src/App.tsx` import 区加（与其他 component import 同处）：

```tsx
import { type AppMode } from "./components/ModeSwitch";
```

在 `const [appVersion, setAppVersion] = useState(...)` 附近新增：

```tsx
  const [appMode, setAppMode] = useState<AppMode>("free");
```

- [ ] **Step 2: 给 AppHeader 传 props**

在 `<AppHeader ... />` 的 props 中（`appVersion={appVersion}` 附近）加：

```tsx
        appMode={appMode}
        onModeChange={setAppMode}
```

- [ ] **Step 3: 条件渲染下半部分视图**

把 `<AppHeader .../>` 之后的 `update-error-detail` 块保留不动；将其后的 `<CanvasControls>`、`<div className="asset-workspace">…</div>`、`<PromptDock>`、`<PreviewModal>` 这一整段用 `appMode` 包裹：

```tsx
      {appMode === "free" ? (
        <>
          <CanvasControls
            /* …原有全部 props 原样保留… */
          />

          <div className="asset-workspace">
            {/* …原有 sectionDefinitions.map(...) 原样保留… */}
          </div>

          <PromptDock
            /* …原有全部 props 原样保留… */
          />

          <PreviewModal
            /* …原有全部 props 原样保留… */
          />
        </>
      ) : (
        <div className="workflow-placeholder">这是工作流页面</div>
      )}
```

注意：只是用 `{appMode === "free" ? (<>…</>) : (…)}` 包住这四个元素，元素内部 props 一字不改。`update-error-detail` 块留在条件外（顶栏下方，两个模式都可见）。

- [ ] **Step 4: 运行全量测试 + 构建**

Run: `npm test`
Expected: PASS（含 ModeSwitch、AppHeader 等全部用例）

Run: `npm run build`
Expected: 构建成功，无 TS 报错。

- [ ] **Step 5: 提交**

```bash
git add src/App.tsx
git commit -m "feat: App 按模式切换自由/工作流视图"
```

---

### Task 4: ModeSwitch + 工作流占位样式

**Files:**
- Modify: `src/styles.css`（在 `.brand-version { … }` 规则之后新增）

**Interfaces:**
- Consumes: Task 1 的 class 名 `.mode-switch`、`.mode-switch--workflow`、`.mode-switch-thumb`、`.mode-switch-label--free`、`.mode-switch-label--workflow`；Task 3 的 `.workflow-placeholder`。
- Produces: 视觉样式（无代码接口）。

- [ ] **Step 1: 新增样式规则**

在 `src/styles.css` 的 `.brand-version { … }` 规则块之后插入：

```css
.mode-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  margin-left: 12px;
  padding: 0 12px;
  border: 1px solid #d7d4cc;
  border-radius: 999px;
  background: #f6f7f4;
  cursor: pointer;
  overflow: hidden;
  transition: background-color 0.35s ease, border-color 0.35s ease;
}

.mode-switch-thumb {
  position: absolute;
  top: 50%;
  left: 4px;
  width: 44px;
  height: 22px;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  transform: translate(0, -50%);
  transition: transform 0.35s ease;
  z-index: 1;
}

.mode-switch--workflow {
  background: #16a34a;
  border-color: #15803d;
}

.mode-switch--workflow .mode-switch-thumb {
  transform: translate(48px, -50%);
}

.mode-switch-label {
  position: relative;
  z-index: 2;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  transition: color 0.35s ease;
}

.mode-switch-label--free {
  width: 44px;
  text-align: center;
  color: #1e2329;
}

.mode-switch-label--workflow {
  width: 44px;
  text-align: center;
  color: #9aa08f;
}

.mode-switch--workflow .mode-switch-label--free {
  color: rgba(255, 255, 255, 0.7);
}

.mode-switch--workflow .mode-switch-label--workflow {
  color: #ffffff;
}

.workflow-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 48px 24px;
  color: #68705f;
  font-size: 18px;
  font-weight: 600;
}
```

说明：轨道内边距 12px + 两个 44px 标签 + 6px gap，滑块宽 44px、起点 left:4px，工作流态 `translateX(48px)` 让滑块从「自由」标签滑到「工作流」标签下方。

- [ ] **Step 2: 运行构建确认无破坏**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 3: 提交**

```bash
git add src/styles.css
git commit -m "style: 模式切换开关与工作流占位样式"
```

---

### Task 5: 本地验证 + bump v0.2.1 + 推送 gitee

**Files:**
- Modify: `package.json`（version → 0.2.1）

- [ ] **Step 1: bump 版本号**

把 `package.json` 的 `"version": "0.1.14"` 改为 `"version": "0.2.1"`。

- [ ] **Step 2: 全量测试 + 构建**

Run: `npm test && npm run build`
Expected: 全部 PASS、构建成功。

- [ ] **Step 3: 本地 ovO 实际验证（借助 9333 / 裸 CDP）**

确认：默认自由模式内容与改动前一致；点击 switch 切到工作流显示「这是工作流页面」且轨道变绿、滑块滑到右侧；切回自由恢复原样。

- [ ] **Step 4: 提交版本号**

```bash
git add package.json
git commit -m "chore: v0.2.1 顶栏模式切换(自由/工作流)"
```

- [ ] **Step 5: 打 tag 并推送 gitee**

```bash
git tag v0.2.1
git push gitee feature/ui-shell
git push gitee v0.2.1
```

Expected: 推送成功。

---

## Self-Review

**1. Spec 覆盖：**
- 顶栏版本号右侧加 switch → Task 2 ✓
- 默认自由、可切工作流、两个独立 Tab → Task 3 ✓
- 工作流只显示「这是工作流页面」→ Task 3 ✓
- 顶栏一行不动 → Task 2（只在 .brand 内 append）✓
- 方案1 React 化、translateX 动画 → Task 1 + Task 4 ✓
- 自由态米白轨道 / 工作流态翠绿 #16a34a / 中文文字 → Task 4 ✓
- 不持久化 → Task 3（useState 默认 free）✓
- 绿色只在 switch 本身、工作流页背景不变 → Task 4（.workflow-placeholder 无背景色）✓
- v0.2.1 发布 + 推 gitee → Task 5 ✓
- ModeSwitch 测试 → Task 1 ✓

**2. 占位符扫描：** 无 TBD/TODO；测试代码、实现代码、CSS 均为完整内容。Task 3 用「原有 props 原样保留」是有意保持现有大段 props 不变（重复贴出反而易引入笔误），并明确指示「内部 props 一字不改」。

**3. 类型一致性：** `AppMode = "free" | "workflow"` 在 Task 1 定义，Task 2/3 import 复用；class 名 Task 1 产出与 Task 4 消费一致（`.mode-switch` / `--workflow` / `-thumb` / `-label--free` / `-label--workflow` / `.workflow-placeholder`）。滑块位移 Task 4 内部自洽（44px 标签 + translateX 48px）。
