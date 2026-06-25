/// <reference types="vite/client" />

type OvoUpdateProgress = {
  percent: number;
  transferred: number;
  total?: number;
};

type OvoUpdateInfo = {
  releaseId: number;
  tagName: string;
  version: string;
  installerName: string;
  installerUrl: string;
  latestYmlUrl: string;
  filePath?: string;
};

type OvoUpdateCheckResult =
  | {
      ok: true;
      status: "latest";
      currentVersion: string;
      latestVersion: string;
      message: string;
    }
  | {
      ok: true;
      status: "available";
      currentVersion: string;
      latestVersion: string;
      update: OvoUpdateInfo;
      message: string;
    }
  | {
      ok: false;
      status: "unsupported" | "error";
      currentVersion: string;
      message: string;
    };

type OvoUpdateDownloadResult = {
  ok: boolean;
  status: "downloaded" | "error";
  filePath?: string;
  message: string;
};

interface Window {
  ovoDesktop?: {
    version: string;
    updater?: {
      getCurrentVersion: () => Promise<string>;
      checkForUpdates: () => Promise<OvoUpdateCheckResult>;
      downloadUpdate: () => Promise<OvoUpdateDownloadResult>;
      installUpdate: () => Promise<{ ok: boolean; message: string }>;
      onProgress: (listener: (progress: OvoUpdateProgress) => void) => () => void;
    };
    auth: {
      openLoginWindow: (targetUrl?: string) => Promise<{ ok: boolean; message?: string; user?: unknown }>;
      checkSession: () => Promise<{ ok: boolean; message?: string; user?: unknown }>;
      clearSession: () => Promise<{ ok: boolean; message?: string }>;
    };
    discovery: {
      inspectCanvas: (canvasUrl: string) => Promise<{
        ok: boolean;
        message?: string;
        summaries?: Array<{
          method: string;
          path: string;
          family: string;
          status?: number;
        }>;
        sanitizedMapPath?: string;
        rawCapturePath?: string;
      }>;
      openCanvas: (
        canvasUrl: string,
        mode: "plain" | "devtools" | "capture"
      ) => Promise<{
        ok: boolean;
        message?: string;
        summaries?: unknown[];
        sanitizedMapPath?: string;
        rawCapturePath?: string;
      }>;
    };
    api: {
      request: (
        path: string,
        options?: {
          method?: "GET" | "POST" | "PUT" | "DELETE";
          body?: unknown;
          headers?: Record<string, string>;
        }
      ) => Promise<{
        ok: boolean;
        status: number;
        data?: unknown;
        message?: string;
      }>;
      uploadFile: (
        path: string,
        input: {
          fileName: string;
          mimeType?: string;
          bytes: ArrayBuffer;
          prefix: string;
          projectId?: string;
        }
      ) => Promise<{
        ok: boolean;
        status: number;
        data?: unknown;
        message?: string;
      }>;
    };
    file: {
      saveAsset: (input: { url: string; fileName: string }) => Promise<{
        ok: boolean;
        path?: string;
        message?: string;
      }>;
      saveAssets?: (input: {
        assets: Array<{
          url: string;
          fileName: string;
          category?: "characters" | "scenes" | "props" | "audio" | "video";
          categoryLabel?: string;
        }>;
      }) => Promise<{
        ok: boolean;
        directoryPath?: string;
        message?: string;
      }>;
    };
    settings?: {
      get: () => Promise<{ downloadDir: string }>;
      set: (input: { downloadDir: string }) => Promise<{ ok: boolean }>;
    };
    dialog?: {
      selectFolder: () => Promise<{ canceled: boolean; path?: string }>;
    };
    localStore?: {
      read: (projectId: string) => Promise<unknown | null>;
      write: (projectId: string, data: unknown) => Promise<{ ok: boolean }>;
    };
    snapshots?: {
      list: (projectId: string) => Promise<Array<{ id: string; createdAt: string; canvasName: string; assetCount: number }>>;
      append: (projectId: string, entry: unknown) => Promise<Array<{ id: string; createdAt: string; canvasName: string; assetCount: number }>>;
      get: (projectId: string, id: string) => Promise<{ id: string; createdAt: string; projectId: string; canvasName: string; canvasUrl: string; assets: unknown[]; canvasSnapshot: unknown; assetCount: number } | null>;
      onFlush: (listener: () => void) => () => void;
      sendFlushDone: () => void;
    };
  };
}
