import { describe, expect, it, vi } from "vitest";
import { FetchApiTransport } from "./transport";

describe("FetchApiTransport", () => {
  it("returns parsed JSON for successful requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true })
    });
    const transport = new FetchApiTransport("https://qijing.kjjhz.cn", fetchMock as unknown as typeof fetch);

    await expect(transport.request("/api/auth/me")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("https://qijing.kjjhz.cn/api/auth/me", {
      body: undefined,
      credentials: "include",
      headers: { Accept: "application/json" },
      method: "GET"
    });
  });

  it("throws a readable error for failed requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Unauthorized" })
    });
    const transport = new FetchApiTransport("https://qijing.kjjhz.cn", fetchMock as unknown as typeof fetch);

    await expect(transport.request("/api/auth/me")).rejects.toMatchObject({
      status: 401,
      message: "Unauthorized"
    });
  });
});
