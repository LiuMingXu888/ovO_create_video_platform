import { describe, expect, it } from "vitest";
import { buildAssetUploadPayload, buildUploadFormData, getUploadPrefix } from "./uploadClient";

describe("uploadClient payload builders", () => {
  it("uses the filename without extension as upload prefix", () => {
    expect(getUploadPrefix(new File(["x"], "green-box.png", { type: "image/png" }))).toBe("green-box");
  });

  it("builds upload FormData with file, prefix, and projectId", () => {
    const file = new File(["x"], "green-box.png", { type: "image/png" });
    const formData = buildUploadFormData(file, "project-1");

    expect(formData.get("file")).toBe(file);
    expect(formData.get("prefix")).toBe("green-box");
    expect(formData.get("projectId")).toBe("project-1");
  });

  it("builds asset metadata for registration", () => {
    expect(
      buildAssetUploadPayload({
        name: "green-box",
        kind: "image",
        publicUrl: "https://example.com/green-box.png",
        projectId: "project-1"
      })
    ).toEqual({
      name: "green-box",
      type: "image",
      url: "https://example.com/green-box.png",
      projectId: "project-1"
    });
  });
});
