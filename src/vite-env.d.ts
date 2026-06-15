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
  };
}
