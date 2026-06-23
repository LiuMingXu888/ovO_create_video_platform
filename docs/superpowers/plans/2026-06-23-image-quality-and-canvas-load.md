# 按模型画质 + 布局对齐 + 下载命名 + 画布加载韧性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让图片生成按模型给出正确的画质选项(兑吧低/中/高、GPT-Image-2 1K/2K/4K、Gemini 锁定4K),统一两个生成 tab 的宽度与三栏顶部对齐,修批量下载文件夹命名,并让大画布不再"画布资源加载失败"且单素材可重试。

**Architecture:** 前端 React + TypeScript(Vite),Electron 主进程(`electron/`)。图片生成走 `/api/generate-image`,字段按模型不同(`size`/`quality`/无)。画布加载在 `services/canvasLoader.ts`。测试用 vitest。

**Tech Stack:** React 18, TypeScript, Vite, vitest, Electron, lucide-react。

## Global Constraints

- 工作目录:`/Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell`(分支 `feature/ui-shell`)。
- 版本:结束时 `package.json` 由 `0.1.3` bump 到 `0.1.4`。
- 推送远端:`gitee`(`git@gitee.com:siberian-aries/ov-o_create_video_platform.git`)分支 `feature/ui-shell`。
- 模型存储值(settings.model / 快照 / 发后端解析源)保持规范名:`GPT-Image-2(兑吧)` / `GPT-Image-2` / `Gemini 3 Pro` / `Gemini 3.1 Flash`。香蕉后缀**只用于下拉 label**。
- 各模型 API id:`gpt-image-2-duiba` / `gpt-image-2` / `gemini-3-pro-image-preview` / `gemini-3.1-flash-image-preview`。
- 画质发送规则(来自真实抓包):兑吧发 `quality`∈{low,medium,high};GPT-Image-2 发 `size`∈{1K,2K,4K};Gemini 不发画质字段。
- 每个任务结束跑相关测试;不要 commit `docs/release-packaging-guide.md`(预存未跟踪文件)。
- 测试命令:`npm test -- <文件>`(vitest,根目录运行)。

---

### Task 1: 模型/画质数据模型(imageGenOptions + types)

**Files:**
- Modify: `src/types.ts:31`(`ImageQuality` 联合类型)
- Modify: `src/lib/imageGenOptions.ts:9-22`(模型清单)、`:35`(IMAGE_QUALITIES)、`:101-107`(默认设置)
- Test: `src/lib/imageGenOptions.test.ts`

**Interfaces:**
- Produces:
  - `interface ImageQualityOption { value: ImageQuality; label: string }`
  - `interface ImageModelOption { label: string; value: string; apiId: string; qualityField: "size"|"quality"|null; qualityOptions: ImageQualityOption[]; defaultQuality: ImageQuality }`
  - `IMAGE_MODEL_OPTIONS: ImageModelOption[]`
  - `getImageModelOption(value: string): ImageModelOption | undefined`(按 value/label/apiId 任一匹配)
  - 派生保留:`IMAGE_MODELS: string[]`(= 各 value)、`IMAGE_MODEL_IDS: Record<string,string>`(value→apiId)
  - `ImageQuality = "1k"|"2k"|"4k"|"low"|"medium"|"high"`
  - `DEFAULT_IMAGE_GENERATION_SETTINGS.quality = "high"`(默认模型兑吧)

- [ ] **Step 1: 改 ImageQuality 类型**

`src/types.ts` 第 31 行:

```ts
export type ImageQuality = "1k" | "2k" | "4k" | "low" | "medium" | "high";
```

- [ ] **Step 2: 写失败测试**

把 `src/lib/imageGenOptions.test.ts` 顶部 import 与新增用例改为:

