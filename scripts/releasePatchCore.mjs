import yaml from "js-yaml";

export const GITEE_OWNER = "siberian-aries";
export const GITEE_REPO = "ov-o_create_video_platform";
export const GITEE_REMOTE_URL = "git@gitee.com:siberian-aries/ov-o_create_video_platform.git";

const GITEE_API_BASE = `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}`;
const RELEASE_FLAGS = new Set(["--dry-run", "--skip-build"]);

export function parseReleaseArgs(args) {
  for (const arg of args) {
    if (!RELEASE_FLAGS.has(arg)) {
      throw new Error(`未知发布参数：${arg}`);
    }
  }

  return {
    dryRun: args.includes("--dry-run"),
    skipBuild: args.includes("--skip-build"),
  };
}

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
  const lines = remoteOutput
    .split(/\r?\n/)
    .map((line) => line.trim());
  const giteeFetchLine = lines.find((line) => line.startsWith("gitee\t") && line.endsWith(" (fetch)"));
  const giteePushLine = lines.find((line) => line.startsWith("gitee\t") && line.endsWith(" (push)"));

  if (!giteeFetchLine) {
    throw new Error("缺少 gitee fetch remote");
  }

  if (!giteePushLine) {
    throw new Error("缺少 gitee push remote");
  }

  const fetchUrl = giteeFetchLine.replace(/^gitee\s+/, "").replace(/\s+\(fetch\)$/, "");
  const pushUrl = giteePushLine.replace(/^gitee\s+/, "").replace(/\s+\(push\)$/, "");
  if (fetchUrl !== GITEE_REMOTE_URL) {
    throw new Error(`gitee fetch remote 不正确：${fetchUrl}`);
  }

  if (pushUrl !== GITEE_REMOTE_URL) {
    throw new Error(`gitee push remote 不正确：${pushUrl}`);
  }

  return pushUrl;
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
  const latest = yaml.load(content);

  if (!latest || typeof latest !== "object" || Array.isArray(latest)) {
    throw new Error("latest.yml 格式不正确");
  }

  if (latest.version === undefined) {
    throw new Error("latest.yml 缺少目标版本");
  }

  if (String(latest.version) !== version) {
    throw new Error("latest.yml version 不匹配");
  }

  if (latest.path !== installerName) {
    throw new Error("latest.yml 未引用目标安装包");
  }

  if (typeof latest.sha512 !== "string" || !latest.sha512.trim()) {
    throw new Error("latest.yml 缺少 sha512");
  }

  if (!Array.isArray(latest.files) || latest.files.length === 0) {
    throw new Error("latest.yml 缺少 files");
  }

  const matchingFile = latest.files.find((file) => {
    if (!file || typeof file !== "object") {
      return false;
    }

    return file.url === installerName || file.path === installerName;
  });

  if (!matchingFile) {
    throw new Error("latest.yml files 未引用目标安装包");
  }

  if (typeof matchingFile.sha512 !== "string" || !matchingFile.sha512.trim()) {
    throw new Error("latest.yml file sha512 不正确");
  }

  if (matchingFile.size !== undefined && (typeof matchingFile.size !== "number" || matchingFile.size <= 0)) {
    throw new Error("latest.yml file size 不正确");
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
  return getReleaseCommandPlan({ dryRun: true, skipBuild: true, version });
}

export function getReleaseCommandPlan({ dryRun, skipBuild, version }) {
  const readCommands = [
    ["git", "status", "--short"],
    ["git", "remote", "-v"],
    ["git", "branch", "--show-current"],
  ];

  if (dryRun) {
    return {
      commands: readCommands,
      validateArtifacts: false,
      message: createDryRunMessage(version),
    };
  }

  const commands = [
    ...readCommands,
    ["git", "fetch", "gitee", "main:refs/remotes/gitee/main"],
    ["git", "rev-list", "--count", "HEAD..refs/remotes/gitee/main"],
    ["git", "tag", "--list", `v${version}`],
    ["git", "ls-remote", "--tags", "gitee", `v${version}`],
    ["npm", "version", version, "--no-git-tag-version"],
  ];

  if (!skipBuild) {
    commands.push(["npm", "run", "dist:win:installer"]);
  }

  commands.push(
    ["git", "add", "package.json", "package-lock.json"],
    ["git", "commit", "-m", `chore: release v${version}`],
    ["git", "tag", `v${version}`],
    ["git", "push", "--atomic", "gitee", "HEAD:main", `v${version}`],
  );

  return {
    commands,
    validateArtifacts: true,
    message: createDryRunMessage(version),
  };
}

export function getUploadAssetOrder(assets) {
  return [assets.installer, assets.latestYml];
}

function createDryRunMessage(version) {
  const assets = expectedReleaseAssets(version);
  return [
    `dry-run: would release v${version}`,
    `push gitee HEAD:main and v${version}`,
    `upload ${assets.latestYml} plus ${assets.installer}`,
  ].join(", and ");
}

export async function createDryRunPlan({ version }) {
  return createDryRunMessage(version);
}
