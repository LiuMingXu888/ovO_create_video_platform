import { useState, type ReactNode } from "react";
import { Check, ExternalLink, History, Link, Loader2, Plus, RefreshCw, Redo2, Save, Trash2, Undo2 } from "lucide-react";
import type { CanvasHistoryEntry } from "../lib/canvasHistory";
import type { SnapshotMeta } from "../lib/canvasSnapshots";
import { formatSnapshotTimestamp } from "../lib/canvasSnapshots";
import type { AuthState } from "../types";

interface CanvasControlsProps {
  canvasUrl: string;
  canvasName: string;
  canvasHistory: CanvasHistoryEntry[];
  authState: AuthState;
  loading: boolean;
  errorMessage?: string;
  snapshotHistory: SnapshotMeta[];
  onCanvasUrlChange: (value: string) => void;
  onCanvasNameChange: (value: string) => void;
  onSaveCanvasName: () => void;
  onSelectCanvasHistory: (entry: CanvasHistoryEntry) => void;
  onDeleteCanvasHistory: (entry: CanvasHistoryEntry) => void;
  onNewCanvas: () => void;
  onOpenCompanyCanvas: (mode: "plain" | "devtools" | "capture") => void;
  onLoadCanvas: () => void;
  onSaveSnapshot: () => void;
  onOpenSnapshotHistory: () => void;
  onRestoreSnapshot: (id: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenQijing: () => void;
  searchSlot?: ReactNode;
}

export function CanvasControls({
  canvasUrl,
  canvasName,
  canvasHistory,
  authState,
  loading,
  errorMessage,
  snapshotHistory,
  onCanvasUrlChange,
  onCanvasNameChange,
  onSaveCanvasName,
  onSelectCanvasHistory,
  onDeleteCanvasHistory,
  onNewCanvas,
  onOpenCompanyCanvas,
  onLoadCanvas,
  onSaveSnapshot,
  onOpenSnapshotHistory,
  onRestoreSnapshot,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenQijing,
  searchSlot
}: CanvasControlsProps) {
  const [snapshotPopoverOpen, setSnapshotPopoverOpen] = useState(false);

  const authLabel =
    authState.status === "authenticated"
      ? `已登录：${authState.user.account ?? authState.user.name ?? "公司账号"}`
      : authState.status === "checking"
        ? "正在检查登录态"
        : authState.status === "unauthenticated"
          ? authState.message
          : "未检查登录态";

  const canOpen = authState.status === "authenticated" && !loading;

  function toggleSnapshotPopover() {
    if (!snapshotPopoverOpen) onOpenSnapshotHistory();
    setSnapshotPopoverOpen((v) => !v);
  }

  return (
    <section className="canvas-controls" aria-label="画布加载">
      {/* 左列：历史画布侧栏 */}
      <div className="canvas-history-panel" aria-label="历史画布">
        <button type="button" className="canvas-history-new" onClick={onNewCanvas} disabled={loading}>
          <Plus size={15} />
          <span>新增画布</span>
        </button>
        {canvasHistory.map((entry) => (
          <div key={`${entry.projectId ?? entry.url}-${entry.createdAt}`} className="canvas-history-item-row">
            <button
              type="button"
              className={`canvas-history-item${entry.url === canvasUrl ? " canvas-history-item-active" : ""}`}
              title={entry.url}
              aria-label={`打开画布 ${entry.name}`}
              onClick={() => onSelectCanvasHistory(entry)}
              disabled={loading}
            >
              {entry.name}
            </button>
            <button
              type="button"
              className="canvas-history-delete"
              title={`删除历史画布 ${entry.name}`}
              aria-label={`删除历史画布 ${entry.name}`}
              onClick={() => onDeleteCanvasHistory(entry)}
              disabled={loading}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* 中列：名称 / 地址+奇境 / 动作 / 状态 */}
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

        <div className="canvas-url-row">
          <div className="canvas-url-field">
            <Link size={18} />
            <input
              value={canvasUrl}
              onChange={(event) => onCanvasUrlChange(event.currentTarget.value)}
              placeholder="粘贴画布地址，例如 http://qijing.kjjhz.cn/canvas/..."
            />
          </div>
          <button type="button" className="secondary-button" onClick={onOpenQijing} disabled={!canOpen} title="在带地址栏的浏览器中打开奇境">
            <ExternalLink size={16} />
            <span>打开奇境</span>
          </button>
        </div>

        <div className="canvas-control-actions">
          <button type="button" className="primary-button" onClick={onLoadCanvas} disabled={loading}>
            {loading ? <Loader2 size={16} /> : <RefreshCw size={16} />}
            <span>获取画布资源</span>
          </button>
          <button type="button" className="secondary-button" onClick={onSaveSnapshot} disabled={loading}>
            <Save size={16} />
            <span>保存记录</span>
          </button>
          <div className="canvas-snapshot-restore-wrapper">
            <button type="button" className="secondary-button" onClick={toggleSnapshotPopover} disabled={loading}>
              <History size={16} />
              <span>恢复历史记录</span>
            </button>
            {snapshotPopoverOpen && (
              <div className="canvas-snapshot-popover" role="listbox" aria-label="快照历史列表">
                {snapshotHistory.length === 0 ? (
                  <div className="canvas-snapshot-empty">暂无历史记录</div>
                ) : (
                  snapshotHistory.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="canvas-snapshot-item"
                      role="option"
                      aria-selected={false}
                      onClick={() => { onRestoreSnapshot(item.id); setSnapshotPopoverOpen(false); }}
                    >
                      <span className="canvas-snapshot-time">{formatSnapshotTimestamp(item.createdAt)}</span>
                      <span className="canvas-snapshot-count">{item.assetCount} 个资源</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className="secondary-button icon-only-button"
            onClick={onUndo}
            disabled={loading || !canUndo}
            title="撤销上一步"
            aria-label="撤销上一步"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            className="secondary-button icon-only-button"
            onClick={onRedo}
            disabled={loading || !canRedo}
            title="重做下一步"
            aria-label="重做下一步"
          >
            <Redo2 size={16} />
          </button>
        </div>

        <div className="canvas-status-line">{loading ? "正在连接公司接口" : authLabel}</div>
        {errorMessage && <div className="canvas-error-line">{errorMessage}</div>}
      </div>

      {/* 右列：三个公司画布按钮，顶部与名称行对齐 */}
      <div className="canvas-open-buttons">
        <button type="button" className="secondary-button" onClick={() => onOpenCompanyCanvas("plain")} disabled={!canOpen}>
          <ExternalLink size={16} />
          <span>Open公司画布</span>
        </button>
        <button type="button" className="secondary-button" onClick={() => onOpenCompanyCanvas("devtools")} disabled={!canOpen}>
          <ExternalLink size={16} />
          <span>Open公司画布(DevTools)</span>
        </button>
        <button type="button" className="secondary-button" onClick={() => onOpenCompanyCanvas("capture")} disabled={!canOpen}>
          <ExternalLink size={16} />
          <span>Open公司画布(API Fetch)</span>
        </button>
        {searchSlot && <div className="canvas-open-buttons-search">{searchSlot}</div>}
      </div>
    </section>
  );
}