```ts
import { describe, expect, it } from "vitest";
import {
  IMAGE_CAMERAS,
  IMAGE_CAMERA_PROMPT_SUFFIX,
  IMAGE_MODELS,
  IMAGE_MODEL_IDS,
  IMAGE_MODEL_OPTIONS,
  getImageModelOption,
  DEFAULT_IMAGE_GENERATION_SETTINGS
} from "./imageGenOptions";

describe("imageGenOptions", () => {
  it("does not offer Seedream 5.0 until its model id is known", () => {
    expect(IMAGE_MODELS).not.toContain("Seedream 5.0");
  });

  it("maps every offered model to an API id", () => {
    for (const model of IMAGE_MODELS) {
      expect(IMAGE_MODEL_IDS[model]).toBeTruthy();
    }
  });

  it("shows 香蕉 nicknames only in the dropdown label, keeps canonical stored values", () => {
    const pro = getImageModelOption("Gemini 3 Pro");
    expect(pro?.label).toBe("Gemini 3 Pro(香蕉pro)");
    expect(pro?.value).toBe("Gemini 3 Pro");
    expect(pro?.apiId).toBe("gemini-3-pro-image-preview");
    const flash = getImageModelOption("Gemini 3.1 Flash");
    expect(flash?.label).toBe("Gemini 3.1 Flash(香蕉2)");
    expect(flash?.value).toBe("Gemini 3.1 Flash");
  });

  it("gives 兑吧 low/medium/high quality and GPT-Image-2 1k/2k/4k", () => {
    const duiba = getImageModelOption("GPT-Image-2(兑吧)");
    expect(duiba?.qualityField).toBe("quality");
    expect(duiba?.qualityOptions.map((q) => q.value)).toEqual(["low", "medium", "high"]);
    expect(duiba?.defaultQuality).toBe("high");

    const gpt = getImageModelOption("GPT-Image-2");
    expect(gpt?.qualityField).toBe("size");
    expect(gpt?.qualityOptions.map((q) => q.value)).toEqual(["1k", "2k", "4k"]);
  });

  it("locks Gemini quality to a single 4K option with no quality field", () => {
    for (const value of ["Gemini 3 Pro", "Gemini 3.1 Flash"]) {
      const option = getImageModelOption(value);
      expect(option?.qualityField).toBeNull();
      expect(option?.qualityOptions).toEqual([{ value: "4k", label: "4K" }]);
    }
  });

  it("defaults to 兑吧 model with high quality", () => {
    expect(DEFAULT_IMAGE_GENERATION_SETTINGS.model).toBe("GPT-Image-2(兑吧)");
    expect(DEFAULT_IMAGE_GENERATION_SETTINGS.quality).toBe("high");
  });

  it("offers the confirmed camera presets with prompt suffixes", () => {
    expect(IMAGE_CAMERAS).toContain("Sony FX3");
    expect(IMAGE_CAMERAS).toContain("ARRI ALEXA 35");
    expect(IMAGE_CAMERA_PROMPT_SUFFIX["暂不选择"]).toBe("");
    expect(IMAGE_CAMERA_PROMPT_SUFFIX["Sony FX3"]).toContain("Sony FX3");
    expect(IMAGE_CAMERA_PROMPT_SUFFIX["ARRI ALEXA 35"]).toContain("ARRI ALEXA 35");
  });

  it("offers IMAGE_MODEL_OPTIONS in fixed order", () => {
    expect(IMAGE_MODEL_OPTIONS.map((m) => m.value)).toEqual([
      "GPT-Image-2(兑吧)",
      "GPT-Image-2",
      "Gemini 3 Pro",
      "Gemini 3.1 Flash"
    ]);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm test -- src/lib/imageGenOptions.test.ts`
Expected: FAIL（`IMAGE_MODEL_OPTIONS` / `getImageModelOption` / `DEFAULT_IMAGE_GENERATION_SETTINGS` 未导出 或 断言不符）

- [ ] **Step 4: 实现数据模型**

替换 `src/lib/imageGenOptions.ts` 第 1~35 行(import 行 + IMAGE_MODELS/IMAGE_MODEL_IDS/IMAGE_ASPECT_RATIOS/IMAGE_QUALITIES)为:

```ts
import type { ImageAspectRatio, ImageGenerationSettings, ImageQuality, VideoResolution } from "../types";

// Image-generation option lists. Model / ratio / quality field shapes are
// confirmed from real 接口诊断 captures of POST /api/generate-image:
//   gpt-image-2-duiba 发 quality(low/medium/high)
//   gpt-image-2       发 size(1K/2K/4K)
//   gemini-*          不发画质字段(后端固定 4K)
// 香蕉后缀仅用于下拉 label;value 保持公司端规范名以兼容快照。

export interface ImageQualityOption {
  value: ImageQuality;
  label: string;
}

export interface ImageModelOption {
  label: string;
  value: string;
  apiId: string;
  qualityField: "size" | "quality" | null;
  qualityOptions: ImageQualityOption[];
  defaultQuality: ImageQuality;
}

const GEMINI_QUALITY: ImageQualityOption[] = [{ value: "4k", label: "4K" }];

export const IMAGE_MODEL_OPTIONS: ImageModelOption[] = [
  {
    label: "GPT-Image-2(兑吧)",
    value: "GPT-Image-2(兑吧)",
    apiId: "gpt-image-2-duiba",
    qualityField: "quality",
    qualityOptions: [
      { value: "low", label: "低" },
      { value: "medium", label: "中" },
      { value: "high", label: "高" }
    ],
    defaultQuality: "high"
  },
  {
    label: "GPT-Image-2",
    value: "GPT-Image-2",
    apiId: "gpt-image-2",
    qualityField: "size",
    qualityOptions: [
      { value: "1k", label: "1K" },
      { value: "2k", label: "2K" },
      { value: "4k", label: "4K" }
    ],
    defaultQuality: "4k"
  },
  {
    label: "Gemini 3 Pro(香蕉pro)",
    value: "Gemini 3 Pro",
    apiId: "gemini-3-pro-image-preview",
    qualityField: null,
    qualityOptions: GEMINI_QUALITY,
    defaultQuality: "4k"
  },
  {
    label: "Gemini 3.1 Flash(香蕉2)",
    value: "Gemini 3.1 Flash",
    apiId: "gemini-3.1-flash-image-preview",
    qualityField: null,
    qualityOptions: GEMINI_QUALITY,
    defaultQuality: "4k"
  }
];

export function getImageModelOption(value: string): ImageModelOption | undefined {
  return IMAGE_MODEL_OPTIONS.find((m) => m.value === value || m.label === value || m.apiId === value);
}

// Backward-compatible derived exports (consumed by client + tests).
export const IMAGE_MODELS: string[] = IMAGE_MODEL_OPTIONS.map((m) => m.value);

export const IMAGE_MODEL_IDS: Record<string, string> = Object.fromEntries(
  IMAGE_MODEL_OPTIONS.map((m) => [m.value, m.apiId])
);

export const IMAGE_ASPECT_RATIOS: ImageAspectRatio[] = [
  "9:16",
  "1:1",
  "3:4",
  "16:9",
  "4:3",
  "2:3",
  "3:2",
  "21:9"
];

export const IMAGE_QUALITIES: ImageQuality[] = ["1k", "2k", "4k"];
```

