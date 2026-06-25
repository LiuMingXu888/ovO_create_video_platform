# 设计文档：批量 UX 功能（轻提示 / 搜索 / 设置 / 文字化引用 / 提示词模态框 / 续轮询修复 / 预览缩放 / 标题与滑竿样式）

- 日期：2026-06-25
- 分支：feature/ui-shell（worktree：`.worktrees/ui-shell`）
- 目标版本：v0.2.1 → **v0.2.2**
- 远端：gitee `siberian-aries/ov-o_create_video_platform`

## 背景与环境约束

- 栈：Electron **37.10.3**（Chromium ≈ **128**）。`border-shape` / CSS `shape()` 需 Chromium 134+，当前**不可用**——用户贴的"波浪滑竿"原版 CSS 会触发其自带 fallback（退化成普通滑块），故 ui2 改为**做等效、当前可跑的波浪滑竿**。
- 下载：`electron/companySession.ts` 的 `saveAssetToDownloads` / `saveAssetsToDownloads` 直接写 `app.getPath("downloads")`，无弹窗。feat3 需把"基准下载目录"做成可配置项。
- 续轮询机制已存在：`resumePendingImageTasks`（App.tsx）+ `pendingTasks` 持久化（localCanvasStore）+ 启动 auto-load 走 `loadCanvasFromUrl` 会调用 resume。故 fix1 是"机制在但未生效"的真因待查 bug。
- `CanvasAsset` 已含 `generationPrompt?` 与 `generationReferences?: ReferenceItem[]`（含 previewUrl/name/kind）——提示词模态框所需数据现成。

## 范围（9 项）

### feat1 · 轻提示（Toast）
- 行为：**下载 / 重命名 / 删除 / 资源生成成功**时弹轻提示，**2.5s** 自动消失。
- 设计：app 根部挂一个 `ToastHost`，顶部居中、可堆叠、2.5s 自动移除。提供 `useToast()`（轻量 context）。
- 触发点：
  - 下载成功：单个 `downloadAsset` 成功、批量"已下载 N 个"。
  - 重命名成功：`renameAsset` 落地。
  - 删除成功：单个删除、批量删除。
  - 生成成功：图片 ready、视频 ready。
- 样式：success（绿）为主；error 复用同组件（可选）。失败仍走现有 activity message，不强制 toast。

### feat2 · 资源搜索
- 位置：**人物图片模块右上角，那三个 open 按钮（`canvas-open-buttons`：plain/devtools/capture）下面**。
- 交互：搜索输入框，输入即对**全部资源按 name 模糊匹配**（大小写不敏感子串匹配）。
- 结果：弹出结果面板，**按 人物＞场景＞道具＞音频＞视频 分组**展示；每组有分组标题；每行 = 名称 + 操作按钮【加入引用 / 放大预览 / 下载 / 删除】；**无缩略图**。
- 预览联动：从搜索结果点放大预览，PreviewModal 的上/下一个**只在当前搜索结果集内**导航（不串到全量资源）。
- 实现：新增 `AssetSearch.tsx`（输入 + 结果面板）；App 增 `searchQuery` 状态、计算结果、并让 PreviewModal 的导航集在"搜索预览"时切到结果集。

### feat3 · 设置（下载路径）
- 入口：顶栏**退出账户按钮右边**新增"设置"按钮（齿轮图标），**不改动现有布局**；登录/未登录都显示（应用级设置）。
- 形态：**弹窗 Modal**（`SettingsModal`），当前仅一个字段"下载路径"：文本输入 + "选择文件夹"按钮 + 保存。
  - 默认 placeholder = 系统下载文件夹；**留空也走系统下载文件夹**。
- 持久化：electron 端新增 settings 存储（userData 下 `settings.json`），IPC `settings.get/set`；`saveAssetToDownloads`/`saveAssetsToDownloads` 读取配置目录（无则回退 `app.getPath("downloads")`）。
- 选择文件夹：新增 IPC `dialog.selectFolder`（`dialog.showOpenDialog`，`openDirectory`）。

### feat4 · 文字化引用（替换"添加本地图片"按钮）
- **完全移除**提示词上方的"添加本地图片"按钮与本地文件引用上传（含 file input 与 `onLocalFilesSelected` 链路），原位替换为"文字化引用"按钮。
- 点击行为：把当前引用区资源**文字化**后插入提示词**第一行 + 换行**（前置，不覆盖已有提示词）。
- 文字化规则（按资源名**精确分组**）：
  1. 每个引用用现有 `getReferenceLabel` 得到标签（图片N / 视频N / 音频N，N 为同 kind 序号）。
  2. 按 `name` 精确分组，组按**首次出现顺序**。
  3. 组内标签按引用数组顺序**直接拼接**（图片1音频1）。
  4. 每组 = 拼接标签 + "是" + name；组间用 "、" 连接。
  - 例：图片1(小李)+音频1(小李)、图片2(小张)+音频2(小张)、图片3(小王)、图片4(小李家)、图片5(小张家)、视频1(视频节点)
    → `图片1音频1是小李、图片2音频2是小张、图片3是小王、图片4是小李家、图片5是小张家、视频1是视频节点`
- 实现：纯函数 `buildReferenceText(references)` 入 lib + 单测；PromptDock 按钮 onClick 调用并 `setPrompt(text + "\n" + prompt)`。

