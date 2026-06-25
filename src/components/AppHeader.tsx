import { Coins, Download, LogIn, LogOut, MousePointer2, RefreshCw, SquareCheck, Trash2, UserRound, X } from "lucide-react";
import type { AuthState, CanvasProject } from "../types";
import { getManualUpdateButtonLabel, isManualUpdateBusy, type ManualUpdateState } from "../update/manualUpdateState";
import { ModeSwitch, type AppMode } from "./ModeSwitch";

interface AppHeaderProps {
  authState?: AuthState;
  project?: CanvasProject | null;
  selectionMode?: boolean;
  selectedCount?: number;
  totalAssetCount?: number;
  appVersion?: string;
  appMode?: AppMode;
  onModeChange?: (mode: AppMode) => void;
  updateState?: ManualUpdateState;
  onToggleSelectionMode?: () => void;
  onSelectAllAssets?: () => void;
  onDownloadSelected?: () => void;
  onDeleteSelected?: () => void;
  onCancelSelectionMode?: () => void;
  onUpdateClick?: () => void;
  onOpenLogin?: () => void;
  onLogout?: () => void;
}

export function AppHeader({
  authState = { status: "unknown" },
  project = null,
  selectionMode = false,
  selectedCount = 0,
  totalAssetCount = 0,
  appVersion = "0.1.1",
  appMode = "free",
  onModeChange,
  updateState = { phase: "idle" },
  onToggleSelectionMode,
  onSelectAllAssets,
  onDownloadSelected,
  onDeleteSelected,
  onCancelSelectionMode,
  onUpdateClick,
  onOpenLogin,
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
        {onModeChange ? <ModeSwitch mode={appMode} onModeChange={onModeChange} /> : null}
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
            <button
              type="button"
              className="header-tool-button"
              aria-label={`删除选中 ${selectedCount}`}
              onClick={onDeleteSelected}
              disabled={selectedCount === 0}
            >
              <Trash2 size={16} />
              <span>删除选中 {selectedCount}</span>
            </button>
            <button type="button" className="header-tool-button" aria-label="取消多选" onClick={onCancelSelectionMode}>
              <X size={16} />
              <span>取消</span>
            </button>
          </>
        ) : (
          <button type="button" className="header-tool-button" aria-label="多选" onClick={onToggleSelectionMode}>
            <MousePointer2 size={16} />
            <span>多选</span>
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
        {authState.status === "authenticated" && (
          <div className="account-button" title="账户" aria-label={`已登录 ${accountLabel}`}>
            <UserRound size={18} />
            <span>{accountLabel}</span>
          </div>
        )}
        {authState.status === "checking" && (
          <div className="account-button" title="账户">
            <UserRound size={18} />
            <span>检查中</span>
          </div>
        )}
        {authState.status === "authenticated" ? (
          <button
            type="button"
            className="header-tool-button"
            aria-label="退出账户"
            title="退出账户"
            onClick={onLogout}
          >
            <LogOut size={16} />
            <span>退出账户</span>
          </button>
        ) : (
          <button
            type="button"
            className="header-tool-button"
            aria-label="登录账号"
            title="登录账号"
            onClick={onOpenLogin}
            disabled={authState.status === "checking"}
          >
            <LogIn size={16} />
            <span>登录账号</span>
          </button>
        )}
      </div>
    </header>
  );
}
