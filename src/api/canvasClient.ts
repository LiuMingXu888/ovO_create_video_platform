import { endpoints } from "./endpoints";
import type { ApiTransport } from "./transport";

export async function loadProjectSnapshot(transport: ApiTransport, projectId: string): Promise<unknown> {
  return transport.request(endpoints.projectSnapshot(projectId));
}
