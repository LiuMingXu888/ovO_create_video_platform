import { describe, expect, it } from "vitest";
import { validateCompanyApiPath } from "./companySessionClient.js";

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
