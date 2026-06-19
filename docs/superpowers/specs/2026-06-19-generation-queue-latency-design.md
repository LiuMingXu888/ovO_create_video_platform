# ovOApp 视频生成排队过慢诊断设计

## 背景

用户反馈：在公司官方网页版画布点「发送」生成视频，约 20 分钟完成；用 ovOApp 桌面端在同一画布生成，约 1 小时完成。两条入口连接**同一后端、同一项目 `cmq6fwhft0bg5m2l5u78zby8x`、同一账号**。

用户手动查询当天两条 ovOApp 任务的时间戳，瓶颈拆解如下：

| 任务 | 创建→完成 | 真正生成 | 中间排队 |
|------|----------|---------|---------|
| cmqkn8mkj190dm223uvjowk18 | ~57 分 | ~11 分 | ~45 分 |
| cmqkncoin1951m2238nfhan6d | ~52 分 | ~6 分 | ~45 分 |

**结论性观察：生成本身只要 6-11 分钟，时间几乎全卡在「提交后到开始生成」的 ~45 分钟排队。** 6/18 那轮调查（`2026-06-18-video-polling-stall-design.md`）把根因定为「客户端轮询超时 35 分钟太短」，并把窗口拉到 90 分钟——那只让 UI 不提前放弃，没解决「为什么排这么久」。本轮聚焦排队延迟本身。

## 目标

定位 ovOApp 提交视频生成时，是否因 payload / 接口与网页版不同而进入更慢的处理路径；若是客户端可控差异则修复，若是后端队列波动则给出证据、不硬改。

## 范围约束

- 不改后端。
- 测试画布 `cmq6fwhft0bg5m2l5u78zby8x` 可自由增删改、可消耗积分。
- 工作分支 `feature/ui-shell`（worktree `.worktrees/ui-shell`），修复后推 `origin/feature/ui-shell`。

## 已知事实（来自代码与日志）

ovOApp 提交链路：`companyApiFacade.generateVideo` → `generationClient.generateVideo` → `buildCompanyGenerateVideoPayload` → POST `/api/generate-video` → 轮询 `/api/gen-queue`。

`buildCompanyGenerateVideoParams`（`src/api/generationClient.ts:88`）当前**写死**以下字段：
- `model: "ep-20260319213857-htd7q"`（Seedance 2.0）
- `resolution: "720p"`
- `generateAudio: true`
- `genTab: "allref"`
- `networkEnabled: true`
- `referenceMode: settings.omnireference ? "omnireference" : "standard"`（默认 omnireference）
- `duration: settings.durationSeconds`（默认 15）

日志 `127.0.0.1-1781856552189.log` 第 820-855 行确认实际提交 payload 与上述一致：9:16 / 720p / 15s / 音频 / allref / omnireference / 联网 / 4 图 1 音频。

## 核心假设

两入口唯一变量是提交内容。主假设：**网页版用户实际选择的参数更轻**（更短时长、未开音频/联网/全局参考之一或多个），而 ovOApp 把这些重参数写死并默认开启，导致任务进更慢队列且生成更久。次假设：payload 完全一致 → 后端队列波动，客户端不可修。

## 诊断方法

### 基线 A：网页版（快，~20 分钟）
由用户在公司浏览器打开同一画布，按平时方式点发送，复制 Network 中 `/api/generate-video` 的请求 Payload 提供。作为「快」对照。

### 基线 B：ovOApp（慢，~1 小时）
ovOApp 已在运行，远程调试端口 9333 开启。通过 Chrome DevTools 连接 renderer，在测试画布真实新建视频节点并提交一次，抓取：
- `/api/generate-video` 请求体 + 响应体（含 taskId / queueTaskId）
- 随后 `/api/gen-queue` 首批响应中的任务对象，重点取 `createdAt`、`startedAt`、`status`、`providerTaskId`

诊断**不需等满 1 小时**：提交瞬间的 payload 差异 + 队列时间戳即可判定是否进慢路径。

### 逐字段对比
对齐 A、B 两笔请求体，逐字段列差异，重点：`duration`、`generateAudio`、`networkEnabled`、`referenceMode`、`genTab`、`model`、`resolution`、参考资源数量。

## 决策规则 → 修复分支

1. **B 比 A 多带重参数 / 默认值不同** → 修改 `buildCompanyGenerateVideoParams`，让 `generateAudio`、`networkEnabled`、`referenceMode`、`duration` 等跟随 `GenerationSettings`/UI，与网页默认对齐，不再写死。配 TDD 红→绿。
2. **B 与 A 完全一致** → 后端队列波动，客户端不可修。把对比证据写入诊断报告，不硬改代码。
3. **接口路径 / 字段名不一致**（网页走不同端点或字段）→ 对齐 `endpoints` / payload 构造。

## 架构影响

修复（若发生）集中在单文件单函数 `buildCompanyGenerateVideoParams`，通过 `GenerationSettings` 类型透传 UI 选择。`GeneratePanel.tsx` 可能需暴露音频/联网/参考模式开关——仅当对比证明这些是差异来源时才动，遵循 YAGNI。

## 验证

- 若改代码：先加失败测试（断言 payload 字段跟随 settings），实现后转绿。
- `npm test`（全量）+ `npm run build` 必须通过。
- 诊断结论与字段对比表落到 `docs/` 报告。

## 交付

- 诊断报告（含两笔 payload 对比表 + 时间戳证据 + 根因判定）。
- 视结论而定的客户端修复 + 测试。
- 推送 `origin/feature/ui-shell`。
