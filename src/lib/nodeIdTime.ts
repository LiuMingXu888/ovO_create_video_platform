// 公司画布节点 ID 形如 `<kind>-<base36ms>-<rand>`（如 img-mqlzutvc-uek5p2z）。
// 中间段是创建时刻的毫秒时间戳按 base36 编码。画布快照节点本身不带 createdAt，
// 故排序时用此解码作为生成时间来源。带合理性校验，避免把随机串误判成离谱时间。
const MIN_MS = Date.parse("2020-01-01T00:00:00.000Z");

export function decodeNodeIdTime(id: string): number | null {
  if (typeof id !== "string") {
    return null;
  }
  const segments = id.split("-");
  if (segments.length < 3) {
    // 需要 <kind>-<time>-<rand> 至少三段；UUID 占位（generated-image-<uuid>）
    // 会被拆成很多段，其“中间段”不是合法 base36 时间，下面的校验会拦下。
    return null;
  }
  const middle = segments[1];
  if (!/^[0-9a-z]+$/.test(middle)) {
    return null;
  }
  const ms = parseInt(middle, 36);
  if (!Number.isFinite(ms)) {
    return null;
  }
  const maxMs = Date.now() + 24 * 60 * 60 * 1000;
  if (ms < MIN_MS || ms > maxMs) {
    return null;
  }
  return ms;
}
