import { describe, expect, it } from "vitest";
import { normalizeCompanyWindowUrl, validateCompanyApiPath } from "./companySessionClient.js";

describe("company API proxy", () => {
  it("allows only company API paths through the Electron session proxy", () => {
    expect(validateCompanyApiPath("/api/projects/cmq/snapshot")).toEqual({ ok: true });
    expect(validateCompanyApiPath("https://evil.example/api/projects")).toEqual({
      ok: false,
      message: "仅允许请求公司 /api/ 接口"
    });
    expect(validateCompanyApiPath("/canvas/cmq")).toEqual({
      ok: false,
      message: "仅允许请求公司 /api/ 接口"
    });
  });
});

describe("normalizeCompanyWindowUrl", () => {
  it("keeps company canvas URLs and falls back for non-http URLs", () => {
    expect(normalizeCompanyWindowUrl("http://qijing.kjjhz.cn/canvas/cmq")).toBe("http://qijing.kjjhz.cn/canvas/cmq");
    expect(normalizeCompanyWindowUrl("file:///tmp/x")).toBe("http://qijing.kjjhz.cn");
  });
});
