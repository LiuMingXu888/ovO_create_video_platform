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
    expect(screen.getByLabelText("复用提示词和资源 成片")).not.toBeDisabled();
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
    expect(screen.getByLabelText("复用提示词和资源 无提示")).toBeDisabled();
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

describe("AssetCard image generation status", () => {
  it("shows a 生成中 indicator and renders no <img> while an image is generating (no empty src)", () => {
    const asset = {
      id: "img-gen",
      name: "生成图片 1",
      kind: "image" as const,
      category: "characters" as const,
      url: "",
      status: "generating" as const,
      statusLabel: "生成中"
    };
    const { container } = render(
      <AssetCard asset={asset as never} onAction={vi.fn()} onRename={vi.fn()} onChangeCategory={vi.fn()} />
    );
    expect(screen.getByText("生成中")).toBeInTheDocument();
    // 关键: 生成中不渲染 <img>, 避免 src="" 触发浏览器重复下载整页的告警。
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the failure reason on a failed image card and renders no <img>", () => {
    const asset = {
      id: "img-fail",
      name: "生成图片 2",
      kind: "image" as const,
      category: "characters" as const,
      url: "",
      status: "failed" as const,
      errorMessage: "该模型生成超时"
    };
    const { container } = render(
      <AssetCard asset={asset as never} onAction={vi.fn()} onRename={vi.fn()} onChangeCategory={vi.fn()} />
    );
    expect(screen.getByText("该模型生成超时")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("AssetCard image reuse button", () => {
  it("renders enabled reuse button for image with generationPrompt", () => {
    const asset = {
      id: "img1",
      name: "人物A",
      kind: "image",
      category: "characters",
      url: "https://cdn.example.com/a.png",
      status: "ready",
      generationPrompt: "一个角色"
    } as CanvasAsset;
    const onAction = vi.fn();
    render(
      <AssetCard asset={asset} onAction={onAction} onRename={() => {}} onChangeCategory={() => {}} />
    );
    const btn = screen.getByLabelText("复用提示词和资源 人物A");
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onAction).toHaveBeenCalledWith(asset, "reuse-generation");
  });

  it("disables image reuse button when no generationPrompt", () => {
    const asset = {
      id: "img2",
      name: "人物B",
      kind: "image",
      category: "scenes",
      url: "https://cdn.example.com/b.png",
      status: "ready"
    } as CanvasAsset;
    render(
      <AssetCard asset={asset} onAction={vi.fn()} onRename={() => {}} onChangeCategory={() => {}} />
    );
    expect(screen.getByLabelText("复用提示词和资源 人物B")).toBeDisabled();
  });
});

describe("AssetCard view-prompt button", () => {
  it("人物卡片显示提示词按钮并触发 view-prompt", () => {
    const onAction = vi.fn();
    const asset = {
      id: "img3",
      name: "人物C",
      kind: "image" as const,
      category: "characters" as const,
      url: "https://cdn.example.com/c.png",
      status: "ready" as const,
      generationPrompt: "一个角色提示词"
    } as CanvasAsset;
    render(
      <AssetCard asset={asset} onAction={onAction} onRename={() => {}} onChangeCategory={() => {}} />
    );
    const btn = screen.getByLabelText("查看提示词 人物C");
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ category: "characters" }), "view-prompt");
  });

  it("没有 generationPrompt 时提示词按钮禁用", () => {
    const asset = {
      id: "img4",
      name: "人物D",
      kind: "image" as const,
      category: "scenes" as const,
      url: "https://cdn.example.com/d.png",
      status: "ready" as const
    } as CanvasAsset;
    render(
      <AssetCard asset={asset} onAction={vi.fn()} onRename={() => {}} onChangeCategory={() => {}} />
    );
    expect(screen.getByLabelText("查看提示词 人物D")).toBeDisabled();
  });

  it("音频卡片不显示提示词按钮", () => {
    const asset = {
      id: "aud1",
      name: "背景音乐",
      kind: "audio" as const,
      category: "audio" as const,
      url: "https://cdn.example.com/a.mp3",
      status: "ready" as const
    } as CanvasAsset;
    render(
      <AssetCard asset={asset} onAction={vi.fn()} onRename={() => {}} onChangeCategory={() => {}} />
    );
    expect(screen.queryByLabelText(/查看提示词/)).toBeNull();
  });

  it("视频卡片显示提示词按钮", () => {
    const asset = {
      id: "vid1",
      name: "成片A",
      kind: "video" as const,
      category: "video" as const,
      url: "https://cdn.example.com/v.mp4",
      status: "ready" as const,
      generationPrompt: "视频提示词"
    } as CanvasAsset;
    render(
      <AssetCard asset={asset} onAction={vi.fn()} onRename={() => {}} onChangeCategory={() => {}} />
    );
    expect(screen.getByLabelText("查看提示词 成片A")).not.toBeDisabled();
  });
});
