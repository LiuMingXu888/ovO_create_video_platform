import { Coins, Download, LogOut, MousePointer2, RefreshCw, SquareCheck, UserRound, X } from "lucide-react";
import type { AuthState, CanvasProject } from "../types";
import { getManualUpdateButtonLabel, isManualUpdateBusy, type ManualUpdateState } from "../update/manualUpdateState";

interface AppHeaderProps {
  authState?: AuthState;
  project?: CanvasProject | null;
  selectionMode?: boolean;
  selectedCount?: number;
  totalAssetCount?: number;
  appVersion?: string;
  updateState?: ManualUpdateState;
  onToggleSelectionMode?: () => void;
  onSelectAllAssets?: () => void;
  onDownloadSelected?: () => void;
  onCancelSelectionMode?: () => void;
  onUpdateClick?: () => void;
  onLogout?: () => void;
}

export function AppHeader({
  authState = { status: "unknown" },
  project = null,
  selectionMode = false,
  selectedCount = 0,
  totalAssetCount = 0,
  appVersion = "0.1.1",
  updateState = { phase: "idle" },
  onToggleSelectionMode,
  onSelectAllAssets,
  onDownloadSelected,
  onCancelSelectionMode,
  onUpdateClick,
  onLogout
}: AppHeaderProps) {
  const accountLabel =
    authState.status === "authenticated"
      ? authState.user.account ?? authState.user.name ?? "已登录"
      : authState.status === "checking"
        ? "检查中"
        : "未登录";
  const creditLabel =
    authState.status === "authenticated" && authState.user.creditBalance !== undefined
      ? authState.user.creditBalance.toLocaleString("zh-CN")
      : "--";

  return (
    <header className="app-header">
      <div className="brand" aria-label="ovO">
        <span className="brand-mark">ovO</span>
        <span className="brand-version">v{appVersion}</span>
      </div>

      <div className="project-title">
        <span>{project?.title ?? "未命名项目"}</span>
        <small>{project ? project.projectId : "本地壳子 · 公司 API 待接入"}</small>
      </div>

      <div className="header-actions">
        {selectionMode ? (
          <>
            <button
              type="button"
              className="header-tool-button"
              aria-label="全选"
              onClick={onSelectAllAssets}
              disabled={totalAssetCount === 0}
            >
              <SquareCheck size={16} />
              <span>全选</span>
            </button>
            <button
              type="button"
              className="header-tool-button"
              aria-label={`下载选中 ${selectedCount}`}
              onClick={onDownloadSelected}
              disabled={selectedCount === 0}
            >
              <Download size={16} />
              <span>下载选中 {selectedCount}</span>
            </button>
            <button type="button" className="header-tool-button" aria-label="取消多选" onClick={onCancelSelectionMode}>
              <X size={16} />
              <span>取消</span>
            </button>
          </>
        ) : (
          <button type="button" className="header-tool-button" aria-label="多选下载" onClick={onToggleSelectionMode}>
            <MousePointer2 size={16} />
            <span>多选下载</span>
          </button>
        )}
        <div className="credit-pill" title="剩余积分" aria-label={`剩余积分 ${creditLabel}`}>
          <Coins size={16} />
          <span>{creditLabel}</span>
        </div>
        <button
          type="button"
          className={`header-tool-button update-button update-button-${updateState.phase}`}
          aria-label="手动更新"
          title={updateState.message ?? "从 Gitee 检查更新"}
          onClick={onUpdateClick}
          disabled={isManualUpdateBusy(updateState)}
        >
          <RefreshCw size={16} />
          <span>{getManualUpdateButtonLabel(updateState)}</span>
        </button>
        <button type="button" className="account-button" title="账户">
          <UserRound size={18} />
          <span>{accountLabel}</span>
        </button>
        <button
          type="button"
          className="header-tool-button"
          aria-label="退出登录"
          title="退出登录"
          onClick={onLogout}
          disabled={authState.status === "checking"}
        >
          <LogOut size={16} />
          <span>退出登录</span>
        </button>
      </div>
    </header>
  );
}
