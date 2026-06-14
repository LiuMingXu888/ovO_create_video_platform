export type CanvasUrlParseResult =
  | {
      ok: true;
      projectId: string;
      normalizedUrl: string;
    }
  | {
      ok: false;
      error: string;
    };

export function parseCanvasUrl(value: string): CanvasUrlParseResult {
  try {
    const url = new URL(value.trim());
    const parts = url.pathname.split("/").filter(Boolean);
    const canvasIndex = parts.indexOf("canvas");
    const projectId = canvasIndex >= 0 ? parts[canvasIndex + 1] : undefined;

    if (!projectId) {
      return { ok: false, error: "请输入有效的画布地址" };
    }

    return {
      ok: true,
      projectId,
      normalizedUrl: `${url.origin}/canvas/${projectId}`
    };
  } catch {
    return { ok: false, error: "请输入有效的画布地址" };
  }
}
