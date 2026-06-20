# Subtitle Removal Route Progress

## 2026-06-20
- Read superpowers brainstorming instructions, planning-with-files instructions, computer-use instructions, TDD instructions, and verification-before-completion instructions.
- Confirmed active implementation worktree is `.worktrees/ui-shell` on `feature/ui-shell`.
- Inspected current subtitle removal code and tests.
- Found current route selection is based only on `providerVideoUrl`, which can send old videos to the free/provider route.
- User approved the design to route by `createdAt` age: within 24 hours uses free `/api/subtitle-remove/ark`, older or unknown uses paid `/api/subtitle-remove`.
- Replaced stale root planning files in this worktree with this task's plan, findings, and progress.
- Added RED test for an old video that still has `providerVideoUrl`; current code failed by returning route `ark` instead of `default`.
- Implemented `chooseSubtitleRemovalRoute` with a 24-hour window and conservative paid fallback.
- Focused `src/api/subtitleClient.test.ts` now passes: 6 tests.
- Related tests passed: `src/api/subtitleClient.test.ts`, `src/services/canvasLoader.test.ts`, and `src/App.test.tsx` passed 77 tests.
- Full test suite passed: 40 files, 257 tests.
- Production build passed via explicit bundled Node + local `tsc`/`vite`.
- Confirmed authenticated ovO desktop bridge on DevTools port 9333 before the app exited.
- Direct snapshot query for target canvas found existing video `1-1` without `createdAt` or `providerVideoUrl`; by the new rule it should use the paid `/api/subtitle-remove` route.
- First UI automation attempt could not find the canvas URL input before the Electron debug port closed.
- Inspected live target canvas snapshot and found video nodes can use `generationStartedAt`/`seedanceProviderUrl`.
- Added a failing normalizer test proving those fields were not copied to `CanvasAsset.createdAt`/`providerVideoUrl`.
- Fixed `normalizeSnapshotAssets` to preserve provider URL and generation timestamp for video assets.
- Re-ran focused normalizer/subtitle/canvasLoader tests: 22 tests passed.
- Reloaded target canvas resources in the running ovO app; UI listed 98 loaded resources and video assets after the fix.
- Parallel full test runs repeatedly hit unrelated App test timeout flakiness under load; the failing tests passed individually.
- Stopped the local dev app and ran full tests serially: 40 files and 257 tests passed.
- Ran production build with explicit bundled Node and local TypeScript/Vite binaries; build passed.
