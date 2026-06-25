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

export async function saveProjectSnapshotAndVerify(
  transport: ApiTransport,
  projectId: string,
  snapshot: unknown,
  expectedNodeId: string
): Promise<unknown> {
  await saveProjectSnapshot(transport, projectId, snapshot);
  const reloadedSnapshot = await loadProjectSnapshot(transport, projectId);

  if (!snapshotHasNode(reloadedSnapshot, expectedNodeId)) {
    throw new Error("画布保存后未找到新节点，请重新加载画布确认是否被自动保存覆盖");
  }

  return reloadedSnapshot;
}

export function removeAssetFromSnapshot(snapshot: unknown, assetId: string): { snapshot: unknown; updated: boolean } {
  const cloned = structuredClone(snapshot);
  const updated = removeInValue(cloned, assetId, new Set());
  return { snapshot: cloned, updated };
}

export function renameAssetInSnapshot(
  snapshot: unknown,
  assetId: string,
  name: string,
  category?: string
): { snapshot: unknown; updated: boolean } {
  const cloned = structuredClone(snapshot);
  const updated = renameInValue(cloned, assetId, name, category, new Set());
  return { snapshot: cloned, updated };
}

function renameInValue(value: unknown, assetId: string, name: string, category: string | undefined, seen: Set<unknown>): boolean {
  if (!isRecord(value) || seen.has(value)) {
    return false;
  }

  seen.add(value);

  let updated = false;
  if (matchesAsset(value, assetId)) {
    setNameFields(value, name);
    if (category !== undefined && "category" in value) {
      value.category = category;
    }
    updated = true;
  }

  for (const child of Object.values(value)) {
    if (renameInValue(child, assetId, name, category, seen)) {
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

function snapshotHasNode(snapshot: unknown, nodeId: string) {
  const nodes = getSnapshotNodes(snapshot);
  return nodes.some((node) => isRecord(node) && (node.id === nodeId || (isRecord(node.data) && node.data.id === nodeId)));
}

function getSnapshotNodes(snapshot: unknown): unknown[] {
  if (isRecord(snapshot) && isRecord(snapshot.snapshot) && Array.isArray(snapshot.snapshot.nodes)) {
    return snapshot.snapshot.nodes;
  }

  if (isRecord(snapshot) && Array.isArray(snapshot.nodes)) {
    return snapshot.nodes;
  }

  return [];
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
