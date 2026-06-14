import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { PromptDock } from "./components/PromptDock";
import type { ReferenceItem } from "./types";

describe("App shell", () => {
  it("renders the local desktop asset sections expanded by default", () => {
    render(<App />);

    expect(screen.getByLabelText("ovO")).toBeInTheDocument();
    expect(screen.getByText("未命名项目")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "人物" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "场景" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "道具" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "音频" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "视频" })).toBeInTheDocument();
    expect(screen.getByText("男主秦扬人脸参考")).toBeInTheDocument();
    expect(screen.getByText("紧张背景音乐")).toBeInTheDocument();
    expect(screen.getAllByTitle("本地选择文件")).toHaveLength(2);
  });

  it("inserts an asset name into the prompt and reference strip", () => {
    render(<App />);

    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);

    expect(screen.getByPlaceholderText("输入视频提示词，点击资源 + 会插入资源名")).toHaveValue("小区楼道");
    expect(screen.getByRole("button", { name: /图片 小区楼道/ })).toBeInTheDocument();
  });
});

describe("PromptDock", () => {
  it("shows reference validation errors from validateReferenceItems", () => {
    const references: ReferenceItem[] = Array.from({ length: 10 }, (_, index) => ({
      id: `ref-${index}`,
      name: `图片${index}`,
      kind: "image",
      sizeBytes: 1024,
      source: "asset"
    }));

    render(
      <PromptDock
        prompt=""
        references={references}
        onPromptChange={() => undefined}
        onRemoveReference={() => undefined}
        onLocalFilesSelected={() => undefined}
      />
    );

    expect(screen.getByText("图片最多 9 张")).toBeInTheDocument();
  });
});
