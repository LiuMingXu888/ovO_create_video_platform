import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewModal } from "./PreviewModal";
import type { CanvasAsset } from "../types";

const img: CanvasAsset = { id: "i1", name: "图", kind: "image", category: "characters", url: "u" };

describe("PreviewModal", () => {
  it("renders the image element for image assets", () => {
    render(<PreviewModal asset={img} onClose={() => {}} />);
    expect(screen.getByAltText("图")).toBeTruthy();
  });

  it("locks body scroll while open and restores on close", () => {
    const { unmount } = render(<PreviewModal asset={img} onClose={() => {}} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<PreviewModal asset={img} onClose={onClose} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("returns null without an asset", () => {
    const { container } = render(<PreviewModal asset={null} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
