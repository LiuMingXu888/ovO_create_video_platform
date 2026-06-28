import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GenerationSettings, ImageGenerationSettings, ReferenceItem } from "../types";
import { PromptDock } from "./PromptDock";

const generationSettings: GenerationSettings = {
  aspectRatio: "9:16",
  resolution: "720p",
  durationSeconds: 5,
  omnireference: false,
  webSearch: false
};

const imageGenerationSettings: ImageGenerationSettings = {
  model: "default",
  aspectRatio: "1:1",
  quality: "1k",
  camera: "",
  category: ""
};

const baseProps = {
  prompt: "",
  references: [] as ReferenceItem[],
  validationErrors: [],
  nodeName: "",
  onNodeNameChange: vi.fn(),
  onPromptChange: vi.fn(),
  onRemoveReference: vi.fn(),
  onGenerate: vi.fn(),
  generateMode: "video" as const,
  onGenerateModeChange: vi.fn(),
  generationSettings,
  onGenerationSettingsChange: vi.fn(),
  imageGenerationSettings,
  onImageGenerationSettingsChange: vi.fn(),
  onGenerateImage: vi.fn(),
  activityMessages: []
};

describe("PromptDock 文字化引用按钮", () => {
  it("文字化引用按钮把分组文本插到提示词第一行", () => {
    const onPromptChange = vi.fn();
    const references: ReferenceItem[] = [
      { id: "1", name: "小李", kind: "image", sizeBytes: 0, source: "asset" },
      { id: "2", name: "小李", kind: "audio", sizeBytes: 0, source: "asset" }
    ];
    render(
      <PromptDock
        {...baseProps}
        prompt="原有提示词"
        references={references}
        onPromptChange={onPromptChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "文字化引用到提示词" }));
    expect(onPromptChange).toHaveBeenCalledWith("图片1音频1是小李；\n原有提示词");
  });

  it("无引用时按钮禁用", () => {
    render(<PromptDock {...baseProps} references={[]} />);
    expect(screen.getByRole("button", { name: "文字化引用到提示词" })).toBeDisabled();
  });
});
