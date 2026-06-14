import { Download, Play, UserRound } from "lucide-react";

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="brand" aria-label="ovO">
        <span className="brand-mark">ovO</span>
        <span className="brand-subtitle">Create Video</span>
      </div>

      <div className="project-title">
        <span>未命名项目</span>
        <small>本地壳子 · 公司 API 待接入</small>
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
          <span>23176</span>
        </button>
      </div>
    </header>
  );
}
