# UI Shell Followups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the requested `feature/ui-shell` followups for login URL display, credits, stable prompt/generation controls, upload/node fixes, tokenized references, and multi-select download.

**Architecture:** Keep the existing Electron session and React shell. Add small focused helpers for credit extraction, prompt-token state, and batch download while preserving current APIs. Implement with Vitest/Testing Library red-green cycles.

**Tech Stack:** Electron, React, TypeScript, Vite, Vitest, Testing Library, lucide-react.

---

## File Structure

- Modify `electron/companySession.ts`: login window address toolbar and batch download handler.
- Modify `electron/main.ts`: register batch download IPC.
- Modify `electron/preload.cts`: guard FormData serialization and expose batch save.
- Modify `src/vite-env.d.ts`: desktop bridge typings.
- Modify `src/types.ts`: optional credit fields and multi-select action types.
- Create `src/lib/credits.ts` and `src/lib/credits.test.ts`: extract balance from unknown auth payloads.
- Modify `src/components/AppHeader.tsx`: credit display and multi-select controls.
- Modify `src/components/GeneratePanel.tsx`: show computed credit cost.
- Modify `src/components/PromptDock.tsx`: render token editor instead of raw textarea.
- Create `src/components/PromptTokenEditor.tsx`: text + reference token editing UI.
- Modify `src/components/AssetCard.tsx`: swapped audio/video actions and checkbox.
- Modify `src/components/AssetSection.tsx`: pass multi-select props.
- Modify `src/api/uploadClient.ts` and `src/api/uploadClient.test.ts`: default node coordinates.
- Modify `src/lib/downloadAsset.ts` and tests: batch desktop downloads.
- Modify `src/App.tsx` and `src/App.test.tsx`: integrate state and behavior.
- Modify `src/styles.css`: fixed prompt/generate heights, tokens, header controls, checkboxes.

## Task 1: Credit Extraction And Header Display

- [ ] Write failing tests in `src/lib/credits.test.ts` for extracting `23136` from nested fields named `credits`, `credit`, `points`, `balance`, or `remainingCredits`, and returning `undefined` for unrelated numbers.
- [ ] Run `npm test -- src/lib/credits.test.ts` and confirm it fails because the file/helper does not exist.
- [ ] Implement `src/lib/credits.ts` with a recursive, depth-limited extractor that prefers likely credit keys and ignores account/id-like keys.
- [ ] Extend `AuthUser` in `src/types.ts` with optional credit-like fields and update `companyApiFacade` to normalize `creditBalance`.
- [ ] Update `AppHeader` to render a coin/credit pill showing the numeric balance or `--`.
- [ ] Update `App.test.tsx` auth tests to expect the balance pill when auth returns credit data.
- [ ] Run `npm test -- src/lib/credits.test.ts src/App.test.tsx`.

## Task 2: Stable Generate Panel And Cost Display

- [ ] Add failing `App.test.tsx` assertions that a `15s` duration displays `需 150 积分`, changing duration to `12` displays `需 120 积分`, and generation still works.
- [ ] Run the targeted test and confirm it fails.
- [ ] Modify `GeneratePanel` to compute `settings.durationSeconds * 10` and render the cost near the duration control.
- [ ] Remove focus-driven height changes from `src/styles.css`; keep prompt editor and generate panel fixed with stable dimensions.
- [ ] Run `npm test -- src/App.test.tsx`.

## Task 3: Prompt Reference Tokens

- [ ] Add failing tests that clicking an image/video/audio `+` creates a `.prompt-token` with kind-specific class and a reference chip.
- [ ] Add failing tests that deleting the token removes the reference chip, and clicking the reference chip remove button removes the token.
- [ ] Run targeted tests and confirm failures against the current textarea implementation.
- [ ] Create `PromptTokenEditor` with text segments and reference token rendering. Token remove buttons call `onRemoveReference`.
- [ ] Update `PromptDock` to use the token editor and keep the reference strip remove behavior explicit with an `X` button.
- [ ] Update `App` so `insertAsset` adds a reference and prompt token together, and `removeReference` removes both.
- [ ] Update generation payload creation to derive prompt text from the token editor text plus token names.
- [ ] Run `npm test -- src/App.test.tsx`.

## Task 4: Upload FormData And Node Coordinates

- [ ] Add failing `uploadClient.test.ts` coverage that `addAssetNodeToSnapshot` creates media nodes with `position: { x: 0, y: 0 }`, `x: 0`, and `y: 0`.
- [ ] Add failing preload/desktop transport tests or assertions covering readable rejection for non-FormData upload values.
- [ ] Run `npm test -- src/api/uploadClient.test.ts electron/preloadBuild.test.js src/api/desktopTransport.test.ts` as applicable and confirm the coordinate test fails.
- [ ] Modify `createAssetNode` in `src/api/uploadClient.ts` to include default coordinates.
- [ ] Harden `electron/preload.cts` serialization with an explicit `typeof formData.get === "function"` check and readable error.
- [ ] Ensure renderer upload paths only pass genuine `FormData` through `DesktopApiTransport`.
- [ ] Run `npm test -- src/api/uploadClient.test.ts src/api/desktopTransport.test.ts`.

## Task 5: Login Window Address Bar

- [ ] Add Electron unit coverage where practical for URL toolbar helper behavior, or isolate a small URL-state helper if direct BrowserWindow testing is too heavy.
- [ ] Modify `openLoginWindow` to create a parent login shell with a top BrowserView/WebContentsView or injected toolbar that displays current URL.
- [ ] Wire navigation events (`did-navigate`, `did-navigate-in-page`, `page-title-updated`) to update the address field.
- [ ] Add copy button behavior using Electron clipboard.
- [ ] Run `npm run build` to catch Electron TypeScript errors.

## Task 6: Media Action Order And Multi-Select Download

- [ ] Add failing tests that audio/video overlay order places play before `+` or `+` in the requested swapped position compared with current order.
- [ ] Add failing tests that multi-select mode shows checkboxes, selecting assets enables batch download, and cancelling clears checkboxes.
- [ ] Implement `AssetCard` checkbox props and action order swap.
- [ ] Implement header multi-select controls and selected asset state in `App`.
- [ ] Add `downloadAssets` helper and Electron `saveAssets` bridge to create timestamped folders under Downloads.
- [ ] Run `npm test -- src/App.test.tsx src/lib/downloadAsset.test.ts`.

## Task 7: Credit Refresh Hooks

- [ ] Add failing tests that generation calls `companyApiFacade.checkAuth` before and after the generation preview flow.
- [ ] Update `handleOpenLogin`, `handleCheckAuth`, and generation completion flow to refresh auth/credits.
- [ ] For the current preview-only generation path, refresh before and after preview; when real generation/persist is added, keep the same refresh wrapper around async task completion.
- [ ] Run `npm test -- src/App.test.tsx`.

## Task 8: Final Verification

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Start the dev server with `npm run dev -- --host 127.0.0.1`.
- [ ] Open the local app in the in-app Browser and verify key UI states: header credits/multi-select, prompt tokens, fixed generate height, and action order.
- [ ] If Electron can run in the environment, run `npm run dev:electron` and manually verify the login address bar.

