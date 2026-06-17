import { redactSecrets } from "./secretRedactor.js";

export type EndpointFamily = "auth" | "snapshot" | "asset" | "upload" | "generation" | "subtitle" | "unknown";

export interface RawApiCapture {
  method: string;
  url: string;
  status?: number;
  requestBody?: unknown;
  responseBody?: unknown;
}

export interface SanitizedApiSummary {
  method: string;
  path: string;
  queryKeys: string[];
  family: EndpointFamily;
  status?: number;
  requestShape?: unknown;
  responseShape?: unknown;
}

export function classifyEndpoint(pathname: string): EndpointFamily {
  const path = pathname.split("?")[0];
  if (path === "/api/auth/me") return "auth";
  if (/^\/api\/projects\/[^/]+\/snapshot$/.test(path)) return "snapshot";
  if (path === "/api/asset/persist-task") return "generation";
  if (path.startsWith("/api/asset/") || path === "/api/asset/list") return "asset";
  if (path === "/api/upload-file" || path === "/api/upload-public" || path === "/api/asset/upload") return "upload";
  if (path.startsWith("/api/generate-video") || path.startsWith("/api/gen-queue")) return "generation";
  if (path.startsWith("/api/subtitle-remove")) return "subtitle";
  return "unknown";
}

export function buildCapturedRequestBody(contentType: string | undefined, uploadData?: Buffer) {
  if (!uploadData || uploadData.byteLength === 0) {
    return undefined;
  }

  const normalizedContentType = contentType?.toLowerCase() ?? "";
  const text = uploadData.toString("utf8");
  if (normalizedContentType.includes("multipart/form-data")) {
    return { formData: "[multipart]" };
  }

  if (normalizedContentType.includes("application/json")) {
    try {
      return JSON.parse(uploadData.toString("utf8"));
    } catch {
      return { raw: "[unparseable-json]" };
    }
  }

  try {
    return JSON.parse(text);
  } catch {
    if (text.includes("Content-Disposition: form-data")) {
      return { formData: "[multipart]" };
    }
  }

  return { raw: "[binary]" };
}

export function summarizeCapture(capture: RawApiCapture): SanitizedApiSummary {
  const url = new URL(capture.url);
  return {
    method: capture.method,
    path: url.pathname,
    queryKeys: Array.from(url.searchParams.keys()).sort(),
    family: classifyEndpoint(url.pathname),
    status: capture.status,
    requestShape: capture.requestBody === undefined ? undefined : shapeOf(redactSecrets(capture.requestBody)),
    responseShape: capture.responseBody === undefined ? undefined : shapeOf(redactSecrets(capture.responseBody))
  };
}

function shapeOf(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.length > 0 ? [shapeOf(value[0])] : [];
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [key, shapeOf(entryValue)])
    );
  }

  if (value === null) return "null";
  return typeof value;
}
