# 去字幕按 24 小时自动路由 + 元数据持久化设计

Date: 2026-06-20
Branch: `feature/ui-shell`
Remote: gitee `git@gitee.com:siberian-aries/ov-o_create_video_platform.git`
Canvas: `http://qijing.kjjhz.cn/canvas/cmqlzufagtb0ulq1tejj5hwa7`

## 背景与问题

点击视频节点的「去字幕」后，UI 立即生成一个红字节点 `去字幕接口未返回任务 ID`（参考图 1）。
该错误来自 `src/api/subtitleClient.ts` 提交请求后 `submitResult.taskId` 为空。

codex 上一轮尝试（提交 `5ec00f1`、`ff3bb5a`）加了 `chooseSubtitleRemovalRoute`
按视频年龄路由，但：

1. 端点 `/api/subtitle-remove` 与 `/api/subtitle-remove/ark` 及其 payload 是**猜测**的，
   未与网页实际请求核对——这是「未返回任务 ID」最可能的根因。
2. 路由命名 `ark/default` 语义模糊，且默认回退方向与产品期望（未知→付费）相反。
3. 缺少持久化：生成时间、提示词、参考图未必写入服务端快照，
   退出重进后丢失，导致 24h 判定失效、提示词无法复用/复制。

## 目标

1. 点击「去字幕」**全自动**判定走免费（方舟）还是付费（火山 VOD），不弹框。
2. 判定基于「视频生成时间」与 24 小时窗口。
3. 生成视频时持久化元数据到**服务端快照**，使退出重进后仍能看到视频、复用/复制提示词、
   并正确参与 24h 判定。
4. 修好现有「复用生成」按钮，使其在只有提示词时也可用。
5. 去字幕失败时暴露真实诊断信息，不再只显示泛化文案。

## 关键产品决策（已与用户确认）

- 路由方式：**全自动，不弹框**。
- 计时起点：**服务端 `createdAt` 优先**，回退本地生成发起时间 `generationStartedAt`。
- 未知时间戳：**默认付费**（火山 VOD 任意视频可处理，几乎不失败）。
- 持久化位置：**写服务端快照**（跟画布走，换设备/重装可见）。
- 复制提示词：**修好现有「复用生成」按钮**即可，不另加复制按钮。

## 第 1 部分：实测抓包（拿到真实接口契约 — 唯一事实依据）

不再猜端点/payload。用 ovO app 内置浏览器 + 裸 CDP（端口 9333）实测抓两条真实请求。
不使用 Google Chrome；用 computer-use 鼠标操作；CDP 脚本沿用 `/tmp/ovo-cdp/`。

抓两条：
1. **付费**：对画布上**已存在的旧视频**（>24h 或非 Seedance）点「去字幕 → 付费擦除」。
2. **免费**：按用户提示词**新生成一个视频**（全能多参，2 图 + 2 音频，视频选 1-1），
   生成完成后点「去字幕 → 免费擦除」。

每条记录到 `findings.md`：
- 提交请求：完整 URL、method、关键请求头、**payload 全字段**
  （videoUrl / providerVideoUrl / 是否带 taskId / projectId / nodeId / 模型标识）。
- 提交响应：taskId 字段名与层级（是否包在 `data` 里）。
- 轮询请求：URL 模板、status 真实取值（succeeded/failed/processing）、
  结果视频地址字段（videoUrl / outputUrl / providerVideoUrl）。

产出：免费 vs 付费两套契约对照表。**若实测端点与 codex 的 `/api/subtitle-remove(/ark)`
不一致，一律以实测为准。**

## 第 2 部分：数据契约与路由判定

### 时间戳来源

`assetNormalizer.ts` 读回快照时，`createdAt` 优先级：
服务端 `record.createdAt` → `record.generationStartedAt` → 无。
生成发起时在 `App.tsx` 把 `generationStartedAt = new Date().toISOString()` 写进 asset，
并随快照持久化（见第 3 部分），作为服务端无 `createdAt` 时的回退锚点。

### 路由判定 `chooseSubtitleRemovalRoute`

改写为语义清晰的 `"free" | "paid"`（替换 codex 的 `ark/default`），逻辑：

```
输入: { providerVideoUrl?, createdAt?, isSeedance? }, now
1. 拿不到 createdAt（服务端+本地都没有） → "paid"
2. createdAt 解析失败 / 为未来时间       → "paid"
3. age > 24h                            → "paid"
4. age ≤ 24h 且 是 Seedance 原始视频     → "free"
5. age ≤ 24h 但非 Seedance              → "paid"
```

端点映射对齐第 1 部分实测结果，不再假设 default=免费。

