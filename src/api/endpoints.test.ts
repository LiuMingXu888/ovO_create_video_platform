import { describe, expect, it } from "vitest";
import { apiPath, endpoints } from "./endpoints";

describe("endpoints", () => {
  it("builds auth, snapshot, generation, and subtitle paths", () => {
    expect(endpoints.authMe()).toBe("/api/auth/me");
    expect(endpoints.projectSnapshot("project-1")).toBe("/api/projects/project-1/snapshot");
    expect(endpoints.generateVideo()).toBe("/api/generate-video");
    expect(endpoints.generateVideoTask("task-1")).toBe("/api/generate-video/task-1");
    expect(endpoints.genQueue("project-1")).toBe("/api/gen-queue?projectId=project-1");
    expect(endpoints.persistTask()).toBe("/api/asset/persist-task");
    expect(endpoints.subtitleRemove()).toBe("/api/subtitle-remove");
    expect(endpoints.subtitleRemoveTask("task-2")).toBe("/api/subtitle-remove/task-2");
  });

  it("prefixes API paths with a base origin", () => {
    expect(apiPath("https://qijing.kjjhz.cn", "/api/auth/me")).toBe("https://qijing.kjjhz.cn/api/auth/me");
  });
});
