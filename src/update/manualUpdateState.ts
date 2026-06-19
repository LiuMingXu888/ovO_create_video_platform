export type ManualUpdateState =
  | { phase: "idle"; message?: string }
  | { phase: "checking"; message?: string }
  | { phase: "available"; latestVersion: string; message: string }
  | { phase: "downloading"; percent: number; message?: string }
  | { phase: "downloaded"; filePath: string; message?: string }
  | { phase: "latest"; message: string }
  | { phase: "unsupported"; message: string }
  | { phase: "error"; message: string };

type CheckResult =
  | {
      ok: true;
      status: "latest";
      currentVersion: string;
      latestVersion: string;
      message: string;
    }
  | {
      ok: true;
      status: "available";
      currentVersion: string;
      latestVersion: string;
      message: string;
      update?: unknown;
    }
  | {
      ok: false;
      status: "unsupported" | "error";
      currentVersion: string;
      message: string;
    };

export type ManualUpdateAction =
  | { type: "start-check" }
  | { type: "check-result"; result: CheckResult }
  | { type: "start-download" }
  | { type: "download-progress"; percent: number }
  | { type: "downloaded"; filePath: string; message?: string }
  | { type: "install-error"; message: string }
  | { type: "reset" };

export function manualUpdateReducer(state: ManualUpdateState, action: ManualUpdateAction): ManualUpdateState {
  switch (action.type) {
    case "start-check":
      return { phase: "checking" };
    case "check-result":
      if (!action.result.ok) {
        return action.result.status === "unsupported"
          ? { phase: "unsupported", message: action.result.message }
          : { phase: "error", message: action.result.message };
      }

      if (action.result.status === "latest") {
        return { phase: "latest", message: action.result.message };
      }

      return {
        phase: "available",
        latestVersion: action.result.latestVersion,
        message: action.result.message
      };
    case "start-download":
      return { phase: "downloading", percent: 0 };
    case "download-progress":
      if (state.phase !== "downloading") {
        return state;
      }

      return { phase: "downloading", percent: action.percent };
    case "downloaded":
      return { phase: "downloaded", filePath: action.filePath, message: action.message };
    case "install-error":
      return { phase: "error", message: action.message };
    case "reset":
      return { phase: "idle" };
  }
}

export function getManualUpdateButtonLabel(state: ManualUpdateState) {
  switch (state.phase) {
    case "idle":
      return "更新";
    case "checking":
      return "检查中...";
    case "available":
      return "下载更新";
    case "downloading":
      return `${state.percent}%`;
    case "downloaded":
      return "重启安装";
    case "latest":
      return "已是最新";
    case "unsupported":
      return "开发模式";
    case "error":
      return "更新失败";
  }
}

export function isManualUpdateBusy(state: ManualUpdateState) {
  return state.phase === "checking" || state.phase === "downloading";
}
