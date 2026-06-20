# ovOApp 六问修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把联网/全能参考做成可选开关(默认不联网)、generate-video payload 对齐网页、修复提示词复用重复、给更新机制加诊断并暴露真实错误，统一推 gitee。

**Architecture:** 纯客户端改动。生成参数经 `GenerationSettings` 从 UI 透传到 `buildCompanyGenerateVideoParams`；复用去重在快照读取侧 `assetNormalizer`；更新诊断在 Electron 主进程 `giteeReleaseUpdater` 加日志并把原始错误透传到渲染层 reducer。

**Tech Stack:** TypeScript / React 19 / Electron 37 / Vite 6 / Vitest。

## Global Constraints

- 工作分支 `feature/ui-shell`，worktree `.worktrees/ui-shell`。
- 推送目标：**gitee**（`git push gitee feature/ui-shell`），不推 origin/github 除非用户另说。
- 每项 TDD：先写失败测试→跑红→实现→跑绿→commit。
- `npm test` 全量绿 + `npm run build` 通过后才推。
- 测试画布 `cmqlzufagtb0ulq1tejj5hwa7`，可增删改、可消耗积分。
- 内置浏览器/CDP 排查走端口 9333，不用 Google Chrome。
- 模型/分辨率不变：`ep-20260319213857-htd7q` / `720p`。

---

### Task 1: GenerationSettings 增 webSearch 字段 + 默认值

**Files:**
- Modify: `src/types.ts:17-21`
- Modify: `src/App.tsx:235-239`

**Interfaces:**
- Produces: `GenerationSettings` 增 `webSearch: boolean`（必填，UI 始终提供）；App 初始 `webSearch: false`、`omnireference: true`。

- [ ] **Step 1: 改类型**

```typescript
export interface GenerationSettings {
  aspectRatio: "9:16" | "16:9" | "1:1";
  durationSeconds: number;
  omnireference: boolean;
  webSearch: boolean;
}
```

- [ ] **Step 2: 改 App 初始值**（`src/App.tsx:235-239`）

```typescript
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>({
    aspectRatio: "9:16",
    durationSeconds: 15,
    omnireference: true,
    webSearch: false
  });
```

- [ ] **Step 3: 跑构建确认类型无遗漏**

Run: `npm run build`
Expected: 若有别处构造 `GenerationSettings` 未补 `webSearch` 会报 TS 错；逐一补 `webSearch: false`（如测试 fixture）。本步用于发现这些点。

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/App.tsx
git commit -m "feat: add webSearch field to GenerationSettings (default off)"
```

---

### Task 2: GeneratePanel 增「联网搜索」「全能参考」开关

**Files:**
- Modify: `src/components/GeneratePanel.tsx`
- Test: `src/components/GeneratePanel.test.tsx` (Create)

**Interfaces:**
- Consumes: `GenerationSettings`（含 `webSearch`、`omnireference`）、`onSettingsChange`。
- Produces: 两个 checkbox，aria-label 分别 `联网搜索`、`全能参考`，切换时调用 `onSettingsChange` 翻转对应布尔。

- [ ] **Step 1: 写失败测试** (`src/components/GeneratePanel.test.tsx`)

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GeneratePanel } from "./GeneratePanel";
import type { GenerationSettings } from "../types";

const base: GenerationSettings = { aspectRatio: "9:16", durationSeconds: 15, omnireference: true, webSearch: false };

describe("GeneratePanel toggles", () => {
  it("renders 联网搜索 off and 全能参考 on, and toggles them", () => {
    const onSettingsChange = vi.fn();
    render(<GeneratePanel settings={base} onSettingsChange={onSettingsChange} onGenerate={() => {}} />);

    const web = screen.getByLabelText("联网搜索") as HTMLInputElement;
    const omni = screen.getByLabelText("全能参考") as HTMLInputElement;
    expect(web.checked).toBe(false);
    expect(omni.checked).toBe(true);

    fireEvent.click(web);
    expect(onSettingsChange).toHaveBeenCalledWith({ ...base, webSearch: true });

    fireEvent.click(omni);
    expect(onSettingsChange).toHaveBeenCalledWith({ ...base, omnireference: false });
  });
});
```

