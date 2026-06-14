import type { AssetKind } from "../types";

interface BuildAssetUploadPayloadInput {
  name: string;
  kind: AssetKind;
  publicUrl: string;
  projectId?: string;
}

export function getUploadPrefix(file: File) {
  return file.name.replace(/\.[^.]+$/, "");
}

export function buildUploadFormData(file: File, projectId?: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("prefix", getUploadPrefix(file));

  if (projectId) {
    formData.append("projectId", projectId);
  }

  return formData;
}

export function buildAssetUploadPayload(input: BuildAssetUploadPayloadInput) {
  return {
    name: input.name,
    type: input.kind,
    url: input.publicUrl,
    projectId: input.projectId
  };
}
