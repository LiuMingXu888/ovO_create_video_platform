import { describe, expect, it } from "vitest";
import { getManualUpdateButtonLabel, manualUpdateReducer, type ManualUpdateState } from "./manualUpdateState";

describe("manual update state", () => {
  it("labels every visible updater phase", () => {
    const states: Array<[ManualUpdateState, string]> = [
      [{ phase: "idle" }, "更新版本"],
      [{ phase: "checking" }, "检查中..."],
      [{ phase: "available", latestVersion: "0.1.2", message: "发现新版本 v0.1.2" }, "下载更新"],
      [{ phase: "downloading", percent: 45 }, "45%"],
      [{ phase: "downloaded", filePath: "C:/Temp/ovO.exe" }, "重启安装"],
      [{ phase: "latest", message: "当前已是最新版本 v0.1.1" }, "已是最新"],
      [{ phase: "error", message: "无法连接 Gitee，请检查网络或稍后重试" }, "更新失败"],
      [{ phase: "unsupported", message: "开发模式不检查更新" }, "开发模式"]
    ];

    for (const [state, label] of states) {
      expect(getManualUpdateButtonLabel(state)).toBe(label);
    }
  });

  it("transitions from checking to available when Gitee has a newer release", () => {
    const next = manualUpdateReducer(
      { phase: "checking" },
      {
        type: "check-result",
        result: {
          ok: true,
          status: "available",
          currentVersion: "0.1.1",
          latestVersion: "0.1.2",
          message: "发现新版本 v0.1.2",
          update: {
            releaseId: 7,
            tagName: "v0.1.2",
            version: "0.1.2",
            installerName: "ovO-0.1.2-x64-setup.exe",
            installerUrl: "https://gitee.com/setup.exe",
            latestYmlUrl: "https://gitee.com/latest.yml"
          }
        }
      }
    );

    expect(next).toEqual({
      phase: "available",
      latestVersion: "0.1.2",
      message: "发现新版本 v0.1.2"
    });
  });

  it("ignores stale progress after the manual update leaves downloading", () => {
    const state: ManualUpdateState = { phase: "error", message: "更新失败，请稍后重试" };

    const next = manualUpdateReducer(state, { type: "download-progress", percent: 67 });

    expect(next).toBe(state);
  });
});
