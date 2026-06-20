# Subtitle Removal 24-Hour Route Design

Date: 2026-06-20
Branch: `feature/ui-shell`
Canvas: `http://qijing.kjjhz.cn/canvas/cmqlzufagtb0ulq1tejj5hwa7`

## Goal

Subtitle removal must automatically choose the correct backend route from the source video's age:

- Videos generated within 24 hours of the click use the free Seedance/provider route.
- Videos older than 24 hours use the paid Volcano VOD general route.

## Current Problem

`src/api/subtitleClient.ts` currently chooses the route only from `providerVideoUrl`. That can send old videos with a retained provider URL to `/api/subtitle-remove/ark`, causing the UI to create a failed subtitle-removal node.

## Route Rules

- Free route: `/api/subtitle-remove/ark`.
  - Requires a valid `providerVideoUrl`.
  - Requires a valid `createdAt`.
  - Requires `0 <= now - createdAt <= 24 hours`.
  - Sends the provider URL in the request body.
- Paid route: `/api/subtitle-remove`.
  - Used for videos older than 24 hours.
  - Used when `createdAt` is missing or invalid.
  - Used when `providerVideoUrl` is missing.
  - Sends the persisted video URL in the request body.

The conservative fallback is paid, because the provider/free channel is only valid for fresh original Seedance/Fast model videos.

## Implementation

- Add a small route selector in `src/api/subtitleClient.ts`.
- Extend polling options with an optional `now` value for deterministic tests.
- Keep existing return route labels (`ark` and `default`) so callers do not need a broader UI change.
- Update focused subtitle client tests to cover recent, old, boundary, invalid-time, and no-provider cases.

## Verification

- RED/GREEN focused tests for `src/api/subtitleClient.test.ts`.
- Existing app/service tests that exercise subtitle removal.
- Full `npm test` and `npm run build`.
- Built-in ovO browser verification on the test canvas:
  - old existing video uses paid route;
  - newly generated video uses free route.
