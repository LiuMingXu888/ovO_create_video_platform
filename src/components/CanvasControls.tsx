import { Check, Link, Loader2, LogIn, Plus, RefreshCw } from "lucide-react";
import type { CanvasHistoryEntry } from "../lib/canvasHistory";
import type { AuthState } from "../types";

interface CanvasControlsProps {
  canvasUrl: string;
  canvasName: string;
  canvasHistory: CanvasHistoryEntry[];
  authState: AuthState;
  loading: boolean;
  errorMessage?: string;
  notice?: string;
  onCanvasUrlChange: (value: string) => void;
  onCanvasNameChange: (value: string) => void;
  onSaveCanvasName: () => void;
  onSelectCanvasHistory: (entry: CanvasHistoryEntry) => void;
  onNewCanvas: () => void;
  onOpenLogin: () => void;
  onCheckAuth: () => void;
  onLoadCanvas: () => void;
}

export function CanvasControls({
  canvasUrl,
  canvasName,
  canvasHistory,
  authState,
  loading,
  errorMessage,
  notice,
  onCanvasUrlChange,
  onCanvasNameChange,
  onSaveCanvasName,
  onSelectCanvasHistory,
  onNewCanvas,
  onOpenLogin,
  onCheckAuth,
  onLoadCanvas
}: CanvasControlsProps) {
  const authLabel =
    authState.status === "authenticated"
      ? `已登录：${authState.user.account ?? authState.user.name ?? "公司账号"}`
      : authState.status === "checking"
        ? "正在检查登录态"
        : authState.status === "unauthenticated"
          ? authState.message
          : "未检查登录态";

  return (
    <section className="canvas-controls" aria-label="画布加载">
      <div className="canvas-history-panel" aria-label="历史画布">
        <button type="button" className="canvas-history-new" onClick={onNewCanvas} disabled={loading}>
          <Plus size={15} />
          <span>新增画布</span>
        </button>
        {canvasHistory.map((entry) => (
          <button
            key={`${entry.projectId ?? entry.url}-${entry.createdAt}`}
            type="button"
            className={`canvas-history-item${entry.url === canvasUrl ? " canvas-history-item-active" : ""}`}
            title={entry.url}
            onClick={() => onSelectCanvasHistory(entry)}
            disabled={loading}
          >
            {entry.name}
          </button>
        ))}
      </div>

      <div className="canvas-main-panel">
        <div className="canvas-name-row">
          <input
            aria-label="当前画布名称"
            value={canvasName}
            onChange={(event) => onCanvasNameChange(event.currentTarget.value)}
            placeholder="给当前画布命名"
          />
          <button type="button" className="secondary-button icon-only-button" title="保存画布名称" aria-label="保存画布名称" onClick={onSaveCanvasName}>
            <Check size={16} />
          </button>
        </div>

        <div className="canvas-url-field">
          <Link size={18} />
          <input
            value={canvasUrl}
            onChange={(event) => onCanvasUrlChange(event.currentTarget.value)}
            placeholder="粘贴画布地址，例如 http://qijing.kjjhz.cn/canvas/..."
          />
        </div>

        <div className="canvas-control-actions">
          <button type="button" className="secondary-button" onClick={onOpenLogin} disabled={loading || authState.status === "checking"}>
            {authState.status === "checking" ? <Loader2 size={16} /> : <LogIn size={16} />}
            <span>登录公司账号</span>
          </button>
          <button type="button" className="secondary-button" onClick={onCheckAuth} disabled={loading}>
            {authState.status === "checking" ? <Loader2 size={16} /> : <LogIn size={16} />}
            <span>检查登录态</span>
          </button>
          <button type="button" className="primary-button" onClick={onLoadCanvas} disabled={loading}>
            {loading ? <Loader2 size={16} /> : <RefreshCw size={16} />}
            <span>加载画布资源</span>
          </button>
        </div>

        <div className="canvas-status-line">{loading ? "正在连接公司接口" : authLabel}</div>
        <div className="canvas-status-line">当前网址：{canvasUrl}</div>
        {notice && <div className="canvas-status-line">{notice}</div>}
        {errorMessage && <div className="canvas-error-line">{errorMessage}</div>}
      </div>
    </section>
  );
}
