import type { CanvasAsset } from "../types";

/**
 * 快照式撤销/重做。
 *
 * 与"恢复历史记录"复用同一套服务端快照机制：每次破坏性操作（重命名、删除、
 * 批量删除、切换分类、恢复快照）发生前，先把"操作前"的整份画布状态压入 undo 栈，
 * redo 栈清空。撤销时弹出 undo 栈顶并把"当前态"压入 redo 栈；重做反之。
 *
 * 选择整份状态快照而非逐字段增量，是因为删除等操作在服务端没有简单的逆操作，
 * 用整份 canvasSnapshot 配合 restoreCanvasSnapshot 推回最稳妥，且能统一处理 5 类操作。
 */
export interface CanvasStateSnapshot {
  assets: CanvasAsset[];
  canvasSnapshot: unknown;
  canvasName: string;
  canvasUrl: string;
}

export interface UndoRedoState {
  undoStack: CanvasStateSnapshot[];
  redoStack: CanvasStateSnapshot[];
}

/** 栈深上限，避免长时间使用后内存无界增长。 */
export const MAX_HISTORY_DEPTH = 50;

export function createUndoRedoHistory(): UndoRedoState {
  return { undoStack: [], redoStack: [] };
}

export function canUndo(history: UndoRedoState): boolean {
  return history.undoStack.length > 0;
}

export function canRedo(history: UndoRedoState): boolean {
  return history.redoStack.length > 0;
}

/**
 * 在破坏性操作发生前调用：把"操作前"的状态压入 undo 栈，并清空 redo 栈
 * （新操作发生后，原先可重做的分支失效）。
 */
export function pushCheckpoint(history: UndoRedoState, snapshotBeforeMutation: CanvasStateSnapshot): UndoRedoState {
  const undoStack = [...history.undoStack, snapshotBeforeMutation];
  // 超出上限时丢弃最旧记录。
  if (undoStack.length > MAX_HISTORY_DEPTH) {
    undoStack.splice(0, undoStack.length - MAX_HISTORY_DEPTH);
  }
  return { undoStack, redoStack: [] };
}

/**
 * 撤销：返回需要恢复的"操作前"状态与新的历史栈；无可撤销时返回 null。
 * 调用方需提供"当前态"，它会被压入 redo 栈以便重做。
 */
export function undo(
  history: UndoRedoState,
  currentSnapshot: CanvasStateSnapshot
): { restored: CanvasStateSnapshot; history: UndoRedoState } | null {
  if (!canUndo(history)) {
    return null;
  }
  const restored = history.undoStack[history.undoStack.length - 1];
  return {
    restored,
    history: {
      undoStack: history.undoStack.slice(0, -1),
      redoStack: [...history.redoStack, currentSnapshot]
    }
  };
}

/**
 * 重做：返回需要恢复的状态与新的历史栈；无可重做时返回 null。
 * 调用方需提供"当前态"，它会被压回 undo 栈以便再次撤销。
 */
export function redo(
  history: UndoRedoState,
  currentSnapshot: CanvasStateSnapshot
): { restored: CanvasStateSnapshot; history: UndoRedoState } | null {
  if (!canRedo(history)) {
    return null;
  }
  const restored = history.redoStack[history.redoStack.length - 1];
  return {
    restored,
    history: {
      undoStack: [...history.undoStack, currentSnapshot],
      redoStack: history.redoStack.slice(0, -1)
    }
  };
}
