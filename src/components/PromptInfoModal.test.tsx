import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromptInfoModal } from "./PromptInfoModal";
import type { CanvasAsset } from "../types";

const asset: CanvasAsset = {
  id: "n1",
  name: "小李",
  kind: "image",
  category: "characters",
  url: "x",
  generationPrompt: "第一句\n第二句",
  generationReferences: [
    { id: "r1", name: "参考A", kind: "image", sizeBytes: 0, source: "asset", previewUrl: "p.jpg" },
    { id: "r2", name: "参考B", kind: "video", sizeBytes: 0, source: "asset" },
  ],
};

describe("PromptInfoModal", () => {
  it("returns null without asset", () => {
    const { container } = render(<PromptInfoModal asset={null} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows references and prompt lines", () => {
    render(<PromptInfoModal asset={asset} onClose={vi.fn()} />);
    expect(screen.getByText("第一句")).toBeTruthy();
    expect(screen.getByText("第二句")).toBeTruthy();
    expect(screen.getByAltText("参考A")).toBeTruthy();
  });

  it("renders text placeholder when previewUrl absent", () => {
    render(<PromptInfoModal asset={asset} onClose={vi.fn()} />);
    expect(screen.getByText("参考B")).toBeTruthy();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(<PromptInfoModal asset={asset} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(<PromptInfoModal asset={asset} onClose={onClose} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
