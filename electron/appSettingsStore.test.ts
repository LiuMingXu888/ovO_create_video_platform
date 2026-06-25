import { describe, expect, it } from "vitest";
import { resolveDownloadDir } from "./appSettingsStore.js";

describe("resolveDownloadDir", () => {
  it("uses configured dir when non-empty", () => {
    expect(resolveDownloadDir("/Users/mac/Downloads", "/tmp/out")).toBe("/tmp/out");
  });
  it("falls back to downloads when empty", () => {
    expect(resolveDownloadDir("/Users/mac/Downloads", "")).toBe("/Users/mac/Downloads");
    expect(resolveDownloadDir("/Users/mac/Downloads", "   ")).toBe("/Users/mac/Downloads");
  });
});
