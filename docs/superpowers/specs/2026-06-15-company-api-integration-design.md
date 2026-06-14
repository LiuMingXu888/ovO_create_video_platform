# Company API Integration Design

Date: 2026-06-15

## Goal

Connect the local ovO desktop shell to the existing company canvas APIs so the user can paste a canvas URL, load that canvas' resources, upload local resources, generate a `9:16` video, and optionally remove subtitles.

This stage still does not build a server. All authentication state, sanitized API discovery data, cached resources, generated task records, and downloaded outputs stay on the user's computer.

## Approved Scope

This design covers the next implementation phase after the local UI shell:

1. Login/session status through the user's own company account.
2. Canvas URL parsing and project id extraction.
3. Authenticated calls for user info, project snapshot, and asset list.
4. Resource normalization into existing UI categories.
5. Upload flow for image, video, and audio files.
6. Video generation with default `Seedance 2.0`, `9:16`, `720p`.
7. Subtitle-removal task flow.
8. Polling and displaying task status/results.

The implementation must keep each capability behind explicit UI actions. Loading resources is safe to run after the user enters a canvas URL. Upload, video generation, and subtitle removal can create server-side state or consume credits, so those actions must only run after the user clicks the matching button.

## Non-Goals

- Do not bypass company authentication.
- Do not ask for or store the user's password.
- Do not commit cookies, localStorage, tokens, HAR files, raw API payloads, generated media, or company project data to GitHub.
- Do not implement cloud rendering.
- Do not implement collaborative editing.
- Do not implement server-side asset-category persistence until the API shape proves a safe field exists.
- Do not rename server assets in the first API phase. Local display-name editing can be planned after read/upload/generate is stable.

## Recommended Approach

Use a typed authenticated API client inside Electron, backed by a local session manager.

### Option A: Electron Request Client Using Captured Login State

The app stores the user's browser session locally, then uses Electron/Node `fetch` to call company APIs with the correct cookies/headers.

Pros:

- Fast, testable, and easy to type.
- Fits the existing Electron app.
- Resource loading, upload, generation, and polling can share one client.

Cons:

- Requires careful local storage of cookies/session data.
- Need to confirm which cookies/headers are required by the company site.

### Option B: Playwright Page Automation For Every API Action

Keep a Playwright browser/page open and run requests through page context or route interception.

Pros:

- Closest to what the company web app already does.
- Useful for discovery and login.

Cons:

- More brittle and slower for normal app actions.
- Harder to unit test.
- Read-only browser contexts can block direct request probing.

### Option C: Manual Token Paste

Ask the user to paste tokens/cookies into the app.

Pros:

- Quick to prototype.

Cons:

- Bad user experience.
- Easy to leak secrets.
- Not acceptable for this product unless all other login-state approaches fail.

Recommendation: use Option A for implementation and keep Option B only for discovery/login fallback. Do not use Option C.

## Security Model

The user logs in through the real company website. The local app never asks for account credentials directly.

Store auth/session data only in a local ignored directory:

- `storage/auth/session.json`
- `storage/auth/storage-state.json`
- `storage/api/sanitized-api-map.json`

Rules:

- `.gitignore` must continue to ignore `storage/`, `.env`, `.env.*`, `api-captures/`, `*.har`, logs, and generated media.
- Docs and commits may include endpoint paths and field names.
- Docs and commits must not include private cookies, bearer tokens, signed URLs with secrets, raw response bodies, or company content dumps.
- If auth validation fails, show a clear "重新登录" action.

## Endpoint Map

The first Chrome discovery pass identified these endpoint families.

### Session

- `GET /api/auth/me`

Purpose:

- Confirm whether the saved session is valid.
- Read user/account information for the header.

Expected local behavior:

- On app startup or "检查登录态", call this endpoint.
- If it succeeds, show logged-in state.
- If it fails with auth status, show login-required state and do not call canvas APIs.

### Canvas Snapshot

- `GET /api/projects/{projectId}/snapshot`
- `PUT /api/projects/{projectId}/snapshot`

