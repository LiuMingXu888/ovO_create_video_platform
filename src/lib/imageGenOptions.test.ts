import { describe, expect, it } from "vitest";
import {
  IMAGE_CAMERAS,
  IMAGE_CAMERA_PROMPT_SUFFIX,
  IMAGE_MODELS,
  IMAGE_MODEL_IDS,
  IMAGE_MODEL_OPTIONS,
  getImageModelOption,
  DEFAULT_IMAGE_GENERATION_SETTINGS
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

  it("shows 香蕉 nicknames only in the dropdown label, keeps canonical stored values", () => {
    const pro = getImageModelOption("Gemini 3 Pro");
    expect(pro?.label).toBe("Gemini 3 Pro(香蕉pro)");
    expect(pro?.value).toBe("Gemini 3 Pro");
    expect(pro?.apiId).toBe("gemini-3-pro-image-preview");
    const flash = getImageModelOption("Gemini 3.1 Flash");
    expect(flash?.label).toBe("Gemini 3.1 Flash(香蕉2)");
    expect(flash?.value).toBe("Gemini 3.1 Flash");
  });

  it("gives 兑吧 low/medium/high quality and GPT-Image-2 1k/2k/4k", () => {
    const duiba = getImageModelOption("GPT-Image-2(兑吧)");
    expect(duiba?.qualityField).toBe("quality");
    expect(duiba?.qualityOptions.map((q) => q.value)).toEqual(["low", "medium", "high"]);
    expect(duiba?.defaultQuality).toBe("high");

    const gpt = getImageModelOption("GPT-Image-2");
    expect(gpt?.qualityField).toBe("size");
    expect(gpt?.qualityOptions.map((q) => q.value)).toEqual(["1k", "2k", "4k"]);
  });

  it("locks Gemini quality to a single 4K option with no quality field", () => {
    for (const value of ["Gemini 3 Pro", "Gemini 3.1 Flash"]) {
      const option = getImageModelOption(value);
      expect(option?.qualityField).toBeNull();
      expect(option?.qualityOptions).toEqual([{ value: "4k", label: "4K" }]);
    }
  });

  it("defaults to the GPT-Image-2 model (size param, ~15s) which works under the 60s gateway", () => {
    expect(DEFAULT_IMAGE_GENERATION_SETTINGS.model).toBe("GPT-Image-2");
    expect(DEFAULT_IMAGE_GENERATION_SETTINGS.quality).toBe("4k");
  });

  it("offers the confirmed camera presets with prompt suffixes", () => {
    expect(IMAGE_CAMERAS).toContain("Sony FX3");
    expect(IMAGE_CAMERAS).toContain("ARRI ALEXA 35");
    expect(IMAGE_CAMERA_PROMPT_SUFFIX["暂不选择"]).toBe("");
    expect(IMAGE_CAMERA_PROMPT_SUFFIX["Sony FX3"]).toContain("Sony FX3");
    expect(IMAGE_CAMERA_PROMPT_SUFFIX["ARRI ALEXA 35"]).toContain("ARRI ALEXA 35");
  });

  it("offers IMAGE_MODEL_OPTIONS in fixed order", () => {
    expect(IMAGE_MODEL_OPTIONS.map((m) => m.value)).toEqual([
      "GPT-Image-2(兑吧)",
      "GPT-Image-2",
      "Gemini 3 Pro",
      "Gemini 3.1 Flash"
    ]);
  });
});
