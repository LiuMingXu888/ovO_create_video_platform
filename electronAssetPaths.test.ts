import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Vite production asset paths", () => {
  it("uses relative asset URLs so Electron can load built files from file://", () => {
    const viteConfig = fs.readFileSync(path.join(process.cwd(), "vite.config.ts"), "utf8");

    expect(viteConfig).toContain('base: "./"');
  });
});