- [ ] **Step 2: 跑红**

Run: `npx vitest run src/components/GeneratePanel.test.tsx`
Expected: FAIL（找不到 label "联网搜索"）。

- [ ] **Step 3: 实现** — 在 `GeneratePanel.tsx` 时长 `field-line` 之后、`credit-cost` 之前插入两个开关：

```tsx
      <label className="field-line">
        <span>联网搜索</span>
        <input
          type="checkbox"
          aria-label="联网搜索"
          checked={settings.webSearch}
          onChange={(event) => onSettingsChange({ ...settings, webSearch: event.currentTarget.checked })}
        />
      </label>
      <label className="field-line">
        <span>全能参考</span>
        <input
          type="checkbox"
          aria-label="全能参考"
          checked={settings.omnireference}
          onChange={(event) => onSettingsChange({ ...settings, omnireference: event.currentTarget.checked })}
        />
      </label>
```

并把顶部 `<div className="generate-summary">` 里写死的 `<b>全能参考</b>` 文案删除或保留为标题（不影响开关；删除以免与开关重复表达）。

- [ ] **Step 4: 跑绿**

Run: `npx vitest run src/components/GeneratePanel.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/GeneratePanel.tsx src/components/GeneratePanel.test.tsx
git commit -m "feat: add 联网搜索/全能参考 toggles to GeneratePanel"
```

---

### Task 3: 抓网页「标准参考」模式基线（诊断，决定 referenceMode 去留）

**Files:**
- Create: `docs/superpowers/diagnostics/2026-06-19-web-standard-mode-capture.md`

**Interfaces:**
- Produces: 网页在「标准参考」模式下 `/api/generate-video` 实发字段集合，供 Task 4 决定 `referenceMode`/`genTab` 去留。

- [ ] **Step 1: 内置浏览器导航到测试画布**

```bash
node /tmp/ovo-cdp/nav-canvas.mjs   # 已存在；或重写指向 cmqlzufagtb0ulq1tejj5hwa7
```

- [ ] **Step 2: 在网页 UI 把参考模式切到「标准/非全能」，填好提示词，启动 CDP 网络录制后点生成**

用 `/tmp/ovo-cdp/network-record.mjs <ws> /api/generate-video 35000 /tmp/ovo-cdp/web-standard.json`，再点生成按钮。

- [ ] **Step 3: 提取标准模式 payload 键集合，落盘文档**

对比全能模式基线（11 键、无 `referenceMode`），记录标准模式是否出现 `referenceMode`/`genTab`/其他字段。写入 `docs/superpowers/diagnostics/2026-06-19-web-standard-mode-capture.md`。

- [ ] **Step 4: 据结论确定 Task 4 的 referenceMode 策略**
  - 若标准模式也不发 `referenceMode` → Task 4 删 `referenceMode`，参考模式仅由 UI 是否带全部参考体现（与网页一致）。
  - 若标准模式发 `referenceMode: "standard"` 且全能发 `"omnireference"`（或全能省略）→ Task 4 让 `referenceMode` 跟随 `omnireference`，仅在需要时发送。

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/diagnostics/2026-06-19-web-standard-mode-capture.md
git commit -m "docs: capture web standard-reference-mode generate payload baseline"
```

---

### Task 4: buildCompanyGenerateVideoParams 对齐网页字段

**Files:**
- Modify: `src/api/generationClient.ts:88-103`
- Test: `src/api/generationClient.test.ts`

**Interfaces:**
- Consumes: `GenerationSettings`（含 `webSearch`、`omnireference`、`aspectRatio`、`durationSeconds`）。
- Produces: payload 键集合对齐网页 = `prompt, model, ratio, duration, resolution, generateAudio, webSearch, referenceImages, referenceImageLabels, referenceAudios[, referenceVideos][, referenceMode]`，删除 `aspectRatio`、`genTab`、`networkEnabled`、`task` 包装；`referenceVideos` 仅在非空时发送；`webSearch` 跟随 settings。

> 注意：`buildCompanyGenerateVideoPayload` 的 `projectId+nodeId` 分支当前在 params 之上又加 `ratio`、`_meta`、`task`。本任务保留 `ratio`+`_meta`，删除 `task`。网页只发 `ratio`(不发 `aspectRatio`)，故 params 内不再单独发 `aspectRatio`。

- [ ] **Step 1: 改失败测试** — 更新 `generationClient.test.ts` 中 `buildCompanyGenerateVideoPayload` 两处断言为对齐后的键集合。无 project/node 分支的断言改为：

```typescript
  it("maps the Seedance display model to the company backend model id (web-aligned)", () => {
    expect(buildCompanyGenerateVideoPayload({ prompt: "生成一段视频", references: refs })).toEqual({
      prompt: "生成一段视频",
      model: "ep-20260319213857-htd7q",
      ratio: "9:16",
      resolution: "720p",
      duration: 15,
      generateAudio: true,
      webSearch: false,
      referenceMode: "omnireference",
      referenceImages: ["https://example.com/image.png"],
      referenceImageLabels: ["图"],
      referenceVideos: ["https://example.com/video.mp4"],
      referenceAudios: ["https://example.com/audio.mp3"]
    });
  });
