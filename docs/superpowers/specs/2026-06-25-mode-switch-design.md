# 顶栏模式切换（自由 / 工作流）设计

日期：2026-06-25
分支：feature/ui-shell
目标版本：v0.2.1

## 背景与目标

在顶栏左侧版本号右边新增一个模式切换开关，用于在「自由模式」和「工作流模式」之间切换。两种模式相当于两个独立 Tab，顶栏那一行保持不变，下方页面内容完全不同：

- **自由模式（默认）**：当前已有的全部内容（画布控制栏 + 资源工作区 + 提示词坞 + 预览弹窗）。
- **工作流模式**：换成一个全新的页面，当前阶段先只显示一行文字「这是工作流页面」，其余功能后续再加。

开关视觉采用掘金文章《CSS实现超级酷炫的Switch开关》的「方案1」（白色滑块在胶囊轨道内滑动 + 过渡动画）的精髓，但用 React 受控组件声明式实现，不照搬文章的命令式 DOM 操作。

## 已确认的决策

1. **绿色作用范围**：绿色只作用在 switch 开关本身（工作流态轨道变绿）。工作流页面背景保持原米白 `#f6f7f4`，不整页变绿。
2. **持久化**：不持久化。纯组件 state，每次启动 app 默认回到自由模式。
3. **配色风格**：适配顶栏浅色风格，不照搬文章纯黑胶囊。文字用中文 `自由` / `工作流`。绿色用翠绿 `#16a34a`。
4. **滑块动画**：用 `transform: translateX()` + `transition` 在两端滑动（比文章「先撑满再缩窄」更利落，无需 transitionend 回调）。

## 架构

### 状态管理（src/App.tsx）

- 新增 `const [appMode, setAppMode] = useState<"free" | "workflow">("free")`。纯组件 state，不写 localStorage。
- 渲染时根据 `appMode` 条件切换下半部分视图：
  - `free` → 渲染现有全部内容（`<CanvasControls>` + `<div className="asset-workspace">` + `<PromptDock>` + `<PreviewModal>`），逻辑零改动。
  - `workflow` → 只渲染占位区 `<div className="workflow-placeholder">这是工作流页面</div>`。
- `<AppHeader>` 始终渲染（顶栏不随模式变化），并接收新的 `appMode` / `onModeChange` props。

自由模式相关的全部 state（资源、生成、快照、引用等）原样保留，切到工作流只是换下半部分视图，不卸载这些 state（条件渲染下半视图，App 组件本身不重挂）。

### 顶栏接入（src/components/AppHeader.tsx）

- `AppHeaderProps` 新增 `appMode?: "free" | "workflow"` 和 `onModeChange?: (mode) => void`。
- 在 `.brand` 容器内、`<span className="brand-version">` 右侧渲染 `<ModeSwitch mode={appMode} onModeChange={onModeChange} />`。
- 顶栏其余结构（项目标题、积分、更新、登录等）完全不动。

### ModeSwitch 组件（新文件 src/components/ModeSwitch.tsx）

受控组件，无 DOM 操作、无 getElementById、无 transitionend 监听。

```tsx
interface ModeSwitchProps {
  mode: "free" | "workflow";
  onModeChange: (mode: "free" | "workflow") => void;
}
```

- 渲染一个 `<button type="button" role="switch" aria-checked={mode === "workflow"}>`。
- 点击：`onModeChange(mode === "free" ? "workflow" : "free")`。
- 内部结构：轨道根元素 + 滑块 `.mode-switch-thumb` + 两个文字标签（`自由` / `工作流`）。
- 由 `mode` prop 决定根元素 class（如 `mode-switch--workflow`），动画与配色全部交给 CSS，React 只管状态。
- 可访问性：`aria-label="模式切换"`，两个文字标签可见。

## 样式（src/styles.css 新增）

### .mode-switch（胶囊轨道）

- 内联放在 `.brand` 内，版本号右侧，用 `margin-left` 隔开。
- 高约 28px，圆角 999px，`position: relative; overflow: hidden`，`cursor: pointer`，无默认 button 边框背景。
- `transition: background-color .35s ease, border-color .35s ease`。
- 容纳两个文字标签，宽度足够同时放下「自由」「工作流」。

### 自由态（默认）

- 轨道：米白 `#f6f7f4`，细边框 `#d7d4cc`（和顶栏一致）。
- `自由` 文字：高亮深色（如 `#1e2329`）。
- `工作流` 文字：浅灰（如 `#9aa08f`）。
- 滑块停在「自由」一侧。

### 工作流态（.mode-switch--workflow）

- 轨道：翠绿 `#16a34a`，边框同色或更深绿。
- `工作流` 文字：白色高亮。
- `自由` 文字：半透明白（如 `rgba(255,255,255,.7)`）。
- 滑块 `translateX` 滑到「工作流」一侧。

### .mode-switch-thumb（滑块）

- 白色圆角块，绝对定位。
- `transition: transform .35s ease`。
- 由根元素 class 控制 `transform`（自由 `translateX(0)`，工作流 `translateX(<偏移>)`）。

### .workflow-placeholder（工作流占位页）

- 占据下半部分区域，居中显示「这是工作流页面」，留白充足、字号略大、颜色柔和。

## 测试

- 新增 `src/components/ModeSwitch.test.tsx`，跟随现有 `AppHeader.test.tsx` 风格：
  - 渲染后 `role="switch"` 的 `aria-checked` 初始随 `mode` prop。
  - 点击后 `onModeChange` 被调用且传入相反的模式值。
- App 层条件渲染逻辑简单，不单独加测试。

## 验证

- 改完运行项目的 build / lint / test（按 package.json 实际脚本）。
- 在本地 ovO 中实际点击切换，确认：自由模式内容与改动前一致；切到工作流显示「这是工作流页面」且 switch 轨道变绿；切回自由恢复原样。可借助 9333 远程调试端口 / 裸 CDP 确认渲染。

## 范围之外（本次不做）

- 工作流模式的真实功能（仅占位文字）。
- 模式持久化 / 记忆上次模式。
- 整页背景随模式变色。
- 顶栏其余区域的任何调整。

## 版本与发布

- 完成后将 package.json 版本号 bump 到 `0.2.1`，commit 信息带 `v0.2.1`，打 tag 并推送到 gitee 远端 `feature/ui-shell`。
