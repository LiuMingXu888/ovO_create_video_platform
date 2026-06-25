import { describe, expect, it } from "vitest";
import { buildSnapshotEntry, formatSnapshotTimestamp } from "./canvasSnapshots";
import type { CanvasAsset } from "../types";

const mockAsset = (id: string): CanvasAsset =>
  ({ id, name: "n", kind: "image", category: "scenes", url: "http://x/y", status: "ready" }) as CanvasAsset;

describe("buildSnapshotEntry", () => {
  it("id 由 createdAt 派生，assetCount 等于 assets 长度", () => {
    const now = new Date("2026-06-25T10:00:00.000Z");
    const entry = buildSnapshotEntry(
      { projectId: "p1", canvasName: "test", canvasUrl: "http://x", assets: [mockAsset("a1"), mockAsset("a2")], canvasSnapshot: {} },
      now
    );
    expect(entry.createdAt).toBe("2026-06-25T10:00:00.000Z");
    expect(entry.id).toBe("2026-06-25T10-00-00-000Z");
    expect(entry.assetCount).toBe(2);
  });

  it("assets 为空时 assetCount 为 0", () => {
    const entry = buildSnapshotEntry(
      { projectId: "p1", canvasName: "test", canvasUrl: "http://x", assets: [], canvasSnapshot: null },
      new Date("2026-06-25T00:00:00.000Z")
    );
    expect(entry.assetCount).toBe(0);
  });
});

describe("formatSnapshotTimestamp", () => {
  it("格式为 YYYY年MM月DD日 HH:mm:ss", () => {
    const result = formatSnapshotTimestamp("2026-06-25T10:00:00.000Z");
    expect(result).toMatch(/^\d{4}年\d{2}月\d{2}日 \d{2}:\d{2}:\d{2}$/);
  });
});
