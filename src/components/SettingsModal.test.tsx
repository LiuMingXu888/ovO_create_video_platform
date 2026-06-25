import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";

describe("SettingsModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <SettingsModal open={false} downloadDir="" onChangeDownloadDir={() => {}} onPickFolder={() => {}} onSave={() => {}} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("calls onSave when save button clicked", () => {
    const onSave = vi.fn();
    render(
      <SettingsModal open downloadDir="/tmp/out" onChangeDownloadDir={() => {}} onPickFolder={() => {}} onSave={onSave} onClose={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave).toHaveBeenCalled();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <SettingsModal open downloadDir="" onChangeDownloadDir={() => {}} onPickFolder={() => {}} onSave={() => {}} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onPickFolder when folder button clicked", () => {
    const onPickFolder = vi.fn();
    render(
      <SettingsModal open downloadDir="" onChangeDownloadDir={() => {}} onPickFolder={onPickFolder} onSave={() => {}} onClose={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: "选择文件夹" }));
    expect(onPickFolder).toHaveBeenCalled();
  });

  it("calls onChangeDownloadDir when input changes", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal open downloadDir="" onChangeDownloadDir={onChange} onPickFolder={() => {}} onSave={() => {}} onClose={() => {}} />
    );
    fireEvent.change(screen.getByPlaceholderText("默认下载到系统下载文件夹"), { target: { value: "/new/path" } });
    expect(onChange).toHaveBeenCalledWith("/new/path");
  });
});
