# ovOApp 六问修复设计（webSearch开关 / 字段对齐 / gitee推送 / 更新诊断 / 复用去重）

> 日期：2026-06-19　分支：feature/ui-shell（worktree `.worktrees/ui-shell`）
> 测试画布：http://qijing.kjjhz.cn/canvas/cmqlzufagtb0ulq1tejj5hwa7
> 排查工具：ovO 内置浏览器（已登录公司账号，端口 9333）+ 裸 CDP，不用 Google Chrome。
> 关联：上一轮 `2026-06-19-video-latency-root-cause.md`（视频延迟真因=双端点轮询，已修，本轮不动）。

## 背景与目标

用户提出 6 项，合并为一份 spec、一次做完、统一推 gitee：
1. 联网（webSearch）做成可选开关，类似 9:16/16:9，**默认不开启**。
2. 排查 app 提交 payload 还有哪些字段没和网页端对齐，尽量对齐网页。
3. 推送统一到 gitee 远端。
4. Windows 点更新提示失败：加 console 诊断 + 暴露真实错误；Mac 点更新显示"检查中→开发模式"需说明。
5. 退出重进 ovO 后用视频提示词复用，出现两组相同内容但名字不一致（一组正常名、一组哈希名）。
6. 参考上一轮诊断文件（已读，无需改）。

## 已确证事实（探查结论）

### 字段对齐基线（本会话内置浏览器 CDP 实抓，权威）
网页 `/api/generate-video` 只发 11 个键：
`prompt, model, ratio, duration, resolution, generateAudio, webSearch, referenceImages, referenceImageLabels, referenceAudios, _meta`

app 当前（`src/api/generationClient.ts` `buildCompanyGenerateVideoParams`）**多发** 6 个：
`aspectRatio`（网页只用 `ratio`）、`genTab:"allref"`、`referenceMode`、`networkEnabled`、`referenceVideos:[]`、`task{}` 包装。

> 注：网页基线在「全能参考」模式抓取，却**未发 `referenceMode` 字段**——网页可能靠服务端默认或其他字段决定参考模式。本设计采用「实现时抓标准模式包再定」（见下问题①）。

### 复用去重根因（子代理实证，引用 file:line）
- 写入：`src/api/uploadClient.ts:114-134` `createCompanyVideoNode` 把参考存**两份**——`generationReferences`（带正常名对象）+ `referenceImages/Videos/Audios`（仅 URL 字符串）。
- 读取：`src/lib/assetNormalizer.ts:229-238` `getGenerationReferences` 把两份**都解析并拼接、不去重**（line 236 `[...directReferences, ...groupedReferences]`）。URL 那份经 `parseNamedReferences`→`createReferenceItem` 用 `fallbackName(url)`=哈希文件名当名。
- 现象只在重启后出现：在线会话直接用内存里的 `generationReferences`；重启后走快照 reload→normalizer→产生重复。
- 去重键：**URL**（id 非确定、分组数组无稳定 id、名字两组不同；URL 是唯一稳定共享标识）。

### 更新机制（子代理实证）
- Mac「开发模式」**非 bug**：dev 模式 `app.isPackaged=false`，`giteeReleaseUpdater.ts:127` 直接返回 `unsupported`（`!isPackaged || platform!=="win32"`）。launch:mac 跑 dev，永远 unsupported→按钮显示"开发模式"。设计如此，仅需在界面文案/日志上说明。
- Windows 失败真因**被吞**：所有错误经 `normalizeUpdateError`（`giteeReleaseUpdater.ts:276-288`）压成 3 句中文，全文件**无一行 console**。最可能：release 资产名不匹配 `ovO-x.y.z-x64-setup.exe`、缺 `latest.yml`、tag 非 `x.y.z`（均抛"更新包不完整"），或 Gitee API 网络/限流。
- 关键限制：**无法在 Mac 本地复现 Windows 失败**，本轮只加诊断+暴露真实错误，不盲修。

## 各问题设计

