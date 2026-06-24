# ovO 画布同步修复 + 顶栏/画布按钮重构 设计（v0.1.11）

分支：`feature/ui-shell`（worktree `.worktrees/ui-shell`），推送 gitee 时版本号 `0.1.10 → 0.1.11`。

## 背景

承接 [[ovo-placeholder-race-and-updater-404]] 与 [[ovo-canvas-node-measured-render]]。上一轮补了 `measured` 修复了"节点完全不渲染"，但音频/视频仍不同步到公司画布。本轮解决三个画布数据 bug + 一次顶栏与画布按钮的结构重构。

## 问题与根因

### Bug1 — 图片生成占位符竞态
连续快速提交两个图片生成任务时，第一个结果错位 / 占位符互相覆盖。

根因：`assetsRef.current` 通过 `useEffect(() => { assetsRef.current = assets }, [assets])` 异步更新。两个 handler 在同一 render 周期内接连调用时，第二个读到的 `assetsRef.current` 仍是旧值（不含第一个占位符），`[...assetsRef.current, placeholder2]` 覆盖掉了第一个占位符。`src/App.tsx` 图片提交段已用 ref，但仍有这个"ref 未及时更新"的窗口；视频（用陈旧 `assets`）和去字幕（用陈旧 `assets`）更严重。

### Bug2 — 音频/视频不同步到公司画布（核心）
图片能同步，音频/视频不能。

根因（capture 实证）：公司画布前端按 `data.status` 驱动节点渲染。对比 capture 中**公司端原生节点** vs **ovO 写入节点**：

- image 原生：`data.status: "completed"` + `imageSource: "upload"` —— ovO 恰好写成 `completed`，所以**图片能渲染**。
- audio 原生：`data.status: "idle"` + `isCustomUpload: true` + `voicePresetId/voiceName/gender/ageGroup: null` —— ovO 写成 `completed` 且缺这些字段 → **不渲染**。
- video 原生：`data.status: "idle"` + `model: "Seedance 2.0"`（modelName，非 endpoint id） —— ovO 写成 `completed` + `model: "ep-2026..."` → **不渲染**。

节点存进了快照（PUT 200 / dbSaved:true），但画布渲染器不认 `completed` 状态的 audio/video → 不显示。这同时导致：视频生成后打开画布看不到 → 画布自动保存其内存态（无该节点）→ 覆盖快照 → 重新加载视频永久丢失。

> ⚠️ 强假设：audio/video 用 `status:"idle"` 是从原生 capture 推断，未在活画布验证。改完打包后需实测确认；若不对再据新抓包微调。

### Bug3 — 本地上传冲掉生成中的占位符
有视频在生成中时本地上传一张图片，生成中的占位符全部消失。

根因：`src/App.tsx` `handleFilesSelected` 上传完成后用 `normalizeSnapshotAssets(nextSnapshot)` 从服务端快照重建 assets 列表，而服务端快照里没有 `status:"generating"` 的本地占位符 → 全被丢弃。

## 修复方案

### 修复1：占位符竞态（`src/App.tsx`）
三个 handler 创建占位符后，在 `setAssets(assetsWithPlaceholder)` 前后**立即同步** `assetsRef.current = assetsWithPlaceholder;`，消除 ref 更新窗口：
- 图片生成（`handleGenerateImage`，提交段）
- 视频生成（`handleGeneratePreview`，提交段，并把 `[...assets, ...]` 改为 `[...assetsRef.current, ...]`）
- 去字幕（`handleRemoveSubtitles`，提交段，同上）

工厂函数 `createGeneratedVideoPlaceholder` / `createSubtitlePlaceholder` 的序号计算从 `assets.filter` 改为 `assetsRef.current.filter`，与图片保持一致。

### 修复2：节点 schema 对齐（`src/api/uploadClient.ts`）
`baseNode` 的 `status` 由"按 ready→completed 统一"改为**按 kind 区分**：
- image：`completed`（保持）
- audio / video：`idle`（完成态用原生值）
- 占位/失败态（asset.status 为 generating/failed）：保留自身值，不强转。

`createCompanyAudioNode` 补齐原生字段：`isCustomUpload: true`、`voicePresetId: null`、`voiceName: null`、`gender: null`、`ageGroup: null`。

`createCompanyVideoNode` 的 `model` 改用 modelName（如 `"Seedance 2.0"`）而非 endpoint id；保留 `videoUrl`、`seedanceProviderUrl`、`thumbnailUrl`、`duration`、`resolution`、`aspectRatio`、`generateAudio` 等。

`MEASURED_BY_KIND` video 高度 587 → 588（对齐原生）。

> 注意 `snapshotHasNode` 校验用的是 node id / assetId，与 status 无关，schema 改动不影响保存校验。

### 修复3：上传保留生成中占位符（`src/App.tsx`）
`handleFilesSelected` 有画布分支，上传完成后：
```ts
const uploadedAssets = normalizeSnapshotAssets(nextSnapshot);
const generating = assetsRef.current.filter((a) => a.status === "generating");
const merged = [...uploadedAssets, ...generating];
assetsRef.current = merged;
setAssets(merged);
```
对 `defaultAssetOrder` 同步补回占位符 id，避免排序丢失。

## UI 重构

