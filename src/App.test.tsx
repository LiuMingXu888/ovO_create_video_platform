import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { PromptDock } from "./components/PromptDock";
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

  it("downloads remote assets by converting them to a local blob first", async () => {
    const blob = new Blob(["asset"], { type: "image/png" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(blob)
    });
    vi.stubGlobal("fetch", fetchMock);
    const { createObjectURL, revokeObjectURL } = mockObjectUrl("blob:downloaded-asset");

    render(<App />);

    const anchor = document.createElement("a");
    const click = vi.fn();
    vi.spyOn(anchor, "click").mockImplementation(click);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName === "a") {
        return anchor;
      }

      return Document.prototype.createElement.call(document, tagName, options);
    }) as typeof document.createElement);

    fireEvent.click(screen.getAllByTitle("下载")[1]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=600&q=80"
    ));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.href).toBe("blob:downloaded-asset");
    expect(anchor.download).toBe("小区楼道");
    expect(anchor.rel).toBe("noopener noreferrer");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:downloaded-asset");
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