### 「是否 Seedance 原始视频」判定

免费方舟仅适用 Seedance 2.0/Fast 原始视频。判据：
- 优先：生成时持久化的模型标识 `model`。
- 回退：拿不到模型标识 → 归入「未知 → 付费」（安全，不浪费免费额度）。

注：若实测发现免费接口不挑模型、任何 ≤24h 视频均可免费，则抓包后回来修正此条。

## 第 3 部分：持久化与「复用生成」按钮

### 生成发起即写入元数据（写服务端快照）

`App.tsx` 生成视频流程（`saveCanvasAsset` 路径）把以下字段一起写进将持久化到服务端
快照的 asset：
- `generationStartedAt`（发起时刻，时间回退锚点）
- `generationPrompt`（提示词全文）
- `generationReferences`（参考图/音频，带名字）
- `model`（模型标识，用于 Seedance 判定；生成 payload 里有则存）

### assetNormalizer 读回对齐

`assetNormalizer.ts` 读回快照时解析 `createdAt / generationStartedAt / providerVideoUrl`
（codex 已加）+ 补 `model`，并确保 `generationPrompt / generationReferences` 读回完整
（关系到「复用生成」按钮能否亮起）。

### 「复用生成」按钮修复

现状 `AssetCard.tsx:222`：`disabled = !generationPrompt || !generationReferences?.length`，
必须**同时**有提示词和引用才可点。去字幕新节点或只存 prompt 的视频按钮永久灰。

修复（保持「修好现有按钮就够」，不另加复制按钮）：
- 只要有 `generationPrompt` 即可点（引用为空时只填提示词，不填引用）。
- `App.tsx:533` 的 `handleReuse` 同步放宽：有 prompt 填回输入框，引用有则一起填，无则跳过。
- title/aria 文案按是否有 prompt 调整。

### 去字幕新节点继承元数据

确认 `createSubtitleRemovedAsset`（canvasLoader.ts:190）与 `createSubtitlePlaceholder`
（App.tsx:586）继承源视频的 `generationPrompt / generationReferences / generationStartedAt / model`，
使去字幕产出节点也能复用提示词、并正确参与 24h 判定。

## 第 4 部分：错误处理与可观测性

- **提交阶段**：`taskId` 缺失时抛错带上 route（免费/付费）、实际请求 URL、HTTP 状态、
  响应体摘要（对齐上轮 updater 诊断做法）。
- **轮询阶段**：`status === "failed"` 时把服务端真实失败原因透传到节点 `errorMessage`
  （参考图 1 红字显示真因而非泛化文案）；超时保留文案但带已轮询次数/最后 status。
- **路由可观测**：每次去字幕在 activity log 打一条
  `去字幕中：<节点名>（免费/付费，依据：createdAt=… age=…h）`。
- **不吞错**：各分支不静默失败，原始 error 抛到 `handleRemoveSubtitles` 的 catch，节点标红显真因。

## 第 5 部分：测试与验证

### 单元测试（TDD，先写测试）

- `subtitleClient.test.ts` — `chooseSubtitleRemovalRoute` 全分支：
  无 createdAt / 解析失败 / 未来时间 / >24h → paid；≤24h+Seedance → free；
  ≤24h+非Seedance → paid；边界 age = 24h（注入固定 `now`，确定性）。
- `subtitleClient.test.ts` — `removeSubtitles`：免费/付费各打对端点、payload 正确、
  taskId 缺失抛带诊断错、轮询 succeeded/failed/超时三态。
- `assetNormalizer.test.ts` — 读回 `createdAt/generationStartedAt/model/generationPrompt/generationReferences` 完整。
- `AssetCard` 测试 — 只有 prompt 无引用时「复用生成」可点；两者都无时禁用。

### 实测验证（对齐第 1 部分抓包）

- 抓包契约写进测试 fixture，确保端点/payload 与实测一致。
- ovO app 真实跑：旧视频付费擦除成功、新视频免费擦除成功，参考图 1 红字消失。
- 退出重进画布：视频节点还在、提示词可复用、24h 判定仍正确（读服务端快照）。

### 全量验证与推送

- `npm test` 全绿（注意 App.test/updater 满载并行偶发 flaky，需隔离复跑确认）。
- `npm run build` 通过。
- 在 `feature/ui-shell` 按任务粒度提交，**推 gitee**，不直接推 main。

## 范围外（YAGNI）

- 不重构去字幕模块为独立 service（留待真有需要）。
- 不新增独立「复制提示词」按钮（复用按钮已满足）。
- 不改去字幕弹框为自定义对话框（决策为全自动不弹框）。


