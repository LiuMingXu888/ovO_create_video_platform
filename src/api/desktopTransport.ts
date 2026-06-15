import type { ApiError } from "../types";
import type { ApiRequestOptions, ApiTransport } from "./transport";

interface DesktopApiResponse<T> {
  ok: boolean;
  status: number;
  data?: T;
  message?: string;
}

export class DesktopApiTransport implements ApiTransport {
  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const result = (await window.ovoDesktop?.api.request(path, {
      method: options.method ?? "GET",
      body: options.body,
      headers: options.headers
    })) as DesktopApiResponse<T> | undefined;

    if (!result) {
      throw { message: "Electron 桌面端接口不可用" } satisfies ApiError;
    }

    if (!result.ok) {
      throw {
        status: result.status,
        message: result.message ?? `请求失败 (${result.status})`,
        detail: result.data
      } satisfies ApiError;
    }

    return result.data as T;
  }
}
