import { Download, Play, UserRound } from "lucide-react";
import type { AuthState, CanvasProject } from "../types";

interface AppHeaderProps {
  authState?: AuthState;
  project?: CanvasProject | null;
}

export function AppHeader({ authState = { status: "unknown" }, project = null }: AppHeaderProps) {
  const accountLabel =
    authState.status === "authenticated"
      ? authState.user.account ?? authState.user.name ?? "已登录"
      : authState.status === "checking"
        ? "检查中"
        : "未登录";

  return (
    <header className="app-header">
      <div className="brand" aria-label="ovO">
        <span className="brand-mark">ovO</span>
        <span className="brand-subtitle">Create Video</span>
      </div>

      <div className="project-title">
        <span>{project?.title ?? "未命名项目"}</span>
        <small>{project ? project.projectId : "本地壳子 · 公司 API 待接入"}</small>
      </div>

      <div className="header-actions">
        <button type="button" className="icon-button" title="预览" aria-label="预览">
          <Play size={18} />
        </button>
        <button type="button" className="icon-button" title="下载" aria-label="下载">
          <Download size={18} />
        </button>
        <button type="button" className="account-button" title="账户">
          <UserRound size={18} />
          <span>{accountLabel}</span>
        </button>
      </div>
    </header>
  );
}
