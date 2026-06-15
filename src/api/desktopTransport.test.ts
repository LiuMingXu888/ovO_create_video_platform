import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopApiTransport } from "./desktopTransport";

describe("DesktopApiTransport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads company API data through the Electron desktop bridge", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      data: { title: "接口项目" }
    });
    vi.stubGlobal("window", {
      ovoDesktop: {
        api: { request }
      }
    });

    const transport = new DesktopApiTransport();

    await expect(transport.request("/api/projects/cmq/snapshot")).resolves.toEqual({ title: "接口项目" });
    expect(request).toHaveBeenCalledWith("/api/projects/cmq/snapshot", { method: "GET" });
  });

  it("throws a readable error when the desktop bridge reports a failed company API request", async () => {
    vi.stubGlobal("window", {
      ovoDesktop: {
        api: {
          request: vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            message: "Unauthorized",
            data: { error: "Unauthorized" }
          })
        }
      }
    });

    const transport = new DesktopApiTransport();

    await expect(transport.request("/api/projects/cmq/snapshot")).rejects.toMatchObject({
      status: 401,
      message: "Unauthorized"
    });
  });
});
