import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CanvasControls } from "./CanvasControls";

const baseProps = {
  canvasUrl: "http://qijing.kjjhz.cn/canvas/abc",
  canvasName: "测试画布",
  canvasHistory: [],
  loading: false,
  snapshotHistory: [],
  onCanvasUrlChange: vi.fn(), onCanvasNameChange: vi.fn(), onSaveCanvasName: vi.fn(),
  onSelectCanvasHistory: vi.fn(), onDeleteCanvasHistory: vi.fn(), onNewCanvas: vi.fn(),
  onOpenCompanyCanvas: vi.fn(), onLoadCanvas: vi.fn(),
  onSaveSnapshot: vi.fn(), onOpenSnapshotHistory: vi.fn(), onRestoreSnapshot: vi.fn(), onOpenQijing: vi.fn()
};

describe("CanvasControls 画布按钮", () => {
  it("渲染三个画布按钮且未登录时禁用", () => {
    render(<CanvasControls {...baseProps} authState={{ status: "unauthenticated", message: "" }} />);
    const open = screen.getByRole("button", { name: /^Open公司画布$/ });
    const dev = screen.getByRole("button", { name: /Open公司画布\(DevTools\)/ });
    const fetchBtn = screen.getByRole("button", { name: /Open公司画布\(API Fetch\)/ });
    expect(open).toBeDisabled();
    expect(dev).toBeDisabled();
    expect(fetchBtn).toBeDisabled();
  });
  it("已登录时三按钮可点并传 mode", () => {
    const onOpen = vi.fn();
    render(<CanvasControls {...baseProps} onOpenCompanyCanvas={onOpen}
      authState={{ status: "authenticated", user: { name: "u" } } as never} />);
    screen.getByRole("button", { name: /^Open公司画布$/ }).click();
    expect(onOpen).toHaveBeenCalledWith("plain");
  });
  it("不再渲染登录公司账号/检查登录态", () => {
    render(<CanvasControls {...baseProps} authState={{ status: "authenticated", user: { name: "u" } } as never} />);
    expect(screen.queryByText("登录公司账号")).toBeNull();
    expect(screen.queryByText("检查登录态")).toBeNull();
  });
});