然后把文件末尾 `DEFAULT_IMAGE_GENERATION_SETTINGS`(原 101-107 行)的 `quality` 改为 `"high"`:

```ts
export const DEFAULT_IMAGE_GENERATION_SETTINGS: ImageGenerationSettings = {
  model: "GPT-Image-2(兑吧)",
  aspectRatio: "9:16",
  quality: "high",
  camera: "暂不选择",
  category: "人物"
};
```

(`IMAGE_CAMERAS` / `IMAGE_CAMERA_PROMPT_SUFFIX` / `IMAGE_CATEGORIES` / `VIDEO_RESOLUTIONS` / `IMAGE_GENERATION_CREDIT_COST` 保持不动。)

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- src/lib/imageGenOptions.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/lib/imageGenOptions.ts src/lib/imageGenOptions.test.ts
git commit -m "feat(image): per-model quality metadata and 香蕉 display labels"
```

---

### Task 2: 按模型画质组装 payload(imageGenerationClient)

**Files:**
- Modify: `src/api/imageGenerationClient.ts:26-57`(SIZE/QUALITY 集合 + buildGenerateImagePayload 的画质分支)
- Test: `src/api/imageGenerationClient.test.ts:11-52`

**Interfaces:**
- Consumes: `getImageModelOption`(Task 1)
- Produces: `buildGenerateImagePayload` —— 按模型 `qualityField` 决定发 `size`(value.toUpperCase())/`quality`(value 原样 low|medium|high)/不发;`model` 发 apiId。

- [ ] **Step 1: 改测试(失败)**

把 `src/api/imageGenerationClient.test.ts` 的 `baseSettings` 与三个画质用例改为:

`baseSettings`(第 12-18 行)保持 `model: "GPT-Image-2", quality: "4k"`(GPT-Image-2 用 size,合法)。

替换"sends \`quality\` for gpt-image-2-duiba"用例(原 35-44 行)为:

```ts
  it("sends `quality` (low/medium/high) for gpt-image-2-duiba and never `size`", () => {
    const high = buildGenerateImagePayload({ prompt: "人物", settings: { ...baseSettings, model: "GPT-Image-2(兑吧)", quality: "high" } });
    expect(high.model).toBe("gpt-image-2-duiba");
    expect(high.quality).toBe("high");
    expect(high.size).toBeUndefined();

    const low = buildGenerateImagePayload({ prompt: "人物", settings: { ...baseSettings, model: "GPT-Image-2(兑吧)", quality: "low" } });
    expect(low.quality).toBe("low");
    const medium = buildGenerateImagePayload({ prompt: "人物", settings: { ...baseSettings, model: "GPT-Image-2(兑吧)", quality: "medium" } });
    expect(medium.quality).toBe("medium");
  });
```

`resolveImageModelId` 用例(21-26 行)与 gpt-image-2 的 size 用例(28-33 行)、gemini 用例(46-51 行)保持不变。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- src/api/imageGenerationClient.test.ts`
Expected: FAIL(`quality: "low"` 期望与旧 `4k?high:medium` 映射不符)

- [ ] **Step 3: 实现 payload 分支**

替换 `src/api/imageGenerationClient.ts` 第 3 行 import 与第 26-57 行:

第 3 行 import 增加 `getImageModelOption`:

```ts
import { IMAGE_CAMERA_PROMPT_SUFFIX, IMAGE_MODEL_IDS, getImageModelOption } from "../lib/imageGenOptions";
```

