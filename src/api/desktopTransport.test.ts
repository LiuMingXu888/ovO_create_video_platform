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

  it("serializes real FormData bodies before sending them through the desktop bridge", async () => {
    const uploadFile = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      data: { publicUrl: "https://example.com/uploaded.png" }
    });
    vi.stubGlobal("window", {
      ovoDesktop: {
        api: {
          request: vi.fn(),
          uploadFile
        }
      }
    });

    const transport = new DesktopApiTransport();
    const formData = new FormData();
    formData.append("file", new File(["x"], "uploaded.png", { type: "image/png" }));

    await expect(transport.request("/api/upload-file", { method: "POST", body: formData })).resolves.toEqual({
      publicUrl: "https://example.com/uploaded.png"
    });
    expect(uploadFile).toHaveBeenCalledWith(
      "/api/upload-file",
      expect.objectContaining({
        fileName: "uploaded.png",
        mimeType: "image/png",
        prefix: "",
        bytes: expect.any(ArrayBuffer)
      })
    );
    expect(uploadFile.mock.calls[0][1]).not.toBeInstanceOf(FormData);
  });
});
