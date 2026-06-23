import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssetCard } from "./AssetCard";
import type { CanvasAsset } from "../types";

function renderCard(asset: CanvasAsset) {
  return render(
    <AssetCard asset={asset} onAction={() => {}} onRename={() => {}} onChangeCategory={() => {}} />
  );
}

describe("AssetCard reuse-generation button", () => {
  it("enables reuse button when only generationPrompt exists", () => {
    const asset = {
      id: "v1",
      name: "成片",
      kind: "video",
      category: "video",
      url: "https://cdn.example.com/v.mp4",
      generationPrompt: "提示词"
    } as CanvasAsset;
    renderCard(asset);
    expect(screen.getByLabelText("复用生成 成片")).not.toBeDisabled();
  });

  it("disables reuse button when no generationPrompt", () => {
    const asset = {
      id: "v2",
      name: "无提示",
      kind: "video",
      category: "video",
      url: "https://cdn.example.com/v2.mp4"
    } as CanvasAsset;
    renderCard(asset);
    expect(screen.getByLabelText("复用生成 无提示")).toBeDisabled();
  });
});

describe("AssetCard media error retry", () => {
  it("shows a retry control when an image asset fails to load and reloads on click", () => {
    const asset = {
      id: "img-err",
      name: "人物-坏图",
      kind: "image" as const,
      category: "characters" as const,
      url: "https://example.com/broken.png",
      status: "ready" as const
    };
    render(
      <AssetCard
        asset={asset as never}
        onAction={vi.fn()}
        onRename={vi.fn()}
        onChangeCategory={vi.fn()}
      />
    );
    const img = screen.getByAltText("人物-坏图") as HTMLImageElement;
    fireEvent.error(img);
    const retry = screen.getByRole("button", { name: /重新获取/ });
    expect(retry).toBeTruthy();
    fireEvent.click(retry);
    // 重载后图片重新挂载,src 带 cache-bust 查询
    const reloaded = screen.getByAltText("人物-坏图") as HTMLImageElement;
    expect(reloaded.getAttribute("src")).toContain("retry=");
  });
});