```

> `refs` 含一个 video，故 `referenceVideos` 非空仍出现。`webSearch` 默认随未提供 settings 的默认 `false`。`referenceMode` 按 Task 3 结论保留/删除——若删除则从断言移除。新增一条断言：传 `settings.webSearch=true` 时 payload.webSearch===true；传 `settings.webSearch=false`（无 video 的 refs）时不含 `referenceVideos`、不含 `aspectRatio`/`genTab`/`networkEnabled`/`task`。

```typescript
  it("follows settings.webSearch and omits app-only fields + empty referenceVideos", () => {
    const imageOnly = [refs[0]]; // only the image ref
    const payload: any = buildCompanyGenerateVideoPayload({
      prompt: "p",
      references: imageOnly,
      settings: { aspectRatio: "9:16", durationSeconds: 5, omnireference: false, webSearch: true }
    });
    expect(payload.webSearch).toBe(true);
    expect(payload.referenceMode).toBe("standard"); // 若 Task3 决定删 referenceMode，则改断言 payload.referenceMode === undefined
    expect("aspectRatio" in payload).toBe(false);
    expect("genTab" in payload).toBe(false);
    expect("networkEnabled" in payload).toBe(false);
    expect("task" in payload).toBe(false);
    expect("referenceVideos" in payload).toBe(false);
  });
```

- [ ] **Step 2: 跑红**

Run: `npx vitest run src/api/generationClient.test.ts`
Expected: FAIL（当前 payload 含 aspectRatio/genTab/networkEnabled/task）。

- [ ] **Step 3: 实现** — 替换 `buildCompanyGenerateVideoParams`（`src/api/generationClient.ts:88-103`）：

```typescript
function buildCompanyGenerateVideoParams(input: BuildGenerateVideoPayloadInput, settings: GenerationSettings) {
  const referenceVideos = getReferenceValues(input.references, "video");
  const params: Record<string, unknown> = {
    prompt: input.prompt,
    model: SEEDANCE_MODEL_ID,
    ratio: settings.aspectRatio,
    resolution: "720p",
    duration: settings.durationSeconds,
    generateAudio: true,
    // 网页用 webSearch 控制联网/全网搜索；默认关。
    webSearch: settings.webSearch ?? false,
    // referenceMode 跟随全能参考开关；Task 3 若证明网页不发此字段则删除本行。
    referenceMode: settings.omnireference ? "omnireference" : "standard",
    referenceImages: getReferenceValues(input.references, "image"),
    referenceImageLabels: getReferenceLabels(input.references, "image"),
    referenceAudios: getReferenceValues(input.references, "audio")
  };
  // 仅在有视频参考时发送，贴近网页（网页空时不发）。
  if (referenceVideos.length > 0) {
    params.referenceVideos = referenceVideos;
  }
  return params;
}
```

并修改 `buildCompanyGenerateVideoPayload` 的 project/node 分支：删除 `aspectRatio`(已不在 params) 与 `task` 块，仅保留 `...params, ratio, _meta`：

```typescript
    payload = {
      ...params,
      ratio: settings.aspectRatio,
      _meta: {
        nodeId: input.nodeId,
        projectId: input.projectId,
        label: getTaskLabel(input.prompt)
      }
    };
