# ovOApp 视频生成「慢1小时 vs 网页20分钟」根因诊断报告

> 日期：2026-06-19　分支：feature/ui-shell　画布(测试)：cmq6fwhft0bg5m2l5u78zby8x / cmqks34nvglwjwwxvyezojt88
> 采集方式：ovO app 内置浏览器 + 原生渲染进程，经 Electron 远程调试端口 9333 用裸 CDP 驱动。未使用 Google Chrome。

## 结论（先说答案）

**慢的根因是服务端的 `source` 队列分类，不是 app 的 payload。且该慢路径已在今天被服务端移除——现在 app 和网页一样快。客户端无需为「变快」改任何代码。**

- app 提交的任务被服务端打上 `source: "canvas-mode"`，进入一个**固定 ~45 分钟**的限流队列后才开始生成。
- 网页提交的任务被打上 `source: "canvas"`，**0 秒**进入生成。
- 两者「真正生成」耗时相同（6–11 分钟）。所以差距 100% 来自排队，不是生成速度。
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
- **app**（src/api/generationClient.ts）：POST /api/generate-video → **只轮询 /api/gen-queue** → 视需要 POST /api/asset/persist-task。
  - 差异：app 不查 /api/generate-video/{taskId} 单任务端点。当前能拿到结果（gen-queue 的 resultUrl 即够），非阻塞问题，但与网页不完全一致。

## 建议（与「变快」无关，属对齐/健壮性，可选）

1. **文档归档即可**：变快已由服务端解决，客户端不动代码。
2. **防御性对齐（推荐做）**：把 `buildCompanyGenerateVideoParams` 的请求体对齐网页证明可用的形状——补 `webSearch`（修复联网开关可能静默失效）、`referenceImageLabels`；评估去除 `networkEnabled/genTab/referenceMode/task` 冗余。配 TDD。好处：① 修复联网功能潜在失效；② 万一服务端将来重新启用基于 source/payload 的路由，app 已与网页同形不会再被打入慢队列。
