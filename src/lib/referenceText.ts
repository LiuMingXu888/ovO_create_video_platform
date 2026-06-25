import type { ReferenceItem } from "../types";

export function getReferenceLabel(item: ReferenceItem, references: ReferenceItem[]): string {
  const sameKindIndex =
    references.filter((reference) => reference.kind === item.kind).findIndex((reference) => reference.id === item.id) + 1;
  if (item.kind === "image") return `图片${sameKindIndex}`;
  if (item.kind === "video") return `视频${sameKindIndex}`;
  return `音频${sameKindIndex}`;
}

export function buildReferenceText(references: ReferenceItem[]): string {
  const groups: { name: string; labels: string[] }[] = [];
  for (const item of references) {
    const label = getReferenceLabel(item, references);
    const existing = groups.find((group) => group.name === item.name);
    if (existing) {
      existing.labels.push(label);
    } else {
      groups.push({ name: item.name, labels: [label] });
    }
  }
  return groups.map((group) => `${group.labels.join("")}是${group.name}`).join("、");
}
