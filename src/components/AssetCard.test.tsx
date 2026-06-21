import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
