#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import {
  bumpPatchVersion,
  createDryRunCommandPlan,
  createDryRunPlan,
  findReleaseAssets,
  giteeApiPath,
  validateLatestYmlForVersion,
  validateMainNotBehindGiteeMain,
  validateNoExistingRelease,
  validateReleaseBranch,
  validateCleanStatus,
  validateGiteeOnlyRemote,
} from "./releasePatchCore.mjs";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipBuild = args.has("--skip-build");

function run(command, args, options = {}) {
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

  for (const assetPath of [assets.latestYml, assets.installer]) {
    const form = new FormData();
    form.append("access_token", token);
    form.append("file", new Blob([readFileSync(assetPath)]), basename(assetPath));

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      body: form,
    });

    if (!uploadResponse.ok) {
      throw new Error(`上传 Gitee Release 附件失败：${assetPath}：${uploadResponse.status} ${await uploadResponse.text()}`);
    }
  }
}

async function main() {
  const status = run("git", ["status", "--short"]);
  const remoteOutput = run("git", ["remote", "-v"]);
  const currentBranch = run("git", ["branch", "--show-current"]).trim();
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

  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const nextVersion = bumpPatchVersion(packageJson.version);

  if (dryRun) {
    createDryRunCommandPlan({ version: nextVersion });

    if (!skipBuild) {
      const assets = findReleaseAssets(listReleasePaths(), nextVersion);
      validateLatestYmlForVersion(readFileSync(assets.latestYml, "utf8"), nextVersion);
    }

    console.log(await createDryRunPlan({ version: nextVersion }));
    return;
  }

  const token = process.env.GITEE_ACCESS_TOKEN;
  if (!token) {
    throw new Error("缺少 GITEE_ACCESS_TOKEN");
  }

  run("git", ["fetch", "gitee", "main", "--tags"], { stdio: "inherit" });
  const behindCount = run("git", ["rev-list", "--count", "HEAD..gitee/main"]).trim();
  validateMainNotBehindGiteeMain({ behindCount });

  const localTagsOutput = run("git", ["tag", "--list", `v${nextVersion}`]);
  const remoteTagsOutput = run("git", ["ls-remote", "--tags", "gitee", `v${nextVersion}`]);
  const releases = await listGiteeReleases(token);
  validateNoExistingRelease({ version: nextVersion, localTagsOutput, remoteTagsOutput, releases });

  run("npm", ["version", nextVersion, "--no-git-tag-version"], { stdio: "inherit" });

  if (!skipBuild) {
    run("npm", ["run", "dist:win:installer"], { stdio: "inherit" });
  }

  const assets = findReleaseAssets(listReleasePaths(), nextVersion);
  validateLatestYmlForVersion(readFileSync(assets.latestYml, "utf8"), nextVersion);

  run("git", ["add", "package.json", "package-lock.json"], { stdio: "inherit" });
  run("git", ["commit", "-m", `chore: release v${nextVersion}`], { stdio: "inherit" });
  run("git", ["tag", `v${nextVersion}`], { stdio: "inherit" });
  run("git", ["push", "gitee", "HEAD:main"], { stdio: "inherit" });
  run("git", ["push", "gitee", `v${nextVersion}`], { stdio: "inherit" });

  await createGiteeRelease({ token, version: nextVersion, assets });
  console.log(`released v${nextVersion} to gitee`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
