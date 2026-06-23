import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ImageGeneratePanel } from "./ImageGeneratePanel";
import { DEFAULT_IMAGE_GENERATION_SETTINGS } from "../lib/imageGenOptions";

function renderPanel(overrides = {}, onSettingsChange = vi.fn()) {
  const settings = { ...DEFAULT_IMAGE_GENERATION_SETTINGS, ...overrides };
  render(
    <ImageGeneratePanel
      settings={settings}
      onSettingsChange={onSettingsChange}
      onGenerate={vi.fn()}
    />
  );
  return { onSettingsChange };
}

describe("ImageGeneratePanel", () => {
  it("shows the generate button without a credit cost suffix", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "生成图片" })).toBeTruthy();
    expect(screen.queryByText(/积分/)).toBeNull();
  });

  it("shows 兑吧 quality options 低/中/高", () => {
    renderPanel({ model: "GPT-Image-2(兑吧)", quality: "high" });
    const quality = screen.getByLabelText("质量") as HTMLSelectElement;
    expect([...quality.options].map((o) => o.text)).toEqual(["低", "中", "高"]);
    expect(quality.disabled).toBe(false);
  });

  it("locks Gemini quality to a disabled 4K", () => {
    renderPanel({ model: "Gemini 3 Pro", quality: "4k" });
    const quality = screen.getByLabelText("质量") as HTMLSelectElement;
    expect([...quality.options].map((o) => o.text)).toEqual(["4K"]);
    expect(quality.disabled).toBe(true);
  });

  it("renders 香蕉 labels but keeps canonical model values", () => {
    renderPanel({ model: "Gemini 3 Pro" });
    const model = screen.getByLabelText("生图模型") as HTMLSelectElement;
    expect([...model.options].some((o) => o.text === "Gemini 3 Pro(香蕉pro)")).toBe(true);
    expect(model.value).toBe("Gemini 3 Pro");
  });

  it("resets quality to the new model default when switching models", () => {
    const onSettingsChange = vi.fn();
    renderPanel({ model: "GPT-Image-2(兑吧)", quality: "low" }, onSettingsChange);
    fireEvent.change(screen.getByLabelText("生图模型"), { target: { value: "GPT-Image-2" } });
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ model: "GPT-Image-2", quality: "4k" })
    );
  });
});