### 重构A：AppHeader 右上角（`src/components/AppHeader.tsx`）
当前：`account-button`（无 onClick，始终显示状态文字）+ `退出登录`（始终显示）。

改为左→右：`多选 / 积分 / 更新 / 登录状态标签 / 登录账号·退出账户按钮`
- **登录状态标签**：纯展示，无 onClick。仅 `authState.status === "authenticated"` 时显示，文字为账号名（`account ?? name ?? "已登录"`）；checking 显示"检查中"。未登录不渲染该标签。
- **登录·退出按钮**：未登录 label="登录账号" + `onClick={onOpenLogin}`；已登录 label="退出账户" + `onClick={onLogout}`；checking 时 disabled。

### 重构B：CanvasControls 画布按钮（`src/components/CanvasControls.tsx`）
当前：`登录公司账号 / 检查登录态 / 加载画布资源`。

改为：`Open公司画布 / Open公司画布(DevTools) / Open公司画布(API Fetch) / 加载画布资源`
- 移除"登录公司账号""检查登录态"（`onOpenLogin`、`onCheckAuth` 在此组件不再使用；登录改由 AppHeader 承担）。
- 三个画布按钮均 `disabled` 当 `authState.status !== "authenticated"` 或 loading。
- `加载画布资源` 保持不变。

三按钮行为：
- **Open公司画布**：纯打开公司画布（公司 session 分区），不挂 CDP，可手动开 DevTools。
- **Open公司画布(DevTools)**：打开后**自动** `openDevTools()`，不挂 CDP（与抓包互斥）。
- **Open公司画布(API Fetch)**：复用现有 `inspectCanvas` 的 CDP 抓包逻辑，写 `storage/api/`。

### 重构C：三按钮的 Electron 后端
- `electron/companySession.ts`：新增 `openCanvasWindow(canvasUrl, mode)`，`mode ∈ {"plain","devtools","capture"}`。抽出现有 `inspectCanvas` 的窗口/BrowserView 创建逻辑复用；`capture` 挂 `attachApiCapture`，`devtools` 调 `webContents.openDevTools({mode:"detach"})`，`plain` 都不做。`capture` 模式返回值与 `inspectCanvas` 一致（summaries/路径）；`plain`/`devtools` 返回 `{ok:true}`。保留 `inspectCanvas` 作为 `openCanvasWindow(url,"capture")` 的薄封装以兼容旧调用。
- `electron/main.ts`：新增 `ipcMain.handle("ovo:canvas:open", (_e, url, mode) => openCanvasWindow(url, mode))`。
- `electron/preload.cts`：`discovery` 下暴露 `openCanvas(url, mode)`；保留 `inspectCanvas` 兼容。
- `src/services/companyApiFacade.ts`：新增 `openCanvas(url, mode)` 转发。
- `src/App.tsx`：新增 `handleOpenCompanyCanvas(mode)`，传给 CanvasControls 三个回调。

> 默认画布 URL：三按钮打开的是当前已加载画布（`project.canvasUrl || canvasUrl`）；为空时回退公司画布根（沿用 `inspectCanvas` 默认 `TARGET_CANVAS_URL`）。

### 重构D：input 宽度（`src/components/CanvasControls.tsx` + `styles.css`）
`.canvas-name-row` 的 input 和 `.canvas-url-field` 宽度改为约 50%（`max-width:50%` 或容器 flex-basis）。canvas 名称的对号按钮（`icon-only-button`）紧贴缩短后的 input 右侧。

## 测试

- `src/App.test.tsx`：保留现有并发占位符回归；新增"连续两个图片任务都保留各自占位符"用例（deferred promise 交错）；"本地上传时保留生成中视频占位符"用例。
- `src/api/uploadClient.test.ts`（若无则新建）：断言 audio 节点 `data.status==="idle"` + `isCustomUpload===true`，video 节点 `data.status==="idle"` + `model==="Seedance 2.0"`，image 节点 `data.status==="completed"`。
- `electron/*.test.ts`：`openCanvasWindow` 三模式分支（capture 挂 capture / devtools 开 devtools / plain 都不挂）——按现有 electron 测试可达性，不可单测则人工验证。
- `App.test.tsx` 中引用旧 `image-node/audio-node/video-node` type 的用例：核对断言是否需随 schema 改动更新。
- 全量 `npm test` + `tsc`（app + tsconfig.node.json）+ `npm run build` 必须绿。

## 验证（人工，打包后）
1. 连续提交两个图片任务 → 两个占位符各就各位，结果不串位。
2. 本地上传音频 → 打开公司画布能看到音频节点。
3. 生成视频完成 → 打开公司画布能看到视频节点；关闭重开仍在（不被自动保存覆盖）。
4. 有视频生成中时本地上传图片 → 生成中占位符不消失。
5. 顶栏：未登录显示"登录账号"无状态标签；登录后显示账号标签 + "退出账户"。
6. 三个画布按钮：plain 无抓包、devtools 自动开 DevTools、API Fetch 写 storage/api；未登录时禁用。
7. input 宽度约半屏，对号贴紧。

## 风险
- audio/video `status:"idle"` 为强假设，可能需据实测微调（已在 Bug2 标注）。
- electron 主进程逻辑较难单测，三模式以人工验证为主。
