import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModeSwitch } from "./ModeSwitch";

describe("ModeSwitch 模式切换", () => {
  it("free 模式:自由按钮高亮,点击工作流回调传 workflow", () => {
    const onModeChange = vi.fn();
    render(<ModeSwitch mode="free" onModeChange={onModeChange} />);
    expect(screen.getByRole("button", { name: "自由" })).toHaveClass("mode-switch-button--active");
    screen.getByRole("button", { name: "工作流" }).click();
    expect(onModeChange).toHaveBeenCalledWith("workflow");
  });

  it("workflow 模式:工作流按钮高亮,点击自由回调传 free", () => {
    const onModeChange = vi.fn();
    render(<ModeSwitch mode="workflow" onModeChange={onModeChange} />);
    expect(screen.getByRole("button", { name: "工作流" })).toHaveClass("mode-switch-button--active");
    screen.getByRole("button", { name: "自由" }).click();
    expect(onModeChange).toHaveBeenCalledWith("free");
  });

  it("点击工具回调传 tools", () => {
    const onModeChange = vi.fn();
    render(<ModeSwitch mode="free" onModeChange={onModeChange} />);
    screen.getByRole("button", { name: "工具" }).click();
    expect(onModeChange).toHaveBeenCalledWith("tools");
  });

  it("三个文字标签都渲染", () => {
    render(<ModeSwitch mode="free" onModeChange={() => {}} />);
    expect(screen.getByText("自由")).toBeInTheDocument();
    expect(screen.getByText("工作流")).toBeInTheDocument();
    expect(screen.getByText("工具")).toBeInTheDocument();
  });
});
