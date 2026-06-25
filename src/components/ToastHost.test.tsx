import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./ToastHost";

function Trigger() {
  const { showToast } = useToast();
  return <button onClick={() => showToast("已下载 2 个")}>go</button>;
}

describe("ToastHost", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows a toast then auto-dismisses after 2.5s", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    act(() => {
      screen.getByText("go").click();
    });
    expect(screen.getByText("已下载 2 个")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.queryByText("已下载 2 个")).toBeNull();
  });
});
