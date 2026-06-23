import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCategorizedDownloadPlan, createDownloadFolderName } from "./downloadPaths.js";

describe("createCategorizedDownloadPlan", () => {
  it("plans selected assets into timestamp and category folders", () => {
    const downloadsPath = path.join("Users", "mac", "Downloads");
    const plan = createCategorizedDownloadPlan({
      downloadsPath,
      timestampFolderName: "2026-06-17-172100",
      assets: [
        {
          url: "https://example.com/person.png",
          fileName: "人物-苏晚晴.png",
          category: "characters",
          categoryLabel: "人物"
        },
        {
          url: "https://example.com/video.mp4",
          fileName: "开场参考视频.mp4",
          category: "video",
          categoryLabel: "视频"
        }
      ]
    });

    expect(plan.directoryPath).toBe(path.join(downloadsPath, "2026-06-17-172100"));
    expect(plan.items).toEqual([
      {
        url: "https://example.com/person.png",
        fileName: "人物-苏晚晴.png",
        categoryDirectoryPath: path.join(downloadsPath, "2026-06-17-172100", "人物"),
        destinationPath: path.join(downloadsPath, "2026-06-17-172100", "人物", "人物-苏晚晴.png")
      },
      {
        url: "https://example.com/video.mp4",
        fileName: "开场参考视频.mp4",
        categoryDirectoryPath: path.join(downloadsPath, "2026-06-17-172100", "视频"),
        destinationPath: path.join(downloadsPath, "2026-06-17-172100", "视频", "开场参考视频.mp4")
      }
    ]);
  });
});

describe("createDownloadFolderName", () => {
  it("names the batch folder 资源文件(YY-MM-DD-HH.mm.ss) with filesystem-safe chars", () => {
    const name = createDownloadFolderName(new Date(2026, 5, 22, 11, 27, 9));
    expect(name).toBe("资源文件(26-06-22-11.27.09)");
    expect(name).not.toMatch(/[/:*?"<>|]/);
  });
});
