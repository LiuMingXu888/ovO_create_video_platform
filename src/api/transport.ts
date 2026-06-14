import type { ApiError } from "../types";
import { COMPANY_API_ORIGIN, apiPath } from "./endpoints";

export interface ApiTransport {
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>;
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

export class FetchApiTransport implements ApiTransport {
  constructor(
    private readonly origin = COMPANY_API_ORIGIN,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...options.headers
    };
    let body: BodyInit | undefined;

    if (options.body instanceof FormData) {
      body = options.body;
    } else if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const response = await this.fetcher(apiPath(this.origin, path), {
      method: options.method ?? "GET",
      credentials: "include",
      headers,
      body
    });

    const data = await safeJson(response);

    if (!response.ok) {
      const message = getErrorMessage(data, response.status);
      const error: ApiError = { status: response.status, message, detail: data };
      throw error;
    }

    return data as T;
  }
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getErrorMessage(data: unknown, status: number) {
  if (isRecord(data)) {
    const message = data.error ?? data.message ?? data.errorDetail;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return `请求失败 (${status})`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
