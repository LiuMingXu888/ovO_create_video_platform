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

  it("uses the ovO name and icon instead of Electron defaults", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "electron/main.ts"), "utf8");

    expect(source).toContain('app.setName("ovO")');
    expect(source).toContain("../resources/ovO.png");
    expect(source).toContain('title: "ovO"');
    expect(source).toContain("icon: appIconPath");
    expect(source).toContain("app.dock?.setIcon(appIconPath)");
  });
});
