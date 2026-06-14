import { describe, expect, it, vi } from "vitest";
import type { ApiTransport } from "./transport";
import { checkAuth } from "./authClient";

describe("checkAuth", () => {
  it("maps successful auth responses to authenticated state", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockResolvedValue({ id: "u1", account: "23176", name: "23176" })
    };

    await expect(checkAuth(transport)).resolves.toEqual({
      status: "authenticated",
      user: { id: "u1", account: "23176", name: "23176" }
    });
  });

  it("maps auth failures to unauthenticated state", async () => {
    const transport: ApiTransport = {
      request: vi.fn().mockRejectedValue({ status: 401, message: "Unauthorized" })
    };

    await expect(checkAuth(transport)).resolves.toEqual({
      status: "unauthenticated",
      message: "登录已失效，请重新登录"
    });
  });
});
