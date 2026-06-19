import { describe, expect, it, vi } from "vitest";

import {
  bumpPatchVersion,
  findReleaseAssets,
  giteeApiPath,
  GITEE_REMOTE_URL,
  validateCleanStatus,
  validateGiteeOnlyRemote,
  createDryRunPlan,
} from "./releasePatchCore.mjs";

describe("releasePatchCore", () => {
  it("bumps patch versions", () => {
    expect(bumpPatchVersion("0.1.0")).toBe("0.1.1");
    expect(bumpPatchVersion("1.2.9")).toBe("1.2.10");
  });

  it("validates clean git status", () => {
    expect(() => validateCleanStatus(" M src/App.tsx\n")).toThrow("发布前工作区必须干净");
    expect(() => validateCleanStatus("")).not.toThrow();
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

  it("rejects missing or wrong gitee push remotes", () => {
    expect(() =>
      validateGiteeOnlyRemote("origin\thttps://github.com/LiuMingXu888/ovO_create_video_platform.git (push)"),
    ).toThrow("缺少 gitee push remote");

    expect(() =>
      validateGiteeOnlyRemote("gitee\tgit@gitee.com:siberian-aries/wrong.git (push)"),
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

  it("plans dry-runs without executing mutation commands", async () => {
    const run = vi.fn();

    const plan = await createDryRunPlan({ version: "0.1.1", run });

    expect(run).not.toHaveBeenCalled();
    expect(plan).toContain("dry-run: would release v0.1.1");
    expect(plan).toContain("push gitee main and v0.1.1");
    expect(plan).toContain("release/windows/latest.yml");
    expect(plan).toContain("release/windows/ovO-0.1.1-x64-setup.exe");
  });
});