```

> `getReferenceLabels` 已在上一轮新增，保留。

- [ ] **Step 4: 跑绿 + 修受影响的旧断言**

Run: `npx vitest run src/api/generationClient.test.ts`
Expected: PASS。旧的「builds a canvas video generation payload with explicit vertical generation metadata」断言含 `task`/`aspectRatio`，改为对齐后的键集合（删 `task`、`aspectRatio`，加 `webSearch`，`referenceMode` 按 Task3）。

- [ ] **Step 5: Commit**

```bash
git add src/api/generationClient.ts src/api/generationClient.test.ts
git commit -m "fix: align generate-video payload with web (drop task/genTab/networkEnabled/aspectRatio, webSearch follows settings)"
```

---

### Task 5: assetNormalizer 复用参考去重

**Files:**
- Modify: `src/lib/assetNormalizer.ts:229-239`
- Test: `src/lib/assetNormalizer.test.ts`

**Interfaces:**
- Produces: `getGenerationReferences` 优先返回 `generationReferences` 派生项；合并后按 URL 去重，保留带正常名（非哈希）的那条。

- [ ] **Step 1: 写失败测试** (`src/lib/assetNormalizer.test.ts` 追加)

```typescript
import { normalizeSnapshotAssets } from "./assetNormalizer"; // 若已 import 则复用

it("does not duplicate reused references stored in both generationReferences and referenceImages", () => {
  const url = "https://oss.example.com/users/x/images/1bad79953c2bb.png";
  const snapshot = {
    nodes: [
      {
        id: "gen-1",
        type: "video",
        data: {
          label: "生成视频 1",
          status: "succeeded",
          videoUrl: "https://oss.example.com/v.mp4",
          generationPrompt: "p",
          generationReferences: [{ id: "a", name: "人物-民警", kind: "image", url }],
          referenceImages: [url]
        }
      }
    ]
  };
  const assets = normalizeSnapshotAssets(snapshot);
  const video = assets.find((a) => a.id === "gen-1");
  const refs = video?.generationReferences ?? [];
  const forUrl = refs.filter((r) => r.url === url);
  expect(forUrl).toHaveLength(1);
  expect(forUrl[0]?.name).toBe("人物-民警"); // 保留正常名，不是哈希文件名
});
```

> 若 `normalizeSnapshotAssets` 的导出名/快照结构与现有测试不同，按 `assetNormalizer.test.ts` 现有用法对齐（读该文件首部 import 与现有快照构造）。

- [ ] **Step 2: 跑红**

Run: `npx vitest run src/lib/assetNormalizer.test.ts -t "does not duplicate reused references"`
Expected: FAIL（当前返回 2 条，一条哈希名）。

- [ ] **Step 3: 实现** — 替换 `getGenerationReferences`（`src/lib/assetNormalizer.ts:229-239`）：

```typescript
function getGenerationReferences(record: RawAssetRecord): ReferenceItem[] | undefined {
  const directReferences = parseReferenceList(record.generationReferences ?? record.references);
  const groupedReferences = [
    ...parseNamedReferences(record.referenceImages, "image"),
    ...parseNamedReferences(record.referenceAudios, "audio"),
    ...parseNamedReferences(record.referenceVideos, "video")
  ];

  // 节点会把参考存两份：generationReferences(带正常名) + referenceImages/Audios/Videos(仅URL,回退哈希名)。
  // 按 URL 去重，优先保留带正常名(generationReferences)的那条，避免复用时出现重复+哈希名。
  const byUrl = new Map<string, ReferenceItem>();
  const noUrl: ReferenceItem[] = [];
  for (const ref of [...directReferences, ...groupedReferences]) {
    if (ref.url) {
      if (!byUrl.has(ref.url)) {
        byUrl.set(ref.url, ref);
      }
    } else {
      noUrl.push(ref);
    }
  }

  const references = [...byUrl.values(), ...noUrl];
  return references.length > 0 ? references : undefined;
}
```

> 因 `directReferences` 先入 Map，同 URL 的分组项被跳过 → 保留带正常名的那条。

- [ ] **Step 4: 跑绿**

Run: `npx vitest run src/lib/assetNormalizer.test.ts`
Expected: PASS（含新测试与原有测试）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/assetNormalizer.ts src/lib/assetNormalizer.test.ts
git commit -m "fix: dedup reused generation references by URL, prefer named over hash"
```