Purpose:

- Load the current canvas state and resource references.
- `PUT` is not needed in the first read-only resource phase.

Expected local behavior:

- Extract `{projectId}` from canvas URLs like `http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x`.
- Call `GET /api/projects/{projectId}/snapshot`.
- Normalize image/video/audio references into the local UI.

### Asset Library

- `GET /api/asset/list?statuses=Active&pageSize=100`
- `GET /api/asset/{assetId}`

Purpose:

- Load broader library assets if snapshot does not contain enough media metadata.
- Resolve asset details when snapshot only stores ids.

Expected local behavior:

- Prefer snapshot resources for the target canvas.
- Use asset-list/detail as enrichment only when needed.
- Avoid loading unrelated assets into the UI unless the user asks for library-wide search later.

### Upload

- `POST /api/upload-file`
- `POST /api/upload-public`
- `POST /api/asset/upload`

Observed fields:

- `FormData.file`
- `FormData.prefix`
- optional `FormData.projectId`
- upload response likely includes `publicUrl`

Expected local behavior:

1. Validate local files with the existing reference/material constraints.
2. Upload the file to storage.
3. Register the uploaded file as an asset if the API requires `POST /api/asset/upload`.
4. Add the uploaded asset to the local UI only after the server responds successfully.

Open verification item:

- Confirm whether `POST /api/upload-file` alone returns a usable generation URL, or whether `POST /api/asset/upload` is required for all media types.

### Generate Video

- `POST /api/generate-video`
- `GET /api/generate-video/{taskId}`
- `GET /api/gen-queue?projectId={projectId}`
- `POST /api/gen-queue`
- `POST /api/asset/persist-task`

Observed generation fields:

- `prompt`
- `model`
- `duration`
- `aspectRatio`
- `resolution`
- `generateAudio`
- `referenceImages`
- `referenceVideos`
- `referenceAudios`
- `multiframeImages`
- `firstFrameImage`
- `lastFrameImage`

Default app settings:

- `model`: `Seedance 2.0`
- `aspectRatio`: `9:16`
- `resolution`: `720p`

Expected local behavior:

1. Validate prompt and reference materials.
2. Submit `POST /api/generate-video`.
3. Save returned task id locally.
4. Poll `GET /api/generate-video/{taskId}` until success/failure.
5. Display the resulting video URL.
6. Use the existing download behavior to save output locally.

Open verification items:

- Confirm exact `model` value string for `Seedance 2.0`.
- Confirm whether `duration` is required and what default the company UI uses.
- Confirm whether `generateAudio` should default to true or false.
- Confirm whether successful tasks need `POST /api/asset/persist-task`.

### Subtitle Removal

- `POST /api/subtitle-remove`
- `GET /api/subtitle-remove/{taskId}`
- `POST /api/subtitle-remove/ark`
- `GET /api/subtitle-remove/ark/{taskId}`

Expected local behavior:

1. If "去除字幕" is enabled and generated video succeeds, submit the returned video URL to subtitle removal.
2. Poll until success/failure.
3. Display the subtitle-free output as the final output when it succeeds.
4. Keep the original generated output available in local task history.

Open verification item:

- Confirm whether the default route should be `/api/subtitle-remove` or `/api/subtitle-remove/ark`.

## Data Model

The app should keep server-facing data separate from UI-facing data.

### CanvasProject

```ts
interface CanvasProject {
  projectId: string;
  canvasUrl: string;
  title?: string;
  loadedAt: string;
}
```

### ApiAsset

```ts
interface ApiAsset {
  id?: string;
  name: string;
  kind: "image" | "audio" | "video";
  url: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  sizeBytes?: number;
  source: "snapshot" | "asset-list" | "upload";
  rawType?: string;
}
```

### LocalTask

```ts
interface LocalTask {
  id: string;
  projectId: string;
  type: "generate-video" | "subtitle-remove";
  status: "queued" | "running" | "succeeded" | "failed";
  serverTaskId?: string;
  createdAt: string;
  updatedAt: string;
  outputUrl?: string;
  errorMessage?: string;
}
```

