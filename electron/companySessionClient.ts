export const COMPANY_ORIGIN = "http://qijing.kjjhz.cn";
export const COMPANY_SESSION_PARTITION = "persist:ovo-company-session";
export const COMPANY_AUTH_ME_URL = `${COMPANY_ORIGIN}/api/auth/me`;
export const TARGET_CANVAS_URL = `${COMPANY_ORIGIN}/canvas/cmq6fwhft0bg5m2l5u78zby8x`;

export interface CompanySessionResult {
  ok: boolean;
  message?: string;
  user?: unknown;
}

export type CompanySessionFetch = (
  url: string,
  init?: {
    headers?: Record<string, string>;
  }
) => Promise<Response>;

export async function checkCompanySession(fetcher: CompanySessionFetch): Promise<CompanySessionResult> {
  try {
    const response = await fetcher(COMPANY_AUTH_ME_URL, {
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      return { ok: false, message: `登录态无效：${response.status}` };
    }

    const user = await response.json();
    return { ok: true, user };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "检查登录态失败" };
  }
}
