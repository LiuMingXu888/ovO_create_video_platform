import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModeSwitch } from "./ModeSwitch";

describe("ModeSwitch 模式切换", () => {
  it("free 模式:aria-checked=false,点击回调传 workflow", () => {
    const onModeChange = vi.fn();
    render(<ModeSwitch mode="free" onModeChange={onModeChange} />);
    const sw = screen.getByRole("switch", { name: "模式切换" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    sw.click();
    expect(onModeChange).toHaveBeenCalledWith("workflow");
  });

  it("workflow 模式:aria-checked=true,点击回调传 free", () => {
    const onModeChange = vi.fn();
    render(<ModeSwitch mode="workflow" onModeChange={onModeChange} />);
    const sw = screen.getByRole("switch", { name: "模式切换" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    sw.click();
    expect(onModeChange).toHaveBeenCalledWith("free");
  });

  it("两个文字标签都渲染", () => {
    render(<ModeSwitch mode="free" onModeChange={() => {}} />);
    expect(screen.getByText("自由")).toBeInTheDocument();
    expect(screen.getByText("工作流")).toBeInTheDocument();
  });
});
