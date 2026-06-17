import { checkAuth } from "../api/authClient";
import { DesktopApiTransport } from "../api/desktopTransport";
import { generateVideo as generateVideoWithTransport } from "../api/generationClient";
import { createCompanyCanvas as createCompanyCanvasWithTransport } from "../api/projectClient";
import { FetchApiTransport } from "../api/transport";
import { uploadCanvasAsset as uploadCanvasAssetWithTransport } from "../api/uploadClient";
import { extractCreditBalance } from "../lib/credits";
import { deleteCanvasAsset, loadCanvasResources, removeCanvasAssetSubtitles, renameCanvasAsset, saveCanvasAsset } from "./canvasLoader";
import type { AssetCategory, AssetKind, AuthState, AuthUser, CanvasAsset, GenerationSettings, ReferenceItem } from "../types";

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
  openLogin: async (targetUrl?: string) => {
    if (!window.ovoDesktop) {
      return { status: "unauthenticated", message: "请在 Electron 桌面端打开登录窗口" } satisfies AuthState;
    }

    return authStateFromDesktopResult(await window.ovoDesktop.auth.openLoginWindow(targetUrl));
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
  }) => uploadCanvasAssetWithTransport(window.ovoDesktop ? desktopTransport : transport, input),
  saveCanvasAsset: (input: {
    projectId: string;
    snapshot: unknown;
    id?: string;
    name: string;
    kind: AssetKind;
    category: AssetCategory;
    url: string;
    providerVideoUrl?: string;
    thumbnailUrl?: string;
    durationSeconds?: number;
    sizeBytes?: number;
    generationPrompt?: string;
    generationReferences?: ReferenceItem[];
  }) => saveCanvasAsset(window.ovoDesktop ? desktopTransport : transport, input),
  removeSubtitles: (input: {
    projectId: string;
    sourceAsset: CanvasAsset;
    placeholderAsset: CanvasAsset;
  }) => removeCanvasAssetSubtitles(window.ovoDesktop ? desktopTransport : transport, input),
  generateVideo: (input: {
    projectId: string;
    nodeId: string;
    prompt: string;
    references: ReferenceItem[];
    settings: GenerationSettings;
  }) => generateVideoWithTransport(window.ovoDesktop ? desktopTransport : transport, input),
  createCompanyCanvas: () => createCompanyCanvasWithTransport(window.ovoDesktop ? desktopTransport : transport),
  logout: async () => {
    if (!window.ovoDesktop) {
      return { status: "unauthenticated", message: "已退出登录" } satisfies AuthState;
    }

    const result = await window.ovoDesktop.auth.clearSession();
    return { status: "unauthenticated", message: result.message ?? "已退出登录" } satisfies AuthState;
  },
  inspectCanvas: async (canvasUrl: string) => {
    if (!window.ovoDesktop) {
      throw new Error("请在 Electron 桌面端使用接口诊断");
    }

    const result = await window.ovoDesktop.discovery.inspectCanvas(canvasUrl);
    if (!result.ok) {
      throw new Error(result.message ?? "接口诊断失败");
    }

    return result;
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