### 问题① webSearch & 全能参考开关
- `src/types.ts` `GenerationSettings` 增 `webSearch?: boolean`（默认 `false`）。`omnireference` 字段已存在，仅需把面板上写死的"全能参考"文字改为可切换控件。
- `src/components/GeneratePanel.tsx`：在比例/时长旁加两个开关——「联网搜索」(webSearch，默认关) 和「全能参考」(omnireference，默认开，保持现状默认值)。
- `src/App.tsx`：`generationSettings` 初始值加 `webSearch: false`。
- `buildCompanyGenerateVideoParams`：`webSearch` 跟随 `settings.webSearch ?? false`；`referenceMode` 跟随 `settings.omnireference`。
- 单元接口：`buildGenerateVideoPayload`/`buildCompanyGenerateVideoPayload` 入参 `settings` 已透传，断言字段跟随。

### 问题② 字段对齐
目标 = 网页 11 字段扁平体。处理 app 多余字段：
- **删除** `aspectRatio`（网页只用 `ratio`，app 当前两个都发）、`genTab`、`networkEnabled`（语义并入 webSearch）、`task{}` 包装（已验证持久化走 `App.tsx:1265` 独立 `saveCanvasAsset`，不依赖 `task`）。
- `referenceVideos`：仅当有视频参考时发送（网页有视频参考时也会发；空数组不发以贴近网页）。
- `referenceMode`：**实现时先抓网页「标准参考」模式包**确认字段后再定（保留/改名/删）。
- 风险控制：保留 `_meta`（网页发，含 nodeId/projectId/label，用于回填节点）。TDD 断言最终 payload 键集合等于网页键集合（按①的开关取值）。

### 问题③ gitee 推送
`gitee` remote 已配（`git@gitee.com:siberian-aries/ov-o_create_video_platform.git`）。本轮所有 commit 完成后 `git push gitee feature/ui-shell`。不动 git 配置。

### 问题④ 更新诊断
- `electron/giteeReleaseUpdater.ts`：在 `checkForUpdates` 入口、`fetchJson`（URL+status）、`findRequiredUpdateAssets`（候选资产名）、`versionFromRelease`（raw tag）、`normalizeUpdateError`（抛错前打原始 error.message/stack）、`downloadUpdate`（installerUrl+status）加结构化 `console`。
- 把真实错误透传到渲染层：`CompanyApiRequestResult`/更新结果对象保留原始错误详情字段，`src/update/manualUpdateState.ts` + `src/App.tsx` 在失败态展示具体原因（而非只"更新失败"）。
- Mac"开发模式"：保持行为，但在按钮/日志上明确"dev 模式不检查更新"，避免误解为 bug。
- 不盲修 Windows 根因，待用户在 Windows 实点后据日志定位。

### 问题⑤ 复用去重
- 修 `src/lib/assetNormalizer.ts` `getGenerationReferences`：优先返回 `generationReferences` 派生的 `directReferences`，仅当其为空才回退 `groupedReferences`；或对合并结果按 URL 去重、保留带正常名那条。采用**优先 directReferences + 按 URL 去重**双保险。
- 写入侧 `uploadClient.ts` 的双写**保留**（后端生成管线可能需 `referenceImages/Videos/Audios`），去重只在读取侧。
- TDD：构造同时含 `generationReferences` 与 `referenceImages` 的快照节点，断言 `getGenerationReferences` 返回去重后的带正常名列表、无哈希名重复项。

### 问题⑥ 诊断文件
上一轮 `docs/superpowers/diagnostics/2026-06-19-video-latency-root-cause.md` 已读，作为参考，无需改动。

## 测试与验证
- 每项配单测（webSearch/omnireference 跟随、payload 键集合对齐、复用去重）。
- 更新诊断以源码断言测试覆盖"日志点存在/错误详情透传"（参照现有 `mainLifecycle.test.ts` 断言源码包含 ipc 注册的风格）。
- `npm test` 全量绿 + `npm run build` 通过。
- 实机验证（内置浏览器/CDP）：抓标准参考模式包（确认②①）；在测试画布提交一次确认对齐后 payload 被服务端正常接受。

## 交付与推送
- 多个聚焦 commit（按问题分），统一推 **gitee**（`git push gitee feature/ui-shell`），不推 origin/github 除非用户另说。
- 更新本轮诊断/进展记录。

## 未决（实现时解决，非占位）
- 问题②`referenceMode` 与问题①「标准参考」字段：依赖实现时抓一次网页标准模式包确认。这是诊断驱动的必要不确定性。
- Windows 更新根因：依赖用户在 Windows 实点后日志，本轮只交付诊断能力。