删除原第 26-29 行的 `SIZE_MODEL_IDS` / `QUALITY_MODEL_IDS` 两个 Set,把 `buildGenerateImagePayload` 内画质分支(原 50-57 行)改为:

```ts
  // 画质字段按模型而定(来自真实抓包):gpt-image-2 发 size、gpt-image-2-duiba
  // 发 quality(low/medium/high)、gemini 两者都不发。
  const qualityField = getImageModelOption(input.settings.model)?.qualityField ?? null;
  if (qualityField === "size") {
    payload.size = input.settings.quality.toUpperCase();
  } else if (qualityField === "quality") {
    payload.quality = input.settings.quality;
  }
```

`resolveImageModelId`(31-33 行)保持不变(`IMAGE_MODEL_IDS[displayName] ?? displayName`,map 现按 value 键)。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- src/api/imageGenerationClient.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/imageGenerationClient.ts src/api/imageGenerationClient.test.ts
git commit -m "feat(image): build generate-image quality field per model"
```

---

### Task 3: 图片面板按模型联动 + 去积分文案(ImageGeneratePanel + App.test)

**Files:**
- Modify: `src/components/ImageGeneratePanel.tsx`(整文件)
- Create: `src/components/ImageGeneratePanel.test.tsx`
- Modify: `src/App.test.tsx:872`、`:2302-2497`(按钮文案正则 + 兑吧画质 fixture)

**Interfaces:**
- Consumes: `IMAGE_MODEL_OPTIONS`, `getImageModelOption`(Task 1)
- Produces: 面板 —— 模型下拉 option value=opt.value、显示 opt.label;画质下拉用当前模型 qualityOptions,Gemini 时 `disabled`;切模型时 quality 重置为该模型 defaultQuality;生成按钮文案为"生成图片"。

- [ ] **Step 1: 写面板失败测试**

新建 `src/components/ImageGeneratePanel.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ImageGeneratePanel } from "./ImageGeneratePanel";
import { DEFAULT_IMAGE_GENERATION_SETTINGS } from "../lib/imageGenOptions";

function renderPanel(overrides = {}, onSettingsChange = vi.fn()) {
  const settings = { ...DEFAULT_IMAGE_GENERATION_SETTINGS, ...overrides };
  render(
    <ImageGeneratePanel
      settings={settings}
      onSettingsChange={onSettingsChange}
      onGenerate={vi.fn()}
    />
  );
  return { onSettingsChange };
}

describe("ImageGeneratePanel", () => {
  it("shows the generate button without a credit cost suffix", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "生成图片" })).toBeTruthy();
    expect(screen.queryByText(/积分/)).toBeNull();
  });

  it("shows 兑吧 quality options 低/中/高", () => {
    renderPanel({ model: "GPT-Image-2(兑吧)", quality: "high" });
    const quality = screen.getByLabelText("质量") as HTMLSelectElement;
    expect([...quality.options].map((o) => o.text)).toEqual(["低", "中", "高"]);
    expect(quality.disabled).toBe(false);
  });

  it("locks Gemini quality to a disabled 4K", () => {
    renderPanel({ model: "Gemini 3 Pro", quality: "4k" });
    const quality = screen.getByLabelText("质量") as HTMLSelectElement;
    expect([...quality.options].map((o) => o.text)).toEqual(["4K"]);
    expect(quality.disabled).toBe(true);
  });

  it("renders 香蕉 labels but keeps canonical model values", () => {
    renderPanel({ model: "Gemini 3 Pro" });
    const model = screen.getByLabelText("生图模型") as HTMLSelectElement;
    expect([...model.options].some((o) => o.text === "Gemini 3 Pro(香蕉pro)")).toBe(true);
    expect(model.value).toBe("Gemini 3 Pro");
  });

  it("resets quality to the new model default when switching models", () => {
    const onSettingsChange = vi.fn();
    renderPanel({ model: "GPT-Image-2(兑吧)", quality: "low" }, onSettingsChange);
    fireEvent.change(screen.getByLabelText("生图模型"), { target: { value: "GPT-Image-2" } });
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ model: "GPT-Image-2", quality: "4k" })
    );
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- src/components/ImageGeneratePanel.test.tsx`
Expected: FAIL(按钮名仍含"积分";画质选项不对)

- [ ] **Step 3: 实现面板**

整体替换 `src/components/ImageGeneratePanel.tsx`:

```tsx
import { Sparkles } from "lucide-react";
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_CAMERAS,
  IMAGE_CATEGORIES,
  IMAGE_MODEL_OPTIONS,
  getImageModelOption
} from "../lib/imageGenOptions";
import type { ImageAspectRatio, ImageGenerationSettings, ImageQuality } from "../types";

