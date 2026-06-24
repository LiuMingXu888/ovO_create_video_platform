# 图片生成 UX 修复 + 画布同步 设计（2026-06-24）

分支：`feature/ui-shell`（worktree）。推送：gitee `feature/ui-shell`，版本号 v0.1.8 → **v0.1.9**。

本轮覆盖 7 个点，分两组。所有结论均基于代码勘察 + 真实抓包
`/Users/mac/Library/Application Support/ovO/storage/api/captures/capture-2026-06-24-101956.json`（193 条捕获，仅含响应体，无请求体）。

---

## Group A — 图片生成 UI（对应 dadja1.png）

### A0. 占位符竞态（开头描述的 bug）

**现象**：隔 1s 连发两张图，出现两个占位符；先返回的第一张图却落到第二个占位符，
后生成的完成后又把空缺占位符顶掉，末尾再多出一个占位符。

**根因**：`handleGenerateImage`（App.tsx:1593-1594）用
`setAssets([...assets, placeholder])`——`assets` 是闭包旧快照；
`createGeneratedImagePlaceholder`（:705）命名计数也读旧 `assets`。第二张提交时拿到的
`assets` 尚未包含第一个占位符，插入时互相覆盖 → 串位 + 末尾重复。

**改法**：
- 占位符插入改函数式更新：`setAssets(current => [...current, placeholder])`，不依赖闭包。
- 占位符命名基于 `assetsRef.current`（已有的实时镜像），不读 `assets`。
- 同步审查 `setDefaultAssetOrder`、`persistCanvasHistoryEntry`、`persistLocalCanvasFull`
  在 `handleGenerateImage` 内是否也吃旧 `assets`，一并改为基于最新值。
- 完成回填已用 `assetsRef.current.map`（:1687），正确，保留。

### A1. 放大预览工具栏（问题1，参考 dadja1.png）

**现状**：`PreviewModal` 头部仅名字 `<h2>` + 上一个/下一个箭头。

**目标**：左边名字、右边一排**固定**功能区，功能区不随名字长短挤动。

**布局**：头部 flex；名字区 `flex:1; min-width:0` + 省略号截断；功能区 `flex-shrink:0` 固定在右。

**功能区**（沿用现有 lucide icon，与 AssetCard 一致）：
- 双击改名：`<h2>` 双击进内联编辑，回车/失焦保存 → 现有 `onRename`。
- 加入提示词资源引用：`Plus` → 现有 `insert` action。
- 复用提示词：`RefreshCcw` → 现有 `reuse-generation` action（无 `generationPrompt` 禁用）。
- 下载：`Download` → 现有 `download` action。
- 删除：`Trash2` → 现有 `delete` action（删后若删的是当前预览项则关闭弹窗）。
- 上一个/下一个：保留现有 `ChevronLeft/Right`。
- 关闭：保留现有 `X`。

**接线**：`PreviewModal` 新增 `onAction(asset, action)` 与 `onRename` 两个 props，
App.tsx 传入已有的 `handleAssetAction` / `renameAsset`。删除走现有 `handleDeleteAsset`（含 confirm）。

### A2. 批量删除（新增功能）

**现状**：批量选中只有 `handleDownloadSelected`。

**改法**：
- 新增 `handleDeleteSelected()`：取 `selectedAssetIds` 对应资产，**一次性确认**
  （`确定要删除选中的 N 个资源吗？`），逐个走现有删除链路（snapshot 节点 + 本地状态 + 落盘）。
- 多个删除**串行** PUT snapshot，避免并发覆盖快照（沿用项目既有“串行避免快照风暴”模式）。
  失败计数，提示“已删除 X 个，Y 个失败”。
- 删完退出选中模式、清空 `selectedAssetIds`。
- UI：批量工具栏“下载选中”旁加“删除选中”按钮，选中数为 0 时禁用。

### A3. 生成比例控不住（问题4）

**勘察结论**：字段**已对齐**。`imageGenerationClient.ts:45` 确实发 `aspectRatio`；
真实节点 `data.aspectRatio` 也存（抓包确认 9:16 / 16:9）。比例飘是**模型遵从度**问题，非字段缺失。

**改法（字段 + 提示词双保险）**：保留 `aspectRatio` 字段；发送时在提示词末尾追加一句
比例说明（如 `，生成的比例为 9:16`）。对所有图片模型生效。追加逻辑放在 payload 构建处
（与 `applyCameraSuffix` 同层），保证 `_meta`/UI 显示用的原始 prompt 不被污染（与摄像机后缀一致策略）。

---

## Group B — 抓包相关（capture-2026-06-24-101956.json）

### B1. duiba gpt-image2 的 504 自恢复（问题1）

**抓包实锤**（taskId `cmqrg58fc0l0fm2w1d4mf8zs4`）：
- POST `/api/generate-image` 撞 nginx 60s 网关超时 → **504**（html 错误页）。
- 但任务在 gen-queue 继续 `running`（createdAt 02:20:55 → completedAt 02:22:39，≈104s），
  随后 `status: succeeded` 带 `resultUrl`。
- `providerTaskId` **全程 null**；恢复靠 `GET /api/gen-queue?projectId=xxx` 的
  `tasks[]` 里按 `task.nodeId === 我们的 nodeId` 匹配。
- 现状 bug：`imageGenerationClient.ts:147-149` 把 504 当**终止失败**直接抛错。

