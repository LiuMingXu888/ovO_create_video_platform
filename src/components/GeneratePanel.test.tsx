import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GeneratePanel } from "./GeneratePanel";
import type { GenerationSettings } from "../types";

const base: GenerationSettings = { aspectRatio: "9:16", resolution: "720p", durationSeconds: 15, omnireference: true, webSearch: false };

describe("GeneratePanel toggles", () => {
  it("renders 联网搜索 off and 全能参考 on, and toggles them", () => {
    const onSettingsChange = vi.fn();
    render(<GeneratePanel settings={base} onSettingsChange={onSettingsChange} onGenerate={() => {}} />);

    const web = screen.getByLabelText("联网搜索") as HTMLInputElement;
    expect(web.checked).toBe(false);
    expect(web.closest("label")).toHaveClass("field-line-nowrap");
    expect(screen.getByRole("button", { name: "生成视频(需要150积分)" })).toBeInTheDocument();
    expect(screen.queryByText("需 150 积分")).not.toBeInTheDocument();

    fireEvent.click(web);
    expect(onSettingsChange).toHaveBeenCalledWith({ ...base, webSearch: true });
  });
});
