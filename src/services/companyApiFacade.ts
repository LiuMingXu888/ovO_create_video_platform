import { checkAuth } from "../api/authClient";
import { DesktopApiTransport } from "../api/desktopTransport";
import { FetchApiTransport } from "../api/transport";
import { loadCanvasResources, renameCanvasAsset } from "./canvasLoader";
import type { AuthState, AuthUser } from "../types";

const transport = new FetchApiTransport();
const desktopTransport = new DesktopApiTransport();

function authStateFromDesktopResult(result: { ok: boolean; message?: string; user?: unknown }): AuthState {
  if (result.ok) {
    return { status: "authenticated", user: (result.user ?? {}) as AuthUser };
  }

  return { status: "unauthenticated", message: result.message ?? "登录已失效，请重新登录" };
}

export const companyApiFacade = {
  openLogin: async () => {
    if (!window.ovoDesktop) {
      return { status: "unauthenticated", message: "请在 Electron 桌面端打开登录窗口" } satisfies AuthState;
    }

    return authStateFromDesktopResult(await window.ovoDesktop.auth.openLoginWindow());
  },
  checkAuth: async () => {
    if (window.ovoDesktop) {
      return authStateFromDesktopResult(await window.ovoDesktop.auth.checkSession());
    }

    return checkAuth(transport);
  },
  loadCanvasResources: (canvasUrl: string) => loadCanvasResources(window.ovoDesktop ? desktopTransport : transport, canvasUrl),
  renameCanvasAsset: (input: { projectId: string; snapshot: unknown; assetId: string; name: string }) =>
    renameCanvasAsset(window.ovoDesktop ? desktopTransport : transport, input)
};
