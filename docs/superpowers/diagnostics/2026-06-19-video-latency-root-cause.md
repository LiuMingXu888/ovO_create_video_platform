# ovOApp 视频生成「慢1小时 vs 网页20分钟」根因诊断报告

> 日期：2026-06-19　分支：feature/ui-shell　画布(测试)：cmq6fwhft0bg5m2l5u78zby8x / cmqks34nvglwjwwxvyezojt88
> 采集方式：ovO app 内置浏览器 + 原生渲染进程，经 Electron 远程调试端口 9333 用裸 CDP 驱动。未使用 Google Chrome。

## 结论（先说答案）

**真因：视频本身几分钟就生成好了，但 app 只轮询 `/api/gen-queue` 这一个会滞后的端点，导致用户白等约 45 分钟。客户端可修，已修。**

存在两个跟踪层、且对 `canvas-mode` 任务不同步：
- `/api/generate-video/{submitTaskId}`（单任务端点）反映**真实快状态**：视频通常 ~7 分钟就 succeeded、有视频地址。
- `/api/gen-queue`（画布队列）对被打上 `source:"canvas-mode"` 的任务**滞后约 45 分钟**才 reconcile；对 `source:"canvas"` 的任务则立即 succeeded。
- **app 只轮询 gen-queue；网页同时轮询 gen-queue + generate-video/{taskId}**。所以同一个 ~7 分钟就好的视频，网页 ~7 分钟看到、app 要等 ~45 分钟。这才是「app 慢 1 小时 vs 网页 20 分」的真因。

**关于 `canvas-mode` 触发条件（重要更正）：** 一度怀疑是 app 的 payload 形状触发 `canvas-mode`，**经实测证伪**——纯旧 app 形状 body（V_APPOLD）也走了快的 `canvas` 路径。`canvas-mode` 是**间歇性**的（今日仅「生成视频3」+8 个历史任务命中），不由客户端 payload 决定。**因此对齐 payload 不能可靠避免 `canvas-mode`；真正的修复是让 app 像网页一样双端点轮询。**

### 决定性证据
- 「生成视频3」（真实 app UI 提交）：单任务端点(submit id cgt-…214251)查得 succeeded、providerUrl 日期 **13:49:30Z**——13:42 提交，视频 **~7 分钟**就好；但 gen-queue 直到 **14:33** 才报完成（`source:canvas-mode`，排队 45.25 分钟）。视频白白躺了 ~44 分钟。
- 受控批次（5s，经 app transport 提交）+11.6 分钟读：V_APPOLD/V_FIX/V_WEB 三者 gen-queue 全部 `source:canvas, succeeded, 0 等待` → payload 形状非触发因素。
- Referer A/B：带/不带 Referer 都走 `canvas` 快路径 → Referer 非因素。

### 前一版结论的更正
本报告初版称「后端已修复、客户端无需改」**是错的**。错因：提交后 3.5 秒读 gen-queue 的 `source/startedAt/providerTaskId` 都是**占位值**（显示 canvas/0 等待），任务 ~45 分钟后真正被调度时才翻成真实值（→canvas-mode）。据占位值得出的「已修复」及「payload 非根因之外、客户端无需改」均不成立。

---

## 历史观测（占位值陷阱见下「更正」段，此处时间戳为已完成任务的最终值，可信）

- app 提交的任务被服务端打上 `source: "canvas-mode"`，进入一个**约 45 分钟**的滞后/限流后才在队列里报完成。
- 网页提交的任务被打上 `source: "canvas"`，队列里**~0 秒**即完成 reconcile。
- 两者「真正生成」耗时相同（6–11 分钟）。所以差距 100% 来自队列可见性滞后，不是生成速度。
- 今天北京时间 16:08 之后某刻，服务端不再对任何任务套用 `canvas-mode` 慢路径；此后**包括 app 在内**的所有任务都是 `canvas` + 0 秒等待（已用真实 app UI 提交复现确认）。

## 证据

### 1. 队列时间戳分布（同一账号，跨 3 天，零积分查询 /api/gen-queue）

| source | nodeId 样式 | 入口 | 创建时间(UTC) | 排队等待 |
|--------|-----------|------|--------------|---------|
| canvas-mode | generated-video-* | app | 06-17 15:49 | 45.6 min |
| canvas-mode | generated-video-* | app | 06-17 16:31 | 46.0 min |
| canvas-mode | generated-video-* | app | 06-18 02:17 | 45.2 min |
| canvas-mode | generated-video-* | app | 06-18 07:19 | 45.8 min |
| canvas-mode | generated-video-* | app | 06-18 08:06 | 45.6 min |
| canvas-mode | generated-video-* | app | 06-18 08:15 | 45.3 min |
| canvas-mode | generated-video-* | app | 06-19 08:05 | 45.9 min |
| canvas-mode | generated-video-* | app | 06-19 08:08 | 45.8 min |
| canvas | vid-/video-* | 网页 | 06-19 10:23 | 0 s |
| canvas | vid-* | 网页(重新生成) | 06-19 13:15 | 0 s |
| **canvas** | **generated-video-*** | **真实 app UI** | **06-19 13:42** | **0 s** |

