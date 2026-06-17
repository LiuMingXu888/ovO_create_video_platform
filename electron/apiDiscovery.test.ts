import { describe, expect, it } from "vitest";
import { buildCapturedRequestBody, classifyEndpoint, summarizeCapture } from "./apiDiscovery.js";

describe("classifyEndpoint", () => {
  it.each([
    ["/api/auth/me", "auth"],
    ["/api/projects/cmq/snapshot", "snapshot"],
    ["/api/asset/list?statuses=Active", "asset"],
    ["/api/upload-file", "upload"],
    ["/api/generate-video", "generation"],
    ["/api/gen-queue?projectId=cmq", "generation"],
    ["/api/asset/persist-task", "generation"],
    ["/api/subtitle-remove/ark", "subtitle"],
    ["/api/unknown", "unknown"]
  ] as const)("classifies %s as %s", (path, family) => {
    expect(classifyEndpoint(path)).toBe(family);
  });
});

describe("buildCapturedRequestBody", () => {
  it("parses JSON request bodies and ignores binary multipart uploads", () => {
    expect(buildCapturedRequestBody("application/json", Buffer.from(JSON.stringify({ action: "batch" })))).toEqual({
      action: "batch"
    });
    expect(buildCapturedRequestBody("multipart/form-data; boundary=test", Buffer.from("file bytes"))).toEqual({
      formData: "[multipart]"
    });
    expect(buildCapturedRequestBody(undefined, undefined)).toBeUndefined();
  });
});

describe("summarizeCapture", () => {
  it("keeps method, path, status, body shape, and endpoint family", () => {
    expect(
      summarizeCapture({
        method: "POST",
        url: "https://qijing.kjjhz.cn/api/generate-video",
        status: 200,
        requestBody: { prompt: "hello", referenceImages: ["a"] },
        responseBody: { taskId: "task-1", status: "queued" }
      })
    ).toEqual({
      method: "POST",
      path: "/api/generate-video",
      queryKeys: [],
      family: "generation",
      status: 200,
      requestShape: {
        prompt: "string",
        referenceImages: ["string"]
      },
      responseShape: {
        taskId: "string",
        status: "string"
      }
    });
  });
});