**改法**：
- 新增 `pollGenQueueByNodeId(transport, {projectId, nodeId}, options)`：
  轮询 `GET /api/gen-queue?projectId=xxx`，在 `tasks[]` 找 `nodeId` 匹配那条：
  - `succeeded` → 经 `extractImageUrl(resultUrl/...)` 返回图片地址。
  - `failed` → 抛 `errorMessage`。
  - running/pending/队列暂无此 nodeId → 继续轮询（队列入队可能有延迟，容忍若干次缺失）。
- `requestGenerateImage` 遇 504 / 拿不到 taskId 时，**不再终止**，回退到 `pollGenQueueByNodeId`
  （需 `projectId + nodeId`，`handleGenerateImage` 已传入，`_meta` 中亦有）。
- 轮询节奏复用现有预算（初始延迟 15s + 4s 间隔，30 分钟上限）。
- 占位符在恢复期间保持“生成中”，不秒报错。
- 仍真正失败（队列内 failed / 超时）才置占位为 failed。

### B2. 按生成时间排序失效（问题2）→ 节点 ID 解码时间（方案 A）

**抓包实锤**：画布 snapshot 节点**没有 `createdAt` 字段**（顶层与 `data` 均无）。
用户看到的 `createdAt` 仅存在于 gen-queue 任务，不在画布节点。故现有
`getGeneratedTime`（App.tsx:187）读 `asset.createdAt` 对存量节点基本取空 → 全沉底。

**关键发现**：节点 ID 中间段是 **base36 毫秒时间戳**，实测解码有序且日期合理：
`img-mqrg5asu-xs7b8qy` → `mqrg5asu` → 合理 2026 日期。

**改法（方案 A，零网络依赖，覆盖所有节点）**：
- 新增 `src/lib/` 解码工具：从 `id` 取中间段 base36 → 毫秒。带**合理性校验**
  （落在合理时间窗，例：2020-01-01 ~ now+1 天），不合理返回 null。
- `getGeneratedTime` 改为：先 `Date.parse(asset.createdAt)`；为空/非法时回退到 ID 解码；
  仍无 → null（沿用现有“沉底且保持默认序”逻辑）。
- 新生成的本地占位 ID（`generated-image-<uuid>`）解不出 → null，符合预期。
- `sortCategoryAssets` 主逻辑不变，仅换时间来源。
- 加单测覆盖：真实节点 ID 解码、UUID 段返回 null、离谱串被校验拦下。

### B3. 本地上传/删除节点画布不显示（问题3）→ 先实证再改

**勘察候选差异**：真实节点有 `measured:{width,height}`、`data.imageSource`
（上传=`"upload"`）、`data.status`（图片=`"completed"`，视频=`"idle"`）。
app 的 `baseNode`（uploadClient.ts:248）**缺 `measured`、缺 `imageSource`，
`status` 给的是 `"ready"/"generating"`**，画布渲染器疑似因此跳过。

**步骤（先实证）**：
1. 用 9333 裸 CDP（参考 `/tmp/cdp_eval.py`）连真实画布，对比“能显示”与“app 写入但不显示”
   节点的字段差异，**确认渲染器实际卡哪个字段**。诊断结论写进实现计划。
2. 按结论补字段：`createCompanyImageNode`/`baseNode` 补 `measured`、`imageSource`，
   `status` 映射成画布枚举（completed/idle）。视频/音频节点同步核对。
3. 删除侧：确认 `removeAssetFromSnapshot` 删到画布渲染用的节点层（按 node.id 匹配），
   实证删除后画布确实消失。
4. 回归：上传/生成/删除后切到画布刷新，确认增删都同步显示/消失。

---

## 影响文件（预估）

- `src/App.tsx` — A0 占位符竞态、A2 批量删除、B2 排序时间源接线、预览弹窗接线（A1）。
- `src/components/PreviewModal.tsx` — A1 工具栏 + 内联改名。
- `src/styles.css` — A1 预览头部布局、A2 批量删除按钮。
- `src/api/imageGenerationClient.ts` — B1 gen-queue 回退轮询、A3 提示词比例后缀。
- `src/api/endpoints.ts` — B1 gen-queue 查询端点（若未导出）。
- `src/api/uploadClient.ts` — B3 节点字段补齐（依实证）。
- `src/lib/<新文件>.ts` — B2 节点 ID base36 时间解码 + 单测。
- `package.json` — 版本号 → v0.1.9。

## 验证

- 单测：B2 解码工具、A0 占位符不互相覆盖（若可单测）。
- 构建：`npm run build` / 现有 test runner 跑通。
- 真机：B1 用 duiba 复现 504 后确认自恢复；B3 CDP 实证 + 画布刷新；
  A1/A2 在 app 内手测预览工具栏与批量删除。
- 回归未人工跑的项在实现计划中标注。

## 既有未提交改动

worktree 内 `electron/companySession.ts` 有一处**已存在的未提交改动**（接口诊断
`Network.enable` 改 fire-and-forget，防 loadURL 前 await 卡死白屏），与本轮无关。
本轮不依赖也不回退它；提交时按需单独处理，不与本轮 7 点混提。

## 非目标（YAGNI）

- 不改服务端；不改画布渲染器；不动 gen-queue 以外的轮询路径。
- 不为 B2 引入额外网络请求（已否决拉 gen-queue 回填方案）。
- 不做与本轮 7 点无关的重构。