interface ImageGeneratePanelProps {
  settings: ImageGenerationSettings;
  onSettingsChange: (settings: ImageGenerationSettings) => void;
  onGenerate: () => void;
  disabled?: boolean;
}

export function ImageGeneratePanel({ settings, onSettingsChange, onGenerate, disabled = false }: ImageGeneratePanelProps) {
  const modelOption = getImageModelOption(settings.model) ?? IMAGE_MODEL_OPTIONS[0];
  const qualityLocked = modelOption.qualityField === null;

  return (
    <aside className="generate-panel generate-panel-image" aria-label="图片生成设置">
      <label className="field-line field-line-wide">
        <span>生图模型</span>
        <select
          aria-label="生图模型"
          value={settings.model}
          onChange={(event) => {
            const next = getImageModelOption(event.currentTarget.value) ?? IMAGE_MODEL_OPTIONS[0];
            onSettingsChange({ ...settings, model: next.value, quality: next.defaultQuality });
          }}
        >
          {IMAGE_MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="field-pair">
        <label className="field-line">
          <span>比例</span>
          <select
            aria-label="比例"
            value={settings.aspectRatio}
            onChange={(event) =>
              onSettingsChange({ ...settings, aspectRatio: event.currentTarget.value as ImageAspectRatio })
            }
          >
            {IMAGE_ASPECT_RATIOS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </label>
        <label className="field-line">
          <span>质量</span>
          <select
            aria-label="质量"
            value={settings.quality}
            disabled={qualityLocked}
            onChange={(event) => onSettingsChange({ ...settings, quality: event.currentTarget.value as ImageQuality })}
          >
            {modelOption.qualityOptions.map((quality) => (
              <option key={quality.value} value={quality.value}>
                {quality.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-pair">
        <label className="field-line">
          <span>摄像机</span>
          <select
            aria-label="摄像机"
            value={settings.camera}
            onChange={(event) => onSettingsChange({ ...settings, camera: event.currentTarget.value })}
          >
            {IMAGE_CAMERAS.map((camera) => (
              <option key={camera} value={camera}>
                {camera}
              </option>
            ))}
          </select>
        </label>
        <label className="field-line">
          <span>类别</span>
          <select
            aria-label="类别"
            value={settings.category}
            onChange={(event) => onSettingsChange({ ...settings, category: event.currentTarget.value })}
          >
            {IMAGE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" className="generate-button generate-button-light" onClick={onGenerate} disabled={disabled}>
        <Sparkles size={18} />
        <span>生成图片</span>
      </button>
    </aside>
  );
}
```

- [ ] **Step 4: 跑面板测试确认通过**

Run: `npm test -- src/components/ImageGeneratePanel.test.tsx`
Expected: PASS

- [ ] **Step 5: 修 App.test.tsx 对应断言**

`src/App.test.tsx` 第 872 行,把按钮正则从含积分改为精确名:

```tsx
    fireEvent.click(screen.getByRole("button", { name: "生成图片" }));
```

把 App.test.tsx 中所有图片设置 fixture 里的 `quality: "4k"`(第 2302/2335/2360/2417/2454/2490 行,均为 `model: "GPT-Image-2(兑吧)"` 的对象)改为 `quality: "high"`。第 2497 行断言:

```tsx
    expect((screen.getByLabelText("质量") as HTMLSelectElement).value).toBe("high");
```

(用 `grep -n 'quality: "4k"' src/App.test.tsx` 确认只在图片 fixture 出现后整体替换为 `quality: "high"`。)

- [ ] **Step 6: 跑 App 测试确认通过**

Run: `npm test -- src/App.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/ImageGeneratePanel.tsx src/components/ImageGeneratePanel.test.tsx src/App.test.tsx
git commit -m "feat(image): per-model quality dropdown and drop credit suffix"
```

---

### Task 4: 两 tab 等宽 + 三栏顶部对齐(CSS)

**Files:**
- Modify: `src/styles.css:893-896`(`.generate-panel-fixed`)、`:1016-1018`(`.prompt-note-panel`)

**Interfaces:** 无导出;纯样式。验证靠实跑(Task 8)。

- [ ] **Step 1: 视频面板撑满列宽**

`src/styles.css` `.generate-panel-fixed`(893-896 行)删除 `align-self: end;`,只留高度:

```css
.generate-panel-fixed {
  height: 154px;
}
```

- [ ] **Step 2: 右侧提示列表与上方对齐**

`src/styles.css` `.prompt-note-panel` 第 1018 行 `height: 128px;` 改为:

```css
  height: 154px;
```

(`align-self: end;` 与 `overflow: auto;` 保留 —— 底对齐 + 154 高 → top 落在 774,与提示词/生成面板齐平。)

- [ ] **Step 3: 类型检查(无单测)**

Run: `npx tsc --noEmit`
Expected: 无新增报错(CSS 改动不影响 tsc;此步确认未误伤其它)

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "fix(ui): equal-width generate panels and top-aligned three columns"
```

---

### Task 5: 批量下载文件夹命名

**Files:**
- Modify: `electron/downloadPaths.ts`(新增 `createDownloadFolderName`)
- Modify: `electron/companySession.ts:503`(改用新函数)
- Test: `electron/downloadPaths.test.ts`

**Interfaces:**
- Produces: `createDownloadFolderName(date: Date): string` → `资源文件(YY-MM-DD-HH.mm.ss)`(半角,合法路径段)

- [ ] **Step 1: 写失败测试**

在 `electron/downloadPaths.test.ts` 顶部 import 增加 `createDownloadFolderName`,并加用例:

```ts
import { createCategorizedDownloadPlan, createDownloadFolderName, sanitizePathPart } from "./downloadPaths";

describe("createDownloadFolderName", () => {
  it("names the batch folder 资源文件(YY-MM-DD-HH.mm.ss) with filesystem-safe chars", () => {
    const name = createDownloadFolderName(new Date(2026, 5, 22, 11, 27, 9));
    expect(name).toBe("资源文件(26-06-22-11.27.09)");
    expect(name).not.toMatch(/[/:*?"<>|]/);
  });
});
```

(注:`new Date(2026, 5, 22, ...)` 的月份 5 = 6月;秒 9 → "09" 验证补零。)

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- electron/downloadPaths.test.ts`
Expected: FAIL(`createDownloadFolderName` 未导出)

- [ ] **Step 3: 实现命名函数**

在 `electron/downloadPaths.ts` 末尾(`sanitizePathPart` 之后)新增:

```ts
export function createDownloadFolderName(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const yy = pad(date.getFullYear() % 100);
  return `资源文件(${yy}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}.${pad(
    date.getMinutes()
  )}.${pad(date.getSeconds())})`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- electron/downloadPaths.test.ts`
Expected: PASS

- [ ] **Step 5: 接入 companySession**

`electron/companySession.ts`:在顶部从 `./downloadPaths` 的 import 中加入 `createDownloadFolderName`(与 `createCategorizedDownloadPlan` 同处导入)。把第 503 行:

```ts
  const directoryName = createTimestampFolderName(new Date());
```

改为:

```ts
  const directoryName = createDownloadFolderName(new Date());
```

(`createTimestampFolderName` 保留 —— capture 文件名第 91 行仍用它。)

- [ ] **Step 6: 跑相关测试 + 类型检查**

Run: `npm test -- electron/downloadPaths.test.ts && npx tsc --noEmit`
Expected: PASS,无类型报错

- [ ] **Step 7: Commit**

```bash
git add electron/downloadPaths.ts electron/downloadPaths.test.ts electron/companySession.ts
git commit -m "fix(download): name batch folder 资源文件(YY-MM-DD-HH.mm.ss)"
```

---

### Task 6: 画布加载根因 —— 前缀同步合并为单次非阻断 PUT

**Files:**
- Modify: `src/services/canvasLoader.ts:48-67`(`normalizeAndSyncAssetPrefixes`)
- Test: `src/services/canvasLoader.test.ts:27-69`(把期望 PUT 次数从 2 改 1,加非阻断用例)

**Interfaces:**
- Consumes: `renameAssetInSnapshot`, `saveProjectSnapshot`(已 import)
- Produces: `normalizeAndSyncAssetPrefixes` —— 所有改名先在内存累积到一份快照,只 `saveProjectSnapshot` 一次,且该保存失败不抛错(assets 仍返回)。

- [ ] **Step 1: 改/加测试(失败)**

`src/services/canvasLoader.test.ts`:把 "syncs missing default prefixes back to the loaded snapshot" 用例最后一行的 PUT 次数断言由 2 改 1:

```ts
    expect(requests.filter((request) => isPutRequest(request.options))).toHaveLength(1);
```

并在该 describe 内新增非阻断用例:

```ts
  it("still returns normalized assets when the prefix-sync save fails", async () => {
    let putCount = 0;
    const transport: ApiTransport = {
      request: vi.fn(async (path: string, options?: { method?: string }) => {
        if (options?.method === "PUT") {
          putCount += 1;
          throw new Error("PUT failed");
        }
        return {
          snapshot: {
            nodes: [
              { id: "image-1", type: "image", data: { id: "image-1", assetId: "image-1", name: "苏晚晴", imageUrl: "https://example.com/su.png" } }
            ]
          }
        } as never;
      })
    };

    const result = await loadCanvasResources(transport, "http://qijing.kjjhz.cn/canvas/project-1");
    expect(result.assets).toEqual([
      expect.objectContaining({ id: "image-1", name: "人物-苏晚晴", category: "characters" })
    ]);
    expect(putCount).toBe(1);
  });
```

(确认文件底部已有 `isPutRequest` helper;若无则沿用现有定义。)

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- src/services/canvasLoader.test.ts`
Expected: FAIL(当前是 2 次 PUT 且保存失败会抛错)

- [ ] **Step 3: 实现合并 + 非阻断**

替换 `src/services/canvasLoader.ts` 的 `normalizeAndSyncAssetPrefixes`(48-67 行)为:

```ts
async function normalizeAndSyncAssetPrefixes(transport: ApiTransport, projectId: string, snapshot: unknown) {
  const rawAssets = normalizeSnapshotAssets(snapshot);
  let nextSnapshot = snapshot;
  let pendingSync = false;
  const assets: CanvasAsset[] = [];

  for (const rawAsset of rawAssets) {
    const normalized = ensureDefaultAssetPrefix(rawAsset);
    assets.push(stripRenameMarker(normalized));

    if (normalized.renamed) {
      const renamed = renameAssetInSnapshot(nextSnapshot, rawAsset.id, normalized.name);
      if (renamed.updated) {
        nextSnapshot = renamed.snapshot;
        pendingSync = true;
      }
    }
  }

  // 把所有前缀改名一次性写回(大画布上百个改名时,单次 PUT 代替逐个 PUT,
  // 避免串行风暴导致整体加载失败)。保存失败不阻断:资源已在内存,下次加载再同步。
  if (pendingSync) {
    try {
      await saveProjectSnapshot(transport, projectId, nextSnapshot);
    } catch (error) {
      console.warn("[画布加载] 前缀同步保存失败,跳过(下次加载重试):", error);
      nextSnapshot = snapshot;
    }
  }

  return { assets, snapshot: nextSnapshot };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- src/services/canvasLoader.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/canvasLoader.ts src/services/canvasLoader.test.ts
git commit -m "fix(canvas): batch prefix sync into one non-fatal save"
```

---

### Task 7: 单素材加载失败可重试(AssetCard)

**Files:**
- Modify: `src/components/AssetCard.tsx`(media 区:img/video 加 onError + 重试态)
- Test: `src/components/AssetCard.test.tsx`(新增重试用例)

**Interfaces:**
- Produces: AssetCard 内部状态 `mediaError` + `reloadKey`;media 加载失败显示占位与"重新获取"按钮,点击对 src 加 `?retry=<reloadKey>` 重载。

- [ ] **Step 1: 写失败测试**

先看 `src/components/AssetCard.test.tsx` 现有 render helper 形态(`grep -n "render(" src/components/AssetCard.test.tsx`),沿用其 props 写法新增:

```tsx
  it("shows a retry control when an image asset fails to load and reloads on click", () => {
    const asset = {
      id: "img-err",
      name: "人物-坏图",
      kind: "image" as const,
      category: "characters" as const,
      url: "https://example.com/broken.png",
      status: "ready" as const
    };
    render(
      <AssetCard
        asset={asset as never}
        onAction={vi.fn()}
        onRename={vi.fn()}
        onChangeCategory={vi.fn()}
      />
    );
    const img = screen.getByAltText("人物-坏图") as HTMLImageElement;
    fireEvent.error(img);
    const retry = screen.getByRole("button", { name: /重新获取/ });
    expect(retry).toBeTruthy();
    fireEvent.click(retry);
    // 重载后图片重新挂载,src 带 cache-bust 查询
    const reloaded = screen.getByAltText("人物-坏图") as HTMLImageElement;
    expect(reloaded.getAttribute("src")).toContain("retry=");
  });
```

(import 顶部确保有 `fireEvent`、`screen`、`render`、`vi`。)

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- src/components/AssetCard.test.tsx`
Expected: FAIL(无"重新获取"按钮)

- [ ] **Step 3: 实现 onError + 重试**

`src/components/AssetCard.tsx`:

(a) 第 2 行 import 增加 `RotateCw`(图标):把第 1 行 lucide 列表里加入 `RotateCw`(与已有 `RefreshCcw` 并列)。

(b) 组件内 state(在 `const [draftName...` 附近)新增:

```tsx
  const [mediaError, setMediaError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
```

(c) 加 cache-bust helper 与重试函数(在 `saveName` 附近):

```tsx
  function withRetry(url: string) {
    if (reloadKey === 0) {
      return url;
    }
    return url.includes("?") ? `${url}&retry=${reloadKey}` : `${url}?retry=${reloadKey}`;
  }

  function retryMedia() {
    setMediaError(false);
    setReloadKey((value) => value + 1);
  }
```

(d) 改 media 区(原 139-164 行 `<div className="asset-media">...`)为:仅图片/视频/音频在非生成、非失败态加 `onError`,并在 `mediaError` 时盖一层重试占位:

```tsx
      <div className="asset-media">
        {asset.kind === "image" && (
          <img src={withRetry(asset.thumbnailUrl ?? asset.url)} alt={asset.name} onError={() => setMediaError(true)} />
        )}
        {asset.kind === "video" && isGenerating && (
          <div className="video-generating">{asset.statusLabel ?? "生成中"}</div>
        )}
        {asset.kind === "video" && isFailed && (
          <div className="video-generating video-failed">{asset.errorMessage ?? asset.statusLabel ?? "生成失败"}</div>
        )}
        {asset.kind === "video" && !isGenerating && !isFailed && (
          <video
            ref={setMediaElement}
            src={withRetry(asset.url)}
            poster={asset.thumbnailUrl}
            muted={false}
            playsInline
            preload="metadata"
            onError={() => setMediaError(true)}
            onEnded={() => onMediaEnded?.(asset.id)}
          />
        )}
        {asset.kind === "audio" && (
          <>
            <audio ref={setMediaElement} src={withRetry(asset.url)} muted={false} preload="metadata" onError={() => setMediaError(true)} onEnded={() => onMediaEnded?.(asset.id)} />
            <div className="audio-wave">音频</div>
          </>
        )}
        {mediaError && (
          <div className="asset-media-error">
            <span>资源加载失败</span>
            <button type="button" onClick={retryMedia} aria-label={`重新获取 ${asset.name}`}>
              <RotateCw size={14} />
              重新获取
            </button>
          </div>
        )}
      </div>
```

(e) 在 `src/styles.css` 末尾追加占位样式:

```css
.asset-media-error {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-content: center;
  gap: 8px;
  justify-items: center;
  background: rgba(247, 244, 238, 0.94);
  color: #9b3139;
  font-size: 12px;
}

.asset-media-error button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid #d94c54;
  border-radius: 6px;
  background: #fff;
  color: #d94c54;
  padding: 4px 10px;
  cursor: pointer;
}
```

(确认 `.asset-media` 为定位上下文:若其无 `position`,在其规则加 `position: relative;`。用 `grep -n "\.asset-media" src/styles.css` 检查并按需补 `position: relative;`。)

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- src/components/AssetCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/AssetCard.tsx src/components/AssetCard.test.tsx src/styles.css
git commit -m "feat(canvas): per-asset media error state with retry"
```

---

### Task 8: 全量验证 + 版本 bump + 推 gitee

**Files:**
- Modify: `package.json`(version 0.1.3 → 0.1.4)

- [ ] **Step 1: 全量测试 + 类型检查**

Run: `npm test && npx tsc --noEmit`
Expected: 全绿,无类型报错。若有失败,回到对应 Task 修复后再继续。

- [ ] **Step 2: 实跑验证(CDP 连运行中 ovO,9333)**

用 `/tmp/select_eval.py`(`CDP_MATCH=5173`)在运行中的 ovO 渲染进程里验证(需先 `npm run dev`/或确认运行的就是本 worktree dev):
- 加载失败画布 `cmqovcnia0bxvm2isz2upocoy`:走 `loadCanvasResources` 能完整返回(assets 数 > 0),不再抛"画布资源加载失败"。
- 图片 tab:切换四个模型,质量选项分别为 低/中/高、1K/2K/4K、4K(锁定)、4K(锁定);按钮显示"生成图片"无积分;视频/图片两面板等宽;右侧提示列表与提示词、生成面板顶部齐平。
- 批量下载:文件夹名形如 `资源文件(26-06-23-….）`(半角)。

说明:若 app 当前运行的是旧构建,需在本 worktree `npm run dev` 后再连 5173 验证;UI 类验证以实际渲染为准,发现偏差回相应 Task 调整。

- [ ] **Step 3: bump 版本**

`package.json` 的 `"version": "0.1.3"` → `"version": "0.1.4"`。

- [ ] **Step 4: Commit + 推 gitee**

```bash
git add package.json
git commit -m "chore: bump version to 0.1.4"
git push gitee feature/ui-shell
```

Expected: 推送成功到 `gitee/feature/ui-shell`。

---

## Self-Review 记录

- **Spec 覆盖**:要求1=Task1/2/3;要求2=Task3;要求3(等宽)=Task4 Step1;要求4(顶部对齐)=Task4 Step2;修复1=Task5;修复2根因=Task6,单素材重试=Task7;版本/推送=Task8。无遗漏。
- **类型一致**:`ImageModelOption`/`ImageQualityOption`/`getImageModelOption`/`IMAGE_MODEL_OPTIONS` 在 Task1 定义,Task2/3 一致引用;`createDownloadFolderName` 签名 Task5 内一致;`ImageQuality` 扩展后兑吧用 low/medium/high、其余 1k/2k/4k。
- **占位符**:无 TBD;所有代码步均给出完整代码。
- **兼容**:模型存储 value 不变(仅 label 带香蕉),快照/公司端兼容;`createTimestampFolderName` 保留给 capture 命名。
