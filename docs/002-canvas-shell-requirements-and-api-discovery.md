# Canvas Shell Requirements And API Discovery

Date: 2026-06-15

## Purpose

This document records the updated product requirements and the first Chrome discovery pass against:

`http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x`

The product is a local shell over the company's existing canvas APIs. It does not replace company services. It changes the interaction model so asset discovery, prompt assembly, upload, and video generation are faster and less frustrating.

No implementation should start until this document is reviewed and approved.

## Chrome Discovery Result

The page opened successfully in Chrome with the existing logged-in session.

Observed page title:

`奇镜 Agent - AI 短剧创作工作台`

Observed account signal in the page header:

`23176`

Observed project title:

`未命名项目 (5) (2)`

Observed rendered resources include images such as:

- 小区楼道
- 高铁站
- 小区走廊参考
- 男主秦扬人脸参考
- 男主· 西装革履
- 绿色行李箱

Observed page asset inventory:

- Images: 83
- Videos: 3
- Other requests/resources: 16
- Scripts: 31
- Stylesheets: 1

The current Chrome execution environment allowed reading page structure, page assets, and front-end bundles. It did not allow direct `fetch` or `XMLHttpRequest` from the read-only page scope, so full response-body probing still needs a later implementation/debug pass using Playwright or app-side request code.

## Confirmed API Endpoints From Page And Bundles

### User And Session

- `GET /api/auth/me`
- `POST /api/auth/logout`

The front-end also references:

- `qijing_auth_token`
- `qijing_session`

These are implementation clues only. The local app must not commit or expose tokens, cookies, or storage-state files.

### Project And Canvas

- `GET /api/projects`
- `GET /api/projects/{projectId}`
- `DELETE /api/projects/{projectId}`
- `GET /api/projects/trash`
- `POST /api/projects/{projectId}/restore`
- `GET /api/projects/{projectId}/snapshot`
- `PUT /api/projects/{projectId}/snapshot`
- `POST /api/projects/{projectId}/share`
- `POST /api/projects/{projectId}/import-state`

The likely core endpoint for loading all canvas nodes/assets is:

`GET /api/projects/cmq6fwhft0bg5m2l5u78zby8x/snapshot`

The front-end saves canvas state with:

`PUT /api/projects/{projectId}/snapshot`

### Asset Library

- `GET /api/asset/list?statuses=Active&pageSize=100`
- `GET /api/asset/list?...`
- `GET /api/asset/{assetId}`
- `POST /api/asset/upload`
- `GET /api/library`
- `GET /api/library/groups`

The agent/search feature uses `GET /api/asset/list` and appears to support searching by `name`, `statuses`, and `pageSize`.

### Upload

- `POST /api/upload-public`
- `POST /api/upload-file`
- `POST /api/asset/upload`

Observed upload-file behavior from the front-end bundle:

- Uses `FormData`.
- Field `file` contains the selected local file.
- Field `prefix` is derived from the original filename without extension.
- Optional field `projectId` can be included.
- Response is expected to include `publicUrl`.

Observed asset upload behavior:

- `POST /api/asset/upload`
- JSON body contains asset metadata.
- Error response may include `error`, `errorCode`, `errorDetail`, and `assetName`.

Upload calls change server state. They must not be triggered without explicit user confirmation.

### Video Generation

- `POST /api/generate-video`
- `GET /api/generate-video/{taskId}`
- `GET /api/gen-queue?projectId={projectId}`
- `POST /api/gen-queue`
- `POST /api/asset/persist-task`

Observed generation payload fields from front-end code include:

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

Observed default video model hints:

- Canvas node default: `Seedance 2.0`
- Drama workbench batch default: `Seedance 2.0 fast`
- Default resolution seen in code: `720p` in the drama workbench path; some canvas node creation paths use `1080p`.

For this product, version 1 default should be:

- Aspect ratio: `9:16`
- Model: `Seedance 2.0`
- Resolution: `720p`

Video generation can consume credits or create server tasks. It must not be triggered without explicit user confirmation.

### Subtitle Removal

- `POST /api/subtitle-remove`
- `GET /api/subtitle-remove/{taskId}`
- `POST /api/subtitle-remove/ark`
- `GET /api/subtitle-remove/ark/{taskId}`

Observed subtitle-removal payload includes a source `videoUrl`. The front-end polls until `succeeded` or `failed`.

Subtitle removal can create server tasks. It must not be triggered without explicit user confirmation.

### Download And Proxy

- `GET /api/video-proxy?url={encodedUrl}`
- `GET /api/download-proxy?url={encodedUrl}&filename={encodedFilename}`

Observed direct media storage host:

- `https://aimanju-caojia.oss-cn-hangzhou.aliyuncs.com/...`

Observed external avatar/resource host:

- `https://s3-imfile.feishucdn.com/...`

## Product Layout Requirements

### Overall Layout

- Top-left shows an `ovO` logo.
- The interface should benchmark the simplicity of Jimeng-style asset prompting.
- Main asset sections:
  - 人物
  - 场景
  - 道具
  - 音频
  - 视频
- Each section has a header and a drawer-style collapse/expand control on the right.
- Collapsed sections hide their grid content.
- Expanded sections show resource cards.

