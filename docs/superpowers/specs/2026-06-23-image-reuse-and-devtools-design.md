# 图片复用提示词、生图 504 诊断、React DevTools 接入 — 设计

日期: 2026-06-23
分支: feature/ui-shell
目标版本: v0.1.5(worktree 当前 0.1.4)

## 背景

用户在 ovO（Electron + React 画布工具）提了三件事:

1. 图片资源卡缺「复用提示词和资源」按钮(视频卡已有「复用生成」)。
2. 生图报 504(`App.tsx:1520 [图片生成] 错误: {status:504, message:'请求失败(504)'}`)。
3. 问 react-devtools 是否有用、能否接入,并要一份下次使用说明。

## 任务 1 — 图片卡「复用提示词和资源」

### 现状

- `AssetCard.tsx` secondary 区:图片卡只有「分类切换 + 删除」,视频卡有「复用生成(RefreshCcw) + 去字幕」,音频卡只有「播放 + 删除」。
- 数据模型 `CanvasAsset` 已有 `generationPrompt?` 和 `generationReferences?: ReferenceItem[]`。
- 视频生成(`createGeneratedVideoPlaceholder`)同时存 `generationPrompt` + `generationReferences`。
- **图片生成(`createGeneratedImagePlaceholder` + `saveCanvasAsset` 调用处)只存 `generationPrompt`,未存 `generationReferences`。** 这是要补的核心数据缺口。
- `reuseGeneration(asset)` 已实现:把 prompt 填回输入框、把 references clone 回引用区,带校验。视频/图片可共用。

### 目标布局(用户给定)

```
人物/场景/道具:  放大-重命名-下载-加号
                  场景(或人物) 切换
                  道具(或场景) 切换
                  复用提示词和资源   ← 新增,放在分类切换按钮之后、删除之前
                  删除
音频:            放大-重命名-下载-加号 / 播放 / 删除   (已符合,不动)
视频:            放大-重命名-下载-加号 / 播放 / 复用 / 去字幕 / 删除  (已符合)
```

### 改动

1. **数据保存参考图(决策: 复用提示词+参考图)**
   - `createGeneratedImagePlaceholder` 增加 `generationReferences: references.map(cloneReferenceForReuse)`。
   - `handleGenerateImage` 里 `saveCanvasAsset(...)` 调用补 `generationReferences: placeholder.generationReferences`(透传到完成态资源)。
   - 复用视频侧已有的 `cloneReferenceForReuse`,不新造。

2. **AssetCard 图片卡加按钮**
   - `imageCategoryActions.map(...)` 之后、删除按钮之前,对 `asset.kind === "image"` 渲染一个「复用提示词和资源」按钮,复用 `RefreshCcw` 图标,`onClick={() => onAction(asset, "reuse-generation")}`,`disabled={!asset.generationPrompt}`,title 按是否有 prompt 切换。
   - 复用现有 `AssetAction = "reuse-generation"`,不新增 action 类型。

3. **视频按钮文案统一为「复用」(决策: 和图片统一为'复用')**
   - 视频卡 reuse 按钮 title/aria 从「复用生成」统一为「复用提示词和资源」/「复用」,行为(填回输入框)不变。
   - 不改成"复制到剪贴板"。

### 验收

- 图片卡 hover 出现「复用提示词和资源」,点击后 prompt 与参考图填回生成区。
- 无 generationPrompt 的图片(如手动上传)按钮 disabled。
- 现有 AssetCard 测试 + 新增针对图片 reuse 按钮存在性/禁用态的断言通过。

## 任务 2 — 生图 504 诊断与修复

### 已知

- 504 在 `requestGenerateImage`(最初 POST `endpoints.generateImage()`)阶段抛出,非轮询阶段。504 = 网关超时。
- payload 已带 `_meta.nodeId`,队列轮询 `pollImageQueueUntilComplete` 按 projectId+nodeId 找任务 — 即使 POST 504,任务可能已进服务端队列。

### 步骤(决策: 先 9333 live 复现确认,再修)

1. 用裸 CDP(`/tmp/cdp_eval.py`,连 127.0.0.1:9333)连到运行中的渲染进程,在测试画布 `cmqlzufagtb0ulq1tejj5hwa7` 触发一次生图。
2. 抓真实请求/响应:确认 504 来自哪个 endpoint、响应体形状、以及 504 之后 gen-queue 里**是否真出现了该 nodeId 的任务**。
3. 据此二选一(复现后定):
   - 若任务确实进队列 → 改 `generateImage`: POST 命中 504/超时(且有 projectId+nodeId)时,不立即失败,转入按 nodeId 轮询 gen-queue(对齐视频流程的容错),拿到结果即成功。
   - 若任务没进队列 → 是上游真超时,加合理重试/超时提示,不伪造成功。

### 验收

- 复现报告写明 504 来源与队列状态(写入 plan / 记忆)。
- 修复后再次 live 触发,生图能拿到图片或得到准确的失败原因(不再是裸 504)。

## 任务 3 — React DevTools(决策: 仅开发模式注入)

### 方案

- `react-devtools` 加入 devDependencies(pin 精确版本)。
- 渲染进程仅在 `import.meta.env.DEV` 时注入 `<script src="http://localhost:8097">`(standalone DevTools 默认端口),生产打包不含。
- 注入位置:`index.html` 用条件,或在 `main.tsx` 开发分支动态插入 script,确保它在 React 之前加载。具体实现时确认 ovO 的 dev 入口(Vite dev server)。
- 提供「下次使用说明」: 先跑 `npx react-devtools` 起独立窗口,再启动 ovO dev,渲染进程自动连上 8097。

### 验收

- dev 模式下 standalone react-devtools 窗口能显示组件树。
- 生产构建产物不含 8097 注入(grep 验证)。
- 说明写入 docs(如 `docs/react-devtools-usage.md`)。

## 提交(决策: 全做完一次推 v0.1.5)

- 三任务完成 → build + test 全过 → bump 0.1.4→0.1.5 → 推 gitee。
- 推送遵循 git_safety: 不直接推 main 之外按既有 feature/ui-shell 流程。

## 范围外(YAGNI)

- 不重构 AssetCard 整体结构。
- 不动音频卡布局。
- 不改图片生成模型/摄像机数据(除非 504 诊断牵出)。