### feat5 · 提示词模态框（调整2）
- 触发：资源卡片新增"提示词"按钮（**仅 人物 / 场景 / 道具 / 视频**，音频不加），无 `generationPrompt` 时禁用。新增 `AssetAction = "view-prompt"`。
- 内容：与预览 Modal **同尺寸同比例**。
  - 顶部：**横向资源缩略图条** = `asset.generationReferences`（用 previewUrl；非图片 kind 给占位）。
  - 下方：`asset.generationPrompt`；**若超出则以列表形式**展示（按行/句拆分为列表项，可滚动）。
  - 右上角：关闭按钮。
- 实现：新增 `PromptInfoModal.tsx`；App 增 `promptInfoAsset` 状态。
- 用途：让用户**只读旧提示词、手动借用其中一句**，避免"复用提示词"整段覆盖当前输入的痛点。

### 卡片图标排列（按用户给定）
主行统一：`放大 - 重命名 - 下载 - 加号`；次行（折叠/悬浮区）：
- 人物：场景 / 道具 / 复用提示词和资源 / 删除 / **提示词**
- 场景：人物 / 道具 / 复用提示词和资源 / 删除 / **提示词**
- 道具：人物 / 场景 / 复用提示词和资源 / 删除 / **提示词**
- 音频：播放 / 删除（**不加提示词**）
- 视频：播放 / 复用提示词和资源 / 去字幕 / 删除 / **提示词**
（视频按钮语义＝复用，与图片一致。）

### fix1 · 重启后图片一直"生成中"且不再轮询
- 期望：重开 app 后，仍在生成的图片应恢复轮询，最终 ready 或 failed，不应永久卡"生成中"且无网络请求。
- 排查范围（实现阶段用 systematic-debugging + 9333 CDP + 检查 `storage` 本地 store 复现）：
  - `pendingTasks` 是否真正写盘并在 `readLocalCanvas`/`mergeCanvasState` 后恢复非空；
  - `pollImageResult` 重启后是否真的发起轮询请求（是否依赖了丢失的内存态）；
  - 占位资产 id 与 pendingTask.nodeId 是否对齐（避免远端 ready 资产 id 不同导致占位永卡）。
- 修复后补回归（能力允许则加单测/集成验证）。

### fix2 · 预览缩放 + 背景列表不滚动
- PreviewModal：按住 **Ctrl + 滚轮**对图片放大/缩小（scale 1×–4×，居中缩放，切换资源/关闭时复位）。
- 预览/提示词模态框打开时，**普通滚轮不得滚动背后的人物/场景列表**（modal 打开时锁背景滚动 / backdrop 上 `wheel` preventDefault）。
- 同样的滚动隔离应用到 `PromptInfoModal`。

### ui1 · ovO 标题样式（用户已给真实 CSS）
- 对顶栏 `.brand-mark`（ovO）套用：Shrikhand 字体 + 渐变描边文字 + drop-shadow + hover（背景位移/scale）。
- **本地内置 Shrikhand 字体**（woff2 进 resources + `@font-face`），不依赖 `fonts.googleapis.com` 外网/CSP。
- 仅作用于品牌标题文本，不改顶栏布局（不照搬原 CSS 里的 body 居中规则），版本号 `v0.2.x` 保留。

### ui2 · 时长滑竿样式（等效波浪、当前可跑）
- 目标：GeneratePanel 的时长 `input[type=range]`（min4 max15）做出接近原设计的波浪滑竿：波浪轨道 + 主色 `#547980` 圆球 thumb + 左侧已填充。
- 技术：用 Chromium 128 支持的手段（SVG/clip-path/渐变 + 自定义 thumb）实现，**作用域限定到专用 class（如 `.wavy-range`）**，不污染其他 range。
- 仍是原生 range，保留可访问性与既有 onChange 行为。

## 架构与文件影响

- 新增组件：`ToastHost.tsx`(+`useToast`)、`AssetSearch.tsx`、`SettingsModal.tsx`、`PromptInfoModal.tsx`。
- 新增 lib：`buildReferenceText.ts`(+test)、settings 客户端封装（renderer 侧）。
- 修改：`App.tsx`（挂载 4 个新 UI、search/preview 联动、prompt 文字化、view-prompt、toast 触发、fix1）、`PromptDock.tsx`（按钮替换）、`AssetCard.tsx`（新增提示词按钮 + 次序）、`PreviewModal.tsx`（缩放+滚动隔离）、`AppHeader.tsx`（设置按钮）、`GeneratePanel.tsx`（滑竿 class）、`types.ts`（`view-prompt`）、`styles.css`（标题/滑竿/toast/搜索/模态框样式）。
- electron：`settings` 存储 + IPC（`settings.get/set`、`dialog.selectFolder`）、`saveAsset*` 读配置目录、`preload.cts` 暴露、resources 内置字体。

## 测试策略
- 纯函数单测：`buildReferenceText`（分组/拼接/顺序/边界）、settings 路径回退、download 目录计算。
- 组件测试：PromptDock 按钮替换后行为、AssetCard 新按钮按类目出现/禁用、PromptInfoModal 渲染、SettingsModal 保存、AssetSearch 分组结果。
- 既有测试保持通过；UI 重构后**带上集成层验证**（避免只跑组件单测漏掉 App 联动，呼应历史教训）。
- fix1：尽量加可复现的回归；至少打包态人工验证一次。

## 交付
- 逐项实现 → `npm test` 全绿 → 人工冒烟（含 fix1 打包态）→ bump **v0.2.2** → 推 gitee。
