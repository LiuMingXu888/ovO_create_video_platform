# Subtitle Removal Route Plan

## Goal
Fix ovO subtitle removal so videos generated within 24 hours use the free Seedance/provider subtitle-removal route, while videos older than 24 hours use the paid Volcano VOD general route. Verify in code and against the test canvas, then push `feature/ui-shell` to Gitee.

## Approved Direction
- User approved the recommended design on 2026-06-20.
- Use `/api/subtitle-remove/ark` for the free route when the source video has a valid provider URL and its `createdAt` is within 24 hours of click time.
- Use `/api/subtitle-remove` for the paid route when the video is older than 24 hours, lacks a parseable `createdAt`, or lacks a provider URL.
- Use ovO's built-in logged-in browser and/or Computer Use for real canvas verification.
- Push to `gitee/feature/ui-shell` when verified.

## Phases
- [x] Phase 1: Read required skills and inspect current branch/code.
- [x] Phase 2: Brainstorm route options and receive user approval.
- [x] Phase 3: Write persistent planning files for this task.
- [x] Phase 4: Add failing regression tests for 24-hour subtitle route selection.
- [x] Phase 5: Implement minimal route-selection fix.
- [x] Phase 6: Run focused and full verification.
- [x] Phase 7: Verify real canvas behavior with the built-in browser or CDP.
- [x] Phase 8: Commit and push `feature/ui-shell` to Gitee.

## Design
- Introduce a small, testable route selector in `src/api/subtitleClient.ts`.
- Route selector inputs: `asset.url`, `asset.providerVideoUrl`, `asset.createdAt`, and injected `now`.
- Free route requires both a provider URL and a valid age from `createdAt` to `now` that is `>= 0` and `<= 24h`.
- Paid route is the conservative fallback.
- Free route body sends provider URL to `/api/subtitle-remove/ark`.
- Paid route body sends persisted URL to `/api/subtitle-remove`.

## Error Log
| Error | Attempt | Resolution |
|-------|---------|------------|
| None yet | 0 | Not applicable |

## Verification Evidence
- RED: `node node_modules/.bin/vitest run src/api/subtitleClient.test.ts` failed because an old provider URL still selected `route: "ark"`.
- GREEN: `node node_modules/.bin/vitest run src/api/subtitleClient.test.ts` passed 6 tests.
- RED: `node node_modules/.bin/vitest run src/lib/assetNormalizer.test.ts -t "normalizes real canvas snapshot node media fields"` failed because provider URL and generation time were missing from normalized video assets.
- GREEN: `node node_modules/.bin/vitest run src/lib/assetNormalizer.test.ts src/api/subtitleClient.test.ts src/services/canvasLoader.test.ts` passed 22 tests.
- Live target canvas snapshot was queried through the authenticated ovO desktop bridge. Existing `1-1` video nodes lack provider/generation-time fields, so they hit the paid fallback rule.
- Running ovO app reloaded target canvas resources successfully after the normalizer fix.
- Related tests: `node node_modules/.bin/vitest run src/lib/assetNormalizer.test.ts src/api/subtitleClient.test.ts src/services/canvasLoader.test.ts` passed 22 tests.
- Full tests: `node node_modules/.bin/vitest run --no-file-parallelism --maxWorkers=1` passed 40 files and 257 tests. Parallel full runs showed App JSDOM timeout flakiness under load; the timed-out tests passed individually.
- Build: explicit `tsc -p tsconfig.json`, `tsc -p tsconfig.node.json`, and `vite build` completed successfully.
- Commit: `5ec00f1 fix: route subtitle removal by video age`.
- Push: `git push gitee feature/ui-shell` succeeded.
