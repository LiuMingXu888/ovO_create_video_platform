import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PreviewModal } from "./PreviewModal";
import type { CanvasAsset } from "../types";

const img: CanvasAsset = { id: "i1", name: "图", kind: "image", category: "characters", url: "u" };

describe("PreviewModal zoom", () => {
  it("ctrl+wheel up scales the image up", () => {
    render(<PreviewModal asset={img} onClose={() => {}} />);
    const media = screen.getByAltText("图") as HTMLImageElement;
    fireEvent.wheel(media, { deltaY: -100, ctrlKey: true });
    expect(media.style.transform).toContain("scale(1.25)");
  });
});
