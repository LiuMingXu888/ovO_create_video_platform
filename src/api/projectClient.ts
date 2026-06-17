import { endpoints } from "./endpoints";
import type { ApiTransport } from "./transport";
import type { CanvasProject } from "../types";

interface CreateProjectResponse {
  id?: string;
  projectId?: string;
  canvasUrl?: string;
  url?: string;
  title?: string;
  name?: string;
  data?: CreateProjectResponse;
}

export async function createCompanyCanvas(transport: ApiTransport, title = "未命名画布"): Promise<CanvasProject> {
  const result = await transport.request<CreateProjectResponse>(endpoints.projects(), {
    method: "POST",
    body: { title, name: title }
  });
  const response = result.data ?? result;
  const projectId = response.projectId ?? response.id ?? projectIdFromCanvasUrl(response.canvasUrl ?? response.url);

  if (!projectId) {
    throw new Error("新建画布接口未返回项目 ID");
  }

  return {
    projectId,
    canvasUrl: response.canvasUrl ?? response.url ?? `http://qijing.kjjhz.cn/canvas/${projectId}`,
    title: response.title ?? response.name ?? title,
    loadedAt: new Date().toISOString()
  };
}

function projectIdFromCanvasUrl(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const canvasIndex = parts.indexOf("canvas");
    return canvasIndex >= 0 ? parts[canvasIndex + 1] : undefined;
  } catch {
    return undefined;
  }
}
