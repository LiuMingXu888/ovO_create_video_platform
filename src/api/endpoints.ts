export const COMPANY_API_ORIGIN = "https://qijing.kjjhz.cn";

export function apiPath(origin: string, path: string) {
  return `${origin.replace(/\/$/, "")}${path}`;
}

export const endpoints = {
  authMe: () => "/api/auth/me",
  projectSnapshot: (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/snapshot`,
  assetList: () => "/api/asset/list?statuses=Active&pageSize=100",
  uploadFile: () => "/api/upload-file",
  uploadPublic: () => "/api/upload-public",
  assetUpload: () => "/api/asset/upload",
  generateVideo: () => "/api/generate-video",
  generateVideoTask: (taskId: string) => `/api/generate-video/${encodeURIComponent(taskId)}`,
  generateImage: () => "/api/generate-image",
  generateImageTask: (taskId: string) => `/api/generate-image/${encodeURIComponent(taskId)}`,
  genQueue: (projectId: string, taskId?: string) =>
    `/api/gen-queue?projectId=${encodeURIComponent(projectId)}${taskId ? `&taskId=${encodeURIComponent(taskId)}` : ""}`,
  persistTask: () => "/api/asset/persist-task",
  subtitleRemove: () => "/api/subtitle-remove",
  subtitleRemoveTask: (taskId: string) => `/api/subtitle-remove/${encodeURIComponent(taskId)}`,
  subtitleRemoveArk: () => "/api/subtitle-remove/ark",
  subtitleRemoveArkTask: (taskId: string) => `/api/subtitle-remove/ark/${encodeURIComponent(taskId)}`,
  projects: () => "/api/projects"
};
