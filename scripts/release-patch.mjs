#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import {
  bumpPatchVersion,
  createDryRunPlan,
  findReleaseAssets,
  getReleaseCommandPlan,
  getUploadAssetOrder,
  giteeApiPath,
  parseReleaseArgs,
  validateLatestYmlForVersion,
  validateMainNotBehindGiteeMain,
  validateNoExistingRelease,
  validateReleaseBranch,
  validateCleanStatus,
  validateGiteeOnlyRemote,
} from "./releasePatchCore.mjs";

const { dryRun, skipBuild } = parseReleaseArgs(process.argv.slice(2));

function run(commandParts, options = {}) {
  const [command, ...args] = commandParts;
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
}

function listReleasePaths() {
  const releaseDir = "release/windows";
  try {
    return readdirSync(releaseDir).map((entry) => join(releaseDir, entry).replaceAll("\\", "/"));
  } catch {
    return [];
  }
}

async function listGiteeReleases(token) {
  const response = await fetch(`${giteeApiPath("/releases")}?access_token=${encodeURIComponent(token)}&per_page=100`);
  if (!response.ok) {
    throw new Error(`查询 Gitee Release 失败：${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function createGiteeRelease({ token, version, assets }) {
  const releaseForm = new URLSearchParams({
    access_token: token,
    tag_name: `v${version}`,
    name: `v${version}`,
    body: `ovO v${version}`,
    prerelease: "false",
  });

  const releaseResponse = await fetch(giteeApiPath("/releases"), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: releaseForm,
  });

  if (!releaseResponse.ok) {
    throw new Error(`创建 Gitee Release 失败：${releaseResponse.status} ${await releaseResponse.text()}`);
  }

  const release = await releaseResponse.json();
  const uploadUrl = giteeApiPath(`/releases/${release.id}/attach_files`);

  for (const assetPath of getUploadAssetOrder(assets)) {
    const form = new FormData();
    form.append("access_token", token);
    form.append("file", new Blob([readFileSync(assetPath)]), basename(assetPath));

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      body: form,
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `上传 Gitee Release 附件失败：${assetPath}：${uploadResponse.status} ${await uploadResponse.text()}。Release 已创建，重新运行前请先清理 Gitee Release 附件或删除该 Release。`,
      );
    }
  }
}

async function main() {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const nextVersion = bumpPatchVersion(packageJson.version);
  const commandPlan = getReleaseCommandPlan({ dryRun, skipBuild, version: nextVersion });
  const [statusCommand, remoteCommand, branchCommand] = commandPlan.commands;
  const status = run(statusCommand);
  const remoteOutput = run(remoteCommand);
  const currentBranch = run(branchCommand).trim();
  validateGiteeOnlyRemote(remoteOutput);

  if (!dryRun) {
    validateCleanStatus(status);
    validateReleaseBranch(currentBranch);
  } else if (status.trim()) {
    console.log("dry-run: 当前工作区有未提交变更；真实发布前必须清理工作区。");
  }

  if (dryRun && currentBranch !== "main") {
    console.log("dry-run: 真实发布必须在 main 分支执行。");
  }

  if (dryRun) {
    console.log(await createDryRunPlan({ version: nextVersion }));
    return;
  }

  const token = process.env.GITEE_ACCESS_TOKEN;
  if (!token) {
    throw new Error("缺少 GITEE_ACCESS_TOKEN");
  }

  const commands = Object.fromEntries(commandPlan.commands.map((command) => [command.join(" "), command]));

  run(commands["git fetch gitee main:refs/remotes/gitee/main"], { stdio: "inherit" });
  const behindCount = run(commands["git rev-list --count HEAD..refs/remotes/gitee/main"]).trim();
  validateMainNotBehindGiteeMain({ behindCount });

  const localTagsOutput = run(commands[`git tag --list v${nextVersion}`]);
  const remoteTagsOutput = run(commands[`git ls-remote --tags gitee v${nextVersion}`]);
  const releases = await listGiteeReleases(token);
  validateNoExistingRelease({ version: nextVersion, localTagsOutput, remoteTagsOutput, releases });

  run(commands[`npm version ${nextVersion} --no-git-tag-version`], { stdio: "inherit" });

  if (!skipBuild) {
    run(commands["npm run dist:win:installer"], { stdio: "inherit" });
  }

  const assets = findReleaseAssets(listReleasePaths(), nextVersion);
  validateLatestYmlForVersion(readFileSync(assets.latestYml, "utf8"), nextVersion);

  run(commands["git add package.json package-lock.json"], { stdio: "inherit" });
  run(commands[`git commit -m chore: release v${nextVersion}`], { stdio: "inherit" });
  run(commands[`git tag v${nextVersion}`], { stdio: "inherit" });
  run(commands[`git push --atomic gitee HEAD:main v${nextVersion}`], { stdio: "inherit" });

  await createGiteeRelease({ token, version: nextVersion, assets });
  console.log(`released v${nextVersion} to gitee`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
