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

export async function createDryRunPlan({ version }) {
  const assets = expectedReleaseAssets(version);
  return [
    `dry-run: would release v${version}`,
    `push gitee main and v${version}`,
    `upload ${assets.latestYml} plus ${assets.installer}`,
  ].join(", and ");
}
