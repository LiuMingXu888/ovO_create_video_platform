import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./services/companyApiFacade", () => ({
  companyApiFacade: {
    openLogin: vi.fn(),
    checkAuth: vi.fn(),
    loadCanvasResources: vi.fn()
  }
}));

import { App } from "./App";
import { PromptDock } from "./components/PromptDock";
import { companyApiFacade } from "./services/companyApiFacade";
import type { ReferenceItem } from "./types";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockObjectUrl(url: string) {
  const createObjectURL = vi.fn(() => url);
  const revokeObjectURL = vi.fn();

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURL
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURL
  });

  return { createObjectURL, revokeObjectURL };
}

function mockMediaDuration(tagName: "audio" | "video", duration: number) {
  const originalCreateElement = document.createElement.bind(document);

  vi.spyOn(document, "createElement").mockImplementation(((name: string, options?: ElementCreationOptions) => {
    const element = originalCreateElement(name, options);

    if (name === tagName) {
      Object.defineProperty(element, "duration", {
        configurable: true,
        value: duration
      });
      Object.defineProperty(element, "src", {
        configurable: true,
        get: () => "",
        set: () => {
          queueMicrotask(() => {
            const mediaElement = element as HTMLMediaElement;
            mediaElement.onloadedmetadata?.(new Event("loadedmetadata"));
          });
        }
      });
    }

    return element;
  }) as typeof document.createElement);
}

describe("App shell", () => {
  it("renders the local desktop asset sections expanded by default", () => {
    render(<App />);

    expect(screen.getByLabelText("ovO")).toBeInTheDocument();
    expect(screen.getByText("未命名项目")).toBeInTheDocument();
    expect(screen.getByText("未登录")).toBeInTheDocument();
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

  it("does not add asset references beyond the hard reference limits", () => {
    render(<App />);

    const addButtons = screen.getAllByTitle("加入提示词");
    for (let index = 0; index < 10; index += 1) {
      fireEvent.click(addButtons[0]);
    }

    expect(screen.getByText("图片最多 9 张")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /图片 小区楼道/ })).toHaveLength(9);
  });

  it("uses local audio duration for reference validation and rejects overlong audio", async () => {
    const { revokeObjectURL } = mockObjectUrl("blob:local-audio");
    mockMediaDuration("audio", 16);
    const file = new File(["audio"], "long-audio.mp3", { type: "audio/mpeg" });

    render(<App />);

    const referenceInput = screen.getByTitle("添加参考素材").querySelector("input");
    fireEvent.change(referenceInput as HTMLInputElement, { target: { files: [file] } });

    expect(await screen.findByText("所有音频总时长不能超过 15 秒")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /音频 long-audio/ })).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:local-audio");
  });

  it("revokes a valid local reference URL on removal", async () => {
    const { revokeObjectURL } = mockObjectUrl("blob:valid-audio");
    mockMediaDuration("audio", 5);
    const file = new File(["audio"], "short-audio.mp3", { type: "audio/mpeg" });

    render(<App />);

    const referenceInput = screen.getByTitle("添加参考素材").querySelector("input");
    fireEvent.change(referenceInput as HTMLInputElement, { target: { files: [file] } });

    fireEvent.click(await screen.findByRole("button", { name: /音频 short-audio/ }));

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:valid-audio"));
  });

  it("rejects an invalid reference batch instead of adding over-limit items", async () => {
    const { revokeObjectURL } = mockObjectUrl("blob:local-image");
    const files = Array.from({ length: 10 }, (_, index) => new File(["image"], `image-${index}.png`, { type: "image/png" }));

    render(<App />);

    const referenceInput = screen.getByTitle("添加参考素材").querySelector("input");
    fireEvent.change(referenceInput as HTMLInputElement, { target: { files } });

    expect(await screen.findByText("图片最多 9 张")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /图片 image-0/ })).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledTimes(10);
  });

  it("rejects unsupported local reference media formats", async () => {
    const { revokeObjectURL } = mockObjectUrl("blob:local-webm");
    mockMediaDuration("video", 4);
    const file = new File(["video"], "clip.webm", { type: "video/webm" });

    render(<App />);

    const referenceInput = screen.getByTitle("添加参考素材").querySelector("input");
    fireEvent.change(referenceInput as HTMLInputElement, { target: { files: [file] } });

    expect(await screen.findByText("视频「clip」仅支持 MP4、MOV 格式")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /视频 clip/ })).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:local-webm");
  });

  it("uploads image assets into characters by default even from empty image sections", async () => {
    mockObjectUrl("blob:scene-upload");
    const file = new File(["image"], "scene-image.png", { type: "image/png" });

    render(<App />);

    const sceneSection = screen.getByRole("button", { name: "场景" }).closest("section") as HTMLElement;
    const sceneInput = sceneSection.querySelector("input") as HTMLInputElement;
    fireEvent.change(sceneInput, { target: { files: [file] } });

    expect(await screen.findByText("scene-image")).toBeInTheDocument();
    expect(sceneSection.querySelector(".upload-placeholder")).toBeInTheDocument();
    expect(sceneSection).not.toHaveTextContent("scene-image");
  });

  it("checks auth state from the company API facade", async () => {
    vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176" }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "检查登录态" }));

    expect(await screen.findByText("已登录：23176")).toBeInTheDocument();
    expect(screen.getByText("23176")).toBeInTheDocument();
  });

  it("opens the company login window and applies the returned auth state", async () => {
    vi.mocked(companyApiFacade.openLogin).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176" }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "登录公司账号" }));

    expect(await screen.findByText("已登录：23176")).toBeInTheDocument();
    expect(companyApiFacade.openLogin).toHaveBeenCalledTimes(1);
  });

  it("loads canvas resources into the existing grid", async () => {
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      assets: [
        {
          id: "api-image",
          name: "接口图片",
          kind: "image",
          category: "characters",
          url: "https://example.com/image.png"
        }
      ]
    });

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText("粘贴画布地址，例如 http://qijing.kjjhz.cn/canvas/..."), {
      target: { value: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x" }
    });
    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));

    expect(await screen.findByText("接口图片")).toBeInTheDocument();
    expect(screen.getByText("接口项目")).toBeInTheDocument();
  });

  it("builds a local generation payload preview without submitting the company API", async () => {
    render(<App />);

    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
    fireEvent.click(screen.getByRole("button", { name: "生成视频" }));

    expect(await screen.findByText("已生成请求预览，未提交公司接口")).toBeInTheDocument();
    expect(screen.getByText(/Seedance 2.0/)).toBeInTheDocument();
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
        onGenerate={() => undefined}
      />
    );

    expect(screen.getByText("图片最多 9 张")).toBeInTheDocument();
  });
});
