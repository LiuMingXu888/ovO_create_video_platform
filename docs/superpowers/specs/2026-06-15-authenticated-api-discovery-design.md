# Authenticated API Discovery Design

Date: 2026-06-15

## Goal

Run the real company canvas flow safely from the local desktop app: open the user's own logged-in company session, capture the exact API requests used by the target canvas, save only sanitized evidence, then enable typed read/upload/generation clients from confirmed request shapes.

This phase is an API discovery and session foundation phase. It does not automatically upload files, generate videos, remove subtitles, rename server assets, or save canvas state.

## User Approval Boundary

The user has asked for the app to "run the whole flow" and identify login, resource loading, upload, and generation APIs. Because some endpoints create server state or consume credits, the flow is split into two classes.

Allowed without extra confirmation after the user clicks the matching local button:

- Open the company canvas URL.
- Check `GET /api/auth/me`.
- Load the canvas page.
- Capture request metadata and sanitized response shape.
- Call read-only endpoints that the current logged-in user can already access:
  - `GET /api/auth/me`
  - `GET /api/projects/{projectId}/snapshot`
  - `GET /api/projects/{projectId}`
  - `GET /api/asset/list?...`
  - `GET /api/asset/{assetId}`
  - media proxy/download reads when explicitly downloading a selected asset

Requires explicit action-time confirmation in the UI:

- `POST /api/upload-file`
- `POST /api/upload-public`
- `POST /api/asset/upload`
- `POST /api/generate-video`
- `POST /api/gen-queue`
- `POST /api/asset/persist-task`
- `POST /api/subtitle-remove`
- `POST /api/subtitle-remove/ark`
- `PUT /api/projects/{projectId}/snapshot`
- `DELETE`, restore, logout, or any endpoint that mutates project/account state

## Recommended Approach

Use Electron as the owner of authenticated requests and Playwright as the discovery/login helper.

### Why This Approach

- The user logs in through the real company site, so the app never asks for passwords.
- Playwright can observe the same page requests the company canvas already makes.
- Electron main/preload can expose a small typed IPC surface to the React UI.
- Request clients stay testable because the renderer talks to typed local methods, not directly to browser internals.

### Rejected Alternatives

Manual cookie/token paste is rejected because it is fragile and unsafe.

Using Playwright for every normal app request is rejected as the primary runtime path because it is slower and harder to test. It remains useful for discovery, login, and fallback validation.

Hard-coding request bodies before observing a successful company request is rejected. The first real side-effecting implementation must be based on captured request shape and a dry-run preview.

## Local Data Policy

Private local data lives only in ignored directories:

- `storage/auth/storage-state.json`
- `storage/auth/session-check.json`
- `storage/api/captures/*.json`
- `storage/api/sanitized-api-map.json`
- `storage/assets/`
- `storage/outputs/`

Committed files may include:

- Endpoint paths.
- HTTP methods.
- Parameter names.
- Sanitized response shape, such as key names and value types.
- Example payloads with fake values.

Committed files must not include:

- Cookies.
- Bearer tokens.
- LocalStorage/sessionStorage values.
- Raw response bodies from company projects.
- Real signed media URLs.
- User account identifiers beyond already visible non-secret UI labels.
- Real company asset names copied from private responses unless already supplied by the user in this thread.
- HAR files.

## Discovery Flow

### Step 1: Login Session

1. User clicks `登录公司账号`.
2. Electron opens a controlled browser window at `http://qijing.kjjhz.cn`.
3. User logs in manually.
4. App waits for either:
   - successful `GET /api/auth/me`, or
   - user closes the login window.
5. On success, save Playwright storage state to `storage/auth/storage-state.json`.
6. Renderer shows authenticated state and account display text.

Failure states:

- Login window closed before auth succeeds: show `登录未完成`.
- Auth endpoint returns 401/403: show `登录态无效，请重新登录`.
- Network error: show retry action.

### Step 2: Open Target Canvas And Capture

1. User enters a canvas URL.
2. App parses the project id locally.
3. App opens the URL in a controlled browser context using saved storage state.
4. App listens to request and response events.
5. App records only request metadata:
   - method
   - pathname
   - query parameter names
   - request content type
   - request body key names and value types
   - response status
   - response content type
   - response body key names and value types
   - initiator category when available
6. App writes raw private capture only to ignored `storage/api/captures/`.
7. App writes a sanitized map to `storage/api/sanitized-api-map.json`.

The UI shows a discovery checklist:

- Auth check observed.
- Project snapshot observed.
- Asset list/detail observed.
- Upload endpoint observed.
- Generation endpoint observed.
- Subtitle endpoint observed.