### Resource Grid

- Every video card uses a `9:16` visual ratio.
- Use a six-column grid on desktop.
- Images, videos, audio, scenes, characters, and props use the same interaction model, but their visual card presentation may differ by media type.
- If a section has no data, show at least one upload placeholder card with a plus sign.
- Clicking a placeholder opens local file selection.
- Upload can select multiple files.
- There is no product-level upload count limit for library sections unless the company API rejects it.
- Uploaded asset display name defaults to the local filename.

### Resource Card Actions

Each resource card has three actions:

1. Preview or enlarge.
2. Download.
3. Add to prompt.

Clicking the plus action appends a reference token or asset mention into the fixed prompt area.

### Prompt Area

- The prompt input area is fixed near the bottom center of the screen.
- It has two fixed sizes:
  - Compact size when blurred.
  - Expanded size when focused.
- The prompt box does not move around while the user scrolls resource sections.
- If text exceeds the visible area, the prompt box scrolls internally.
- The prompt area has a reference-material strip above it.
- The reference-material strip has a plus placeholder for local upload.

### Reference Material Strip

The strip above the prompt is the final generation input collection area.

Supported input limits:

- Images: up to 9 files.
- Image size: each image under 30 MB.
- Image formats: JPEG, PNG, WebP, and compatible image formats accepted by the server.
- Videos: up to 3 files.
- Video size: each video under 50 MB.
- Video duration: all selected videos combined must be 2 to 15 seconds.
- Video formats: MP4 and MOV only.
- Audio: up to 3 files.
- Audio duration: all selected audio combined must be at most 15 seconds.
- Audio size: each audio under 15 MB.
- Audio formats: MP3 and WAV.
- Mixed total: images + videos + audio combined must not exceed 12 files. This is a hard limit.

The app must validate these constraints before upload or generation.

## Core Version 1 Features

### 1. Load Canvas

Input:

- Canvas URL.

Behavior:

- Extract project id from the URL.
- Use saved login state.
- Load canvas snapshot and asset list.
- Normalize resources into:
  - character image assets
  - scene image assets
  - prop image assets
  - audio assets
  - video assets

Current uncertainty:

- The existing canvas appears to store characters, scenes, and props as image nodes without a strict server-side category. The app may need a local classification layer.

### 2. Upload Assets

Behavior:

- User selects local images, videos, or audio.
- App validates type, count, size, and duration limits.
- App uploads through company APIs.
- Uploaded asset name should default to local filename.

Need to verify:

- Whether `POST /api/upload-file` is enough for all media types.
- Whether `POST /api/asset/upload` is required after file upload to register the asset in the asset library.
- Whether renaming image/audio/video assets causes server-side issues.

### 3. Rename Assets

Behavior:

- User can edit image, audio, and video display names.
- App should preserve original filename and server id internally.

Need to verify:

- Whether renaming is only stored in canvas snapshot node data.
- Whether renaming requires asset-library update.
- Whether changing names affects generation payloads.

### 4. Generate Video

Default generation settings:

- Model: `Seedance 2.0`
- Aspect ratio: `9:16`
- Resolution: `720p`

Behavior:

- User builds prompt and reference-material strip.
- User clicks generate.
- App submits a video generation task.
- App polls task status.
- App displays output video.
- App supports download.

Need to verify:

- Required `POST /api/generate-video` payload shape for Seedance 2.0.
- Whether `generateAudio` should default to true or false.
- Whether project id must be included.
- Whether generation should also create a `/api/gen-queue` entry.

### 5. Remove Subtitles

Behavior:

- User can enable subtitle removal for generated or imported videos.
- App submits subtitle-removal task.
- App polls status.
- App replaces or adds the subtitle-free output.

Need to verify:

- Whether default route should use `/api/subtitle-remove` or `/api/subtitle-remove/ark`.

## Implementation Guardrails

- Do not read or commit browser cookies, localStorage dumps, tokens, or private API payloads.
- Do not upload files without explicit user confirmation.
- Do not trigger generation or subtitle-removal without explicit user confirmation.
- Do not push captured private project data to GitHub.
- Commit and push every small verified feature to GitHub.
- Before each feature, write or update a document and wait for user confirmation.

## First Proposed Implementation Slice

Build only the local UI shell first:

- Electron + React + TypeScript app.
- Static layout matching this document.
- `ovO` logo.
- Collapsible sections for 人物, 场景, 道具, 音频, 视频.
- Six-column `9:16` resource card grid on desktop.
- Empty-state plus placeholders.
- Fixed prompt box with compact and expanded focus states.
- Reference-material strip with local validation logic, but no server upload yet.

This slice has no company API side effects and can be reviewed visually before connecting real APIs.

## Questions To Confirm

1. For version 1, should characters, scenes, and props be separated by a local manual classification if the company API only returns image assets?
2. For the first UI implementation, should every section be expanded by default, or should only 视频 be expanded like the reference sketch?
3. Should the generation reference strip be the only source sent to `generate-video`, or should clicking plus on a resource also insert a textual marker into the prompt?
4. Are generation and subtitle-removal allowed to be tested on the company account after you explicitly approve, even if they consume credits?
