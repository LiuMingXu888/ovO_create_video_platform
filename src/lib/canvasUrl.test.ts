import { describe, expect, it } from "vitest";
import { parseCanvasUrl } from "./canvasUrl";

describe("parseCanvasUrl", () => {
  it("extracts the project id from a qijing canvas URL", () => {
    expect(parseCanvasUrl("http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x")).toEqual({
      ok: true,
      projectId: "cmq6fwhft0bg5m2l5u78zby8x",
      normalizedUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x"
    });
  });

  it("accepts canvas URLs with query strings", () => {
    expect(parseCanvasUrl("https://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x?from=share")).toEqual({
      ok: true,
      projectId: "cmq6fwhft0bg5m2l5u78zby8x",
      normalizedUrl: "https://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x"
    });
  });

  it("rejects non-canvas URLs", () => {
    expect(parseCanvasUrl("https://qijing.kjjhz.cn/projects/cmq6fwhft0bg5m2l5u78zby8x")).toEqual({
      ok: false,
      error: "请输入有效的画布地址"
    });
  });
});
