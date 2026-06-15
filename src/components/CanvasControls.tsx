import { Link, Loader2, LogIn, RefreshCw } from "lucide-react";
import type { AuthState } from "../types";

interface CanvasControlsProps {
  canvasUrl: string;
  authState: AuthState;
  loading: boolean;
  errorMessage?: string;
  notice?: string;
  onCanvasUrlChange: (value: string) => void;
  onOpenLogin: () => void;
  onCheckAuth: () => void;
  onLoadCanvas: () => void;
}

export function CanvasControls({
  canvasUrl,
  authState,
  loading,
  errorMessage,
  notice,
  onCanvasUrlChange,
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
      {notice && <div className="canvas-status-line">{notice}</div>}
      {errorMessage && <div className="canvas-error-line">{errorMessage}</div>}
    </section>
  );
}
