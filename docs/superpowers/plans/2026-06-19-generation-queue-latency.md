# ovOApp 视频生成排队过慢诊断 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 定位 ovOApp 提交视频生成是否因 payload/接口与网页版不同而进入更慢队列，若客户端可控则修复并对齐网页默认。

**Architecture:** 抓取两条入口的 `/api/generate-video` 请求做逐字段对比。网页基线由用户提供；ovOApp 基线通过 Chrome DevTools 连接已运行实例（9333 端口）的 renderer，真实提交一次抓请求/响应/队列时间戳。差异定位后按决策规则修复 `buildCompanyGenerateVideoParams`。

**Tech Stack:** TypeScript / React 19 / Electron 37 / Vite 6 / Vitest；Chrome DevTools MCP 连接 renderer。

## Global Constraints

- 不改后端。
- 测试画布 `cmq6fwhft0bg5m2l5u78zby8x`，可增删改、可消耗积分。
- 工作分支 `feature/ui-shell`，worktree `.worktrees/ui-shell`，推 `origin/feature/ui-shell`。
- 写死参数位置：`src/api/generationClient.ts:88` `buildCompanyGenerateVideoParams`。
- ovOApp renderer 远程调试端口：9333（已开）。
- 项目 ID：`cmq6fwhft0bg5m2l5u78zby8x`；模型：`ep-20260319213857-htd7q` (Seedance 2.0)。

---

### Task 1: 采集 ovOApp 慢路径基线（真实提交）

**Files:**
- Create: `docs/superpowers/diagnostics/2026-06-19-ovoapp-submit-capture.md`

**Interfaces:**
- Produces: ovOApp 侧 `/api/generate-video` 请求体、响应体（taskId/queueTaskId）、`/api/gen-queue` 首批任务对象（createdAt/startedAt/status/providerTaskId）。

- [ ] **Step 1:** 连接 9333 renderer（`mcp_chrome-devtools_list_pages` → select ovO 页面），确认是 ovOApp 画布页。
- [ ] **Step 2:** 在 renderer 注入 fetch/XHR 抓包钩子（evaluate_script），记录 `/api/generate-video` 与 `/api/gen-queue` 的 method/url/请求体/响应体到 window 全局数组。
- [ ] **Step 3:** 在测试画布真实新建视频节点并提交一次（驱动 UI 或直接走 `companyApiFacade.generateVideo`），触发一次真实请求。
- [ ] **Step 4:** 读取抓包结果，提取请求 payload + 响应 taskId/queueTaskId。
- [ ] **Step 5:** 拉一次 `/api/gen-queue`，记录该任务 createdAt/startedAt/status/providerTaskId。
- [ ] **Step 6:** 写入 `docs/superpowers/diagnostics/2026-06-19-ovoapp-submit-capture.md`，commit。

### Task 2: 采集网页版快路径基线（用户提供）

**Files:**
- Modify: `docs/superpowers/diagnostics/2026-06-19-ovoapp-submit-capture.md`（追加网页 payload 段）

**Interfaces:**
- Consumes: 用户复制的网页版 `/api/generate-video` Payload。
- Produces: 网页版请求体字段集合。

- [ ] **Step 1:** 接收用户提供的网页版 Payload，原样记录。
- [ ] **Step 2:** 追加到诊断文档，commit。

### Task 3: 逐字段对比 + 根因判定

**Files:**
- Create: `docs/superpowers/diagnostics/2026-06-19-payload-comparison.md`

- [ ] **Step 1:** 列对比表：`duration / generateAudio / networkEnabled / referenceMode / genTab / model / resolution / aspectRatio / 参考资源数`，逐字段标 ovOApp vs 网页 vs 差异。
- [ ] **Step 2:** 按 spec 决策规则判定走哪条修复分支（多带重参数 / 完全一致 / 接口不一致）。
- [ ] **Step 3:** 写入结论，commit。

### Task 4（条件触发）: 修复写死参数 → 跟随 UI

仅当 Task 3 判定为「ovOApp 多带重参数 / 默认值不同」时执行。

**Files:**
- Modify: `src/api/generationClient.ts:88` `buildCompanyGenerateVideoParams`
- Modify: `src/types.ts`（若需扩展 `GenerationSettings`）
- Test: `src/api/generationClient.test.ts`

**Interfaces:**
- Consumes: `GenerationSettings`（含需对齐的字段，如 `generateAudio?: boolean`、`networkEnabled?: boolean`）。
- Produces: payload 字段跟随 settings 而非写死。

- [ ] **Step 1: 写失败测试** — 断言传入 `settings.generateAudio=false`（或对比表确定的差异字段）时，payload 对应字段跟随。

```typescript
it("lets settings control generateAudio instead of hardcoding true", () => {
  const payload: any = buildGenerateVideoPayload({
    prompt: "p",
    references: [],
    settings: { aspectRatio: "9:16", durationSeconds: 5, omnireference: false, generateAudio: false }
  });
  expect(payload.generateAudio).toBe(false);
});
```

- [ ] **Step 2: 跑测试确认 RED** — `npm test -- src/api/generationClient.test.ts -t "generateAudio"`，预期 FAIL。
- [ ] **Step 3: 实现** — 在 `GenerationSettings` 加可选字段，`buildCompanyGenerateVideoParams` 用 `settings.generateAudio ?? true` 等形式取代写死值，对齐 Task 3 确定的差异字段。
- [ ] **Step 4: 跑测试确认 GREEN** — 同上命令，预期 PASS。
- [ ] **Step 5: Commit**。

### Task 5: 全量验证 + 推送

- [ ] **Step 1:** `npm test`（全量），预期全绿。
- [ ] **Step 2:** `npm run build`，预期 TypeScript + Vite 构建通过。
- [ ] **Step 3:** 更新 `progress.md` / `task_plan.md` 记录本轮结论。
- [ ] **Step 4:** commit 并 `git push -u origin feature/ui-shell`。

## Self-Review

- **Spec coverage:** 基线 A（Task 2）、基线 B（Task 1）、逐字段对比（Task 3）、三条修复分支（Task 4 条件触发 + Task 3 判定）、验证推送（Task 5）均覆盖。
- **Placeholder scan:** Task 4 为条件任务，具体差异字段依赖 Task 3 实测结果，这是诊断驱动的必要不确定性，非占位符；测试代码已给出可执行范例。
- **Type consistency:** `buildGenerateVideoPayload` / `buildCompanyGenerateVideoParams` / `GenerationSettings` 命名与 `src/api/generationClient.ts` 现状一致。
