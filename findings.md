# Subtitle Removal Route Findings

## Context
- Working path: `/Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell`.
- Branch: `feature/ui-shell`.
- Test canvas: `http://qijing.kjjhz.cn/canvas/cmqlzufagtb0ulq1tejj5hwa7`.
- User wants old generated videos to use paid Volcano VOD subtitle removal and newly generated videos to use free subtitle removal.

## Code Facts
- `src/api/subtitleClient.ts` currently chooses route solely from `asset.providerVideoUrl`.
- Current route mapping:
  - `providerVideoUrl` present -> `/api/subtitle-remove/ark`.
  - `providerVideoUrl` absent -> `/api/subtitle-remove`.
- Existing docs say `/api/subtitle-remove/ark` should be offered only when a fresh `providerVideoUrl` exists and is treated as the free/provider channel.
- `CanvasAsset` already has optional `createdAt`.
- Generated video placeholders and save flow set `createdAt` to `new Date().toISOString()`.
- Existing video assets loaded from snapshots may have `createdAt`, but the route selector must safely handle missing or invalid values.
- Snapshot video nodes can store the free/provider URL as `seedanceProviderUrl`, and generation time as `generationStartedAt`.
- Before this fix, `normalizeSnapshotAssets` did not copy `seedanceProviderUrl` to `CanvasAsset.providerVideoUrl` or `generationStartedAt` to `CanvasAsset.createdAt`, so reloaded fresh generated videos could not use the free route.

## Approved Rule
- If source video generation time to click time is within 24 hours, use the free Seedance/provider route.
- If older than 24 hours, use paid Volcano VOD general route.
- If `createdAt` is missing/invalid or the provider URL is missing, use paid route as conservative fallback.

## Browser / Canvas Evidence
- Authenticated ovO desktop bridge was available on DevTools port 9333.
- Direct target canvas snapshot query found existing `1-1` video nodes without `providerVideoUrl` or `createdAt`, so those old/persisted videos correctly fall back to the paid route.
- UI mouse click on an old generated-video card triggered the existing activity error `去字幕接口未返回任务 ID`; request wrapping could not observe the closed-over desktop transport call, so endpoint proof is covered by API/service tests.
- Reloading target canvas resources after the normalizer fix succeeded and listed the video assets without leaving the extra temporary failed node at the top.
