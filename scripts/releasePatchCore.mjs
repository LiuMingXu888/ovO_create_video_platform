export const GITEE_OWNER = "siberian-aries";
export const GITEE_REPO = "ov-o_create_video_platform";
export const GITEE_REMOTE_URL = "git@gitee.com:siberian-aries/ov-o_create_video_platform.git";

const GITEE_API_BASE = `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}`;

export function bumpPatchVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`版本号格式不正确：${version}`);
  }

  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

export function validateCleanStatus(status) {
  if (status.trim()) {
    throw new Error("发布前工作区必须干净");
  }
}

export function validateReleaseBranch(branchName) {
  if (branchName.trim() !== "main") {
    throw new Error("发布必须在 main 分支执行");
  }
}

export function validateMainNotBehindGiteeMain({ behindCount }) {
  if (Number(behindCount) > 0) {
    throw new Error("本地 main 落后于 gitee/main");
  }
}

export function validateGiteeOnlyRemote(remoteOutput) {
  const giteePushLine = remoteOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("gitee\t") && line.endsWith(" (push)"));

  if (!giteePushLine) {
    throw new Error("缺少 gitee push remote");
  }

  const remoteUrl = giteePushLine.replace(/^gitee\s+/, "").replace(/\s+\(push\)$/, "");
  if (remoteUrl !== GITEE_REMOTE_URL) {
    throw new Error(`gitee push remote 不正确：${remoteUrl}`);
  }

  return remoteUrl;
}

export function giteeApiPath(pathname) {
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${GITEE_API_BASE}${normalizedPathname}`;
}

export function expectedReleaseAssets(version) {
  return {
    latestYml: "release/windows/latest.yml",
    installer: `release/windows/ovO-${version}-x64-setup.exe`,
  };
}

export function findReleaseAssets(paths, version) {
  const normalizedPaths = new Set(paths.map((path) => path.replaceAll("\\", "/")));
  const latestYml = "release/windows/latest.yml";
  const installer = version
    ? `release/windows/ovO-${version}-x64-setup.exe`
    : paths.map((path) => path.replaceAll("\\", "/")).find((path) => /^release\/windows\/ovO-\d+\.\d+\.\d+-x64-setup\.exe$/.test(path));

  if (!installer || !normalizedPaths.has(latestYml) || !normalizedPaths.has(installer)) {
    throw new Error("缺少 Windows 更新产物");
  }

  return { installer, latestYml };
}

export function validateLatestYmlForVersion(content, version) {
  const { installer } = expectedReleaseAssets(version);
  const installerName = installer.split("/").at(-1);

  if (!content.includes(installerName)) {
    throw new Error("latest.yml 未引用目标安装包");
  }
}

export function validateNoExistingRelease({ version, localTagsOutput, remoteTagsOutput, releases }) {
  const tag = `v${version}`;
  const localTags = localTagsOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (localTags.includes(tag)) {
    throw new Error(`本地 tag 已存在：${tag}`);
  }

  const hasRemoteTag = remoteTagsOutput
    .split(/\r?\n/)
    .some((line) => line.trim().endsWith(`refs/tags/${tag}`) || line.trim().endsWith(`refs/tags/${tag}^{}`));

  if (hasRemoteTag) {
    throw new Error(`Gitee tag 已存在：${tag}`);
  }

  if (releases.some((release) => release?.tag_name === tag)) {
    throw new Error(`Gitee Release 已存在：${tag}`);
  }
}

export function createDryRunCommandPlan({ version }) {
  return {
    commands: [
      ["git", "status", "--short"],
      ["git", "remote", "-v"],
      ["git", "branch", "--show-current"],
    ],
    message: createDryRunMessage(version),
  };
}

function createDryRunMessage(version) {
  const assets = expectedReleaseAssets(version);
  return [
    `dry-run: would release v${version}`,
    `push gitee main and v${version}`,
    `upload ${assets.latestYml} plus ${assets.installer}`,
  ].join(", and ");
}

export async function createDryRunPlan({ version }) {
  return createDryRunMessage(version);
}
