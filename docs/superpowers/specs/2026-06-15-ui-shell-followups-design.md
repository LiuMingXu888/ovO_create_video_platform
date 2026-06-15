# UI Shell Followups Design

Date: 2026-06-15

## Goal

Implement the requested `feature/ui-shell` followups for the desktop canvas shell: browser-like login address display, credit visibility and refresh, stable generation controls, repaired upload/node creation, media card action ordering, tokenized prompt references, and multi-select downloads.

## Scope

This change stays inside the existing Electron + React app in `/Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell`. It should preserve the current company-session model and the existing canvas resource loading flow.

## Requirements

1. The company login window shows a browser-style address bar above the web contents. The bar must display the current page URL, update during navigation, and provide a copy action.
2. The right side of the app header shows the current credit balance when discoverable. The known current visible balance is `23136`; implementation must not hard-code that value.
3. Credit data is refreshed after login/check-auth, before generation, after generation completion, and after video persistence/return.
4. The generate panel shows the current credit cost using `durationSeconds * 10`, so `15s` displays `150`.
5. Prompt and generate panel heights stay fixed while the duration slider is dragged or while the prompt focus changes. Slider changes must not resize the generate button.
6. Uploading image/audio/video into a loaded company canvas must not fail with `formData.get is not a function`. Uploaded media nodes must include default canvas coordinates at `x: 0`, `y: 0`.
7. Video and audio cards swap the positions of `+` and play/pause controls.
8. Clicking `+` on image/video/audio creates a colored prompt token, not plain text. Tokens must visually distinguish media kind from normal prompt text.
9. Prompt tokens and the reference strip are the same reference collection. Removing a token removes the strip item. Removing a strip item removes the token. A token deletes as a single unit.
10. The app header adds a multi-select download mode. In multi-select mode, every asset card shows a top-left checkbox. Selected assets can be downloaded together. The desktop download path creates a timestamped folder containing the selected resources. Cancelling multi-select hides all checkboxes and clears selection.

## Architecture

The prompt editor changes from a raw `textarea` to a small token editor component that owns text segments and reference token segments. The `references` array remains the canonical media-reference data for validation and generation; prompt text for generation is derived from editor segments.

Credit handling extends the existing auth state with an optional numeric balance. Balance extraction uses a defensive recursive scan over authenticated user payloads and future API payloads for likely credit fields. If no value is discoverable, the header displays `--`.

Desktop file saving gains a batch API so Electron can create a timestamped folder in the user's downloads directory. Browser fallback keeps per-file downloads.

Upload handling keeps the current `POST /api/upload-file` first, then snapshot-save flow. The Electron preload must accept only real `FormData`; renderer transport must avoid passing serialized objects as if they were `FormData`. New snapshot nodes include `position: { x: 0, y: 0 }` and top-level `x: 0`, `y: 0` fields for compatibility with common canvas shapes.

## Error Handling

- Login address copy failures show no blocking modal; the button remains usable.
- Unknown credit fields produce `--`, not an error.
- Batch download reports partial failures by returning failed file names/messages.
- Upload errors continue to surface in the existing canvas error line.

## Testing

Use Vitest and Testing Library for renderer behavior:

- Header displays credit values from auth payloads.
- Generate panel displays `duration * 10` cost and does not rely on focus-based resizing classes.
- Prompt tokens are inserted, colored by kind, and synchronize with the reference strip on deletion from either place.
- Asset cards show selectable checkboxes only in multi-select mode.
- Batch download calls the desktop bridge with selected assets.

Use unit tests for upload and desktop transport:

- Upload nodes include default `x/y` coordinates.
- Desktop transport recognizes genuine `FormData`.
- Preload serialization rejects non-`FormData` with a readable error.

Manual verification:

- Run the app in Electron.
- Open login window and confirm address bar updates and copy works.
- Load the target canvas.
- Upload one image, one audio, and one video file.
- Verify prompt token insertion/deletion, slider stability, and multi-select UI.