---

### Task 6: 更新机制诊断日志 + 真实错误透传

**Files:**
- Modify: `electron/giteeReleaseUpdater.ts`（checkForUpdates/fetchJson/findRequiredUpdateAssets/versionFromRelease/normalizeUpdateError/downloadUpdate）
- Test: `electron/giteeReleaseUpdater.test.ts`

**Interfaces:**
- Produces: `UpdateCheckResult` 的 `error` 分支增 `detail?: string`（原始错误信息）；主进程在关键节点 `console` 输出；`normalizeUpdateError` 仍返回用户友好中文，但同时透传 `detail`。

- [ ] **Step 1: 写失败测试** — 断言 error 结果带原始 detail：

```typescript
it("surfaces the original error detail on check failure", async () => {
  const updater = createGiteeReleaseUpdater({
    currentVersion: "0.1.1",
    isPackaged: true,
    platform: "win32",
    fetcher: (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch
  });
  const result = await updater.checkForUpdates();
  expect(result.ok).toBe(false);
  if (!result.ok && result.status === "error") {
    expect(result.message).toContain("Gitee");          // 用户友好
    expect(result.detail).toContain("503");              // 原始细节透传
  } else {
    throw new Error("expected error result");
  }
});
```

- [ ] **Step 2: 跑红**

Run: `npx vitest run electron/giteeReleaseUpdater.test.ts -t "surfaces the original error detail"`
Expected: FAIL（当前 result 无 `detail`，且 fetchJson 抛的是泛化中文，无 503）。

- [ ] **Step 3: 实现**

3a. `fetchJson` 保留状态细节并打日志：

```typescript
  async function fetchJson<T>(url: string): Promise<T> {
    console.log("[updater] fetchJson", url);
    const response = await fetcher(url, { headers: { accept: "application/json" } });
    if (!response.ok) {
      console.error("[updater] fetchJson failed", url, response.status);
      const detail = `HTTP ${response.status} @ ${url}`;
      throw new Error(response.status === 404 ? `更新包不完整 (${detail})` : `无法连接 Gitee (${detail})`);
    }
    return (await response.json()) as T;
  }
```

3b. `UpdateCheckResult` error 分支加 `detail`（`giteeReleaseUpdater.ts:54-59`）：

```typescript
  | {
      ok: false;
      status: "unsupported" | "error";
      currentVersion: string;
      message: string;
      detail?: string;
    };
```

3c. `checkForUpdates` 入口日志 + catch 透传 detail：

```typescript
  async function checkForUpdates(): Promise<UpdateCheckResult> {
    console.log("[updater] checkForUpdates", { isPackaged, platform, currentVersion });
    latestUpdate = undefined;
    downloadedUpdate = undefined;

    if (!isPackaged || platform !== "win32") {
      console.log("[updater] skipped: dev/non-win32");
      return { ok: false, status: "unsupported", currentVersion, message: "开发模式不检查更新" };
    }

    try {
      // ...原逻辑不变...
    } catch (error) {
      const detail = error instanceof Error ? `${error.message}${error.stack ? "\n" + error.stack : ""}` : String(error);
      console.error("[updater] checkForUpdates error", detail);
      return { ok: false, status: "error", currentVersion, message: normalizeUpdateError(error), detail };
    }
  }
```

3d. `findRequiredUpdateAssets` 抛错前打候选名、`versionFromRelease` 打 rawVersion：

