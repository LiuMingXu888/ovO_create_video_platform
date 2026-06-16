import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Electron main lifecycle", () => {
  it("quits when every window is closed so the local dev server can be released", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "electron/main.ts"), "utf8");

    expect(source).toContain('app.on("window-all-closed", () => {');
    expect(source).not.toContain('process.platform !== "darwin"');
    expect(source).toContain("app.quit();");
  });
});
