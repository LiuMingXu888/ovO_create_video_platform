import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  createUndoRedoHistory,
  MAX_HISTORY_DEPTH,
  pushCheckpoint,
  redo,
  undo,
  type CanvasStateSnapshot
} from "./undoRedoHistory";

function snap(name: string): CanvasStateSnapshot {
  return { assets: [], canvasSnapshot: null, canvasName: name, canvasUrl: `url-${name}` };
}

describe("undoRedoHistory", () => {
  it("starts empty with nothing to undo or redo", () => {
    const history = createUndoRedoHistory();
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it("pushCheckpoint enables undo and clears redo", () => {
    let history = createUndoRedoHistory();
    history = pushCheckpoint(history, snap("A"));
    expect(canUndo(history)).toBe(true);
    expect(canRedo(history)).toBe(false);
  });

  it("undo returns the pre-mutation state and moves current onto redo", () => {
    let history = createUndoRedoHistory();
    history = pushCheckpoint(history, snap("before"));

    const result = undo(history, snap("current"));
    expect(result).not.toBeNull();
    expect(result!.restored.canvasName).toBe("before");
    expect(canUndo(result!.history)).toBe(false);
    expect(canRedo(result!.history)).toBe(true);
  });

  it("redo re-applies the undone state and moves current back onto undo", () => {
    let history = createUndoRedoHistory();
    history = pushCheckpoint(history, snap("before"));
    const undone = undo(history, snap("current"))!;

    const result = redo(undone.history, snap("after-undo"));
    expect(result).not.toBeNull();
    expect(result!.restored.canvasName).toBe("current");
    expect(canUndo(result!.history)).toBe(true);
    expect(canRedo(result!.history)).toBe(false);
  });

  it("undo returns null when nothing to undo", () => {
    expect(undo(createUndoRedoHistory(), snap("x"))).toBeNull();
  });

  it("redo returns null when nothing to redo", () => {
    expect(redo(createUndoRedoHistory(), snap("x"))).toBeNull();
  });

  it("a fresh checkpoint after undo discards the redo branch", () => {
    let history = createUndoRedoHistory();
    history = pushCheckpoint(history, snap("A"));
    const undone = undo(history, snap("B"))!;
    expect(canRedo(undone.history)).toBe(true);

    const next = pushCheckpoint(undone.history, snap("C"));
    expect(canRedo(next)).toBe(false);
    expect(canUndo(next)).toBe(true);
  });

  it("round-trips through multiple checkpoints", () => {
    let history = createUndoRedoHistory();
    history = pushCheckpoint(history, snap("s1"));
    history = pushCheckpoint(history, snap("s2"));

    // current state is s3 (live), undo back to s2 then s1
    const u1 = undo(history, snap("s3"))!;
    expect(u1.restored.canvasName).toBe("s2");
    const u2 = undo(u1.history, u1.restored)!;
    expect(u2.restored.canvasName).toBe("s1");
    expect(canUndo(u2.history)).toBe(false);
  });

  it("caps the undo stack at MAX_HISTORY_DEPTH, dropping oldest", () => {
    let history = createUndoRedoHistory();
    for (let i = 0; i < MAX_HISTORY_DEPTH + 10; i += 1) {
      history = pushCheckpoint(history, snap(`s${i}`));
    }
    expect(history.undoStack.length).toBe(MAX_HISTORY_DEPTH);
    // oldest retained should be s10 (first 10 dropped)
    expect(history.undoStack[0].canvasName).toBe("s10");
  });
});
