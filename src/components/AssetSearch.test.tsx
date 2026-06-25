import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssetSearch } from "./AssetSearch";
import type { CanvasAsset } from "../types";

const assets: CanvasAsset[] = [
  { id: "1", name: "小李", kind: "image", category: "characters", url: "u" },
  { id: "2", name: "小李配音", kind: "audio", category: "audio", url: "u" }
];

describe("AssetSearch", () => {
  it("typing shows grouped results with actions", () => {
    const onAction = vi.fn();
    render(<AssetSearch assets={assets} onAction={onAction} onPreview={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索资源" }), { target: { value: "小李" } });
    expect(screen.getByText("人物")).toBeTruthy();
    expect(screen.getByText("音频")).toBeTruthy();
    expect(screen.getAllByText("小李").length).toBeGreaterThan(0);
  });
});
