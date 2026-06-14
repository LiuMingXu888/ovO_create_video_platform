interface Window {
  ovoDesktop?: {
    version: string;
    auth: {
      openLoginWindow: () => Promise<{ ok: boolean; message?: string }>;
      clearSession: () => Promise<{ ok: boolean; message?: string }>;
    };
  };
}
