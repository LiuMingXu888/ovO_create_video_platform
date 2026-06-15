import { endpoints } from "./endpoints";
import type { ApiTransport } from "./transport";

export async function loadProjectSnapshot(transport: ApiTransport, projectId: string): Promise<unknown> {
  return transport.request(endpoints.projectSnapshot(projectId));
}

export async function saveProjectSnapshot(transport: ApiTransport, projectId: string, snapshot: unknown): Promise<unknown> {
  return transport.request(endpoints.projectSnapshot(projectId), {
    method: "PUT",
    body: snapshot
  });
}

export function renameAssetInSnapshot(snapshot: unknown, assetId: string, name: string): { snapshot: unknown; updated: boolean } {
  const cloned = structuredClone(snapshot);
  const updated = renameInValue(cloned, assetId, name, new Set());
  return { snapshot: cloned, updated };
}

function renameInValue(value: unknown, assetId: string, name: string, seen: Set<unknown>): boolean {
  if (!isRecord(value) || seen.has(value)) {
    return false;
  }

  seen.add(value);

  let updated = false;
  if (matchesAsset(value, assetId)) {
    setNameFields(value, name);
    updated = true;
  }

  for (const child of Object.values(value)) {
    if (renameInValue(child, assetId, name, seen)) {
      updated = true;
    }
  }

  return updated;
}

function matchesAsset(record: Record<string, unknown>, assetId: string) {
  return record.id === assetId || record.assetId === assetId;
}

function setNameFields(record: Record<string, unknown>, name: string) {
  if ("name" in record || (!("title" in record) && !("label" in record))) {
    record.name = name;
  }

  if ("title" in record) {
    record.title = name;
  }

  if ("label" in record) {
    record.label = name;
  }

  if (isRecord(record.data)) {
    setNameFields(record.data, name);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
