# 图片生成轮询持久化 + 默认排序 + 引用清空 设计文档

日期：2026-06-23
分支：feature/ui-shell
目标版本：0.1.6

## 背景

ovO 桌面端（Electron + React）当前的图片生成流程存在三个问题：

1. 生成图片后，提示词已清空但"引用的图片"残留，与视频生成行为不一致。
2. 除视频外的其他资产分类默认排序为 `default`，没有按生成时间降序。
3. 图片生成只有"已等待"文案，没有真正的数据轮询、没有超时、没有持久化。生成途中关闭应用，再打开生成结果就丢了。

关键架构事实（决定方案）：
- 当前本地仅持久化"布局"（资产 id + 分类 + 排序，存 localStorage 键 `ovo.canvasHistory.v1`），资产**真实内容（url/提示词/参数）不存本地**，每次靠"加载画布资源"从公司服务端快照重新拉。
- 视频生成 `handleGeneratePreview`（App.tsx:1281）与图片生成 `handleGenerateImage`（App.tsx:1435）结构对称。
- 真正的轮询在 API 客户端层：`imageGenerationClient.ts` 已有 `pollImageQueueUntilComplete`（1.5s 间隔、maxAttempts 600）。
- Electron 已有完整 IPC + preload 架构（`electron/main.ts`、`electron/preload.cts`），新增本地文件存储通道可行。

## 用户已确认的决策

- 调整1（引用+提示词清空时机）：**提交后立即清空**。
- 调整3（断点恢复行为）：**自动续轮询直到出结果**。
- 持久化介质：**Electron 本地文件**（写 `app.getPath("userData")` 目录）。
- 版本迁移：**做**（存储文件写入 schema 版本，读取时按版本兼容迁移）。
- 多端边界：接受。本地缓存只解决"同一台机器重开不丢"，多端一致以点击"加载画布资源"为准。
- 调整3 taskId 丢失降级：可接受。提交后未拿到 taskId 即被关闭的极短窗口，降级为按 projectId 重新拉一次画布资源兜底。
- 原"保存按钮"（调整4）：**取消**。改为所有改动操作实时自动落盘，手动按钮多余。

## 范围

三个调整：
1. 生成图片后立即清空引用 + 提示词。
2. 全部资产分类默认按生成时间降序。
3. 图片生成：loading + 30 分钟超时 + 1.5s 轮询打印控制台 + 实时持久化到 Electron 本地文件 + 重开自动续轮询。所有改动操作（生成、加载、改名、改分类、排序）实时自动落盘。含 schema 版本迁移与"远端为准"的合并规则。

不在范围：多端实时同步；为存量（服务端已有、无 createdAt）资产补真实生成时间。

## 详细设计

### 调整1：生成图片后立即清空引用 + 提示词

文件：`src/App.tsx` 的 `handleGenerateImage`（约 1435-1537）。

当前 `setPrompt("")` 在 1458（提交前已清提示词），但全函数无 `setReferences([])`。`referenceImageUrls` 在 1469 才读 `references`。

改法：在清空前先用局部变量保存提交所需引用，再与视频生成（App.tsx:1319-1321）对齐清空：

```ts
const submittedReferences = references; // 提交用旧引用
// ... setAssets / persist / setDefaultAssetOrder ...
setPrompt("");
setReferences([]);
setReferenceIssues([]);
// 后续 referenceImageUrls 基于 submittedReferences 计算，而非已清空的 references
```

确保提交用的是清空前的引用，UI 立即清空。

### 调整2：全部分类默认按生成时间降序

文件：`src/App.tsx:44` `defaultSortModes`。

```ts
const defaultSortModes: Record<AssetCategory, SortMode> = {
  characters: "generated-desc",
  scenes: "generated-desc",
  props: "generated-desc",
  audio: "generated-desc",
  video: "generated-desc"
};
```

兼容性：排序辅助 `getGeneratedTime`（App.tsx:178）读 `asset.createdAt`，无效时回退 `defaultIndex`。存量资产可能无 `createdAt`，将回退到默认顺序位置（已是现有行为，无需新增代码，保持兼容即可）。不凭空补存量资产生成时间。

### 调整3：图片生成轮询 + 30 分钟超时 + 控制台打印 + 本地持久化 + 续轮询

#### 3a. 轮询与超时与打印

文件：`src/api/imageGenerationClient.ts`。

- `DEFAULT_IMAGE_GENERATION_POLL_OPTIONS`（:6）：`maxAttempts` 由 600 提到 **1200**（1.5s × 1200 = 30 分钟）。
- 在 `pollImageQueueUntilComplete`（:178）/ `pollImageTaskUntilComplete`（:158）每次轮询回调 `console.log` 打印：attempt 序号、当前状态、已等待时间、taskId/nodeId。
- App 层 `handleGenerateImage` 超时改为 30 分钟（参照视频 40 分钟的 `setTimeout` 模式，App.tsx:1335），超时置占位资产 `status: "failed"` + 文案"生成超时（超过30分钟）"。

#### 3b. Electron 本地文件存储层（新增）

新增主进程 IPC（`electron/main.ts`）：
- `ovo:local-store:read`（按 projectId 读 JSON）
- `ovo:local-store:write`（按 projectId 写 JSON）

存储位置：`path.join(app.getPath("userData"), "canvas-store", "<projectId>.json")`。

preload（`electron/preload.cts`）暴露：
```ts
localStore: {
  read: (projectId: string) => ipcRenderer.invoke("ovo:local-store:read", projectId),
  write: (projectId: string, data) => ipcRenderer.invoke("ovo:local-store:write", projectId, data)
}
```

