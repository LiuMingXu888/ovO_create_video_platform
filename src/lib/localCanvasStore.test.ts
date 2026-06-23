import { describe, expect, it } from "vitest";
import {
  buildLocalCanvasStore,
  mergeCanvasState,
  migrateLocalCanvasStore,
  CURRENT_SCHEMA_VERSION
} from "./localCanvasStore";
import type { CanvasAsset } from "../types";

const baseAsset = (over: Partial<CanvasAsset>): CanvasAsset => ({
  id: "a1",
  name: "x",
  kind: "image",
  category: "characters",
  url: "u",
  sizeBytes: 0,
  ...over
});

describe("migrateLocalCanvasStore", () => {
  it("accepts a current-version object", () => {
    const store = buildLocalCanvasStore({
      projectId: "p1",
      canvasName: "n",
      canvasUrl: "c",
      assets: [],
      pendingTasks: []
    });
    expect(migrateLocalCanvasStore(store)?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("upgrades a legacy object without schemaVersion", () => {
    const legacy = {
      projectId: "p1",
      canvasName: "n",
      canvasUrl: "c",
      assets: [],
      pendingTasks: [],
      updatedAt: "t"
    };
    expect(migrateLocalCanvasStore(legacy)?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("returns null for non-objects or missing required fields", () => {
    expect(migrateLocalCanvasStore(null)).toBeNull();
    expect(migrateLocalCanvasStore("x")).toBeNull();
    expect(migrateLocalCanvasStore({ assets: [] })).toBeNull();
  });
});

describe("mergeCanvasState", () => {
  it("lets remote ready override local and clears the matching pending task", () => {
    const local = buildLocalCanvasStore({
      projectId: "p1",
      canvasName: "n",
      canvasUrl: "c",
      assets: [baseAsset({ id: "n1", status: "generating" })],
      pendingTasks: [{ nodeId: "n1", kind: "image", category: "characters", prompt: "p", startTime: 1, status: "running" }]
    });
    const remote = { assets: [baseAsset({ id: "n1", status: "ready", url: "remote" })] };
    const merged = mergeCanvasState(local, remote);
    expect(merged.assets.find((a) => a.id === "n1")?.status).toBe("ready");
    expect(merged.pendingTasks.find((t) => t.nodeId === "n1")).toBeUndefined();
  });

  it("keeps local generating asset and pending task when remote lacks that nodeId", () => {
    const local = buildLocalCanvasStore({
      projectId: "p1",
      canvasName: "n",
      canvasUrl: "c",
      assets: [baseAsset({ id: "n1", status: "generating" })],
      pendingTasks: [{ nodeId: "n1", kind: "image", category: "characters", prompt: "p", startTime: 1, status: "running" }]
    });
    const merged = mergeCanvasState(local, { assets: [] });
    expect(merged.assets.find((a) => a.id === "n1")?.status).toBe("generating");
    expect(merged.pendingTasks).toHaveLength(1);
  });

  it("uses remote directly with no pending tasks when local is null", () => {
    const merged = mergeCanvasState(null, { assets: [baseAsset({ id: "n1", status: "ready" })] });
    expect(merged.assets).toHaveLength(1);
    expect(merged.pendingTasks).toHaveLength(0);
  });
});
