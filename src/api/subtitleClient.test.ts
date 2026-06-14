import { describe, expect, it } from "vitest";
import { buildSubtitleRemovePayload } from "./subtitleClient";

describe("buildSubtitleRemovePayload", () => {
  it("builds payload from a source video URL", () => {
    expect(buildSubtitleRemovePayload("https://example.com/video.mp4")).toEqual({
      videoUrl: "https://example.com/video.mp4"
    });
  });
});