## Resource Normalization

When loading canvas resources:

- All images enter `人物` by default.
- Audio resources enter `音频`.
- Video resources enter `视频`.
- `场景` and `道具` start empty unless the user drags images into them locally.
- Local drag/drop category changes do not write to the server in this phase.

Resource names:

- Use API display name when present.
- Fall back to filename without extension.
- Preserve server id and URL internally.
- Do not server-rename assets in this phase.

## User Flow

### Login And Session

1. User clicks "登录 / 检查登录态".
2. App opens company login page or checks saved session.
3. User logs in through company UI if needed.
4. App validates `GET /api/auth/me`.
5. App shows account information when valid.

### Load Canvas

1. User pastes canvas URL.
2. App extracts project id.
3. App calls `GET /api/projects/{projectId}/snapshot`.
4. App normalizes returned resources.
5. UI replaces sample assets with real canvas resources.

### Upload Resource

1. User chooses local file from a section placeholder or reference strip.
2. App validates file type, size, count, and duration.
3. User clicks upload/confirm for server upload if the file is going to company storage.
4. App calls upload endpoints.
5. App adds the uploaded server asset to the local UI.

### Generate Video

1. User builds prompt and reference strip.
2. User confirms generate.
3. App posts generation payload.
4. App polls task status.
5. App displays output video.
6. If subtitle removal is enabled, app submits subtitle removal and polls the second task.

## Error Handling

Show clear local states for:

- Missing login state.
- Expired session.
- Invalid canvas URL.
- Project id not found in URL.
- Canvas access denied.
- Snapshot shape unsupported.
- No supported media found.
- Upload validation failed.
- Upload request failed.
- Generate request rejected.
- Generate task failed.
- Subtitle removal failed.
- Output download failed.

Each error should include one next action:

- log in again
- retry
- choose different file
- inspect sanitized API map
- copy error message
- download original output

## Testing Strategy

### Unit Tests

- Canvas URL parser accepts normal canvas URLs and rejects invalid URLs.
- API response normalizer maps image/audio/video resources into UI assets.
- Upload payload builder includes `file`, `prefix`, and `projectId`.
- Generation payload builder uses `Seedance 2.0`, `9:16`, and `720p`.
- Task polling stops on success/failure and times out after a bounded number of attempts.

### Integration Tests With Mock API

- Auth success renders logged-in state.
- Expired auth blocks canvas loading.
- Snapshot response populates five UI sections.
- Upload success adds an uploaded asset.
- Generate success shows output video.
- Generate failure shows error state.

### Manual Company API Verification

These require the user's logged-in company account and may consume credits:

1. `GET /api/auth/me`.
2. `GET /api/projects/{projectId}/snapshot`.
3. One small image upload.
4. One small audio or video upload only if image upload confirms the flow.
5. One low-risk generate-video task.
6. One subtitle-removal task only after generation succeeds.

Before steps 3-6, the app or operator must make the side effect clear.

## Implementation Order

1. Add local API configuration and canvas URL parser.
2. Add session/auth status service.
3. Add typed API client and mockable request layer.
4. Add snapshot resource normalizer.
5. Wire "Load Canvas" into the UI.
6. Add upload client with local validation and server upload confirmation.
7. Add generation payload builder, submit action, and polling.
8. Add subtitle-removal flow.
9. Add sanitized API-map output for debugging.

Each step must be committed and pushed after verification.

## Open Questions For Implementation

These are discovery tasks, not blockers for writing the implementation plan:

1. Which exact cookie/header set is required outside the company web page?
2. What is the exact snapshot response shape for the target canvas?
3. Does asset upload require both storage upload and asset registration?
4. What is the exact `Seedance 2.0` model id expected by `POST /api/generate-video`?
5. Does generation need `/api/gen-queue` or `/api/asset/persist-task` for the result to appear in the company system?
6. Which subtitle-removal endpoint is the default path for this account?

## Approval Gate

After this document is committed, implementation must not start until the user confirms the design.
