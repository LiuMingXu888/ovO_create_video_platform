# Video Polling Stall Findings

## Context
- Working branch: `feature/ui-shell` in `/Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell`.
- User-provided browser log: `/Users/mac/Downloads/127.0.0.1-1781771906360.log`.
- Canvas: `http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x`.
- Real verification assets: `/Users/mac/Downloads/2026-06-18-164734`.

## Browser Log Facts
- Submit payload used 9:16, 720p, duration 15, generate audio, all reference/omnireference, network enabled.
- Submit response included `taskId=cgt-20260618161550-frvvp`, `queueTaskId=cmqj86fp10k5xm223d96hl3nd`, and `_genTaskId=cmqj86fp10k5xm223d96hl3nd`.
- Client chose `cmqj86fp10k5xm223d96hl3nd` for queue polling.
- Queue responses contained a matching task with keys including `id`, `providerTaskId`, `resultUrl`, `errorMessage`, `startedAt`, and `completedAt`.
- Logged normalized task state stayed `status: polling` with no visible video URL.

## Local Asset Facts
- Images:
  - `/Users/mac/Downloads/2026-06-18-164734/人物/人物-陆瑜婉后期.png`
  - `/Users/mac/Downloads/2026-06-18-164734/人物/人物-男主· 西装革履.png`
- Audios:
  - `/Users/mac/Downloads/2026-06-18-164734/音频/音频-江晚 - 女主.mp3`
  - `/Users/mac/Downloads/2026-06-18-164734/音频/音频-白景言 - 男主.mp3`
- Video:
  - `/Users/mac/Downloads/2026-06-18-164734/视频/1-1.mp4`

## Raw Queue Evidence
- Browser log already exposed one raw queue response around polling attempt 845:
  - `id`: `cmqj86fp10k5xm223d96hl3nd`
  - `projectId`: `cmq6fwhft0bg5m2l5u78zby8x`
  - `nodeId`: `generated-video-210f5b78-5e89-4325-b355-ddd8b5bbe144`
  - `userId`: `cmpm7d828001em22x9en36d4e`
  - `status`: `polling`
  - `providerTaskId`: `cgt-20260618161550-frvvp`
  - `resultUrl`: `null`
  - `errorMessage`: `null`
  - `startedAt`: `2026-06-18T08:15:45.396Z`
  - `completedAt`: `null`
  - `assetPersisted`: `true`
- DevTools port `9333` was not open before manual app startup.
- Manual Electron startup with `--remote-debugging-port=9333` succeeded.
- Authenticated renderer bridge query on the old task returned:
  - `status`: `succeeded`
  - `providerTaskId`: `cgt-20260618170109-fhb5x`
  - `resultUrl`: `https://aimanju-caojia.oss-cn-hangzhou.aliyuncs.com/users/cmpm7d828001em22x9en36d4e/videos/886fb72f23c9044f3fa9641e9aabc47c597c3fde6c95b603c8b8d242edf64a82.mp4`
  - `errorMessage`: `null`
  - `createdAt`: `2026-06-18T08:15:45.397Z`
  - `startedAt`: `2026-06-18T09:01:03.553Z`
  - `completedAt`: `2026-06-18T09:11:22.020Z`
- In Asia/Shanghai local time, this means the task was created at about 16:15, started at 17:01, and completed at 17:11. The existing frontend polling window is 1400 attempts * 1500 ms = 35 minutes, so it would time out around 16:50, before the successful result arrived.

## Root Cause Classification
- Root cause for the observed UI failure is client timeout too short for the actual queue delay: the backend task eventually succeeded, but only after roughly 56 minutes.
- Secondary issue: current timeout error loses the last known queue state, making a long backend wait look like an opaque client failure.
- No evidence of wrong queue id or result parser bug for this old task.

## Implemented Client Fix
- `DEFAULT_GENERATION_POLL_OPTIONS` changed from 1400 attempts to 3600 attempts at the same 1500 ms interval, extending the default window from about 35 minutes to 90 minutes.
- Canvas queue normalization now preserves `providerTaskId`, `startedAt`, and `completedAt`.
- Canvas queue timeout errors now include the last known `status`, `providerTaskId`, `resultUrl`, `errorMessage`, `startedAt`, and `completedAt`.

## Verification
- Focused regression tests first failed for the intended reasons:
  - default attempts were still `1400` instead of `3600`
  - total polling window was `2100000ms` instead of at least `5400000ms`
  - timeout error was only `任务轮询超时`
- After implementation, focused tests passed.
- `npm test -- src/api/generationClient.test.ts`: 18 passed.
- `npm test`: 190 passed across 35 test files.
- `npm run build`: build passed.
- Live old-task query through `window.ovoDesktop.api.request` returned `status=succeeded`, `providerTaskId=cgt-20260618170109-fhb5x`, and non-empty `resultUrl`.
