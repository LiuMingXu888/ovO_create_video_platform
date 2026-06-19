# Gitee Manual Update Design

Date: 2026-06-19
Project: ovO_create_video_platform
Target app: `.worktrees/ui-shell`

## Goal

Add a release and update flow for the Windows ovO desktop app where the Windows machine only needs access to Gitee. Each release increments the patch version, publishes built Windows artifacts to Gitee Release, and lets the installed Windows app update manually from Gitee.

## Confirmed Decisions

- The Windows machine can access Gitee but should not depend on GitHub or other external services.
- The Windows user runs an installed or portable desktop app, not source code.
- The update button downloads a prebuilt Windows installer or portable package from Gitee Release.
- Version numbers use automatic patch increments, such as `0.1.0 -> 0.1.1`.
- Release publishing pushes only to the `gitee` remote:
  `git@gitee.com:siberian-aries/ov-o_create_video_platform.git`.
- The GitHub remote may remain configured locally, but the release command must not push to GitHub.
- The app header shows the current version next to the `ovO` logo.
- The app header includes a manual update button between the credit pill and account button.

## Release Flow

Create a release command, for example `npm run release:patch`, scoped to the app package in `.worktrees/ui-shell`.

The command should:

1. Verify the release worktree is clean.
2. Increment the app patch version in `package.json` and `package-lock.json`.
3. Build the Windows app and updater metadata with Electron Builder.
4. Commit the version change and create a matching tag, such as `v0.1.1`.
5. Push `main` and the release tag to the `gitee` remote only.
6. Create or update the matching Gitee Release.
7. Upload the Windows artifacts required for updates, including the NSIS installer and `latest.yml`.

The release script should fail before pushing if required Gitee credentials are missing. It must not require GitHub credentials.

## Update Source

Use Gitee Release as the update source. The Windows client should check the Gitee release feed or generated update metadata for the latest version.

The update flow must not clone the repository, pull the `main` branch, install dependencies, run Node, or build on the Windows user's machine.

## Header UI

The header layout should stay close to the existing `AppHeader` structure:

- Brand area: show `ovO` plus a compact version badge such as `v0.1.1` immediately to the right of the logo.
- Actions area: preserve the existing multi-select/download controls and credit pill.
- Add a manual update button between the credit pill and account button.
- Keep logout as the final action.

Suggested button states:

- Idle: `更新`
- Checking: `检查中...`
- Update available: `下载更新`
- Downloading: show percent, such as `45%`
- Downloaded: `重启安装`
- No update: transient message `已是最新`
- Error: `更新失败`, with the error detail available by title, tooltip, or nearby compact text

The update button should be visible in development mode but disabled or handled with a clear message such as `开发模式不检查更新`.

## Electron Architecture

The Electron main process owns update checks and downloads. The renderer should call preload-exposed methods rather than contacting Gitee directly.

Recommended bridge shape:

```ts
window.ovoDesktop.updater = {
  getCurrentVersion(): Promise<string>,
  checkForUpdates(): Promise<UpdateCheckResult>,
  downloadUpdate(): Promise<UpdateDownloadResult>,
  installUpdate(): Promise<void>,
  onStatus(listener): () => void,
  onProgress(listener): () => void
}
```

The exact names can follow local conventions, but the boundary should remain:

- Renderer: button state, labels, progress display.
- Preload: safe IPC wrapper.
- Main process: Gitee update feed, download, install/restart.

## Version Display

The displayed version should come from build metadata or Electron app/package metadata. Do not duplicate a hard-coded React version string.

The current `window.ovoDesktop.version = "0.1.0"` should be replaced or backed by the same source used for packaging, so the header and installer version cannot drift.

## Error Handling

The updater should preserve the current app if anything fails.

Required user-facing cases:

- Gitee unreachable: `无法连接 Gitee，请检查网络或稍后重试`.
- No newer release: `当前已是最新版本 vX.Y.Z`.
- Update metadata missing or incomplete: `更新包不完整`.
- Download failure: `下载失败，可重试`.
- Installation postponed or cancelled: keep the current version and allow retry.
- Development mode: `开发模式不检查更新`.

## Tests

Unit tests:

- Header renders `ovO` with the current version badge.
- Update button sits between the credit pill and account button.
- Update button state machine covers idle, checking, available, downloading, downloaded, latest, and error states.
- Development mode disables or short-circuits update checks.

Electron/main-process tests:

- Updater IPC handlers are registered.
- Gitee feed URL points to the Gitee repository, not GitHub.
- Update errors are normalized before reaching the renderer.
- Version lookup uses package/app metadata instead of a duplicated string.

Release script tests or dry-run checks:

- Patch version increments correctly.
- Release command refuses dirty worktrees.
- Release command pushes to `gitee` only.
- Release command prepares or uploads the artifacts needed by Electron updates.

Manual Windows acceptance:

1. Install version `v0.1.1` on Windows.
2. Publish `v0.1.2` to Gitee Release.
3. Open the installed Windows app.
4. Confirm the header shows `ovO v0.1.1`.
5. Click the update button.
6. Confirm the app checks Gitee, downloads the update, and offers restart/install.
7. Restart/install.
8. Confirm the header shows `ovO v0.1.2`.

## Out Of Scope

- GitHub publishing.
- Background automatic update checks.
- Updating by cloning source code.
- Windows-side Node/npm/Git dependency installation.
- In-app account or project data migration beyond preserving the existing Electron app data.