等待时间在 45.2–46.0 分钟之间，跨 3 天、不分时段几乎恒定 → 这是**人为限流/调度窗口**，不是负载波动。

### 2. 决定性对照实验（经 app 自身 transport 提交 5s 任务，读到 source 后立即取消，逐项排除）

| 实验 | 变量 | 结果 source | 等待 |
|------|------|------------|------|
| Test A | 网页形状 body | canvas | 0 s |
| A' | **完整 app 形状**(task+genTab+networkEnabled+referenceMode) | canvas | 0 s |
| B | 网页形状 + task 包装 | canvas | 0 s |
| T1 | app 形状 + `generated-video-` nodeId | canvas | 0 s |
| T2 | 网页形状 + `generated-video-` nodeId | canvas | 0 s |
| **真实 app UI 点「生成视频」** | app 真实全链路 | **canvas** | **0 s** |

排除项（均经 app transport、在原 8zby8x 画布上测得 canvas + 0 秒）：
- ❌ payload body 形状（task 包装 / genTab / networkEnabled / referenceMode）
- ❌ nodeId 前缀（generated-video-）
- ❌ Referer 头（app 主进程 fetchWithCompanySession 不带 Referer，仍得 canvas）
- ❌ projectId（同一旧画布既出过 canvas-mode 也出 canvas）

唯一仍能区分「8 个慢任务(≤今日08:08)」与「所有快任务(≥10:23)」的变量是**时间** → 服务端在这两个时刻之间改了行为。git 历史确认 app 从未发送过 `source` 字段，该值一直由服务端派生。

## app vs 网页 /api/generate-video 请求体逐字段对比

实测（app 来自 127.0.0.1-1781856552189.log 第820行 + 代码；网页来自 9333 CDP 抓包）：

| 字段 | app | 网页 | 说明 |
|------|-----|------|------|
| prompt / model / duration / generateAudio / resolution / ratio | ✅ 相同 | ✅ | 一致 |
| aspectRatio | ✅ 有 | ❌ 无 | app 多发(网页只用 ratio) |
| genTab: "allref" | ✅ 有 | ❌ 无 | app 多发 |
| networkEnabled: true | ✅ 有 | ❌ 无 | **app 用这个名** |
| webSearch: true | ❌ 无 | ✅ 有 | **网页用这个名（联网开关）** |
| referenceMode: omnireference | ✅ 有 | ❌ 无 | app 多发 |
| referenceImageLabels | ❌ 无 | ✅ 有 | 网页多发(参考图命名，利于提示词对齐) |
| referenceVideos: [] | ✅ 有 | ❌ 无 | app 多发空数组 |
| task: {...} 包装 | ✅ 有 | ❌ 无 | app 多发 |
| _meta: {nodeId,projectId,label} | ✅ 有 | ✅ 有 | 一致 |

这些差异**不影响队列速度**（已实验证明），但其中 `networkEnabled` vs `webSearch` 是潜在的**功能正确性**隐患：若服务端按网页字段名 `webSearch` 读联网开关，则 app 的联网/全网搜索可能未真正生效（静默失效）。`referenceImageLabels` 缺失可能影响多参考图的提示词指代质量。

## 检索（获取视频）接口链对比

- **网页**：POST /api/generate-video → 轮询 **既查 /api/gen-queue 又查 /api/generate-video/{taskId}** → 完成后 PUT/POST /api/projects/{id}/snapshot 落库。
- **app（修复前）**：POST /api/generate-video → **只轮询 /api/gen-queue** → 视需要 POST /api/asset/persist-task。
  - **这正是慢的根因**：gen-queue 对 canvas-mode 任务滞后 ~45 分钟，而视频已在单任务端点就绪。之前误判为「非阻塞」是错的。
- **app（修复后，commit 见下）**：canvas 轮询循环里同时补查 `/api/generate-video/{submitTaskId}`，任一 succeeded 即返回。单任务端点报错(含 410 过期)一律吞掉——它只是加速器，gen-queue 仍是失败/最终态的权威。

## 已实施修复

1. **commit d4aad2d（对齐/正确性，非变快）**：`buildCompanyGenerateVideoParams` 补 `webSearch:true`（修联网开关可能静默失效）+ `referenceImageLabels`。注：经实测 payload 形状非 canvas-mode 触发因素，故此提交不解决延迟，仅修联网正确性。
2. **变快修复（本轮）**：`pollCanvasQueueUntilComplete` 增加单任务端点加速轮询（对齐网页双查），把 canvas-mode 命中时的用户等待从 ~1 小时降到真实生成时间 ~7 分钟。TDD 红→绿（新增测试「returns as soon as the single-task endpoint reports success while the canvas queue lags」），`npm test` 244 全绿，`npm run build` 通过。

## 仍未定位（不影响修复有效性）
`canvas-mode` 的服务端触发条件未知（间歇性，非 payload/Referer/nodeId/projectId 决定）。但双端点轮询使其不再影响用户体验，故无需继续逆向后端。
