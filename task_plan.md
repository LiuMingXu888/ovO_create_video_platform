# Video Polling Stall Debug Plan

## Goal
Diagnose why canvas video generation on project `cmq6fwhft0bg5m2l5u78zby8x` remains in `polling`, fix the client-side behavior that evidence proves is wrong or incomplete, verify, commit, and push `feature/ui-shell`.

## Approved Direction
- Start from raw `/api/gen-queue` evidence instead of guessing.
- Use the actual local folder `/Users/mac/Downloads/2026-06-18-164734` for real verification; file names are only identifiers.
- Do not attempt server changes.
- Push fixes to `origin/feature/ui-shell`.

## Phases
- [x] Phase 1: Explore repo state, existing branch, browser log, and current design.
- [x] Phase 2: Brainstorm and get user approval for the diagnostic approach.
- [x] Phase 3: Write implementation plan and persistent working files.
- [x] Phase 4: Capture raw queue evidence for the old stalled task.
- [x] Phase 5: Add failing regression test for the proven client-controlled behavior.
- [x] Phase 6: Implement the minimal client fix.
- [x] Phase 7: Verify with focused tests, full tests/build, and real canvas task when feasible.
- [ ] Phase 8: Commit and push `feature/ui-shell`.

## Current Hypotheses
1. Backend queue created a task but never created or advanced the provider task.
2. Backend/provider produced an error hidden from the current normalized logs.
3. Backend returned a success/result shape that the client does not currently recognize.
4. A configuration mismatch, such as model id or origin/cookie split, prevents provider progress.
5. Confirmed: the old task eventually succeeded after roughly 56 minutes, while the client timeout window is currently about 35 minutes.

## Error Log
| Error | Attempt | Resolution |
|-------|---------|------------|
| None yet | 0 | Not applicable |
| Vite port 5173 already in use | 1 | Reused existing running Vite service instead of starting another one |
| DevTools 9333 unavailable | 1 | Found running app used 9222; 9222 was occupied by Chrome, so manually started Electron on 9333 |

## Decision Rules
- If raw queue state includes `status=succeeded` with media URL but the UI still polls, fix client normalization.
- If raw queue state stays `polling` with no `providerTaskId`, add diagnostics and surface server-stall evidence; do not pretend the client can finish it.
- If raw queue state has `errorMessage`, surface it clearly in polling errors.
- If auth fails, refresh/login through the desktop app before repeating API calls.
- Because the old task succeeded after the current timeout window, extend the default polling window and include last-known queue diagnostics in timeout errors.

## Verification Evidence
- Focused RED command failed as expected before implementation: `npm test -- src/api/generationClient.test.ts -t "covers delayed queue starts|includes the last canvas queue diagnostics|uses a longer default polling window"`.
- Focused GREEN command passed after implementation.
- `npm test -- src/api/generationClient.test.ts`: 18 tests passed.
- `npm test`: 35 test files and 190 tests passed.
- `npm run build`: TypeScript and Vite production build completed successfully.
- Live authenticated queue query for old task returned `status=succeeded` and a non-empty `resultUrl`.
