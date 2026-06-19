# Video Polling Stall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine why canvas video generation remains in `polling`, fix the client-controlled failure mode, verify with tests and one real canvas run, then push `feature/ui-shell`.

**Architecture:** Treat the app, authenticated company API, and provider queue as separate boundaries. First collect raw queue evidence through the authenticated Electron bridge or network capture, then make the smallest client change that matches the proven root cause. Keep polling normalization in `src/api/generationClient.ts` and avoid server assumptions beyond observed response fields.

**Tech Stack:** Electron, Vite, React, TypeScript, Vitest, company API endpoints `/api/generate-video` and `/api/gen-queue`.

---

## File Map

- `docs/superpowers/specs/2026-06-18-video-polling-stall-design.md` records the approved diagnosis design.
- `task_plan.md`, `findings.md`, and `progress.md` preserve working memory for this debugging session.
- `src/api/generationClient.ts` owns generation payloads, queue polling, task matching, and result normalization.
- `src/api/generationClient.test.ts` covers queue polling behavior and will receive any regression tests before production code changes.
- `electron/companySessionClient.ts`, `electron/preload.cts`, and `src/api/transport.ts` may be read to confirm the authenticated request bridge, but should only be modified if evidence points there.

## Task 1: Capture Raw Queue Evidence

**Files:**
- Read: `src/api/generationClient.ts`
- Read: `src/api/endpoints.ts`
- Read: `electron/companySessionClient.ts`
- Log findings in: `findings.md`
- Log progress in: `progress.md`

- [ ] **Step 1: Confirm the old task identifiers from the browser log**

Run:

```bash
rg -n "taskId|queueTaskId|providerTaskId|errorMessage|轮询尝试 8[0-9][0-9]" /Users/mac/Downloads/127.0.0.1-1781771906360.log
```

Expected: The command shows `taskId=cgt-20260618161550-frvvp`, `queueTaskId=cmqj86fp10k5xm223d96hl3nd`, and late polling attempts still reporting `status: polling`.

- [ ] **Step 2: Check whether the Electron app exposes a remote debugging port**

Run:

```bash
curl -s http://127.0.0.1:9333/json/version
curl -s http://127.0.0.1:9333/json/list
```

Expected: If the desktop app is running with the current launcher, the commands return DevTools metadata and at least one target for the renderer. If connection fails, start the app with `npm run launch:mac`.

- [ ] **Step 3: Query the old queue task through the authenticated renderer bridge**

In the renderer context, execute:

```js
await window.ovoDesktop.api.request('/api/gen-queue?projectId=cmq6fwhft0bg5m2l5u78zby8x&taskId=cmqj86fp10k5xm223d96hl3nd')
```

Expected: Raw JSON includes the queue task object. Record `status`, `providerTaskId`, `resultUrl`, `errorMessage`, `startedAt`, and `completedAt` in `findings.md`.

- [ ] **Step 4: Classify the failure**

Use these rules:

```text
providerTaskId empty + errorMessage empty -> backend queue did not create provider task or hid failure.
providerTaskId empty + errorMessage present -> client should surface that backend error.
providerTaskId present + resultUrl empty after 20+ minutes -> provider/backend callback is stalled.
resultUrl/videoUrl present + status not succeeded -> client normalization should treat returned media as completion only if server semantics confirm it is final.
status succeeded + media URL present -> client parser bug if UI still polls.
```

Expected: One classification is written to `findings.md`.

## Task 2: Add the First Failing Regression Test

**Files:**
- Modify: `src/api/generationClient.test.ts`
- Modify only after RED: `src/api/generationClient.ts`

- [ ] **Step 1: Choose the regression behavior from Task 1**

If Task 1 proves a client parser issue, write a test that reproduces the exact raw queue shape. If Task 1 proves server stall, write a test for diagnostics preservation instead of pretending the client can finish a stalled task.

- [ ] **Step 2: Write the failing test**

For a diagnostics preservation case, add this test to `src/api/generationClient.test.ts`:

```ts
it("includes provider diagnostics when a canvas queue task times out", async () => {
  const transport = createTransport([
    {
      tasks: [
        {
          id: "queue-task-1",
          nodeId: "node-1",
          status: "polling",
          providerTaskId: "",
          errorMessage: "",
          startedAt: "2026-06-18T08:15:50.000Z",
          completedAt: null
        }
      ]
    }
  ]);

  await expect(
    generateVideo(
      transport,
      {
        projectId: "project-1",
        nodeId: "node-1",
        prompt: "test prompt",
        references: []
      },
      { intervalMs: 0, maxAttempts: 1 }
    )
  ).rejects.toThrow(/providerTaskId/);
});
```

Expected: The test fails because the current timeout error is only `任务轮询超时`.

- [ ] **Step 3: Run the focused test to verify RED**

Run:

```bash
npm test -- src/api/generationClient.test.ts -t "includes provider diagnostics"
```

