import { describe, expect, it } from "vitest";
import {
  IMAGE_CAMERAS,
  IMAGE_CAMERA_PROMPT_SUFFIX,
  IMAGE_MODELS,
  IMAGE_MODEL_IDS
} from "./imageGenOptions";

describe("imageGenOptions", () => {
  it("does not offer Seedream 5.0 until its model id is known", () => {
    expect(IMAGE_MODELS).not.toContain("Seedream 5.0");
  });

  it("maps every offered model to an API id", () => {
    for (const model of IMAGE_MODELS) {
      expect(IMAGE_MODEL_IDS[model]).toBeTruthy();
    }
  });

  it("offers the confirmed camera presets with prompt suffixes", () => {
    expect(IMAGE_CAMERAS).toContain("Sony FX3");
    expect(IMAGE_CAMERAS).toContain("ARRI ALEXA 35");
    expect(IMAGE_CAMERA_PROMPT_SUFFIX["暂不选择"]).toBe("");
    expect(IMAGE_CAMERA_PROMPT_SUFFIX["Sony FX3"]).toContain("Sony FX3");
    expect(IMAGE_CAMERA_PROMPT_SUFFIX["ARRI ALEXA 35"]).toContain("ARRI ALEXA 35");
  });
});
