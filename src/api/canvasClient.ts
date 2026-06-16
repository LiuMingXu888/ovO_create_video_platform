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

export function removeAssetFromSnapshot(snapshot: unknown, assetId: string): { snapshot: unknown; updated: boolean } {
  const cloned = structuredClone(snapshot);
  const updated = removeInValue(cloned, assetId, new Set());
  return { snapshot: cloned, updated };
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

function removeInValue(value: unknown, assetId: string, seen: Set<unknown>): boolean {
  if (!isRecord(value) || seen.has(value)) {
    return false;
  }

  seen.add(value);

  let updated = false;
  const removedNodeIds = new Set<string>();
  if (Array.isArray(value.nodes)) {
    const nextNodes = value.nodes.filter((node) => {
      const shouldRemove = matchesNodeAsset(node, assetId);
      if (shouldRemove && isRecord(node) && typeof node.id === "string") {
        removedNodeIds.add(node.id);
      }
      return !shouldRemove;
    });
    if (nextNodes.length !== value.nodes.length) {
      value.nodes = nextNodes;
      updated = true;
    }
  }

  if (removedNodeIds.size > 0 && Array.isArray(value.edges)) {
    const nextEdges = value.edges.filter((edge) => !matchesEdgeNode(edge, removedNodeIds));
    if (nextEdges.length !== value.edges.length) {
      value.edges = nextEdges;
      updated = true;
    }
  }

  for (const child of Object.values(value)) {
    if (removeInValue(child, assetId, seen)) {
      updated = true;
    }
  }

  return updated;
}

function matchesAsset(record: Record<string, unknown>, assetId: string) {
  return record.id === assetId || record.assetId === assetId;
}

function matchesNodeAsset(value: unknown, assetId: string) {
  if (!isRecord(value)) {
    return false;
  }

  return matchesAsset(value, assetId) || (isRecord(value.data) && matchesAsset(value.data, assetId));
}

function matchesEdgeNode(value: unknown, nodeIds: Set<string>) {
  if (!isRecord(value)) {
    return false;
  }

  return (typeof value.source === "string" && nodeIds.has(value.source)) || (typeof value.target === "string" && nodeIds.has(value.target));
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
