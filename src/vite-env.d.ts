interface Window {
  ovoDesktop?: {
    version: string;
    auth: {
      openLoginWindow: () => Promise<{ ok: boolean; message?: string; user?: unknown }>;
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
      saveAssets?: (input: { assets: Array<{ url: string; fileName: string }> }) => Promise<{
        ok: boolean;
        directoryPath?: string;
        message?: string;
      }>;
    };
  };
}
