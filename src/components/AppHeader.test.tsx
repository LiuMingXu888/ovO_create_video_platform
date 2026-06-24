import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppHeader } from "./AppHeader";

describe("AppHeader 登录区", () => {
  it("未登录:无账号标签,按钮显示登录账号", () => {
    const onOpenLogin = vi.fn();
    render(<AppHeader authState={{ status: "unauthenticated", message: "" }} onOpenLogin={onOpenLogin} />);
    expect(screen.getByRole("button", { name: "登录账号" })).toBeInTheDocument();
    expect(screen.queryByText("已登录")).toBeNull();
    screen.getByRole("button", { name: "登录账号" }).click();
    expect(onOpenLogin).toHaveBeenCalled();
  });
  it("已登录:显示账号标签 + 退出账户按钮", () => {
    const onLogout = vi.fn();
    render(<AppHeader authState={{ status: "authenticated", user: { account: "acc1", name: "n" } } as never} onLogout={onLogout} />);
    expect(screen.getByText("acc1")).toBeInTheDocument();
    screen.getByRole("button", { name: "退出账户" }).click();
    expect(onLogout).toHaveBeenCalled();
  });
});
