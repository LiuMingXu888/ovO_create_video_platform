# 视频生成轮询卡 `polling` —— 诊断与修复设计

日期：2026-06-18
分支：`feature/ui-shell`
项目：ovO_create_video_platform（Electron 桌面端）

## 1. 问题陈述

画布视频生成提交后，前端一直轮询 `/api/gen-queue`，任务 `status` 长时间停在 `polling`，约 20 分钟内本应出结果但没出。浏览器日志 `127.0.0.1-1781771906360.log` 显示轮询到第 863 次仍是 `polling`。

## 2. 日志已确认的事实

- **提交成功**：服务器返回 `taskId=cgt-20260618161550-frvvp`、`queueTaskId=cmqj86fp10k5xm223d96hl3nd`。
- **轮询正常**：客户端每次都能在 `/api/gen-queue` 响应里找到任务，但 `status` 全部为 `polling`，`videoUrl` 始终 `undefined`。
- **客户端逻辑正确**：`pollCanvasQueueUntilComplete` 只在 `succeeded`/`failed` 终止，否则按 `intervalMs=1500ms` 重试至 `maxAttempts=1400`（约 35 分钟）后抛"任务轮询超时"。没有让它卡住的客户端 bug。
- **payload 正确**：9:16 / 720p / 2 图 / 2 音 / 1 视频 / omnireference / generateAudio / networkEnabled，全部符合预期。

**已确诊结论**：卡点不是前端用错任务 ID，也不是解析不到成功结果；该任务后来在服务端成功了，但实际耗时超过当前前端轮询窗口。客户端需要延长默认轮询窗口，并在超时时暴露最后一次队列诊断信息。

## 3. 根因假设（需原始响应确诊）

客户端日志经 `normalizeQueueTask` 归一化，只打印 `status`/`videoUrl` 等，**隐藏了 `providerTaskId`/`resultUrl`/`errorMessage`/`startedAt`/`completedAt`**（这些在任务对象的 23 个 key 里）。必须拿 `/api/gen-queue` 原始响应才能定性。三个嫌疑点：

1. **跨用户音频 URL**：2 张参考图在 `users/cmq4ng1wn00eam23m3dw79vyu/images/`，但 2 个音频在 `users/cmpm7d828001em22x9en36d4e/other/` —— 不同用户的 OSS 路径。若服务端校验引用归属或音频对当前账号不可访问，provider 任务可能建不起来。
2. **硬编码模型 ID**：`SEEDANCE_MODEL_ID = "ep-20260319213857-htd7q"`（`generationClient.ts:15`）。endpoint 失效会导致 provider 提交失败。
3. **origin 不一致**：`endpoints.ts` 的 `COMPANY_API_ORIGIN = "https://qijing.kjjhz.cn"`（https），而 `companySessionClient.ts` 的 `COMPANY_ORIGIN = "http://qijing.kjjhz.cn"`（http）。桌面端走 `DesktopApiTransport → requestCompanyApi`（用 http origin），但仍值得确认两条通道是否都命中同一后端、cookie 是否一致。

**确诊判据**：
- `providerTaskId` 为空 → provider 没建起来（指向假设 1 或 2）。
- `errorMessage` 有内容 → 直接读错误。
- `providerTaskId` 非空但长时间无 `resultUrl` → provider 在跑，可能是真慢或 provider 侧失败未回写。

2026-06-18 通过 9333 DevTools 端口查询旧任务后确认：

- `status=succeeded`
- `providerTaskId=cgt-20260618170109-fhb5x`
- `resultUrl` 已返回 OSS 视频地址
- `createdAt=2026-06-18T08:15:45.397Z`
- `startedAt=2026-06-18T09:01:03.553Z`
- `completedAt=2026-06-18T09:11:22.020Z`

折算本地时间，该任务约 16:15 创建、17:01 开始、17:11 完成，超过原先 `1400 * 1500ms = 35 分钟` 的前端轮询窗口。

## 4. 诊断机制

桌面端已暴露 `window.ovoDesktop.api.request(path, options)`（preload.cts → `ovo:company-api:request` → `requestCompanyApi`，用已登录 partition session 发认证请求）。**无需改代码**，app 带调试端口起来后，在 renderer devtools console 调：

```js
await window.ovoDesktop.api.request('/api/gen-queue?projectId=cmq6fwhft0bg5m2l5u78zby8x&taskId=cmqj86fp10k5xm223d96hl3nd')
```

即可拿原始 JSON（含被隐藏字段）。

## 5. 接入：调试端口

当前运行的 app 未带 `--remote-debugging-port`，无法 attach devtools。已改 `scripts/launcherCore.mjs`：`createLauncher` 新增 `debugPort` 入参（默认从 `OVO_DEBUG_PORT` 读），有值则给 Electron 启动加 `--remote-debugging-port=<port>`。`launch-mac.mjs` 默认传 `9333`（9222 常被本机 Chrome 占用，故避开）。用户 `npm run launch:mac` 重启即开调试端口（启动时会自动 `git pull origin feature/ui-shell` 拉最新代码）。已补单测并通过。

## 6. 修复范围（确诊后对症）

仅修客户端能控的点，不盲改：

- **超时与状态反馈**：将默认轮询窗口扩到 90 分钟；长时间 `polling` 后若仍超时，错误信息包含最后一次队列状态（`status`、`providerTaskId`、`resultUrl`、`errorMessage`、`startedAt`、`completedAt`），区分"服务端仍在排队/生成"与"网络/登录失效"。
- **跨用户引用校验**（若确诊为假设 1）：提交前校验所有 reference URL 的用户前缀是否一致/属于当前账号，不一致时告警或阻断，避免提交注定失败的任务。
- **模型 ID 配置化**（若确诊为假设 2）：把硬编码 endpoint 提到配置，便于切换/排查。
- **origin 统一**（若确诊为假设 3）：统一 http/https，消除两条通道差异。

**非目标**：不改服务端（无权限）；不做无关重构。

## 7. 复现验证（场景）

接 devtools 驱动画布 `http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x`：右击新增节点，传本地 `/Users/mac/Downloads/2026-06-18-164734` 的 2 图、2 音频、1 视频（文件名仅作素材识别，不影响角色设定），输入"安检拦截"提示词，配置 9:16 / 720p / Seedance 2.0 高清 / 全能参考 / 有声音 / 联网，触发生成并观察是否走出 `polling`。

优先级：先抓 `/api/gen-queue` 原始响应定性根因，再决定是否修改客户端；真实画布生成用于验证和补充证据，不作为盲目等待的第一步。

## 8. 交付

修复 + 单测/build 通过后，提交并推送到 `origin/feature/ui-shell`。
