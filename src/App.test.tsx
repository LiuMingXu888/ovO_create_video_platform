import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./services/companyApiFacade", () => ({
  companyApiFacade: {
    openLogin: vi.fn(),
    checkAuth: vi.fn(),
    loadCanvasResources: vi.fn(),
    renameCanvasAsset: vi.fn(),
    uploadCanvasAsset: vi.fn(),
    deleteCanvasAsset: vi.fn()
  }
}));

import { App } from "./App";
import { PromptDock } from "./components/PromptDock";
import { companyApiFacade } from "./services/companyApiFacade";
import type { ReferenceItem } from "./types";

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  localStorage.clear();
  vi.mocked(companyApiFacade.uploadCanvasAsset).mockReset();
  vi.mocked(companyApiFacade.renameCanvasAsset).mockReset();
  vi.mocked(companyApiFacade.loadCanvasResources).mockReset();
  vi.mocked(companyApiFacade.openLogin).mockReset();
  vi.mocked(companyApiFacade.checkAuth).mockReset();
  vi.mocked(companyApiFacade.deleteCanvasAsset).mockReset();
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

    expect(screen.getByRole("button", { name: "图一 小区楼道" })).toBeInTheDocument();
    expect(referenceChips()).toHaveLength(1);
    expect(referenceChips()[0]).toHaveTextContent("图一");
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
      "图一",
      "音频一",
      "视频一",
      "图二"
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
    fireEvent.click(screen.getByRole("button", { name: "图一 小区楼道" }));

    expect(screen.queryByRole("button", { name: "图一 小区楼道" })).not.toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole("button", { name: /音频一 short-audio/ }));

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
    expect(screen.getByRole("button", { name: "接口项目" })).toBeInTheDocument();
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

    expect(screen.getByRole("button", { name: "我的第一块画布" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "我的第一块画布" }));
    fireEvent.click(screen.getByRole("button", { name: "加载画布资源" }));

    await screen.findByText("接口图片 B");
    const reloadedScenesSection = screen.getByRole("button", { name: "场景" }).closest("section") as HTMLElement;
    expect(reloadedScenesSection).toHaveTextContent("接口图片 A");
    const reloadedCharactersSection = screen.getByRole("button", { name: "人物" }).closest("section") as HTMLElement;
    expect(reloadedCharactersSection).toHaveTextContent("接口图片 B");
    expect(reloadedCharactersSection).not.toHaveTextContent("接口图片 A");
  });

  it("builds a local generation payload preview without submitting the company API", async () => {
    vi.mocked(companyApiFacade.checkAuth).mockResolvedValue({
      status: "authenticated",
      user: { account: "23176", creditBalance: 23136 }
    });
    render(<App />);

    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
    fireEvent.click(screen.getByRole("button", { name: "生成视频" }));

    expect(await screen.findByText("已生成 9:16 · 15s · 全能参考 请求预览，未提交公司接口")).toBeInTheDocument();
    expect(screen.getByText(/Seedance 2.0/)).toBeInTheDocument();
    expect(companyApiFacade.checkAuth).toHaveBeenCalledTimes(2);
  });

  it("reuses a generated video's prompt and source references when metadata exists", async () => {
    render(<App />);

    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
    fireEvent.change(screen.getByPlaceholderText("输入视频提示词，点击资源 + 会插入资源标签"), {
      target: { value: "镜头缓慢推进，人物回头" }
    });
    fireEvent.click(screen.getByRole("button", { name: "生成视频" }));

    expect(await screen.findByText("生成视频 1")).toBeInTheDocument();

    fireEvent.click(referenceChips()[0]);
    fireEvent.change(screen.getByPlaceholderText("输入视频提示词，点击资源 + 会插入资源标签"), {
      target: { value: "" }
    });
    expect(referenceChips()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "复用生成 生成视频 1" }));

    expect(screen.getByPlaceholderText("输入视频提示词，点击资源 + 会插入资源标签")).toHaveValue("镜头缓慢推进，人物回头");
    expect(referenceChips()).toHaveLength(1);
    expect(referenceChips()[0]).toHaveTextContent("图一");
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
    expect(await screen.findByText("已同步名称：接口图片改名")).toBeInTheDocument();
  });

  it("cycles section sorting through default, ascending, descending, and default", async () => {
    render(<App />);

    const charactersSection = screen.getByRole("button", { name: "人物" }).closest("section") as HTMLElement;
    const beforeSortNames = Array.from(charactersSection.querySelectorAll(".asset-name")).map((node) => node.textContent);

    expect(screen.getAllByText("默认")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "人物 按名称排序：默认" }));
    expect(screen.getByText("升序")).toBeInTheDocument();
    expect(Array.from(charactersSection.querySelectorAll(".asset-name")).map((node) => node.textContent)).toEqual([
      "高铁站",
      "绿色行李箱",
      "男主秦扬人脸参考",
      "小区楼道"
    ]);

    fireEvent.click(screen.getByRole("button", { name: "人物 按名称排序：升序" }));
    expect(screen.getByText("降序")).toBeInTheDocument();
    expect(Array.from(charactersSection.querySelectorAll(".asset-name")).map((node) => node.textContent)).toEqual([
      "小区楼道",
      "男主秦扬人脸参考",
      "绿色行李箱",
      "高铁站"
    ]);

    fireEvent.click(screen.getByRole("button", { name: "人物 按名称排序：降序" }));
    expect(Array.from(charactersSection.querySelectorAll(".asset-name")).map((node) => node.textContent)).toEqual(beforeSortNames);
    expect(screen.getByText("紧张背景音乐")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "复用生成 开场参考视频" })).toBeDisabled();
  });

  it("shows generation controls for ratio, duration, and omnireference mode", async () => {
    render(<App />);

    expect(screen.getByLabelText("比例")).toHaveValue("9:16");
    expect(screen.getByLabelText("时长")).toHaveValue("15");
    expect(screen.getByText("需 150 积分")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "全能参考模式" })).not.toBeInTheDocument();
    expect(screen.getByText("全能参考")).toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle("加入提示词")[0]);
    fireEvent.change(screen.getByLabelText("比例"), { target: { value: "16:9" } });
    fireEvent.change(screen.getByLabelText("时长"), { target: { value: "12" } });
    expect(screen.getByText("需 120 积分")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "生成视频" }));

    expect(await screen.findByText("已生成 16:9 · 12s · 全能参考 请求预览，未提交公司接口")).toBeInTheDocument();
  });

  it("offers image category conversion actions only on image assets", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "设为场景图片 小区楼道" }));

    const sceneSection = screen.getByRole("button", { name: "场景" }).closest("section") as HTMLElement;
    expect(sceneSection).toHaveTextContent("小区楼道");
    expect(screen.getByRole("button", { name: "设为人物图片 小区楼道" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设为道具图片 小区楼道" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "设为场景图片 开场参考视频" })).not.toBeInTheDocument();
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
      "复用生成 开场参考视频",
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
      fileName: "小区楼道"
    });
    expect(screen.getByText("已下载 1 个资源")).toBeInTheDocument();
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
        generationSettings={{ aspectRatio: "9:16", durationSeconds: 5, omnireference: true }}
        onGenerationSettingsChange={() => undefined}
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
        generationSettings={{ aspectRatio: "16:9", durationSeconds: 5, omnireference: true }}
        onGenerationSettingsChange={() => undefined}
      />
    );

    fireEvent.mouseEnter(screen.getByRole("button", { name: "图一 横图" }));

    expect(document.querySelector(".reference-hover-preview")).toHaveClass("reference-hover-preview-large");
    expect(screen.getByRole("img", { name: "横图 预览" })).toHaveClass("reference-hover-preview-image");
  });
});
