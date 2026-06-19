import type { CanvasAsset, SectionDefinition } from "../types";

export const sectionDefinitions: SectionDefinition[] = [
  { id: "characters", title: "人物", accepts: ["image"] },
  { id: "scenes", title: "场景", accepts: ["image"] },
  { id: "props", title: "道具", accepts: ["image"] },
  { id: "audio", title: "音频", accepts: ["audio"] },
  { id: "video", title: "视频", accepts: ["video"] }
];

export const sampleAssets: CanvasAsset[] = [
  {
    id: "asset-xiaoqu-loudao",
    name: "小区楼道",
    kind: "image",
    category: "characters",
    url: "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=300&q=80"
  },
  {
    id: "asset-gaotiezhan",
    name: "高铁站",
    kind: "image",
    category: "characters",
    url: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=300&q=80"
  },
  {
    id: "asset-nanzhu",
    name: "男主秦扬人脸参考",
    kind: "image",
    category: "characters",
    url: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&q=80"
  },
  {
    id: "asset-xinglixiang",
    name: "绿色行李箱",
    kind: "image",
    category: "characters",
    url: "https://images.unsplash.com/photo-1565026057447-bc90a3dceb87?auto=format&fit=crop&w=600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1565026057447-bc90a3dceb87?auto=format&fit=crop&w=300&q=80"
  },
  {
    id: "asset-bgm",
    name: "紧张背景音乐",
    kind: "audio",
    category: "audio",
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3",
    durationSeconds: 12,
    sizeBytes: 2_400_000
  },
  {
    id: "asset-video-demo",
    name: "开场参考视频",
    kind: "video",
    category: "video",
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1496062031456-07b8f162a322?auto=format&fit=crop&w=300&q=80",
    durationSeconds: 5,
    sizeBytes: 6_000_000
  }
];
