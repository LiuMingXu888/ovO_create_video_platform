#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import {
  bumpPatchVersion,
  createDryRunPlan,
  expectedReleaseAssets,
  findReleaseAssets,
  giteeApiPath,
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
  validateGiteeOnlyRemote(remoteOutput);

  if (!dryRun) {
    validateCleanStatus(status);
  } else if (status.trim()) {
    console.log("dry-run: 当前工作区有未提交变更；真实发布前必须清理工作区。");
  }

  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const nextVersion = bumpPatchVersion(packageJson.version);
  const expectedAssets = expectedReleaseAssets(nextVersion);

  if (dryRun) {
    if (!skipBuild) {
      findReleaseAssets(listReleasePaths(), nextVersion);
    }

    console.log(await createDryRunPlan({ version: nextVersion }));
    return;
  }

  const token = process.env.GITEE_ACCESS_TOKEN;
  if (!token) {
    throw new Error("缺少 GITEE_ACCESS_TOKEN");
  }

  run("npm", ["version", nextVersion, "--no-git-tag-version"], { stdio: "inherit" });

  if (!skipBuild) {
    run("npm", ["run", "dist:win:installer"], { stdio: "inherit" });
  }

  const assets = findReleaseAssets(listReleasePaths(), nextVersion);

  run("git", ["add", "package.json", "package-lock.json"], { stdio: "inherit" });
  run("git", ["commit", "-m", `chore: release v${nextVersion}`], { stdio: "inherit" });
  run("git", ["tag", `v${nextVersion}`], { stdio: "inherit" });
  run("git", ["push", "gitee", "main"], { stdio: "inherit" });
  run("git", ["push", "gitee", `v${nextVersion}`], { stdio: "inherit" });

  await createGiteeRelease({ token, version: nextVersion, assets });
  console.log(`released v${nextVersion} to gitee`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
