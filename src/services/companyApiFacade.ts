import { checkAuth } from "../api/authClient";
import { FetchApiTransport } from "../api/transport";
import { loadCanvasResources } from "./canvasLoader";

const transport = new FetchApiTransport();

export const companyApiFacade = {
  checkAuth: () => checkAuth(transport),
  loadCanvasResources: (canvasUrl: string) => loadCanvasResources(transport, canvasUrl)
};
