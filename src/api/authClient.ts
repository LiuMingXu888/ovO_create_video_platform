import type { AuthState, AuthUser } from "../types";
import { endpoints } from "./endpoints";
import type { ApiTransport } from "./transport";

export async function checkAuth(transport: ApiTransport): Promise<AuthState> {
  try {
    const user = await transport.request<AuthUser>(endpoints.authMe());
    return { status: "authenticated", user };
  } catch {
    return { status: "unauthenticated", message: "登录已失效，请重新登录" };
  }
}
