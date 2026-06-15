import { checkAuth } from "../api/authClient";
import { DesktopApiTransport } from "../api/desktopTransport";
import { FetchApiTransport } from "../api/transport";
import { uploadCanvasAsset as uploadCanvasAssetWithTransport } from "../api/uploadClient";
import { extractCreditBalance } from "../lib/credits";
import { deleteCanvasAsset, loadCanvasResources, renameCanvasAsset } from "./canvasLoader";
import type { AssetCategory, AssetKind, AuthState, AuthUser } from "../types";

const transport = new FetchApiTransport();
const desktopTransport = new DesktopApiTransport();

function authStateFromDesktopResult(result: { ok: boolean; message?: string; user?: unknown }): AuthState {
  if (result.ok) {
    return { status: "authenticated", user: normalizeAuthUser(result.user) };
  }

  return { status: "unauthenticated", message: result.message ?? "登录已失效，请重新登录" };
}

function normalizeAuthUser(user: unknown): AuthUser {
  const normalized = (isRecord(user) ? { ...user } : {}) as AuthUser;
  normalized.creditBalance = extractCreditBalance(user);
  return normalized;
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

    const authState = await checkAuth(transport);
    if (authState.status === "authenticated") {
      return { ...authState, user: normalizeAuthUser(authState.user) };
    }
    return authState;
  },
  loadCanvasResources: (canvasUrl: string) => loadCanvasResources(window.ovoDesktop ? desktopTransport : transport, canvasUrl),
  renameCanvasAsset: (input: { projectId: string; snapshot: unknown; assetId: string; name: string }) =>
    renameCanvasAsset(window.ovoDesktop ? desktopTransport : transport, input),
  deleteCanvasAsset: (input: { projectId: string; snapshot: unknown; assetId: string }) =>
    deleteCanvasAsset(window.ovoDesktop ? desktopTransport : transport, input),
  uploadCanvasAsset: (input: {
    projectId: string;
    snapshot: unknown;
    file: File;
    name: string;
    kind: AssetKind;
    category: AssetCategory;
  }) => uploadCanvasAssetWithTransport(window.ovoDesktop ? desktopTransport : transport, input)
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
