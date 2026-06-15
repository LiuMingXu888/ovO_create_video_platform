import { describe, expect, it } from "vitest";
import { checkCompanySession, COMPANY_AUTH_ME_URL, COMPANY_SESSION_PARTITION } from "./companySessionClient.js";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init
  });
}

describe("company session client", () => {
  it("uses the named persistent Electron partition for company login state", () => {
    expect(COMPANY_SESSION_PARTITION).toBe("persist:ovo-company-session");
  });

  it("checks auth through the injected Electron session fetcher", async () => {
    const requestedUrls: string[] = [];
    const result = await checkCompanySession(async (url, init) => {
      requestedUrls.push(url);
      expect(init?.headers).toEqual({ accept: "application/json" });
      return jsonResponse({ account: "23176" });
    });

    expect(requestedUrls).toEqual([COMPANY_AUTH_ME_URL]);
    expect(result).toEqual({ ok: true, user: { account: "23176" } });
  });

  it("reports invalid login state when the company auth endpoint rejects the session", async () => {
    const result = await checkCompanySession(async () => jsonResponse({ error: "unauthorized" }, { status: 401 }));

    expect(result).toEqual({ ok: false, message: "登录态无效：401" });
  });
});