Expected: FAIL for the expected missing diagnostics in the thrown timeout error.

## Task 3: Implement the Minimal Client Fix

**Files:**
- Modify: `src/api/generationClient.ts`
- Test: `src/api/generationClient.test.ts`

- [ ] **Step 1: Preserve diagnostic fields in queue normalization**

Add fields only if Task 1 shows they exist in raw queue responses:

```ts
providerTaskId?: string;
startedAt?: string;
completedAt?: string;
```

Update `normalizeQueueTask`:

```ts
providerTaskId: stringValue(value.providerTaskId),
startedAt: stringValue(value.startedAt),
completedAt: stringValue(value.completedAt),
```

- [ ] **Step 2: Include the last known queue state in timeout errors**

Track `lastTaskResult` inside `pollCanvasQueueUntilComplete` and throw a message like:

```ts
throw new Error(
  `任务轮询超时：status=${lastTaskResult.status ?? "unknown"}, providerTaskId=${lastTaskResult.providerTaskId ?? "empty"}, errorMessage=${lastTaskResult.errorMessage ?? "empty"}`
);
```

Expected: Users and logs can distinguish server queue stall from login/network/client parser failure.

- [ ] **Step 3: Run the focused test to verify GREEN**

Run:

```bash
npm test -- src/api/generationClient.test.ts -t "includes provider diagnostics"
```

Expected: PASS.

- [ ] **Step 4: Run all generation client tests**

Run:

```bash
npm test -- src/api/generationClient.test.ts
```

Expected: PASS.

## Task 4: Real Canvas Verification

**Files:**
- Read/update: `findings.md`
- Read/update: `progress.md`

- [ ] **Step 1: Start or reuse the desktop app on `feature/ui-shell`**

Run only if the remote debugging endpoint is unavailable:

```bash
npm run launch:mac
```

Expected: The app opens, uses the authenticated company session, and exposes DevTools on port `9333`.

- [ ] **Step 2: Open the canvas**

Navigate the in-app/company browser to:

```text
http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x
```

Expected: The canvas loads with the company account.

- [ ] **Step 3: Create the real test generation**

Use these files from `/Users/mac/Downloads/2026-06-18-164734`:

```text
人物/人物-陆瑜婉后期.png
人物/人物-男主· 西装革履.png
音频/音频-江晚 - 女主.mp3
音频/音频-白景言 - 男主.mp3
视频/1-1.mp4
```

Configure: 9:16, 720p, Seedance 2.0 high quality, omnireference/all reference, audio enabled, network enabled.

Prompt:

```text
'图片1''音频1'是苏婉晴、'图片2''音频2'是老周（苏婉晴的女朋友）、衔接上一个视频参考'视频1'，图片1中的人物和图片2中的人物出现在视频1中人物即将走的时候，突然出现把要过安检的女生拦住了，台词自由发挥。
```

Expected: A queue task is created. Record the new `taskId` and `queueTaskId` in `findings.md`.

- [ ] **Step 4: Poll the new task raw state**

Use:

```js
await window.ovoDesktop.api.request('/api/gen-queue?projectId=cmq6fwhft0bg5m2l5u78zby8x&taskId=<newQueueTaskId>')
```

Expected: Record whether `providerTaskId` appears and whether `resultUrl` or `errorMessage` changes within the observation window.

## Task 5: Full Verification and Push

**Files:**
- Read: `package.json`
- Update: `task_plan.md`
- Update: `progress.md`

- [ ] **Step 1: Run the test suite relevant to the change**

Run:

```bash
npm test -- src/api/generationClient.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the project verification command**

Run:

```bash
npm test
npm run build
```

Expected: Both commands exit 0.

- [ ] **Step 3: Inspect the final diff**

Run:

```bash
git diff -- docs/superpowers/specs/2026-06-18-video-polling-stall-design.md docs/superpowers/plans/2026-06-18-video-polling-stall.md task_plan.md findings.md progress.md src/api/generationClient.ts src/api/generationClient.test.ts
git status --short
```

Expected: Only planned files are modified or created.

- [ ] **Step 4: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-06-18-video-polling-stall-design.md docs/superpowers/plans/2026-06-18-video-polling-stall.md task_plan.md findings.md progress.md src/api/generationClient.ts src/api/generationClient.test.ts
git commit -m "fix: expose video polling stall diagnostics"
```

Expected: Commit succeeds on `feature/ui-shell`.

- [ ] **Step 5: Push**

Run:

```bash
git push origin feature/ui-shell
```

Expected: Push succeeds.

## Self-Review

- Spec coverage: The plan covers raw diagnosis, TDD, targeted client fix, real canvas verification, and push.
- Placeholder scan: No TBD/TODO/fill-later placeholders remain.
- Type consistency: Diagnostic fields use string values already supported by `stringValue`; queue task matching remains in `generationClient.ts`.
