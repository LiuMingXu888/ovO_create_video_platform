import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./services/companyApiFacade", () => ({
  companyApiFacade: {
    openLogin: vi.fn(),
    checkAuth: vi.fn(),
    loadCanvasResources: vi.fn(),
    renameCanvasAsset: vi.fn(),
    uploadCanvasAsset: vi.fn(),
    saveCanvasAsset: vi.fn(),
    deleteCanvasAsset: vi.fn(),
    generateVideo: vi.fn(),
    generateImage: vi.fn(),
    pollImageResult: vi.fn(),
    removeSubtitles: vi.fn(),
    createCompanyCanvas: vi.fn(),
    logout: vi.fn(),
    inspectCanvas: vi.fn()
  }
}));

import { App } from "./App";
import { PromptDock } from "./components/PromptDock";
import { companyApiFacade } from "./services/companyApiFacade";
import type { ReferenceItem } from "./types";

const promptPlaceholder = "输入视频提示词，可用图片1、音频1说明参考素材";
const generateButtonName = /生成视频\(需要\d+积分\)/;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  localStorage.clear();
  window.ovoDesktop = undefined;
  vi.mocked(companyApiFacade.uploadCanvasAsset).mockReset();
  vi.mocked(companyApiFacade.saveCanvasAsset).mockReset();
  vi.mocked(companyApiFacade.renameCanvasAsset).mockReset();
  vi.mocked(companyApiFacade.loadCanvasResources).mockReset();
  vi.mocked(companyApiFacade.openLogin).mockReset();
  vi.mocked(companyApiFacade.checkAuth).mockReset();
  vi.mocked(companyApiFacade.deleteCanvasAsset).mockReset();
  vi.mocked(companyApiFacade.generateVideo).mockReset();
  vi.mocked(companyApiFacade.generateImage).mockReset();
  vi.mocked(companyApiFacade.pollImageResult).mockReset();
  vi.mocked(companyApiFacade.removeSubtitles).mockReset();
  vi.mocked(companyApiFacade.createCompanyCanvas).mockReset();
  vi.mocked(companyApiFacade.logout).mockReset();
  vi.mocked(companyApiFacade.inspectCanvas).mockReset();
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