Upload/generation/subtitle endpoints may be marked as "known from bundle, not executed" until the user explicitly performs that action later.

### Step 3: Confirm Read Clients

1. Use saved session to call `GET /api/auth/me`.
2. Use the parsed project id to call `GET /api/projects/{projectId}/snapshot`.
3. Normalize returned resources with the existing local normalizer.
4. Display image resources under `人物` by default, video under `视频`, audio under `音频`.
5. If snapshot does not contain enough media fields, call asset detail/list endpoints for enrichment.

This is the first real end-to-end "load canvas resources" milestone.

### Step 4: Side-Effect Dry Runs

Before enabling real uploads or generation, the app builds local previews:

- Upload preview:
  - selected file names
  - detected media types
  - validation result
  - target endpoint sequence
  - sanitized `FormData` field names
- Generate preview:
  - prompt
  - model `Seedance 2.0`
  - aspect ratio `9:16`
  - resolution `720p`
  - reference image/video/audio counts and names
  - exact endpoint to submit
- Subtitle preview:
  - source video URL origin/category only
  - selected route

The actual request button stays disabled until the user confirms the preview.

## UI Additions

Add a compact `接口发现` panel near the existing canvas controls.

Controls:

- `登录公司账号`
- `检查登录态`
- `打开画布并捕获接口`
- `导出脱敏接口地图`
- `清除本地登录态`

Status display:

- login status
- current account display
- project id
- discovered endpoint families
- last discovery timestamp
- warnings about missing upload/generation evidence

The panel must not show cookies, tokens, or raw response snippets.

## IPC Surface

Expose these placeholder-to-real methods through `window.ovoDesktop`:

```ts
interface OvoDesktopApi {
  version: string;
  auth: {
    openLoginWindow: () => Promise<{ ok: boolean; message?: string; user?: AuthUser }>;
    checkSession: () => Promise<{ ok: boolean; message?: string; user?: AuthUser }>;
    clearSession: () => Promise<{ ok: boolean; message?: string }>;
  };
  discovery: {
    inspectCanvas: (canvasUrl: string) => Promise<DiscoveryResult>;
    exportSanitizedApiMap: () => Promise<{ ok: boolean; path?: string; message?: string }>;
  };
}
```

The renderer must treat this API as optional so tests and browser preview still work without Electron.

## Test Strategy

Automated tests should cover logic without calling the company site:

- Canvas URL parsing for valid and invalid URLs.
- Capture sanitizer removes headers, cookies, token-like fields, signed URL query values, and raw response bodies.
- API map classifier groups paths into auth, snapshot, asset, upload, generation, subtitle, and unknown.
- IPC handlers return readable errors when no saved session exists.
- Renderer shows discovery status from mocked `window.ovoDesktop`.
- Upload/generation buttons require preview confirmation before side-effect calls.

Manual verification is required for the real company flow:

1. Start local app.
2. Click login.
3. Log in through company page.
4. Check session.
5. Paste `http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x`.
6. Open canvas and capture APIs.
7. Load read-only resources.
8. Confirm sanitized map contains endpoint paths and field shapes, with no secrets.

Manual upload/generation/subtitle verification must be a separate user-approved pass.

## Error Handling

Required user-facing messages:

- `未找到本地登录态，请先登录公司账号`
- `登录态已失效，请重新登录`
- `画布地址无效`
- `没有权限访问该画布`
- `接口发现未捕获到项目快照请求`
- `脱敏检查失败，已阻止导出`
- `该操作会上传文件到公司服务器，请确认`
- `该操作可能消耗生成额度，请确认`

## Implementation Milestones

1. Session storage and IPC foundation.
2. Playwright login window and auth check.
3. Request capture and sanitizer.
4. Sanitized API map classifier/export.
5. Read-only resource loading using saved session.
6. Upload dry-run preview.
7. Generation dry-run preview with confirmation gate.
8. User-approved real upload/generation/subtitle passes.

## Open Questions

These questions should be answered by discovery evidence, not guessing:

- Which cookies or headers are required for Electron-side `fetch`?
- Does `GET /api/projects/{projectId}/snapshot` contain all resource URLs, or must it be enriched by asset detail/list?
- Does upload require both file storage upload and asset registration for every media type?
- What exact `Seedance 2.0` model string does the production generation endpoint expect?
- Is subtitle removal route `/api/subtitle-remove` or `/api/subtitle-remove/ark` for the default product path?
- Does successful generation require `POST /api/asset/persist-task` to make output reusable?

## Approval Gate

After this spec is reviewed, create a separate implementation plan. The first implementation plan should stop at read-only authenticated discovery and resource loading. Real upload, real generation, and real subtitle removal should each get their own user-approved plan after the request shapes are confirmed.
