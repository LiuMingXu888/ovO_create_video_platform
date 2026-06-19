import { describe, expect, it } from "vitest";

import {
  bumpPatchVersion,
  createDryRunCommandPlan,
  findReleaseAssets,
  getReleaseCommandPlan,
  giteeApiPath,
  GITEE_REMOTE_URL,
  getUploadAssetOrder,
  parseReleaseArgs,
  validateLatestYmlForVersion,
  validateNoExistingRelease,
  validateReleaseBranch,
  validateCleanStatus,
  validateGiteeOnlyRemote,
  createDryRunPlan,
} from "./releasePatchCore.mjs";

const validLatestYml = [
  "version: 0.1.2",
  "path: ovO-0.1.2-x64-setup.exe",
  "sha512: top-level-sha512",
  "files:",
  "  - url: ovO-0.1.2-x64-setup.exe",
  "    sha512: file-sha512",
  "    size: 12345",
].join("\n");

describe("releasePatchCore", () => {
  it("parses only known release flags", () => {
    expect(parseReleaseArgs(["--dry-run"])).toEqual({ dryRun: true, skipBuild: false });
    expect(parseReleaseArgs(["--dry-run", "--skip-build"])).toEqual({ dryRun: true, skipBuild: true });
    expect(parseReleaseArgs(["--skip-build"])).toEqual({ dryRun: false, skipBuild: true });
    expect(() => parseReleaseArgs(["--dryrun"])).toThrow("未知发布参数：--dryrun");
  });

  it("bumps patch versions", () => {
    expect(bumpPatchVersion("0.1.0")).toBe("0.1.1");
    expect(bumpPatchVersion("1.2.9")).toBe("1.2.10");
  });

  it("validates clean git status", () => {
    expect(() => validateCleanStatus(" M src/App.tsx\n")).toThrow("发布前工作区必须干净");
    expect(() => validateCleanStatus("")).not.toThrow();
  });

  it("requires real releases to run from main", () => {
    expect(() => validateReleaseBranch("feature/ui-shell")).toThrow("发布必须在 main 分支执行");
    expect(() => validateReleaseBranch("main")).not.toThrow();
  });

  it("uses only the exact gitee push remote when origin also exists", () => {
    const remoteOutput = [
      "gitee\tgit@gitee.com:siberian-aries/ov-o_create_video_platform.git (fetch)",
      "gitee\tgit@gitee.com:siberian-aries/ov-o_create_video_platform.git (push)",
      "origin\thttps://github.com/LiuMingXu888/ovO_create_video_platform.git (fetch)",
      "origin\thttps://github.com/LiuMingXu888/ovO_create_video_platform.git (push)",
    ].join("\n");

    expect(validateGiteeOnlyRemote(remoteOutput)).toBe(GITEE_REMOTE_URL);
  });

  it("requires exact gitee fetch and push remotes", () => {
    const wrongFetchRemoteOutput = [
      "gitee\thttps://gitee.com/siberian-aries/ov-o_create_video_platform.git (fetch)",
      "gitee\tgit@gitee.com:siberian-aries/ov-o_create_video_platform.git (push)",
    ].join("\n");

    expect(() => validateGiteeOnlyRemote(wrongFetchRemoteOutput)).toThrow("gitee fetch remote 不正确");

    const exactRemoteOutput = [
      "gitee\tgit@gitee.com:siberian-aries/ov-o_create_video_platform.git (fetch)",
      "gitee\tgit@gitee.com:siberian-aries/ov-o_create_video_platform.git (push)",
    ].join("\n");

    expect(validateGiteeOnlyRemote(exactRemoteOutput)).toBe(GITEE_REMOTE_URL);
  });

  it("rejects missing or wrong gitee push remotes", () => {
    expect(() =>
      validateGiteeOnlyRemote("gitee\tgit@gitee.com:siberian-aries/ov-o_create_video_platform.git (fetch)"),
    ).toThrow("缺少 gitee push remote");

    expect(() =>
      validateGiteeOnlyRemote(
        [
          "gitee\tgit@gitee.com:siberian-aries/ov-o_create_video_platform.git (fetch)",
          "gitee\tgit@gitee.com:siberian-aries/wrong.git (push)",
        ].join("\n"),
      ),
    ).toThrow("gitee push remote 不正确");
  });

  it("builds gitee API paths", () => {
    expect(giteeApiPath("/releases")).toBe(
      "https://gitee.com/api/v5/repos/siberian-aries/ov-o_create_video_platform/releases",
    );
  });

  it("finds Windows release assets", () => {
    expect(
      findReleaseAssets(["release/windows/ovO-0.1.2-x64-setup.exe", "release/windows/latest.yml"], "0.1.2"),
    ).toEqual({
      installer: "release/windows/ovO-0.1.2-x64-setup.exe",
      latestYml: "release/windows/latest.yml",
    });
  });

  it("validates latest.yml references the target installer", () => {
    expect(() => validateLatestYmlForVersion(validLatestYml, "0.1.2")).not.toThrow();
    expect(() =>
      validateLatestYmlForVersion(
        [
          "version: 0.1.2",
          "path: ovO-0.1.1-x64-setup.exe",
          "sha512: top-level-sha512",
          "files:",
          "  - url: ovO-0.1.2-x64-setup.exe",
          "    sha512: file-sha512",
        ].join("\n"),
        "0.1.2",
      ),
    ).toThrow(
      "latest.yml 未引用目标安装包",
    );
  });

  it("rejects stale or comment-only latest.yml installer references", () => {
    expect(() => validateLatestYmlForVersion("path: ovO-0.1.2-x64-setup.exe\n", "0.1.2")).toThrow(
      "latest.yml 缺少目标版本",
    );

    expect(() =>
      validateLatestYmlForVersion(
        [
          "version: 0.1.1",
          "path: ovO-0.1.2-x64-setup.exe",
          "sha512: top-level-sha512",
          "files:",
          "  - url: ovO-0.1.2-x64-setup.exe",
          "    sha512: file-sha512",
        ].join("\n"),
        "0.1.2",
      ),
    ).toThrow("latest.yml version 不匹配");

    expect(() =>
      validateLatestYmlForVersion(
        [
          "version: 0.1.2",
          "# ovO-0.1.2-x64-setup.exe",
          "path: other.exe",
          "sha512: top-level-sha512",
          "files:",
          "  - url: other.exe",
          "    sha512: file-sha512",
        ].join("\n"),
        "0.1.2",
      ),
    ).toThrow("latest.yml 未引用目标安装包");
  });

  it("rejects latest.yml missing top-level sha512", () => {
    expect(() =>
      validateLatestYmlForVersion(
        [
          "version: 0.1.2",
          "path: ovO-0.1.2-x64-setup.exe",
          "files:",
          "  - url: ovO-0.1.2-x64-setup.exe",
          "    sha512: file-sha512",
        ].join("\n"),
        "0.1.2",
      ),
    ).toThrow("latest.yml 缺少 sha512");
  });

  it("rejects latest.yml missing files array", () => {
    expect(() =>
      validateLatestYmlForVersion(
        [
          "version: 0.1.2",
          "path: ovO-0.1.2-x64-setup.exe",
          "sha512: top-level-sha512",
        ].join("\n"),
        "0.1.2",
      ),
    ).toThrow("latest.yml 缺少 files");
  });

  it("rejects latest.yml without a matching file entry", () => {
    expect(() =>
      validateLatestYmlForVersion(
        [
          "version: 0.1.2",
          "path: ovO-0.1.2-x64-setup.exe",
          "sha512: top-level-sha512",
          "files:",
          "  - url: other.exe",
          "    sha512: file-sha512",
        ].join("\n"),
        "0.1.2",
      ),
    ).toThrow("latest.yml files 未引用目标安装包");
  });

  it("rejects latest.yml matching file entries without sha512", () => {
    expect(() =>
      validateLatestYmlForVersion(
        [
          "version: 0.1.2",
          "path: ovO-0.1.2-x64-setup.exe",
          "sha512: top-level-sha512",
          "files:",
          "  - url: ovO-0.1.2-x64-setup.exe",
        ].join("\n"),
        "0.1.2",
      ),
    ).toThrow("latest.yml file sha512 不正确");
  });

  it("rejects latest.yml matching file entries with non-positive size", () => {
    expect(() =>
      validateLatestYmlForVersion(
        [
          "version: 0.1.2",
          "path: ovO-0.1.2-x64-setup.exe",
          "sha512: top-level-sha512",
          "files:",
          "  - url: ovO-0.1.2-x64-setup.exe",
          "    sha512: file-sha512",
          "    size: 0",
        ].join("\n"),
        "0.1.2",
      ),
    ).toThrow("latest.yml file size 不正确");
  });

  it("rejects existing local tag, remote tag, or gitee release before mutation", () => {
    expect(() =>
      validateNoExistingRelease({
        version: "0.1.2",
        localTagsOutput: "v0.1.2\n",
        remoteTagsOutput: "",
        releases: [],
      }),
    ).toThrow("本地 tag 已存在");

    expect(() =>
      validateNoExistingRelease({
        version: "0.1.2",
        localTagsOutput: "",
        remoteTagsOutput: "abc123\trefs/tags/v0.1.2\n",
        releases: [],
      }),
    ).toThrow("Gitee tag 已存在");

    expect(() =>
      validateNoExistingRelease({
        version: "0.1.2",
        localTagsOutput: "",
        remoteTagsOutput: "",
        releases: [{ tag_name: "v0.1.2" }],
      }),
    ).toThrow("Gitee Release 已存在");

    expect(() =>
      validateNoExistingRelease({
        version: "0.1.2",
        localTagsOutput: "",
        remoteTagsOutput: "",
        releases: [{ tag_name: "v0.1.1" }],
      }),
    ).not.toThrow();
  });

  it("describes dry-run release actions as text", async () => {
    const plan = await createDryRunPlan({ version: "0.1.1" });

    expect(plan).toContain("dry-run: would release v0.1.1");
    expect(plan).toContain("push gitee HEAD:main and v0.1.1");
    expect(plan).toContain("release/windows/latest.yml");
    expect(plan).toContain("release/windows/ovO-0.1.1-x64-setup.exe");
  });

  it("keeps dry-run command plans free of mutation commands", () => {
    const plan = createDryRunCommandPlan({ version: "0.1.1" });
    const executableCommands = plan.commands.map((command) => command.join(" "));

    expect(executableCommands).not.toContain("npm version 0.1.1 --no-git-tag-version");
    expect(executableCommands).not.toContain("npm run dist:win:installer");
    expect(executableCommands).not.toContain("git add package.json package-lock.json");
    expect(executableCommands).not.toContain("git commit -m chore: release v0.1.1");
    expect(executableCommands).not.toContain("git tag v0.1.1");
    expect(executableCommands).not.toContain("git push gitee HEAD:main");
    expect(executableCommands).not.toContain("git push gitee v0.1.1");
    expect(plan.message).toContain("push gitee HEAD:main and v0.1.1");
  });

  it("plans real release preflight with fresh gitee main data and separate remote tag checks", () => {
    const plan = getReleaseCommandPlan({ dryRun: false, skipBuild: false, version: "0.1.1" });
    const executableCommands = plan.commands.map((command) => command.join(" "));

    expect(executableCommands).toContain("git fetch gitee main:refs/remotes/gitee/main");
    expect(executableCommands).toContain("git rev-list --count HEAD..refs/remotes/gitee/main");
    expect(executableCommands).toContain("git ls-remote --tags gitee v0.1.1");
    expect(executableCommands).toContain("git push --atomic gitee HEAD:main v0.1.1");
    expect(executableCommands).not.toContain("git push gitee HEAD:main");
    expect(executableCommands).not.toContain("git push gitee v0.1.1");
    expect(executableCommands).not.toContain("git fetch gitee main --tags");
  });

  it("uses the CLI dry-run plan with read-only commands", () => {
    const plan = getReleaseCommandPlan({ dryRun: true, skipBuild: true, version: "0.1.1" });
    const executableCommands = plan.commands.map((command) => command.join(" "));

    expect(executableCommands).toEqual([
      "git status --short",
      "git remote -v",
      "git branch --show-current",
    ]);
    expect(executableCommands).not.toContain("npm version 0.1.1 --no-git-tag-version");
    expect(executableCommands).not.toContain("npm run dist:win:installer");
    expect(executableCommands).not.toContain("git add package.json package-lock.json");
    expect(executableCommands).not.toContain("git commit -m chore: release v0.1.1");
    expect(executableCommands).not.toContain("git tag v0.1.1");
    expect(executableCommands).not.toContain("git push gitee HEAD:main");
    expect(plan.message).toContain("push gitee HEAD:main and v0.1.1");
  });

  it("keeps dry-run plans read-only with or without skip-build", () => {
    for (const skipBuild of [false, true]) {
      const plan = getReleaseCommandPlan({ dryRun: true, skipBuild, version: "0.1.1" });
      const executableCommands = plan.commands.map((command) => command.join(" "));

      expect(executableCommands).toEqual([
        "git status --short",
        "git remote -v",
        "git branch --show-current",
      ]);
      expect(executableCommands).not.toContain("npm run dist:win:installer");
      expect(plan.validateArtifacts).toBe(false);
      expect(plan.message).toContain("push gitee HEAD:main and v0.1.1");
    }
  });

  it("uploads installer before latest.yml", () => {
    expect(
      getUploadAssetOrder({
        installer: "release/windows/ovO-0.1.1-x64-setup.exe",
        latestYml: "release/windows/latest.yml",
      }),
    ).toEqual(["release/windows/ovO-0.1.1-x64-setup.exe", "release/windows/latest.yml"]);
  });
});