function referenceChips() {
  return Array.from(document.querySelectorAll(".reference-chip"));
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
    expect(screen.getAllByTitle("本地选择文件")).toHaveLength(5);
  });

  it("adds an asset to the reference strip without inserting its name into the prompt", () => {
    render(<App />);

    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);

    expect(screen.getByRole("button", { name: "图片1 小区楼道" })).toBeInTheDocument();
    expect(referenceChips()).toHaveLength(1);
    expect(referenceChips()[0]).toHaveTextContent("图片1");
    expect(referenceChips()[0]).toHaveTextContent("小区楼道");
    expect(document.querySelector(".prompt-token-line")).not.toBeInTheDocument();
  });

  it("labels references by kind and shows a centered preview only while hovering previewable references", () => {
    render(<App />);

    const addButtons = screen.getAllByTitle("加入提示词");
    fireEvent.click(addButtons[0]);
    fireEvent.click(addButtons[4]);
    fireEvent.click(addButtons[5]);
    fireEvent.click(addButtons[1]);

    expect(referenceChips().map((chip) => chip.querySelector(".reference-kind")?.textContent)).toEqual([
      "图片1",
      "音频1",
      "视频1",
      "图片2"
    ]);
    expect(screen.queryByRole("img", { name: "小区楼道 预览" })).not.toBeInTheDocument();

    fireEvent.mouseEnter(referenceChips()[0]);
    expect(screen.getByRole("img", { name: "小区楼道 预览" })).toHaveAttribute(
      "src",
      expect.stringContaining("images.unsplash.com")
    );
    expect(document.querySelector(".reference-hover-preview")).toBeInTheDocument();

    fireEvent.mouseLeave(referenceChips()[0]);
    expect(screen.queryByRole("img", { name: "小区楼道 预览" })).not.toBeInTheDocument();

    fireEvent.mouseEnter(referenceChips()[1]);
    expect(document.querySelector(".reference-hover-preview")).not.toBeInTheDocument();
  });

  it("removes prompt tokens and reference chips as one synced item", () => {
    render(<App />);

    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
    fireEvent.click(screen.getByRole("button", { name: "图片1 小区楼道" }));

    expect(screen.queryByRole("button", { name: "图片1 小区楼道" })).not.toBeInTheDocument();
    expect(referenceChips()).toHaveLength(0);
  });

  it("does not add asset references beyond the hard reference limits", () => {
    render(<App />);

    const addButtons = screen.getAllByTitle("加入提示词");
    for (let index = 0; index < 10; index += 1) {
      fireEvent.click(addButtons[0]);
    }

    expect(screen.getByText("图片最多 9 张")).toBeInTheDocument();
    expect(referenceChips()).toHaveLength(9);
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

    fireEvent.click(await screen.findByRole("button", { name: /音频1 short-audio/ }));

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

  it("categorizes uploaded image assets by Chinese name prefixes", async () => {
    mockObjectUrl("blob:scene-upload");
    const files = [
      new File(["image"], "场景-百家老宅.png", { type: "image/png" }),
      new File(["image"], "道具-桂花糕.png", { type: "image/png" }),
      new File(["image"], "女主林夏.png", { type: "image/png" })
    ];

    render(<App />);

    const charactersSection = screen.getByRole("button", { name: "人物" }).closest("section") as HTMLElement;
    const scenesSection = screen.getByRole("button", { name: "场景" }).closest("section") as HTMLElement;
    const propsSection = screen.getByRole("button", { name: "道具" }).closest("section") as HTMLElement;
    const scenesInput = scenesSection.querySelector("input") as HTMLInputElement;
    fireEvent.change(scenesInput, { target: { files } });

    expect(await screen.findByText("场景-百家老宅")).toBeInTheDocument();
    expect(scenesSection).toHaveTextContent("场景-百家老宅");
    expect(propsSection).toHaveTextContent("道具-桂花糕");
    expect(charactersSection).toHaveTextContent("女主林夏");
    expect(charactersSection).not.toHaveTextContent("场景-百家老宅");
    expect(charactersSection).not.toHaveTextContent("道具-桂花糕");
  });

  it("uploads local files through the company canvas node flow when a real project is loaded", async () => {
    const file = new File(["video"], "company-video.mp4", { type: "video/mp4" });
    const originalSnapshot = { snapshot: { nodes: [] } };
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: originalSnapshot,
      assets: []
    });
    vi.mocked(companyApiFacade.uploadCanvasAsset).mockResolvedValue({
      ok: true,
      snapshot: {
        snapshot: {
          nodes: [
            {
              id: "uploaded-video-node",
              type: "video",
              data: {
                name: "company-video",
                videoUrl: "https://example.com/company-video.mp4",
                sizeBytes: 5
              }
            }
          ]
        }
      },
      asset: {
        id: "uploaded-video-node",
        name: "company-video",
        kind: "video",
        category: "video",
        url: "https://example.com/company-video.mp4",
        sizeBytes: 5
      }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await waitFor(() => expect(screen.getByLabelText("当前画布名称")).toHaveValue("接口项目"));

    const videoSection = screen.getByRole("button", { name: "视频" }).closest("section") as HTMLElement;
    const videoInput = videoSection.querySelector("input") as HTMLInputElement;
    fireEvent.change(videoInput, { target: { files: [file] } });

    expect(await screen.findByText("company-video")).toBeInTheDocument();
    expect(companyApiFacade.uploadCanvasAsset).toHaveBeenCalledWith({
      projectId: "cmq6fwhft0bg5m2l5u78zby8x",
      snapshot: originalSnapshot,
      file,
      name: "company-video",
      kind: "video",
      category: "video"
    });
    expect(screen.getByText("已同步上传 1 个资源")).toBeInTheDocument();
  });

  it("adds the selected image category prefix before uploading to a real company canvas", async () => {
    const file = new File(["image"], "百家老宅.png", { type: "image/png" });
    const originalSnapshot = { snapshot: { nodes: [] } };
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: originalSnapshot,
      assets: []
    });
    vi.mocked(companyApiFacade.uploadCanvasAsset).mockResolvedValue({
      ok: true,
      snapshot: {
        snapshot: {
          nodes: [
            {
              id: "uploaded-scene-node",
              type: "image",
              data: {
                name: "场景-百家老宅",
                imageUrl: "https://example.com/scene.png"
              }
            }
          ]
        }
      },
      asset: {
        id: "uploaded-scene-node",
        name: "场景-百家老宅",
        kind: "image",
        category: "scenes",
        url: "https://example.com/scene.png"
      }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await waitFor(() => expect(screen.getByLabelText("当前画布名称")).toHaveValue("接口项目"));

    const scenesSection = screen.getByRole("button", { name: "场景" }).closest("section") as HTMLElement;
    const scenesInput = scenesSection.querySelector("input") as HTMLInputElement;
    fireEvent.change(scenesInput, { target: { files: [file] } });

    expect(await screen.findByText("场景-百家老宅")).toBeInTheDocument();
    expect(companyApiFacade.uploadCanvasAsset).toHaveBeenCalledWith({
      projectId: "cmq6fwhft0bg5m2l5u78zby8x",
      snapshot: originalSnapshot,
      file,
      name: "场景-百家老宅",
      kind: "image",
      category: "scenes"
    });
  });

  it("uploads local audio through the same canvas node flow and keeps it in the audio section", async () => {
    const file = new File(["audio"], "voice-over.mp3", { type: "audio/mpeg" });
    const originalSnapshot = { snapshot: { nodes: [] } };
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: originalSnapshot,
      assets: []
    });
    vi.mocked(companyApiFacade.uploadCanvasAsset).mockResolvedValue({
      ok: true,
      snapshot: {
        snapshot: {
          nodes: [
            {
              id: "uploaded-audio-node",
              type: "audio-node",
              data: {
                name: "音频-voice-over",
                kind: "audio",
                category: "audio",
                audioUrl: "https://example.com/voice-over.mp3",
                sizeBytes: 5
              }
            }
          ]
        }
      },
      asset: {
        id: "uploaded-audio-node",
        name: "音频-voice-over",
        kind: "audio",
        category: "audio",
        url: "https://example.com/voice-over.mp3",
        sizeBytes: 5
      }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await waitFor(() => expect(screen.getByLabelText("当前画布名称")).toHaveValue("接口项目"));

    const audioSection = screen.getByRole("button", { name: "音频" }).closest("section") as HTMLElement;
    const audioInput = audioSection.querySelector("input") as HTMLInputElement;
    fireEvent.change(audioInput, { target: { files: [file] } });

    expect(await screen.findByText("音频-voice-over")).toBeInTheDocument();
    expect(audioSection).toHaveTextContent("音频-voice-over");
    expect(companyApiFacade.uploadCanvasAsset).toHaveBeenCalledWith({
      projectId: "cmq6fwhft0bg5m2l5u78zby8x",
      snapshot: originalSnapshot,
      file,
      name: "音频-voice-over",
      kind: "audio",
      category: "audio"
    });
  });

  it("checks auth state from the company API facade", async () => {
    vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176", creditBalance: 23136 }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "检查登录态" }));

    expect(await screen.findByText("已登录：23176")).toBeInTheDocument();
    expect(screen.getByText("23176")).toBeInTheDocument();
    expect(screen.getByLabelText("剩余积分 23,136")).toBeInTheDocument();
  });

  it("opens the company login window and applies the returned auth state", async () => {
    vi.mocked(companyApiFacade.openLogin).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176", creditBalance: 23136 }
    });
    vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176", creditBalance: 23136 }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "登录公司账号" }));

    expect(await screen.findByText("已登录：23176")).toBeInTheDocument();
    expect(screen.getByLabelText("剩余积分 23,136")).toBeInTheDocument();
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
      snapshot: {
        snapshot: {
          nodes: []
        }
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
    expect(screen.getByRole("button", { name: "打开画布 接口项目" })).toBeInTheDocument();
    expect(screen.getByText("已加载 1 个资源")).toBeInTheDocument();
  });

  it("persists canvas history names and applies saved local asset layout when reloading the same canvas", async () => {
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: {
        snapshot: {
          nodes: []
        }
      },
      assets: [
        {
          id: "api-a",
          name: "接口图片 A",
          kind: "image",
          category: "characters",
          url: "https://example.com/a.png"
        },
        {
          id: "api-b",
          name: "接口图片 B",
          kind: "image",
          category: "characters",
          url: "https://example.com/b.png"
        }
      ]
    });

    const { unmount } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await waitFor(() => expect(screen.getByLabelText("当前画布名称")).toHaveValue("接口项目"));
    fireEvent.change(screen.getByLabelText("当前画布名称"), { target: { value: "我的第一块画布" } });
    fireEvent.click(screen.getByRole("button", { name: "保存画布名称" }));
    fireEvent.dragStart(screen.getByText("接口图片 A").closest("article") as HTMLElement);
    fireEvent.drop(screen.getByRole("button", { name: "场景" }).closest("section") as HTMLElement);

    const scenesSection = screen.getByRole("button", { name: "场景" }).closest("section") as HTMLElement;
    expect(scenesSection).toHaveTextContent("接口图片 A");
    unmount();

    render(<App />);

    expect(screen.getByRole("button", { name: "打开画布 我的第一块画布" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开画布 我的第一块画布" }));
    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));

    await screen.findByText("接口图片 B");
    const reloadedScenesSection = screen.getByRole("button", { name: "场景" }).closest("section") as HTMLElement;
    expect(reloadedScenesSection).toHaveTextContent("接口图片 A");
    const reloadedCharactersSection = screen.getByRole("button", { name: "人物" }).closest("section") as HTMLElement;
    expect(reloadedCharactersSection).toHaveTextContent("接口图片 B");
    expect(reloadedCharactersSection).not.toHaveTextContent("接口图片 A");
  });

  it("deletes a saved canvas history entry after confirmation", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: { snapshot: { nodes: [] } },
      assets: [
        {
          id: "api-image",
          name: "小区楼道",
          kind: "image",
          category: "characters",
          url: "https://example.com/image.png"
        }
      ]
    });

    const { unmount } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await waitFor(() => expect(screen.getByLabelText("当前画布名称")).toHaveValue("接口项目"));
    fireEvent.change(screen.getByLabelText("当前画布名称"), { target: { value: "要删除的画布" } });
    fireEvent.click(screen.getByRole("button", { name: "保存画布名称" }));

    expect(screen.getByRole("button", { name: "打开画布 要删除的画布" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除历史画布 要删除的画布" }));

    expect(window.confirm).toHaveBeenCalledWith("确定要删除历史画布「要删除的画布」吗？");
    expect(screen.queryByRole("button", { name: "打开画布 要删除的画布" })).not.toBeInTheDocument();
    unmount();

    render(<App />);

    expect(screen.queryByRole("button", { name: "打开画布 要删除的画布" })).not.toBeInTheDocument();
  });

  it("opens a company window for shared canvas links instead of loading resources directly", async () => {
    vi.mocked(companyApiFacade.openLogin).mockResolvedValue({
      status: "unauthenticated",
      message: "登录窗口已打开，请点击查看后复制进入后的画布地址"
    });
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText("粘贴画布地址，例如 http://qijing.kjjhz.cn/canvas/..."), {
      target: { value: "http://qijing.kjjhz.cn/share/3xYG8A11G2Z9BsNlQX2p97nafHVWrTFV" }
    });
    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));

    await waitFor(() => expect(companyApiFacade.openLogin).toHaveBeenCalledWith("http://qijing.kjjhz.cn/share/3xYG8A11G2Z9BsNlQX2p97nafHVWrTFV"));
    expect(companyApiFacade.loadCanvasResources).not.toHaveBeenCalled();
    expect(screen.getByText("分享链接已打开，请在窗口里点击查看，再复制进入后的画布地址重新加载")).toBeInTheDocument();
  });

  it("hides the standalone 接口诊断 entry now that it is folded into the login window", () => {
    render(<App />);

    expect(screen.queryByRole("button", { name: "接口诊断" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录公司账号" })).toBeInTheDocument();
  });

  it("hides the company canvas creation entry while keeping local canvas creation available", async () => {
    render(<App />);

    expect(screen.queryByRole("button", { name: "新建公司画布" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增画布" })).toBeInTheDocument();
    expect(companyApiFacade.createCompanyCanvas).not.toHaveBeenCalled();
  });

  it("logs out and clears loaded company canvas state", async () => {
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: { snapshot: { nodes: [] } },
      assets: [
        {
          id: "api-image",
          name: "人物-接口图片",
          kind: "image",
          category: "characters",
          url: "https://example.com/image.png"
        }
      ]
    });
    vi.mocked(companyApiFacade.logout).mockResolvedValue({
      status: "unauthenticated",
      message: "已退出登录"
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await screen.findByText("人物-接口图片");
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => expect(companyApiFacade.logout).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("人物-接口图片")).not.toBeInTheDocument();
    expect(screen.getByText("小区楼道")).toBeInTheDocument();
    expect(screen.getAllByText("已退出登录").length).toBeGreaterThan(0);
  });

  it("builds a local generation payload preview without submitting the company API", async () => {
    vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176", creditBalance: 23136 }
    });
    render(<App />);

    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
    fireEvent.change(screen.getByPlaceholderText(promptPlaceholder), {
      target: { value: "图片1是女主，镜头缓慢推进" }
    });
    fireEvent.click(screen.getByRole("button", { name: generateButtonName }));

    expect(await screen.findByText("已生成 9:16 · 15s · 全能参考 请求预览，未提交公司接口")).toBeInTheDocument();
    expect(screen.getByText(/Seedance 2.0/)).toBeInTheDocument();
    expect(companyApiFacade.checkAuth).toHaveBeenCalledTimes(2);
  });

  it("requires prompt text instead of using selected resource names as the prompt", async () => {
    vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176", creditBalance: 23136 }
    });
    render(<App />);

    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
    fireEvent.click(screen.getByRole("button", { name: generateButtonName }));

    expect(await screen.findByText("请输入提示词")).toBeInTheDocument();
    expect(screen.queryByText("已生成 9:16 · 15s · 全能参考 请求预览，未提交公司接口")).not.toBeInTheDocument();
  });

  it("submits real generation for a loaded canvas, shows a loading card, then replaces it with the returned video", async () => {
    vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176", creditBalance: 23136 }
    });
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: { snapshot: { nodes: [] } },
      assets: [
        {
          id: "api-image",
          name: "小区楼道",
          kind: "image",
          category: "characters",
          url: "https://example.com/image.png"
        }
      ]
    });
    let resolveGeneration: (value: { taskId: string; videoUrl: string }) => void = () => undefined;
    vi.mocked(companyApiFacade.generateVideo).mockReturnValue(
      new Promise((resolve) => {
        resolveGeneration = resolve;
      })
    );
    vi.mocked(companyApiFacade.saveCanvasAsset).mockResolvedValue({
      ok: true,
      asset: {
        id: "generated-video-node",
        name: "生成视频 1",
        kind: "video",
        category: "video",
        url: "https://example.com/generated.mp4",
        sizeBytes: 1234
      },
      snapshot: {
        snapshot: {
          nodes: [
            {
              id: "generated-video-node",
              type: "video-node",
              x: 0,
              y: 0,
              position: { x: 0, y: 0 },
              data: {
                id: "generated-video-node",
                assetId: "generated-video-node",
                name: "生成视频 1",
                type: "video",
                kind: "video",
                category: "video",
                videoUrl: "https://example.com/generated.mp4",
                sizeBytes: 1234
              }
            }
          ]
        }
      }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await waitFor(() => expect(screen.getByLabelText("当前画布名称")).toHaveValue("接口项目"));
    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
    fireEvent.change(screen.getByPlaceholderText(promptPlaceholder), {
      target: { value: "镜头缓慢推进" }
    });

    fireEvent.click(screen.getByRole("button", { name: generateButtonName }));

    expect(await screen.findByText("生成视频 1")).toBeInTheDocument();
    expect(screen.getByText("生成中")).toBeInTheDocument();
    resolveGeneration({ taskId: "task-1", videoUrl: "https://example.com/generated.mp4" });

    await waitFor(() => {
      const generatedVideo = screen.getByText("生成视频 1").closest("article")?.querySelector("video") as HTMLVideoElement;
      expect(generatedVideo).toHaveAttribute("src", "https://example.com/generated.mp4");
    });
    expect(screen.queryByText("生成中")).not.toBeInTheDocument();
    expect(screen.getByText(/已生成真实视频：生成视频 1/)).toBeInTheDocument();
    expect(companyApiFacade.saveCanvasAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        name: "生成视频 1",
        snapshot: { snapshot: { nodes: [] } },
        kind: "video",
        category: "video",
        url: "https://example.com/generated.mp4"
      })
    );
    expect(companyApiFacade.generateVideo).toHaveBeenCalledWith({
      projectId: "cmq6fwhft0bg5m2l5u78zby8x",
      nodeId: expect.stringMatching(/^generated-video-/),
      prompt: "镜头缓慢推进",
      references: [
        expect.objectContaining({
          name: "小区楼道",
          kind: "image",
          url: "https://example.com/image.png"
        })
      ],
      settings: {
        aspectRatio: "9:16", resolution: "720p",
        durationSeconds: 15,
        omnireference: true,
        webSearch: false
      }
    });
  });

  it("submits real image generation for a loaded canvas and adds the returned image", async () => {
    vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176", creditBalance: 23136 }
    });
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: { snapshot: { nodes: [] } },
      assets: []
    });
    vi.mocked(companyApiFacade.generateImage).mockResolvedValue({
      taskId: "img-task-1",
      imageUrl: "https://example.com/generated.png"
    });
    vi.mocked(companyApiFacade.saveCanvasAsset).mockResolvedValue({
      ok: true,
      asset: {
        id: "generated-image-node",
        name: "生成图片 1",
        kind: "image",
        category: "characters",
        url: "https://example.com/generated.png",
        sizeBytes: 999
      },
      snapshot: { snapshot: { nodes: [] } }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await waitFor(() => expect(screen.getByLabelText("当前画布名称")).toHaveValue("接口项目"));

    fireEvent.click(screen.getByRole("tab", { name: "图片生成" }));
    fireEvent.change(screen.getByPlaceholderText(promptPlaceholder), {
      target: { value: "一个站立的女人" }
    });
    fireEvent.click(screen.getByRole("button", { name: "生成图片" }));

    await waitFor(() => expect(companyApiFacade.generateImage).toHaveBeenCalled());
    expect(companyApiFacade.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        nodeId: expect.stringMatching(/^generated-image-/),
        prompt: "一个站立的女人",
        settings: expect.objectContaining({ model: "GPT-Image-2(兑吧)", category: "人物" })
      })
    );
    await waitFor(() =>
      expect(companyApiFacade.saveCanvasAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "image",
          category: "characters",
          url: "https://example.com/generated.png"
        })
      )
    );
    expect(await screen.findByText(/已生成图片：生成图片 1/)).toBeInTheDocument();
  });

  it("clears prompt and references immediately after submitting image generation", async () => {
    vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176", creditBalance: 23136 }
    });
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: { snapshot: { nodes: [] } },
      assets: [
        {
          id: "ref-image-1",
          name: "参考图",
          kind: "image",
          category: "characters",
          url: "https://example.com/ref.png",
          createdAt: "2026-02-01T00:00:00.000Z"
        }
      ]
    });
    // Never resolves: assert clearing happens at submit time, before completion.
    vi.mocked(companyApiFacade.generateImage).mockReturnValue(new Promise(() => {}));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await waitFor(() => expect(screen.getByLabelText("当前画布名称")).toHaveValue("接口项目"));

    // Add an image reference, then type a prompt.
    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
    expect(referenceChips()).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText(promptPlaceholder), {
      target: { value: "一个站立的女人" }
    });

    fireEvent.click(screen.getByRole("tab", { name: "图片生成" }));
    fireEvent.click(screen.getByRole("button", { name: "生成图片" }));

    await waitFor(() => expect(companyApiFacade.generateImage).toHaveBeenCalled());
    // Submitted reference urls must still reflect the pre-clear selection.
    expect(companyApiFacade.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ referenceImageUrls: expect.arrayContaining([expect.stringMatching(/^https?:/)]) })
    );
    expect(screen.getByPlaceholderText(promptPlaceholder)).toHaveValue("");
    expect(referenceChips()).toHaveLength(0);
  });

  it("resumes polling for an unfinished image task after reopening (load)", async () => {
    const projectId = "cmq6fwhft0bg5m2l5u78zby8x";
    // Simulate the Electron local store holding a still-running image task.
    window.ovoDesktop = {
      version: "test",
      localStore: {
        read: vi.fn().mockResolvedValue({
          schemaVersion: 1,
          projectId,
          canvasName: "接口项目",
          canvasUrl: `http://qijing.kjjhz.cn/canvas/${projectId}`,
          assets: [
            {
              id: "generated-image-resume",
              name: "生成图片 1",
              kind: "image",
              category: "characters",
              url: "",
              status: "generating"
            }
          ],
          pendingTasks: [
            {
              nodeId: "generated-image-resume",
              taskId: "img-task-resume",
              kind: "image",
              category: "characters",
              prompt: "续轮询",
              startTime: Date.now(),
              status: "running"
            }
          ],
          updatedAt: new Date().toISOString()
        }),
        write: vi.fn().mockResolvedValue({ ok: true })
      }
    } as unknown as Window["ovoDesktop"];

    vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176", creditBalance: 23136 }
    });
    // Remote does not yet have the node (still generating server-side).
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId,
        canvasUrl: `http://qijing.kjjhz.cn/canvas/${projectId}`,
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: { snapshot: { nodes: [] } },
      assets: []
    });
    vi.mocked(companyApiFacade.pollImageResult).mockResolvedValue({
      taskId: "img-task-resume",
      imageUrl: "https://example.com/resumed-done.png"
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await waitFor(() => expect(screen.getByLabelText("当前画布名称")).toHaveValue("接口项目"));

    await waitFor(() =>
      expect(companyApiFacade.pollImageResult).toHaveBeenCalledWith({
        projectId,
        nodeId: "generated-image-resume",
        taskId: "img-task-resume"
      })
    );
    expect(await screen.findByText(/已恢复并完成图片生成/)).toBeInTheDocument();
  });

  it("updates the real generation activity item with the final elapsed time", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176", creditBalance: 23136 }
    });
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: { snapshot: { nodes: [] } },
      assets: [
        {
          id: "api-image",
          name: "小区楼道",
          kind: "image",
          category: "characters",
          url: "https://example.com/image.png"
        }
      ]
    });
    let resolveGeneration: (value: { taskId: string; videoUrl: string }) => void = () => undefined;
    vi.mocked(companyApiFacade.generateVideo).mockReturnValue(
      new Promise((resolve) => {
        resolveGeneration = resolve;
      })
    );
    vi.mocked(companyApiFacade.saveCanvasAsset).mockResolvedValue({
      ok: true,
      asset: {
        id: "generated-video-node",
        name: "生成视频 1",
        kind: "video",
        category: "video",
        url: "https://example.com/generated.mp4"
      },
      snapshot: { snapshot: { nodes: [] } }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await waitFor(() => expect(screen.getByLabelText("当前画布名称")).toHaveValue("接口项目"));
    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
    fireEvent.change(screen.getByPlaceholderText(promptPlaceholder), {
      target: { value: "镜头缓慢推进" }
    });
    fireEvent.click(screen.getByRole("button", { name: generateButtonName }));

    expect(await screen.findByText("正在生成真实视频：生成视频 1（已等待 0分0秒）")).toBeInTheDocument();

    vi.mocked(Date.now).mockReturnValue(66_000);
    resolveGeneration({ taskId: "task-1", videoUrl: "https://example.com/generated.mp4" });

    expect(await screen.findByText("已生成真实视频：生成视频 1（用时 1分5秒）")).toBeInTheDocument();
    expect(screen.queryByText("正在生成真实视频：生成视频 1（已等待 0分0秒）")).not.toBeInTheDocument();

    const generatedActivityItems = within(screen.getByRole("list", { name: "提示记录列表" }))
      .getAllByRole("listitem")
      .filter((item) => item.textContent?.includes("生成视频 1"));
    expect(generatedActivityItems).toHaveLength(1);
  });

  it("updates the in-progress real generation activity item without stacking timer messages", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176", creditBalance: 23136 }
    });
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: { snapshot: { nodes: [] } },
      assets: [
        {
          id: "api-image",
          name: "小区楼道",
          kind: "image",
          category: "characters",
          url: "https://example.com/image.png"
        }
      ]
    });
    let resolveGeneration: (value: { taskId: string; videoUrl: string }) => void = () => undefined;
    vi.mocked(companyApiFacade.generateVideo).mockReturnValue(
      new Promise((resolve) => {
        resolveGeneration = resolve;
      })
    );
    vi.mocked(companyApiFacade.saveCanvasAsset).mockResolvedValue({
      ok: true,
      asset: {
        id: "generated-video-node",
        name: "生成视频 1",
        kind: "video",
        category: "video",
        url: "https://example.com/generated.mp4"
      },
      snapshot: { snapshot: { nodes: [] } }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await waitFor(() => expect(screen.getByLabelText("当前画布名称")).toHaveValue("接口项目"));
    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
    fireEvent.change(screen.getByPlaceholderText(promptPlaceholder), {
      target: { value: "镜头缓慢推进" }
    });
    fireEvent.click(screen.getByRole("button", { name: generateButtonName }));

    expect(await screen.findByText("正在生成真实视频：生成视频 1（已等待 0分0秒）")).toBeInTheDocument();

    vi.mocked(Date.now).mockReturnValue(6_000);

    expect(await screen.findByText("正在生成真实视频：生成视频 1（已等待 0分5秒）")).toBeInTheDocument();
    expect(screen.queryByText("正在生成真实视频：生成视频 1（已等待 0分0秒）")).not.toBeInTheDocument();

    const generatedActivityItems = within(screen.getByRole("list", { name: "提示记录列表" }))
      .getAllByRole("listitem")
      .filter((item) => item.textContent?.includes("生成视频 1"));
    expect(generatedActivityItems).toHaveLength(1);

    resolveGeneration({ taskId: "task-1", videoUrl: "https://example.com/generated.mp4" });
    await screen.findByText("已生成真实视频：生成视频 1（用时 0分5秒）");
  });

  it("passes provider video URLs into the canvas save flow after generation", async () => {
    vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176", creditBalance: 23136 }
    });
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: { snapshot: { nodes: [] } },
      assets: [
        {
          id: "api-image",
          name: "小区楼道",
          kind: "image",
          category: "characters",
          url: "https://example.com/image.png"
        }
      ]
    });
    vi.mocked(companyApiFacade.generateVideo).mockResolvedValue({
      taskId: "task-1",
      videoUrl: "https://example.com/generated.mp4",
      providerVideoUrl: "https://provider.example.com/generated.mp4",
      persisted: true
    });
    vi.mocked(companyApiFacade.saveCanvasAsset).mockResolvedValue({
      ok: true,
      asset: {
        id: "generated-video-node",
        name: "生成视频 1",
        kind: "video",
        category: "video",
        url: "https://example.com/generated.mp4",
        providerVideoUrl: "https://provider.example.com/generated.mp4"
      },
      snapshot: { snapshot: { nodes: [] } }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await waitFor(() => expect(screen.getByLabelText("当前画布名称")).toHaveValue("接口项目"));
    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
    fireEvent.change(screen.getByPlaceholderText(promptPlaceholder), {
      target: { value: "镜头缓慢推进" }
    });
    fireEvent.click(screen.getByRole("button", { name: generateButtonName }));

    await waitFor(() =>
      expect(companyApiFacade.saveCanvasAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://example.com/generated.mp4",
          providerVideoUrl: "https://provider.example.com/generated.mp4"
        })
      )
    );
  });

  it("clears the prompt and selected references after submitting a real generation", async () => {
    vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176", creditBalance: 23136 }
    });
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: { snapshot: { nodes: [] } },
      assets: [
        {
          id: "api-image",
          name: "人物-小区楼道",
          kind: "image",
          category: "characters",
          url: "https://example.com/image.png"
        }
      ]
    });
    vi.mocked(companyApiFacade.generateVideo).mockResolvedValue({
      taskId: "task-1",
      videoUrl: "https://example.com/generated.mp4"
    });
    vi.mocked(companyApiFacade.saveCanvasAsset).mockResolvedValue({
      ok: true,
      asset: {
        id: "generated-video-node",
        name: "生成视频 1",
        kind: "video",
        category: "video",
        url: "https://example.com/generated.mp4"
      },
      snapshot: { snapshot: { nodes: [] } }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await screen.findByText("人物-小区楼道");
    fireEvent.click(screen.getByRole("button", { name: "加入提示词 人物-小区楼道" }));
    fireEvent.change(screen.getByPlaceholderText(promptPlaceholder), {
      target: { value: "镜头缓慢推进" }
    });
    fireEvent.click(screen.getByRole("button", { name: generateButtonName }));

    await waitFor(() => expect(screen.getByPlaceholderText(promptPlaceholder)).toHaveValue(""));
    expect(referenceChips()).toHaveLength(0);
  });

  it("creates a subtitle-removal placeholder and replaces it with the returned video", async () => {
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: { snapshot: { nodes: [] } },
      assets: [
        {
          id: "video-1",
          name: "生成视频 1",
          kind: "video",
          category: "video",
          url: "https://example.com/video.mp4",
          providerVideoUrl: "https://provider.example.com/video.mp4"
        }
      ]
    });
    let resolveRemoval: (value: Awaited<ReturnType<typeof companyApiFacade.removeSubtitles>>) => void = () => undefined;
    vi.mocked(companyApiFacade.removeSubtitles).mockReturnValue(
      new Promise((resolve) => {
        resolveRemoval = resolve;
      })
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await screen.findByText("生成视频 1");
    fireEvent.click(screen.getByRole("button", { name: "去除字幕 生成视频 1" }));

    expect(await screen.findByText("去字幕-生成视频 1")).toBeInTheDocument();
    expect(screen.getByText("去字幕中")).toBeInTheDocument();
    expect(companyApiFacade.removeSubtitles).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        sourceAsset: expect.objectContaining({
          id: "video-1",
          providerVideoUrl: "https://provider.example.com/video.mp4"
        }),
        placeholderAsset: expect.objectContaining({
          name: "去字幕-生成视频 1",
          status: "generating",
          statusLabel: "去字幕中"
        })
      })
    );
    const placeholder = vi.mocked(companyApiFacade.removeSubtitles).mock.calls[0][0].placeholderAsset;
    resolveRemoval({
      ok: true,
      asset: {
        id: placeholder.id,
        name: placeholder.name,
        kind: "video",
        category: "video",
        url: "https://example.com/no-subtitles.mp4"
      },
      snapshot: { snapshot: { nodes: [] } },
      result: {
        runId: "hb:subtitle-1",
        videoUrl: "https://example.com/no-subtitles.mp4",
        route: "paid"
      }
    });

    await waitFor(() => {
      const video = screen.getByText("去字幕-生成视频 1").closest("article")?.querySelector("video") as HTMLVideoElement;
      expect(video).toHaveAttribute("src", "https://example.com/no-subtitles.mp4");
    });
    expect(screen.queryByText("去字幕中")).not.toBeInTheDocument();
  });

  it("keeps the generation placeholder when a concurrent subtitle removal finishes first", async () => {
    vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176", creditBalance: 23136 }
    });
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: { snapshot: { nodes: [] } },
      assets: [
        {
          id: "ref-image",
          name: "小区楼道",
          kind: "image",
          category: "characters",
          url: "https://example.com/image.png"
        },
        {
          id: "video-1",
          name: "原片",
          kind: "video",
          category: "video",
          url: "https://example.com/video.mp4",
          providerVideoUrl: "https://provider.example.com/video.mp4"
        }
      ]
    });

    let resolveRemoval: (value: Awaited<ReturnType<typeof companyApiFacade.removeSubtitles>>) => void = () => undefined;
    vi.mocked(companyApiFacade.removeSubtitles).mockReturnValue(
      new Promise((resolve) => {
        resolveRemoval = resolve;
      })
    );
    let resolveGeneration: (value: { taskId: string; videoUrl: string }) => void = () => undefined;
    vi.mocked(companyApiFacade.generateVideo).mockReturnValue(
      new Promise((resolve) => {
        resolveGeneration = resolve;
      })
    );
    vi.mocked(companyApiFacade.saveCanvasAsset).mockResolvedValue({
      ok: true,
      asset: {
        id: "generated-video-node",
        name: "生成视频 1",
        kind: "video",
        category: "video",
        url: "https://example.com/generated.mp4"
      },
      snapshot: { snapshot: { nodes: [] } }
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await screen.findByText("原片");

    // 1) Start subtitle removal on the existing video (placeholder S).
    fireEvent.click(screen.getByRole("button", { name: "去除字幕 原片" }));
    await screen.findByText("去字幕-原片");

    // 2) Start a new generation (placeholder G) while S is still pending.
    fireEvent.click(screen.getByRole("button", { name: "加入提示词 小区楼道" }));
    fireEvent.change(screen.getByPlaceholderText(promptPlaceholder), {
      target: { value: "镜头缓慢推进" }
    });
    fireEvent.click(screen.getByRole("button", { name: generateButtonName }));
    expect(await screen.findByText("生成视频 1")).toBeInTheDocument();
    expect(screen.getByText("生成中")).toBeInTheDocument();

    // 3) Subtitle removal finishes FIRST — must not drop the generation placeholder.
    const placeholder = vi.mocked(companyApiFacade.removeSubtitles).mock.calls[0][0].placeholderAsset;
    resolveRemoval({
      ok: true,
      asset: {
        id: placeholder.id,
        name: placeholder.name,
        kind: "video",
        category: "video",
        url: "https://example.com/no-subtitles.mp4"
      },
      snapshot: { snapshot: { nodes: [] } },
      result: { runId: "hb:subtitle-1", videoUrl: "https://example.com/no-subtitles.mp4", route: "paid" }
    });

    await waitFor(() => {
      const video = screen.getByText("去字幕-原片").closest("article")?.querySelector("video") as HTMLVideoElement;
      expect(video).toHaveAttribute("src", "https://example.com/no-subtitles.mp4");
    });
    // The generation placeholder survives the subtitle completion.
    expect(screen.getByText("生成视频 1")).toBeInTheDocument();
    expect(screen.getByText("生成中")).toBeInTheDocument();

    // 4) Generation finishes — both nodes end up correct; the subtitle node is not resurrected.
    resolveGeneration({ taskId: "task-1", videoUrl: "https://example.com/generated.mp4" });
    await waitFor(() => {
      const generated = screen.getByText("生成视频 1").closest("article")?.querySelector("video") as HTMLVideoElement;
      expect(generated).toHaveAttribute("src", "https://example.com/generated.mp4");
    });
    const subtitleVideo = screen.getByText("去字幕-原片").closest("article")?.querySelector("video") as HTMLVideoElement;
    expect(subtitleVideo).toHaveAttribute("src", "https://example.com/no-subtitles.mp4");
    expect(screen.queryByText("生成中")).not.toBeInTheDocument();
    expect(screen.queryByText("去字幕中")).not.toBeInTheDocument();
  });

  it("shows the real generation failure reason on the failed video card", async () => {
    vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176", creditBalance: 23136 }
    });
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: { snapshot: { nodes: [] } },
      assets: [
        {
          id: "api-image",
          name: "小区楼道",
          kind: "image",
          category: "characters",
          url: "https://example.com/image.png"
        }
      ]
    });
    vi.mocked(companyApiFacade.generateVideo).mockRejectedValue(new Error("参考素材不能为空"));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await waitFor(() => expect(screen.getByLabelText("当前画布名称")).toHaveValue("接口项目"));
    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
    fireEvent.change(screen.getByPlaceholderText(promptPlaceholder), {
      target: { value: "随机生成一个视频" }
    });
    fireEvent.click(screen.getByRole("button", { name: generateButtonName }));

    await waitFor(() => {
      expect(screen.getByText("生成视频 1").closest("article")).toHaveTextContent("参考素材不能为空");
    });
  });

  it("does not submit real generation without an image reference", async () => {
    vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176", creditBalance: 23136 }
    });
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: { snapshot: { nodes: [] } },
      assets: []
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await waitFor(() => expect(screen.getByLabelText("当前画布名称")).toHaveValue("接口项目"));
    fireEvent.change(screen.getByPlaceholderText(promptPlaceholder), {
      target: { value: "随机生成一个视频" }
    });
    fireEvent.click(screen.getByRole("button", { name: generateButtonName }));

    expect(await screen.findByText("真实生成至少需要 1 张参考图，请先添加图片参考素材")).toBeInTheDocument();
    expect(companyApiFacade.generateVideo).not.toHaveBeenCalled();
    expect(screen.queryByText("生成视频 1")).not.toBeInTheDocument();
  });

  it("reuses a generated video's prompt and source references when metadata exists", async () => {
    render(<App />);

    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
    fireEvent.change(screen.getByPlaceholderText(promptPlaceholder), {
      target: { value: "镜头缓慢推进，人物回头" }
    });
    fireEvent.click(screen.getByRole("button", { name: generateButtonName }));

    expect(await screen.findByText("生成视频 1")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(promptPlaceholder)).toHaveValue("");
    expect(referenceChips()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "复用提示词和资源 生成视频 1" }));

    expect(screen.getByPlaceholderText(promptPlaceholder)).toHaveValue("镜头缓慢推进，人物回头");
    expect(referenceChips()).toHaveLength(1);
    expect(referenceChips()[0]).toHaveTextContent("图片1");
    expect(referenceChips()[0]).toHaveTextContent("小区楼道");
  });

  it("renames image and video assets locally", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "重命名 小区楼道" }));
    const editor = screen.getByDisplayValue("小区楼道").closest("form") as HTMLElement;
    expect(editor.querySelector(".asset-name-editor-actions")).toBeInTheDocument();
    expect(editor.querySelector(".asset-name-editor-actions + input")).toBe(screen.getByDisplayValue("小区楼道"));
    fireEvent.change(screen.getByDisplayValue("小区楼道"), { target: { value: "小区楼道改名" } });
    fireEvent.click(screen.getByRole("button", { name: "保存名称" }));

    expect(await screen.findByText("小区楼道改名")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重命名 开场参考视频" }));
    fireEvent.change(screen.getByDisplayValue("开场参考视频"), { target: { value: "视频改名" } });
    fireEvent.click(screen.getByRole("button", { name: "保存名称" }));

    expect(await screen.findByText("视频改名")).toBeInTheDocument();
  });

  it("opens the name editor by double-clicking the visible asset name", async () => {
    render(<App />);

    fireEvent.doubleClick(screen.getByText("小区楼道"));
    fireEvent.change(screen.getByDisplayValue("小区楼道"), { target: { value: "场景-小区楼道" } });
    fireEvent.click(screen.getByRole("button", { name: "保存名称" }));

    expect(await screen.findByText("场景-小区楼道")).toBeInTheDocument();
  });

  it("keeps text selection inside the name editor from starting card drag", () => {
    render(<App />);

    fireEvent.doubleClick(screen.getByText("小区楼道"));
    const card = screen.getByDisplayValue("小区楼道").closest("article") as HTMLElement;
    const dragStart = vi.fn();
    card.addEventListener("dragstart", dragStart);

    fireEvent.dragStart(screen.getByDisplayValue("小区楼道"));

    expect(dragStart).not.toHaveBeenCalled();
  });

  it("deletes a real canvas asset after confirmation and syncs the snapshot", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: {
        snapshot: {
          nodes: [
            {
              id: "node-image",
              type: "image",
              data: {
                name: "接口图片",
                imageUrl: "https://example.com/image.png"
              }
            }
          ]
        }
      },
      assets: [
        {
          id: "node-image",
          name: "接口图片",
          kind: "image",
          category: "characters",
          url: "https://example.com/image.png"
        }
      ]
    });
    vi.mocked(companyApiFacade.deleteCanvasAsset).mockResolvedValue({
      ok: true,
      snapshot: {
        snapshot: {
          nodes: []
        }
      }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await screen.findByText("接口图片");
    fireEvent.click(screen.getByRole("button", { name: "删除 接口图片" }));

    expect(await screen.findByText("已删除「接口图片」")).toBeInTheDocument();
    expect(screen.queryByText("接口图片")).not.toBeInTheDocument();
    expect(companyApiFacade.deleteCanvasAsset).toHaveBeenCalledWith({
      projectId: "cmq6fwhft0bg5m2l5u78zby8x",
      snapshot: {
        snapshot: {
          nodes: [
            {
              id: "node-image",
              type: "image",
              data: {
                name: "接口图片",
                imageUrl: "https://example.com/image.png"
              }
            }
          ]
        }
      },
      assetId: "node-image"
    });
  });

  it("syncs renamed real canvas assets through the company API facade", async () => {
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: {
        snapshot: {
          nodes: [
            {
              id: "node-image",
              type: "image",
              data: {
                name: "接口图片",
                imageUrl: "https://example.com/image.png"
              }
            }
          ]
        }
      },
      assets: [
        {
          id: "node-image",
          name: "接口图片",
          kind: "image",
          category: "characters",
          url: "https://example.com/image.png"
        }
      ]
    });
    vi.mocked(companyApiFacade.renameCanvasAsset).mockResolvedValue({
      ok: true,
      snapshot: {
        snapshot: {
          nodes: [
            {
              id: "node-image",
              type: "image",
              data: {
                name: "接口图片改名",
                imageUrl: "https://example.com/image.png"
              }
            }
          ]
        }
      }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await screen.findByText("接口图片");
    fireEvent.click(screen.getByRole("button", { name: "重命名 接口图片" }));
    fireEvent.change(screen.getByDisplayValue("接口图片"), { target: { value: "接口图片改名" } });
    fireEvent.click(screen.getByRole("button", { name: "保存名称" }));

    expect(await screen.findByText("接口图片改名")).toBeInTheDocument();
    expect(companyApiFacade.renameCanvasAsset).toHaveBeenCalledWith({
      projectId: "cmq6fwhft0bg5m2l5u78zby8x",
      snapshot: {
        snapshot: {
          nodes: [
            {
              id: "node-image",
              type: "image",
              data: {
                name: "接口图片",
                imageUrl: "https://example.com/image.png"
              }
            }
          ]
        }
      },
      assetId: "node-image",
      name: "接口图片改名"
    });
    const promptNotes = within(screen.getByRole("list", { name: "提示记录列表" }));
    expect(await promptNotes.findByText("已同步名称：接口图片改名")).toBeInTheDocument();
    expect(within(screen.getByLabelText("画布加载")).queryByText("已同步名称：接口图片改名")).not.toBeInTheDocument();
  });

  it("selects section sorting across default, generated time, and name modes", async () => {
    render(<App />);

    const charactersSection = screen.getByRole("button", { name: "人物" }).closest("section") as HTMLElement;
    const beforeSortNames = Array.from(charactersSection.querySelectorAll(".asset-name")).map((node) => node.textContent);

    expect(screen.getByLabelText("人物排序")).toHaveValue("generated-desc");
    expect(screen.getByLabelText("视频排序")).toHaveValue("generated-desc");
    fireEvent.change(screen.getByLabelText("人物排序"), { target: { value: "name-asc" } });
    expect(Array.from(charactersSection.querySelectorAll(".asset-name")).map((node) => node.textContent)).toEqual([
      "高铁站",
      "绿色行李箱",
      "男主秦扬人脸参考",
      "小区楼道"
    ]);

    fireEvent.change(screen.getByLabelText("人物排序"), { target: { value: "name-desc" } });
    expect(Array.from(charactersSection.querySelectorAll(".asset-name")).map((node) => node.textContent)).toEqual([
      "小区楼道",
      "男主秦扬人脸参考",
      "绿色行李箱",
      "高铁站"
    ]);

    fireEvent.change(screen.getByLabelText("人物排序"), { target: { value: "default" } });
    expect(Array.from(charactersSection.querySelectorAll(".asset-name")).map((node) => node.textContent)).toEqual(beforeSortNames);
    expect(screen.getByText("紧张背景音乐")).toBeInTheDocument();
  });

  it("keeps the latest generated video at the top when video sorting uses generated time descending", async () => {
    render(<App />);

    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
    fireEvent.change(screen.getByPlaceholderText(promptPlaceholder), {
      target: { value: "第一个生成" }
    });
    fireEvent.click(screen.getByRole("button", { name: generateButtonName }));
    await screen.findByText("生成视频 1");

    fireEvent.change(screen.getByPlaceholderText(promptPlaceholder), {
      target: { value: "第二个生成" }
    });
    fireEvent.click(screen.getByRole("button", { name: generateButtonName }));
    await screen.findByText("生成视频 2");

    const videoSection = screen.getByRole("button", { name: "视频" }).closest("section") as HTMLElement;
    expect(Array.from(videoSection.querySelectorAll(".asset-name")).map((node) => node.textContent).slice(0, 2)).toEqual([
      "生成视频 2",
      "生成视频 1"
    ]);
  });

  it("defaults non-video categories to generated-desc, newest createdAt first", async () => {
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: { snapshot: { nodes: [] } },
      assets: [
        {
          id: "char-old",
          name: "较早角色",
          kind: "image",
          category: "characters",
          url: "https://example.com/old.png",
          createdAt: "2026-01-01T00:00:00.000Z"
        },
        {
          id: "char-new",
          name: "较晚角色",
          kind: "image",
          category: "characters",
          url: "https://example.com/new.png",
          createdAt: "2026-02-01T00:00:00.000Z"
        }
      ]
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await waitFor(() => expect(screen.getByLabelText("当前画布名称")).toHaveValue("接口项目"));

    expect(screen.getByLabelText("人物排序")).toHaveValue("generated-desc");
    const charactersSection = screen.getByRole("button", { name: "人物" }).closest("section") as HTMLElement;
    expect(Array.from(charactersSection.querySelectorAll(".asset-name")).map((node) => node.textContent)).toEqual([
      "较晚角色",
      "较早角色"
    ]);
  });

  it("reorders images inside the same section by drag and drop", async () => {
    render(<App />);

    const charactersSection = screen.getByRole("button", { name: "人物" }).closest("section") as HTMLElement;
    const firstCard = screen.getByText("小区楼道").closest("article") as HTMLElement;
    const targetCard = screen.getByText("男主秦扬人脸参考").closest("article") as HTMLElement;

    fireEvent.dragStart(firstCard);
    fireEvent.dragOver(targetCard);
    fireEvent.drop(targetCard);

    const names = Array.from(charactersSection.querySelectorAll(".asset-name")).map((node) => node.textContent);

    expect(names).toEqual(["高铁站", "男主秦扬人脸参考", "小区楼道", "绿色行李箱"]);
  });

  it("moves subtitle removal from generate settings onto video cards", () => {
    render(<App />);

    expect(screen.queryByLabelText("去除字幕")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "去除字幕 开场参考视频" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复用提示词和资源 开场参考视频" })).toBeDisabled();
  });

  it("shows generation controls for ratio, duration, and omnireference mode", async () => {
    render(<App />);

    expect(screen.getByLabelText("比例")).toHaveValue("9:16");
    expect(screen.getByLabelText("时长")).toHaveValue("15");
    expect(screen.getByRole("button", { name: "生成视频(需要150积分)" })).toBeInTheDocument();
    expect(screen.queryByText("需 150 积分")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "全能参考模式" })).not.toBeInTheDocument();
    expect(screen.getByText("全能参考")).toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
    fireEvent.change(screen.getByPlaceholderText(promptPlaceholder), {
      target: { value: "图片1是角色参考" }
    });
    fireEvent.change(screen.getByLabelText("比例"), { target: { value: "16:9" } });
    fireEvent.change(screen.getByLabelText("时长"), { target: { value: "12" } });
    expect(screen.getByRole("button", { name: "生成视频(需要120积分)" })).toBeInTheDocument();
    expect(screen.queryByText("需 120 积分")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "生成视频(需要120积分)" }));

    expect(await screen.findByText("已生成 16:9 · 12s · 全能参考 请求预览，未提交公司接口")).toBeInTheDocument();
  });

  it("keeps prompt note history with the newest message first", async () => {
    render(<App />);

    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
    fireEvent.change(screen.getByPlaceholderText(promptPlaceholder), {
      target: { value: "图片1是角色参考" }
    });
    fireEvent.click(screen.getByRole("button", { name: generateButtonName }));
    await screen.findByText("已生成 9:16 · 15s · 全能参考 请求预览，未提交公司接口");

    fireEvent.click(screen.getByRole("button", { name: generateButtonName }));
    await screen.findByText("请输入提示词");

    const noteItems = within(screen.getByRole("list", { name: "提示记录列表" })).getAllByRole("listitem");
    expect(noteItems.map((item) => item.textContent)).toEqual([
      "请输入提示词",
      "已生成 9:16 · 15s · 全能参考 请求预览，未提交公司接口"
    ]);
  });

  it("offers image category conversion actions only on image assets", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "设为场景图片 小区楼道" }));

    const sceneSection = screen.getByRole("button", { name: "场景" }).closest("section") as HTMLElement;
    expect(sceneSection).toHaveTextContent("场景-小区楼道");
    expect(screen.getByRole("button", { name: "设为人物图片 场景-小区楼道" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设为道具图片 场景-小区楼道" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "设为场景图片 开场参考视频" })).not.toBeInTheDocument();
  });

  it("navigates preview assets in the configured category order", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "放大预览 小区楼道" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "小区楼道 预览");
    expect(screen.getByRole("button", { name: "查看下一个节点" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "查看下一个节点" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "高铁站 预览");

    fireEvent.click(screen.getByRole("button", { name: "查看下一个节点" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "男主秦扬人脸参考 预览");
  });

  it("keeps preview navigation buttons grouped next to each other in the modal header", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "放大预览 小区楼道" }));

    const navGroup = screen.getByLabelText("预览切换");
    expect(navGroup).toContainElement(screen.getByRole("button", { name: "查看上一个节点" }));
    expect(navGroup).toContainElement(screen.getByRole("button", { name: "查看下一个节点" }));
    expect(navGroup).toHaveClass("preview-nav-group");
  });

  it("marks preview videos for full containment inside the modal", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "放大预览 开场参考视频" }));

    const previewVideo = screen.getByTitle("完整视频预览");
    expect(previewVideo).toHaveClass("preview-media");
  });

  it("uses loaded video dimensions to choose a portrait preview frame", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "放大预览 开场参考视频" }));

    const previewVideo = screen.getByTitle("完整视频预览") as HTMLVideoElement;
    Object.defineProperty(previewVideo, "videoWidth", { configurable: true, value: 720 });
    Object.defineProperty(previewVideo, "videoHeight", { configurable: true, value: 1280 });
    fireEvent.loadedMetadata(previewVideo);

    expect(previewVideo).toHaveClass("preview-media-portrait");
    expect(previewVideo).toHaveStyle({ aspectRatio: "720 / 1280" });
    expect(previewVideo).not.toHaveStyle({ contain: "size layout paint" });
  });

  it("disables preview navigation at the edges", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "放大预览 开场参考视频" }));
    expect(screen.getByRole("button", { name: "查看下一个节点" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "查看上一个节点" })).not.toBeDisabled();
  });

  it("renames category prefixes through the company snapshot when converting real image assets", async () => {
    const originalSnapshot = {
      snapshot: {
        nodes: [
          {
            id: "node-image",
            type: "image",
            data: {
              id: "node-image",
              assetId: "node-image",
              name: "人物-苏晚晴",
              imageUrl: "https://example.com/image.png"
            }
          }
        ]
      }
    };
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: originalSnapshot,
      assets: [
        {
          id: "node-image",
          name: "人物-苏晚晴",
          kind: "image",
          category: "characters",
          url: "https://example.com/image.png"
        }
      ]
    });
    vi.mocked(companyApiFacade.renameCanvasAsset).mockResolvedValue({
      ok: true,
      snapshot: {
        snapshot: {
          nodes: [
            {
              id: "node-image",
              type: "image",
              data: {
                name: "道具-苏晚晴",
                imageUrl: "https://example.com/image.png"
              }
            }
          ]
        }
      }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await screen.findByText("人物-苏晚晴");
    fireEvent.click(screen.getByRole("button", { name: "设为道具图片 人物-苏晚晴" }));

    expect(await screen.findByText("道具-苏晚晴")).toBeInTheDocument();
    expect(companyApiFacade.renameCanvasAsset).toHaveBeenCalledWith({
      projectId: "cmq6fwhft0bg5m2l5u78zby8x",
      snapshot: originalSnapshot,
      assetId: "node-image",
      name: "道具-苏晚晴"
    });
  });

  it("renames category prefixes through the company snapshot when dragging real image assets between sections", async () => {
    const originalSnapshot = {
      snapshot: {
        nodes: [
          {
            id: "node-image",
            type: "image",
            data: {
              id: "node-image",
              assetId: "node-image",
              name: "人物-苏晚晴",
              imageUrl: "https://example.com/image.png"
            }
          }
        ]
      }
    };
    vi.mocked(companyApiFacade.loadCanvasResources).mockResolvedValue({
      project: {
        projectId: "cmq6fwhft0bg5m2l5u78zby8x",
        canvasUrl: "http://qijing.kjjhz.cn/canvas/cmq6fwhft0bg5m2l5u78zby8x",
        title: "接口项目",
        loadedAt: "2026-06-15T00:00:00.000Z"
      },
      snapshot: originalSnapshot,
      assets: [
        {
          id: "node-image",
          name: "人物-苏晚晴",
          kind: "image",
          category: "characters",
          url: "https://example.com/image.png"
        }
      ]
    });
    vi.mocked(companyApiFacade.renameCanvasAsset).mockResolvedValue({
      ok: true,
      snapshot: {
        snapshot: {
          nodes: [
            {
              id: "node-image",
              type: "image",
              data: {
                name: "场景-苏晚晴",
                imageUrl: "https://example.com/image.png"
              }
            }
          ]
        }
      }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));
    await screen.findByText("人物-苏晚晴");
    fireEvent.dragStart(screen.getByText("人物-苏晚晴").closest("article") as HTMLElement);
    fireEvent.drop(screen.getByRole("button", { name: "场景" }).closest("section") as HTMLElement);

    expect(await screen.findByText("场景-苏晚晴")).toBeInTheDocument();
    expect(companyApiFacade.renameCanvasAsset).toHaveBeenCalledWith({
      projectId: "cmq6fwhft0bg5m2l5u78zby8x",
      snapshot: originalSnapshot,
      assetId: "node-image",
      name: "场景-苏晚晴"
    });
  });

  it("plays only one media asset globally and resets ended media to the beginning", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: play
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: pause
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "播放 紧张背景音乐" }));
    expect(play).toHaveBeenCalledTimes(1);
    const audio = document.querySelector("audio") as HTMLAudioElement;
    expect(audio.muted).toBe(false);
    expect(audio.volume).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "播放 开场参考视频" }));
    await waitFor(() => expect(pause).toHaveBeenCalled());
    expect(play).toHaveBeenCalledTimes(2);

    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(1);
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      writable: true,
      value: 8
    });
    fireEvent.ended(video);

    expect(video.currentTime).toBe(0);
    expect(screen.getByRole("button", { name: "播放 开场参考视频" })).toBeInTheDocument();
  });

  it("unmutes audio and video when playing from the overlay button", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: play
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "播放 紧张背景音乐" }));
    const audio = document.querySelector("audio") as HTMLAudioElement;
    expect(audio.muted).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "播放 开场参考视频" }));
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video.muted).toBe(false);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("orders card actions by asset category", () => {
    render(<App />);

    const imageCard = screen.getByText("小区楼道").closest("article") as HTMLElement;
    const imageActions = Array.from(imageCard.querySelectorAll(".asset-card-overlay button")).map((button) =>
      button.getAttribute("aria-label")
    );
    expect(imageActions).toEqual([
      "放大预览 小区楼道",
      "重命名 小区楼道",
      "下载资源 小区楼道",
      "加入提示词 小区楼道",
      "设为场景图片 小区楼道",
      "设为道具图片 小区楼道",
      "复用提示词和资源 小区楼道",
      "删除 小区楼道"
    ]);

    const audioCard = screen.getByText("紧张背景音乐").closest("article") as HTMLElement;
    const audioActions = Array.from(audioCard.querySelectorAll(".asset-card-overlay button")).map((button) =>
      button.getAttribute("aria-label")
    );
    expect(audioActions).toEqual([
      "放大预览 紧张背景音乐",
      "重命名 紧张背景音乐",
      "下载资源 紧张背景音乐",
      "加入提示词 紧张背景音乐",
      "播放 紧张背景音乐",
      "删除 紧张背景音乐"
    ]);

    const videoCard = screen.getByText("开场参考视频").closest("article") as HTMLElement;
    const videoActions = Array.from(videoCard.querySelectorAll(".asset-card-overlay button")).map((button) =>
      button.getAttribute("aria-label")
    );
    expect(videoActions).toEqual([
      "放大预览 开场参考视频",
      "重命名 开场参考视频",
      "下载资源 开场参考视频",
      "加入提示词 开场参考视频",
      "播放 开场参考视频",
      "复用提示词和资源 开场参考视频",
      "去除字幕 开场参考视频",
      "删除 开场参考视频"
    ]);
  });

  it("selects assets for batch desktop download from the header", async () => {
    const saveAssets = vi.fn().mockResolvedValue({ ok: true, directoryPath: "/Users/mac/Downloads/2026-06-15-201500" });
    Object.defineProperty(window, "ovoDesktop", {
      configurable: true,
      value: {
        file: { saveAssets },
        version: "0.1.0",
        auth: {},
        discovery: {},
        api: {}
      }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "多选下载" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "选择资源 小区楼道" }));
    fireEvent.click(screen.getByRole("button", { name: "下载选中 1" }));

    await waitFor(() => expect(saveAssets).toHaveBeenCalledTimes(1));
    expect(saveAssets.mock.calls[0][0].assets[0]).toMatchObject({
      url: expect.stringContaining("images.unsplash.com"),
      fileName: "小区楼道",
      category: "characters",
      categoryLabel: "人物"
    });
    expect(screen.getByText("已下载 1 个资源")).toBeInTheDocument();
  });

  it("selects all categories for batch desktop download from the header", async () => {
    const saveAssets = vi.fn().mockResolvedValue({ ok: true, directoryPath: "/Users/mac/Downloads/2026-06-15-201500" });
    Object.defineProperty(window, "ovoDesktop", {
      configurable: true,
      value: {
        file: { saveAssets },
        version: "0.1.0",
        auth: {},
        discovery: {},
        api: {}
      }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "多选下载" }));
    expect(screen.getByRole("button", { name: "全选" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "全选" }));
    expect(screen.getByRole("button", { name: "下载选中 6" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下载选中 6" }));

    await waitFor(() => expect(saveAssets).toHaveBeenCalledTimes(1));
    expect(saveAssets.mock.calls[0][0].assets).toHaveLength(6);
    expect(saveAssets.mock.calls[0][0].assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fileName: "小区楼道", category: "characters", categoryLabel: "人物" }),
        expect.objectContaining({ fileName: "紧张背景音乐.mp3", category: "audio", categoryLabel: "音频" }),
        expect.objectContaining({ fileName: "开场参考视频.mp4", category: "video", categoryLabel: "视频" })
      ])
    );
  });

  it("shows the app version beside the ovO logo and places update between credits and account", async () => {
    window.ovoDesktop = {
      version: "0.1.0",
      updater: {
        getCurrentVersion: vi.fn(async () => "0.1.7"),
        checkForUpdates: vi.fn(),
        downloadUpdate: vi.fn(),
        installUpdate: vi.fn(),
        onProgress: vi.fn(() => () => undefined)
      },
      auth: {
        openLoginWindow: vi.fn(),
        checkSession: vi.fn(),
        clearSession: vi.fn()
      },
      discovery: {
        inspectCanvas: vi.fn()
      },
      api: {
        request: vi.fn(),
        uploadFile: vi.fn()
      },
      file: {
        saveAsset: vi.fn()
      }
    };

    render(<App />);

    expect(await screen.findByText("v0.1.7")).toBeInTheDocument();
    const headerText = document.querySelector(".header-actions")?.textContent ?? "";
    expect(headerText.indexOf("--")).toBeLessThan(headerText.indexOf("更新版本"));
    expect(headerText.indexOf("更新版本")).toBeLessThan(headerText.indexOf("未登录"));
  });

  it("checks Gitee updates manually and switches to download state", async () => {
    const checkForUpdates = vi.fn(async () => ({
      ok: true as const,
      status: "available" as const,
      currentVersion: "0.1.1",
      latestVersion: "0.1.2",
      message: "发现新版本 v0.1.2",
      update: {
        releaseId: 7,
        tagName: "v0.1.2",
        version: "0.1.2",
        installerName: "ovO-0.1.2-x64-setup.exe",
        installerUrl: "https://gitee.com/setup.exe",
        latestYmlUrl: "https://gitee.com/latest.yml"
      }
    }));
    window.ovoDesktop = {
      version: "0.1.1",
      updater: {
        getCurrentVersion: vi.fn(async () => "0.1.1"),
        checkForUpdates,
        downloadUpdate: vi.fn(),
        installUpdate: vi.fn(),
        onProgress: vi.fn(() => () => undefined)
      },
      auth: {
        openLoginWindow: vi.fn(),
        checkSession: vi.fn(),
        clearSession: vi.fn()
      },
      discovery: {
        inspectCanvas: vi.fn()
      },
      api: {
        request: vi.fn(),
        uploadFile: vi.fn()
      },
      file: {
        saveAsset: vi.fn()
      }
    };

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "手动更新" }));

    expect(await screen.findByRole("button", { name: "手动更新" })).toHaveTextContent("下载更新");
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("shows 更新失败 when the manual Gitee check rejects", async () => {
    const checkForUpdates = vi.fn(async () => {
      throw new Error("IPC check failed");
    });
    window.ovoDesktop = {
      version: "0.1.1",
      updater: {
        getCurrentVersion: vi.fn(async () => "0.1.1"),
        checkForUpdates,
        downloadUpdate: vi.fn(),
        installUpdate: vi.fn(),
        onProgress: vi.fn(() => () => undefined)
      },
      auth: {
        openLoginWindow: vi.fn(),
        checkSession: vi.fn(),
        clearSession: vi.fn()
      },
      discovery: {
        inspectCanvas: vi.fn()
      },
      api: {
        request: vi.fn(),
        uploadFile: vi.fn()
      },
      file: {
        saveAsset: vi.fn()
      }
    };

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "手动更新" }));

    expect(await screen.findByRole("button", { name: "手动更新" })).toHaveTextContent("更新失败");
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("shows 更新失败 when the manual Gitee download rejects", async () => {
    const checkForUpdates = vi.fn(async () => ({
      ok: true as const,
      status: "available" as const,
      currentVersion: "0.1.1",
      latestVersion: "0.1.2",
      message: "发现新版本 v0.1.2",
      update: {
        releaseId: 7,
        tagName: "v0.1.2",
        version: "0.1.2",
        installerName: "ovO-0.1.2-x64-setup.exe",
        installerUrl: "https://gitee.com/setup.exe",
        latestYmlUrl: "https://gitee.com/latest.yml"
      }
    }));
    const downloadUpdate = vi.fn(async () => {
      throw new Error("IPC download failed");
    });
    window.ovoDesktop = {
      version: "0.1.1",
      updater: {
        getCurrentVersion: vi.fn(async () => "0.1.1"),
        checkForUpdates,
        downloadUpdate,
        installUpdate: vi.fn(),
        onProgress: vi.fn(() => () => undefined)
      },
      auth: {
        openLoginWindow: vi.fn(),
        checkSession: vi.fn(),
        clearSession: vi.fn()
      },
      discovery: {
        inspectCanvas: vi.fn()
      },
      api: {
        request: vi.fn(),
        uploadFile: vi.fn()
      },
      file: {
        saveAsset: vi.fn()
      }
    };

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "手动更新" }));
    expect(await screen.findByRole("button", { name: "手动更新" })).toHaveTextContent("下载更新");

    fireEvent.click(screen.getByRole("button", { name: "手动更新" }));

    expect(await screen.findByRole("button", { name: "手动更新" })).toHaveTextContent("更新失败");
    expect(downloadUpdate).toHaveBeenCalledTimes(1);
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
        generationSettings={{ aspectRatio: "9:16", resolution: "720p", durationSeconds: 5, omnireference: true, webSearch: false }}
        onGenerationSettingsChange={() => undefined}
        generateMode="video"
        onGenerateModeChange={() => undefined}
        imageGenerationSettings={{ model: "GPT-Image-2(兑吧)", aspectRatio: "9:16", quality: "high", camera: "暂不选择", category: "人物" }}
        onImageGenerationSettingsChange={() => undefined}
        onGenerateImage={() => undefined}
      />
    );

    expect(screen.getByText("图片最多 9 张")).toBeInTheDocument();
  });

  it("renders image hover previews in a large uncropped viewport", () => {
    const references: ReferenceItem[] = [
      {
        id: "wide",
        name: "横图",
        kind: "image",
        sizeBytes: 1024,
        source: "asset",
        previewUrl: "https://example.com/wide.png"
      }
    ];

    render(
      <PromptDock
        prompt=""
        references={references}
        onPromptChange={() => undefined}
        onRemoveReference={() => undefined}
        onLocalFilesSelected={() => undefined}
        onGenerate={() => undefined}
        generationSettings={{ aspectRatio: "16:9", resolution: "720p", durationSeconds: 5, omnireference: true, webSearch: false }}
        onGenerationSettingsChange={() => undefined}
        generateMode="video"
        onGenerateModeChange={() => undefined}
        imageGenerationSettings={{ model: "GPT-Image-2(兑吧)", aspectRatio: "9:16", quality: "high", camera: "暂不选择", category: "人物" }}
        onImageGenerationSettingsChange={() => undefined}
        onGenerateImage={() => undefined}
      />
    );

    fireEvent.mouseEnter(screen.getByRole("button", { name: "图片1 横图" }));

    expect(document.querySelector(".reference-hover-preview")).toHaveClass("reference-hover-preview-large");
    expect(screen.getByRole("img", { name: "横图 预览" })).toHaveClass("reference-hover-preview-image");
  });

  it("resizes the prompt editor from the top-right while the generate panel stays bottom-aligned", () => {
    render(
      <PromptDock
        prompt=""
        references={[]}
        onPromptChange={() => undefined}
        onRemoveReference={() => undefined}
        onLocalFilesSelected={() => undefined}
        onGenerate={() => undefined}
        generationSettings={{ aspectRatio: "9:16", resolution: "720p", durationSeconds: 5, omnireference: true, webSearch: false }}
        onGenerationSettingsChange={() => undefined}
        generateMode="video"
        onGenerateModeChange={() => undefined}
        imageGenerationSettings={{ model: "GPT-Image-2(兑吧)", aspectRatio: "9:16", quality: "high", camera: "暂不选择", category: "人物" }}
        onImageGenerationSettingsChange={() => undefined}
        onGenerateImage={() => undefined}
      />
    );

    const editor = document.querySelector(".prompt-token-editor") as HTMLElement;
    const handle = screen.getByRole("button", { name: "调整提示词高度" });

    expect(handle).toHaveClass("prompt-resize-handle");
    expect(document.querySelector(".prompt-token-editor textarea")).toHaveClass("prompt-resizable-textarea");
    expect(document.querySelector(".prompt-token-editor textarea")).toHaveStyle({ resize: "none" });
    expect(document.querySelector(".generate-panel")).toHaveClass("generate-panel-fixed");
    expect(editor).toHaveStyle({ height: "154px" });

    fireEvent(
      handle,
      new MouseEvent("pointerdown", {
        bubbles: true,
        clientY: 320
      })
    );
    fireEvent(
      window,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientY: 220
      })
    );

    expect(editor).toHaveStyle({ height: "254px" });

    fireEvent(
      window,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientY: 620
      })
    );
    fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));

    expect(editor).toHaveStyle({ height: "154px" });
  });

  it("places prompt, generation settings, and prompt notes in a three-column row", () => {
    render(
      <PromptDock
        prompt=""
        references={[]}
        onPromptChange={() => undefined}
        onRemoveReference={() => undefined}
        onLocalFilesSelected={() => undefined}
        onGenerate={() => undefined}
        generationSettings={{ aspectRatio: "9:16", resolution: "720p", durationSeconds: 15, omnireference: true, webSearch: false }}
        onGenerationSettingsChange={() => undefined}
        generateMode="video"
        onGenerateModeChange={() => undefined}
        imageGenerationSettings={{ model: "GPT-Image-2(兑吧)", aspectRatio: "9:16", quality: "high", camera: "暂不选择", category: "人物" }}
        onImageGenerationSettingsChange={() => undefined}
        onGenerateImage={() => undefined}
        activityMessages={["请输入提示词", "已生成 9:16 · 15s · 全能参考 请求预览，未提交公司接口"]}
      />
    );

    const row = document.querySelector(".prompt-row") as HTMLElement;
    const notes = screen.getByRole("region", { name: "提示记录" });

    expect(row).toHaveClass("prompt-row-three-column");
    expect(notes).toHaveClass("prompt-note-panel");
    // 中间栏现在是 generate-column,内嵌了 视频/图片 tab + 生成面板.
    const generateColumn = notes.previousElementSibling as HTMLElement;
    expect(generateColumn).toHaveClass("generate-column");
    expect(generateColumn.querySelector(".generate-mode-tabs")).not.toBeNull();
    expect(generateColumn.querySelector(".generate-panel")).not.toBeNull();
    expect(screen.getByRole("list", { name: "提示记录列表" })).toBeInTheDocument();
    expect(within(notes).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "请输入提示词",
      "已生成 9:16 · 15s · 全能参考 请求预览，未提交公司接口"
    ]);
    expect(screen.getByText("已生成 9:16 · 15s · 全能参考 请求预览，未提交公司接口")).toBeInTheDocument();
  });

  function renderDock(overrides: Partial<React.ComponentProps<typeof PromptDock>> = {}) {
    const props: React.ComponentProps<typeof PromptDock> = {
      prompt: "",
      references: [],
      onPromptChange: () => undefined,
      onRemoveReference: () => undefined,
      onLocalFilesSelected: () => undefined,
      onGenerate: () => undefined,
      generationSettings: { aspectRatio: "9:16", resolution: "720p", durationSeconds: 15, omnireference: true, webSearch: false },
      onGenerationSettingsChange: () => undefined,
      generateMode: "video",
      onGenerateModeChange: () => undefined,
      imageGenerationSettings: { model: "GPT-Image-2(兑吧)", aspectRatio: "9:16", quality: "high", camera: "暂不选择", category: "人物" },
      onImageGenerationSettingsChange: () => undefined,
      onGenerateImage: () => undefined,
      ...overrides
    };
    return render(<PromptDock {...props} />);
  }

  it("renders a video resolution selector defaulting to 720p with white generate button", () => {
    renderDock();

    const resolution = screen.getByLabelText("画质") as HTMLSelectElement;
    expect(resolution.value).toBe("720p");
    expect(Array.from(resolution.options).map((option) => option.value)).toEqual(["480p", "720p", "1080p"]);
    expect(screen.getByRole("button", { name: /生成视频/ })).toHaveClass("generate-button-light");
  });

  it("switches to the image generation tab and shows the image panel options", () => {
    const onGenerateModeChange = vi.fn();
    const { rerender } = renderDock({ onGenerateModeChange });

    fireEvent.click(screen.getByRole("tab", { name: "图片生成" }));
    expect(onGenerateModeChange).toHaveBeenCalledWith("image");

    rerender(
      <PromptDock
        prompt=""
        references={[]}
        onPromptChange={() => undefined}
        onRemoveReference={() => undefined}
        onLocalFilesSelected={() => undefined}
        onGenerate={() => undefined}
        generationSettings={{ aspectRatio: "9:16", resolution: "720p", durationSeconds: 15, omnireference: true, webSearch: false }}
        onGenerationSettingsChange={() => undefined}
        generateMode="image"
        onGenerateModeChange={onGenerateModeChange}
        imageGenerationSettings={{ model: "GPT-Image-2(兑吧)", aspectRatio: "9:16", quality: "high", camera: "暂不选择", category: "人物" }}
        onImageGenerationSettingsChange={() => undefined}
        onGenerateImage={() => undefined}
      />
    );

    expect((screen.getByLabelText("生图模型") as HTMLSelectElement).value).toBe("GPT-Image-2(兑吧)");
    expect((screen.getByLabelText("质量") as HTMLSelectElement).value).toBe("high");
    expect((screen.getByLabelText("摄像机") as HTMLSelectElement).value).toBe("暂不选择");
    expect((screen.getByLabelText("类别") as HTMLSelectElement).value).toBe("人物");
    expect(screen.getByRole("button", { name: /生成图片/ })).toHaveClass("generate-button-light");
  });

  it("exposes a full-width top edge for resizing the prompt box", () => {
    renderDock();
    expect(document.querySelector(".prompt-token-editor .prompt-resize-edge")).toBeInTheDocument();
  });
});