```typescript
export function findRequiredUpdateAssets(files: GiteeAttachFile[]) {
  const installer = files.find((file) => /ovO-\d+\.\d+\.\d+-x64-setup\.exe$/i.test(file.name));
  const latestYml = files.find((file) => file.name === "latest.yml");
  if (!installer?.browser_download_url || !latestYml?.browser_download_url) {
    console.error("[updater] missing assets; have:", files.map((f) => f.name));
    throw new Error(`更新包不完整 (assets: ${files.map((f) => f.name).join(",") || "none"})`);
  }
  return {
    installer: { name: installer.name, url: installer.browser_download_url },
    latestYml: { name: latestYml.name, url: latestYml.browser_download_url }
  };
}
```

```typescript
function versionFromRelease(release: GiteeRelease) {
  const rawVersion = release.tag_name ?? release.name ?? "";
  const version = rawVersion.replace(/^v/i, "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error("[updater] bad tag/version:", rawVersion);
    throw new Error(`更新包不完整 (tag: ${rawVersion || "empty"})`);
  }
  return version;
}
```

3e. `normalizeUpdateError` 容忍带括号后缀的消息（`includes` 已能匹配，无需改）；downloadUpdate 入口加 `console.log("[updater] downloadUpdate", update?.installerUrl)`。

- [ ] **Step 4: 渲染层透传 detail**（`src/update/manualUpdateState.ts` + `src/App.tsx`）
  - `CheckResult` error 分支与 `ManualUpdateState.error` 增可选 `detail?: string`。
  - reducer `check-result` 失败时把 `detail` 带入 error 态。
  - `getManualUpdateButtonLabel` 不变；在错误展示处（状态文案）显示 `message`，并把 `detail` 渲染到一个可展开/小字区域，便于用户截图反馈。

```typescript
// manualUpdateState.ts: ManualUpdateState error 分支
  | { phase: "error"; message: string; detail?: string };
// CheckResult error 分支加 detail?: string
// reducer:
    case "check-result":
      if (!action.result.ok) {
        return action.result.status === "unsupported"
          ? { phase: "unsupported", message: action.result.message }
          : { phase: "error", message: action.result.message, detail: (action.result as { detail?: string }).detail };
      }
```

- [ ] **Step 5: 跑绿 + 全量**

Run: `npx vitest run electron/giteeReleaseUpdater.test.ts src/update/manualUpdateState.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add electron/giteeReleaseUpdater.ts electron/giteeReleaseUpdater.test.ts src/update/manualUpdateState.ts src/App.tsx
git commit -m "feat: add updater diagnostics + surface real error detail to renderer"
```

---

### Task 7: 全量验证 + 推送 gitee

- [ ] **Step 1: 全量测试**

Run: `npx vitest run`
Expected: 全绿。

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: TS + Vite 通过。

- [ ] **Step 3: 实机抽验（内置浏览器/CDP，可选但建议）**
在测试画布提交一次（webSearch 关），经 app transport 确认服务端接受对齐后的 payload、生成成功。

- [ ] **Step 4: 推送 gitee**

```bash
git push gitee feature/ui-shell
```
Expected: 推送成功。若 origin 也需要同步则另行 `git push origin feature/ui-shell`（默认不做）。

## Self-Review

- **Spec coverage:** ①webSearch+全能参考开关=Task1-2；②字段对齐=Task3(抓标准模式)+Task4；③推 gitee=Task7;④更新诊断=Task6;⑤复用去重=Task5;⑥诊断文件不改(无任务)。全覆盖。
- **Placeholder scan:** Task3/Task4 的 referenceMode 去留是诊断驱动的二选一，已给出两种断言写法的明确切换条件，非占位。
- **Type consistency:** `GenerationSettings.webSearch`、`getReferenceLabels`、`UpdateCheckResult.detail`、`ManualUpdateState.error.detail` 命名跨任务一致。
- **Risk:** Task4 删 `task` 已验证持久化不依赖（App.tsx:1265 独立 saveCanvasAsset）；referenceMode 待 Task3 实测定夺。