新增 `src/lib/localCanvasStore.ts`，职责：
- 定义存储 schema（含 `schemaVersion` 字段，初始为 1）。
- 读写封装（调 `window.ovoDesktop.localStore`）。
- schema 版本迁移：读取时若版本低于当前，按迁移函数升级；缺失字段补默认。
- 合并规则（远端为准 + 进行中任务本地优先）。

存储结构（每 projectId 一份）：
```ts
interface LocalCanvasStore {
  schemaVersion: number;
  projectId: string;
  canvasName: string;
  canvasUrl: string;
  assets: CanvasAsset[];        // 完整内容：url/提示词/参数/分类/排序
  pendingTasks: PendingTask[];  // 进行中的生成任务
  updatedAt: string;
}

interface PendingTask {
  nodeId: string;          // = placeholder.id
  taskId?: string;         // 提交后拿到；用于续轮询
  kind: "image" | "video";
  category: AssetCategory;
  prompt: string;
  settings: unknown;       // 生成参数（图片/视频各自的 settings）
  referenceImageUrls?: string[];
  startTime: number;       // 用于 30 分钟超时判断
  status: "submitting" | "queued" | "running";
}
```

#### 3c. 实时自动落盘

在所有改动画布内容的操作后，除现有 `persistCanvasHistoryEntry`（localStorage 布局）外，**追加写一次本地文件**（完整内容）。挂载点（App.tsx 现有调用 `persistCanvasHistoryEntry` 的位置）：
- 图片/视频生成：提交（写 pendingTask）、轮询中间态（更新 pendingTask）、成功（写完整资产 + 移除 pendingTask）、失败/超时（标记失败 + 移除 pendingTask）。
- 加载画布资源（`loadCanvasFromUrl`，App.tsx:957）：远端覆盖后写本地缓存。
- 改名（`renameAsset`，App.tsx:1005）、改分类（`changeAssetCategory`，App.tsx:1028）、排序变更：写本地缓存。

实现方式：封装一个 `persistLocalCanvasFull(project, canvasName, canvasUrl, assets, pendingTasks)`，在上述各处与 `persistCanvasHistoryEntry` 并列调用。注意防抖/避免阻塞 UI（写文件走 IPC 异步，不 await 阻塞渲染，失败仅 console.warn 不影响主流程）。

#### 3d. 启动恢复 + 续轮询

应用启动 / 加载某画布时：
1. 读本地文件（按 projectId）。
2. 合并规则（按 `asset.id` 即 nodeId 为键）：
   - 远端有该 nodeId 且 `ready` → 远端赢，对应 pendingTask 清除。
   - 远端无 / 仍 generating → 本地任务赢，保留。
   - 两边都 ready → 取 `updatedAt`/`createdAt` 较新者。
3. 对每条仍有效（未超过 30 分钟）的 pendingTask：
   - 有 taskId → 恢复"生成中"占位卡，调 `pollImageQueueUntilComplete`（或视频对应轮询）继续轮询，出结果写回。
   - 无 taskId（极短窗口被关）→ 降级：按 projectId 重新拉一次画布资源兜底捞结果。
   - 已超 30 分钟 → 标记超时失败。

场景区分：
- 启动直接看缓存（未点加载）：显示本地缓存内容，标注"本地缓存"，不主动拉远端。
- 点"加载画布资源"：远端覆盖本地（保持 `loadCanvasFromUrl` 现有覆盖行为），重写本地缓存。
- 进行中任务：本地优先，按上面合并规则处理。

### 调整4：取消

不新增手动保存按钮。由 3c 的实时自动落盘覆盖该需求。

## 落地文件清单

- `electron/main.ts`：新增 `ovo:local-store:read/write` 两个 ipcMain.handle + 读写函数（含目录创建、错误处理）。
- `electron/preload.cts`：暴露 `localStore.read/write`。
- `src/lib/localCanvasStore.ts`（新建）：schema、读写封装、版本迁移、合并规则。
- `src/api/imageGenerationClient.ts`：maxAttempts 提到 1200、轮询回调 console.log。
- `src/App.tsx`：清空引用（1a）、默认排序（2）、图片轮询+30min超时+持久化+续轮询（3a/3c/3d）、启动恢复。
- `src/App.test.tsx`：同步受影响的断言（排序默认值、生成流程）。
- 类型：preload window 类型声明（`window.ovoDesktop.localStore`）需在对应 d.ts / 类型文件补充。
- `package.json`：version → 0.1.6。

## 测试策略

- `localCanvasStore` 单元测试：读写往返、schema 迁移（低版本→当前）、三种合并场景（远端ready覆盖、本地pending保留、两边ready取新）。
- 图片生成流程测试：提交后引用+提示词清空；超时路径置 failed。
- 排序测试：各分类默认 `generated-desc`；无 createdAt 资产回退顺序不崩。
- 构建验证：`npm run build`（tsc + vite）通过。
- 现有 `App.test.tsx` 全绿。

## 风险与边界

- 存量资产无 `createdAt` → 排序回退默认位置，无法补真实生成时间（已与用户确认接受）。
- 多端同改同画布 → 本地不自动感知，以点击"加载画布资源"为准（已确认接受）。
- 提交后未拿 taskId 即关闭 → 降级按 projectId 重拉兜底（已确认接受）。
- 写文件失败 → 仅 console.warn，不阻断生成主流程。

## 版本与发布

- 版本 bump：0.1.5 → 0.1.6。
- 推送 gitee 远端：`git@gitee.com:siberian-aries/ov-o_create_video_platform.git`。
