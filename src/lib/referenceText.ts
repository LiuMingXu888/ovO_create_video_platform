import type { ReferenceItem } from "../types";

export function getReferenceLabel(item: ReferenceItem, references: ReferenceItem[]): string {
  const sameKindIndex =
    references.filter((reference) => reference.kind === item.kind).findIndex((reference) => reference.id === item.id) + 1;
  if (item.kind === "image") return `图片${sameKindIndex}`;
  if (item.kind === "video") return `视频${sameKindIndex}`;
  return `音频${sameKindIndex}`;
}

function stripAssetPrefix(name: string): string {
  // 去除"人物-"或"人物 -"等变体（模糊匹配）
  let stripped = name.replace(/^人物[\s\-]*/, '');
  // 去除"音频-"或"音频 -"等变体（模糊匹配）
  stripped = stripped.replace(/^音频[\s\-]*/, '');
  // 去除"场景-"或"场景 -"等变体（模糊匹配）
  stripped = stripped.replace(/^场景[\s\-]*/, '');
  // 去除"道具-"或"道具 -"等变体（模糊匹配）
  stripped = stripped.replace(/^道具[\s\-]*/, '');
  // 如果替换后为空，返回原名
  return stripped || name;
}

export function buildReferenceText(references: ReferenceItem[]): string {
  const groups: { name: string; labels: string[] }[] = [];
  for (const item of references) {
    const label = getReferenceLabel(item, references);
    const processedName = stripAssetPrefix(item.name);
    const existing = groups.find((group) => group.name === processedName);
    if (existing) {
      existing.labels.push(label);
    } else {
      groups.push({ name: processedName, labels: [label] });
    }
  }
  return groups.map((group) => `${group.labels.join("")}是${group.name}`).join("、");
}
