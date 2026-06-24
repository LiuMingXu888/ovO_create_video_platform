# 图片生成 UX 修复 + 画布同步 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复图片生成的占位符竞态、放大预览工具栏、批量删除、比例兜底，以及 duiba 504 自恢复、按时间排序、本地节点画布同步共 7 个问题。

**Architecture:** 纯客户端改动（不动服务端/画布渲染器）。新增节点 ID 时间解码工具与 gen-queue 按 nodeId 回退轮询；修复 React 闭包陈旧导致的占位符竞态；扩展 PreviewModal 与批量工具栏；按 9333 CDP 实证结果补齐上传/生成节点字段。

**Tech Stack:** React + TypeScript + Vite，Vitest 测试，Electron 壳。

## Global Constraints

- 工作目录：`/Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell`（分支 `feature/ui-shell`）。
- 测试命令：`npm run test`（vitest run）；单测文件命名 `*.test.ts`，与被测文件同目录。
- 公司 API origin：`https://qijing.kjjhz.cn`；transport 抛错形如 `{ status:number, message:string, detail }`。
- 版本号：完成后 `package.json` 由 `0.1.8` → `0.1.9`，推送 gitee `feature/ui-shell`。
- 提交信息结尾附：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 不回退、不混提 worktree 内既有未提交的 `electron/companySession.ts`。
- 提示词原始值（UI 显示、`_meta`）不得被比例/摄像机后缀污染——后缀只进发送 payload。

---

## File Structure

- `src/lib/nodeIdTime.ts` (新建) — 节点 ID base36 时间解码，单一职责。
- `src/lib/nodeIdTime.test.ts` (新建) — 解码单测。
- `src/App.tsx` (改) — B2 排序时间源、A0 占位符竞态、A2 批量删除、A1 预览弹窗接线。
- `src/api/imageGenerationClient.ts` (改) — A3 比例提示词后缀、B1 gen-queue 回退轮询。
- `src/api/imageGenerationClient.test.ts` (改) — A3 + B1 测试。
- `src/components/PreviewModal.tsx` (改) — A1 工具栏 + 内联改名。
- `src/components/AppHeader.tsx` (改) — A2 批量删除按钮。
- `src/styles.css` (改) — A1 预览头部布局、A2 按钮样式。
- `src/api/endpoints.ts` — `genQueue(projectId)` 已存在，无需改。

---

## Task 1: 节点 ID 时间解码工具（B2）

**Files:**
- Create: `src/lib/nodeIdTime.ts`
- Test: `src/lib/nodeIdTime.test.ts`

**Interfaces:**
- Produces: `export function decodeNodeIdTime(id: string): number | null` — 从形如
  `img-mqrg5asu-xs7b8qy` / `aud-...` / `vid-...` / `subrm-...` 的 ID 取**中间段**按 base36
  解为毫秒时间戳；落在 `[2020-01-01, now + 1 天]` 区间才返回，否则 `null`。

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/nodeIdTime.test.ts
import { describe, expect, it } from "vitest";
import { decodeNodeIdTime } from "./nodeIdTime";

describe("decodeNodeIdTime", () => {
  it("decodes the base36 middle segment of a real node id to a sane 2026 ms timestamp", () => {
    // img-mqlzutvc-uek5p2z → mqlzutvc → 2026-06-20T06:46:05.496Z
    const ms = decodeNodeIdTime("img-mqlzutvc-uek5p2z");
    expect(ms).not.toBeNull();
    expect(new Date(ms as number).toISOString()).toBe("2026-06-20T06:46:05.496Z");
  });

  it("works across kinds (aud/vid/subrm prefixes)", () => {
    expect(decodeNodeIdTime("vid-mqlzuse5-12sgw5o")).toBe(1782268063581);
    expect(decodeNodeIdTime("aud-mqlzuqxs-ki9o6c8")).toBe(1782268061696);
  });

  it("returns null for uuid-style local placeholder ids (no base36 time segment)", () => {
    expect(decodeNodeIdTime("generated-image-7b3f9c2a-1d4e-4f8a-9b2c-0e1f2a3b4c5d")).toBeNull();
  });

  it("returns null when the decoded time is out of the sane window", () => {
    expect(decodeNodeIdTime("img-zzzzzzzzzzzz-abc")).toBeNull(); // 远未来
    expect(decodeNodeIdTime("img-1-abc")).toBeNull(); // 1970 附近，太早
  });

  it("returns null for ids without a middle segment", () => {
    expect(decodeNodeIdTime("singletoken")).toBeNull();
    expect(decodeNodeIdTime("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- nodeIdTime`
Expected: FAIL（`decodeNodeIdTime` 未定义 / 模块不存在）

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/nodeIdTime.ts

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- nodeIdTime`
Expected: PASS（5 个用例全过）

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodeIdTime.ts src/lib/nodeIdTime.test.ts
git commit -m "feat(sort): 新增节点 ID base36 时间解码工具(画布节点无 createdAt 的排序来源)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 排序接入节点 ID 时间（B2）

**Files:**
- Modify: `src/App.tsx:187-190`（`getGeneratedTime`）

**Interfaces:**
- Consumes: `decodeNodeIdTime` from Task 1。
- Produces: `getGeneratedTime` 在 `createdAt` 缺失/非法时回退到 ID 解码；`sortCategoryAssets` 不变。

- [ ] **Step 1: 在 App.tsx 顶部 import 区加入**

在现有 import 群（约 App.tsx:1-50，跟随既有相对路径风格）加：

```typescript
import { decodeNodeIdTime } from "./lib/nodeIdTime";
```

- [ ] **Step 2: 修改 `getGeneratedTime`**

把 App.tsx:187-190 整个函数替换为：

```typescript
function getGeneratedTime(asset: CanvasAsset) {
  const timestamp = asset.createdAt ? Date.parse(asset.createdAt) : Number.NaN;
  if (Number.isFinite(timestamp)) {
    return timestamp;
  }
  // 画布快照节点不带 createdAt，回退到从节点 ID 解码 base36 时间戳。
  return decodeNodeIdTime(asset.id);
}
```

- [ ] **Step 3: 构建校验**

Run: `npm run build`
Expected: TypeScript 编译通过（`getGeneratedTime` 返回 `number | null`，与
`sortCategoryAssets` 里 `leftTime !== null` 判断一致——已有逻辑就是按 null 处理）。

- [ ] **Step 4: 跑全量测试确认无回归**

Run: `npm run test`
Expected: PASS（无新增失败）

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "fix(sort): 生成时间排序回退到节点 ID 解码(修复降序对存量节点失效)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 比例提示词后缀（A3）

**Files:**
- Modify: `src/api/imageGenerationClient.ts`（`buildGenerateImagePayload`，约 :38-71；新增 `applyAspectRatioSuffix`）
- Modify: `src/api/imageGenerationClient.test.ts`

**Interfaces:**
- Produces: `export function applyAspectRatioSuffix(prompt: string, aspectRatio: string): string` —
  在 prompt 末尾追加 `，生成的比例为 <ratio>`。`buildGenerateImagePayload` 的 `prompt`
  字段经摄像机后缀后再过比例后缀；`_meta.label` 仍基于**原始** prompt。

- [ ] **Step 1: Write the failing test**

在 `imageGenerationClient.test.ts` 的 `describe("buildGenerateImagePayload")` 块内追加：

```typescript
  it("appends the aspect-ratio phrase to the sent prompt", () => {
    const payload = buildGenerateImagePayload({
      prompt: "一个女人",
      settings: { ...baseSettings, aspectRatio: "9:16", camera: "暂不选择" }
    });
    expect(payload.prompt).toBe("一个女人，生成的比例为 9:16");
    expect(payload.aspectRatio).toBe("9:16"); // 字段仍照常发送
  });

  it("appends ratio AFTER the camera suffix, in order", () => {
    const payload = buildGenerateImagePayload({
      prompt: "一个女人",
      settings: { ...baseSettings, aspectRatio: "1:1", camera: "Sony FX3" }
    });
    expect(payload.prompt).toBe(
      `一个女人${IMAGE_CAMERA_PROMPT_SUFFIX["Sony FX3"]}，生成的比例为 1:1`
    );
  });

  it("keeps _meta.label based on the original prompt (not polluted by suffixes)", () => {
    const payload = buildGenerateImagePayload({
      projectId: "p1",
      nodeId: "n1",
      prompt: "海边日落",
      settings: { ...baseSettings, aspectRatio: "16:9", camera: "Sony FX3" }
    });
    expect((payload._meta as { label: string }).label).toBe("海边日落");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- imageGenerationClient`
Expected: FAIL（prompt 未含比例短语；label 断言可能也失败取决于当前实现）

- [ ] **Step 3: 实现 `applyAspectRatioSuffix` 并接入 payload 构建**

在 `imageGenerationClient.ts` 的 `applyCameraSuffix`（:33-36）下方新增：

```typescript
export function applyAspectRatioSuffix(prompt: string, aspectRatio: string) {
  if (!aspectRatio) {
    return prompt;
  }
  return `${prompt}，生成的比例为 ${aspectRatio}`;
}
```

修改 `buildGenerateImagePayload`（:38-71）开头的 prompt 组装。把：

```typescript
  const modelId = resolveImageModelId(input.settings.model);
  const prompt = applyCameraSuffix(input.prompt, input.settings.camera);

  const payload: Record<string, unknown> = {
    prompt,
    model: modelId,
    aspectRatio: input.settings.aspectRatio
  };
```

替换为：

```typescript
  const modelId = resolveImageModelId(input.settings.model);
  const withCamera = applyCameraSuffix(input.prompt, input.settings.camera);
  const prompt = applyAspectRatioSuffix(withCamera, input.settings.aspectRatio);

  const payload: Record<string, unknown> = {
    prompt,
    model: modelId,
    aspectRatio: input.settings.aspectRatio
  };
```

确认 `_meta.label` 用的是 `getTaskLabel(input.prompt)`（:66）——已基于原始 prompt，无需改。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- imageGenerationClient`
Expected: PASS（含新增 3 个用例；既有用例里凡断言 `payload.prompt` 等于纯摄像机后缀的，
需同步更新为带比例短语——见下一步）

- [ ] **Step 5: 修正既有受影响用例**

既有用例 `appends the camera preset phrase to the prompt`（:56-59）断言
`payload.prompt === 一个女人 + Sony FX3后缀`，现在末尾会多比例短语。更新为：

```typescript
  it("appends the camera preset phrase to the prompt", () => {
    const payload = buildGenerateImagePayload({ prompt: "一个女人", settings: { ...baseSettings, camera: "Sony FX3" } });
    expect(payload.prompt).toBe(
      `一个女人${IMAGE_CAMERA_PROMPT_SUFFIX["Sony FX3"]}，生成的比例为 ${baseSettings.aspectRatio}`
    );
  });
```

Run: `npm run test -- imageGenerationClient`
Expected: PASS（全绿）

- [ ] **Step 6: Commit**

```bash
git add src/api/imageGenerationClient.ts src/api/imageGenerationClient.test.ts
git commit -m "feat(image-gen): 提示词末尾追加比例短语作为字段之外的双保险

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: duiba 504 回退轮询 gen-queue（B1）

**Files:**
- Modify: `src/api/imageGenerationClient.ts`（新增 `pollGenQueueByNodeId`；改 `generateImage` 的 504 分支）
- Modify: `src/api/imageGenerationClient.test.ts`

**Interfaces:**
- Consumes: `endpoints.genQueue(projectId)`（已存在，返回 `/api/gen-queue?projectId=...`）。
- Produces: `export async function pollGenQueueByNodeId(transport, input:{projectId:string; nodeId:string}, options?:PollOptions): Promise<GenerateImageResult>` —
  轮询 gen-queue，按 `task.nodeId === input.nodeId` 匹配；`succeeded`→返回 resultUrl，
  `failed`→抛 errorMessage，其它/缺失→继续。
- 真实 gen-queue 响应形状：`{ stats, tasks: Array<{ id, nodeId, status: "running"|"succeeded"|"failed"|..., resultUrl: string|null, errorMessage: string|null, ... }> }`。

- [ ] **Step 1: Write the failing test（504 回退到 gen-queue 直到 succeeded）**

在 `imageGenerationClient.test.ts` 顶部 import 补上 `pollGenQueueByNodeId`：

```typescript
import {
  applyCameraSuffix,
  applyAspectRatioSuffix,
  buildGenerateImagePayload,
  generateImage,
  pollGenQueueByNodeId,
  pollImageResult,
  resolveImageModelId,
  DEFAULT_IMAGE_GENERATION_POLL_OPTIONS
} from "./imageGenerationClient";
```

在 `describe("generateImage")` 块内追加：

```typescript
  it("falls back to gen-queue polling (by nodeId) when POST hits a 504 gateway timeout", async () => {
    let queueCalls = 0;
    const transport = new StubTransport((path, options) => {
      if (options?.method === "POST" && path.endsWith("/generate-image")) {
        throw { status: 504, message: "请求失败 (504)", detail: null };
      }
      if (path.includes("/gen-queue")) {
        expect(path).toContain("projectId=proj-1");
        queueCalls += 1;
        if (queueCalls < 2) {
          return { stats: {}, tasks: [{ id: "t1", nodeId: "node-1", status: "running", resultUrl: null, errorMessage: null }] };
        }
        return {
          stats: {},
          tasks: [{ id: "t1", nodeId: "node-1", status: "succeeded", resultUrl: "https://example.com/duiba.png", errorMessage: null }]
        };
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const result = await generateImage(
      transport,
      { projectId: "proj-1", nodeId: "node-1", prompt: "人物", settings: { ...baseSettings, model: "GPT-Image-2(兑吧)" } },
      { intervalMs: 0, maxAttempts: 5, initialDelayMs: 0 }
    );

    expect(result.imageUrl).toBe("https://example.com/duiba.png");
    expect(queueCalls).toBeGreaterThanOrEqual(2);
  });

  it("throws when the gen-queue task ends in failed after a 504", async () => {
    const transport = new StubTransport((path, options) => {
      if (options?.method === "POST" && path.endsWith("/generate-image")) {
        throw { status: 504, message: "请求失败 (504)", detail: null };
      }
      if (path.includes("/gen-queue")) {
        return {
          stats: {},
          tasks: [{ id: "t1", nodeId: "node-1", status: "failed", resultUrl: null, errorMessage: "内容违规" }]
        };
      }
      throw new Error(`unexpected call: ${path}`);
    });

    await expect(
      generateImage(
        transport,
        { projectId: "proj-1", nodeId: "node-1", prompt: "人物", settings: { ...baseSettings, model: "GPT-Image-2(兑吧)" } },
        { intervalMs: 0, maxAttempts: 5, initialDelayMs: 0 }
      )
    ).rejects.toThrow("内容违规");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- imageGenerationClient`
Expected: FAIL（`pollGenQueueByNodeId` 未导出；504 当前仍抛网关错误，不会查 gen-queue）

- [ ] **Step 3: 实现 `pollGenQueueByNodeId`**

在 `imageGenerationClient.ts` 末尾（其它 helper 之前/之后皆可）新增。先加响应类型与 helper：

```typescript
interface GenQueueTask {
  id?: string;
  nodeId?: string;
  status?: string;
  resultUrl?: string | null;
  imageUrl?: string | null;
  errorMessage?: string | null;
}

interface GenQueueResponse {
  tasks?: GenQueueTask[];
}

// 504 回退用：duiba 等慢模型 POST 撞 nginx 60s 网关超时返回 504，但任务在服务端
// gen-queue 里继续跑到 succeeded（providerTaskId 全程可能为 null），靠 nodeId 匹配恢复。
export async function pollGenQueueByNodeId(
  transport: ApiTransport,
  input: { projectId: string; nodeId: string },
  options: PollOptions = DEFAULT_IMAGE_GENERATION_POLL_OPTIONS
): Promise<GenerateImageResult> {
  if (options.initialDelayMs && options.initialDelayMs > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, options.initialDelayMs));
  }
  let consecutiveErrors = 0;
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    let task: GenQueueTask | undefined;
    try {
      const response = await transport.request<GenQueueResponse>(endpoints.genQueue(input.projectId));
      consecutiveErrors = 0;
      task = (response.tasks ?? []).find((item) => item.nodeId === input.nodeId);
    } catch (error) {
      if (isAuthExpiredError(error)) {
        throw new Error("登录态已失效，请重新登录后再试");
      }
      consecutiveErrors += 1;
      console.warn(`[图片生成] gen-queue 轮询出错 (${consecutiveErrors}/5)`, error instanceof Error ? error.message : error);
      if (consecutiveErrors >= 5) {
        throw new Error("图片生成查询连续失败，请重试");
      }
    }

    if (task) {
      console.log("[图片生成] gen-queue 轮询", { attempt: attempt + 1, nodeId: input.nodeId, status: task.status ?? "pending" });
      if (task.status === "failed") {
        throw new Error(task.errorMessage ?? "图片生成失败");
      }
      const url = stringValue(task.resultUrl ?? undefined) ?? stringValue(task.imageUrl ?? undefined);
      if (url) {
        return { taskId: task.id ?? input.nodeId, imageUrl: url };
      }
    }
    // task 暂时不在队列（入队延迟）或仍 running：继续轮询。

    if (options.intervalMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, options.intervalMs));
    }
  }
  throw new Error("任务轮询超时");
}
```

- [ ] **Step 4: 改 `generateImage` 的 504 分支回退到 gen-queue**

当前 `requestGenerateImage`（:128-153）在 504 时抛"网关超时"错误。改为：504 时**不抛**，
让 `generateImage` 感知并回退。最小改动：在 `generateImage`（:96-126）的提交处包 try/catch。

把 `generateImage` 开头：

```typescript
export async function generateImage(
  transport: ApiTransport,
  input: BuildGenerateImagePayloadInput,
  options: PollOptions = DEFAULT_IMAGE_GENERATION_POLL_OPTIONS
): Promise<GenerateImageResult> {
  const submitResult = await requestGenerateImage(transport, input);
```

替换为：

```typescript
export async function generateImage(
  transport: ApiTransport,
  input: BuildGenerateImagePayloadInput,
  options: PollOptions = DEFAULT_IMAGE_GENERATION_POLL_OPTIONS
): Promise<GenerateImageResult> {
  let submitResult: Awaited<ReturnType<typeof requestGenerateImage>>;
  try {
    submitResult = await requestGenerateImage(transport, input);
  } catch (error) {
    // 504：POST 撞网关超时但任务已入队 gen-queue，按 nodeId 回退轮询恢复。
    if (isGatewayTimeoutError(error) && input.projectId && input.nodeId) {
      return pollGenQueueByNodeId(transport, { projectId: input.projectId, nodeId: input.nodeId }, options);
    }
    throw error;
  }
```

并把 `requestGenerateImage` 里 504 的分支（:147-149）**删除其 throw 改为原样 rethrow**，
使 504 以可识别形态冒泡到 `generateImage`。即把：

```typescript
    if (isGatewayTimeoutError(error)) {
      throw new Error("该模型生成超时（服务端网关 60 秒限制，未返回任务号无法续查）。请改用 Gemini 或 GPT-Image-2 等更快的模型重试。");
    }

    throw error;
```

替换为：

```typescript
    // 504 不在此终止：交给 generateImage 回退到 gen-queue 轮询（任务仍在服务端跑）。
    throw error;
```

（`isGatewayTimeoutError` 仍保留供 `generateImage` 判定。原始 `error` 形如
`{ status:504, ... }`，`isGatewayTimeoutError` 已能匹配。）

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- imageGenerationClient`
Expected: PASS（含新增 2 个用例；既有"同步/异步/失败/抖动"用例不受影响——它们不抛 504）

- [ ] **Step 6: 构建校验**

Run: `npm run build`
Expected: 编译通过

- [ ] **Step 7: Commit**

```bash
git add src/api/imageGenerationClient.ts src/api/imageGenerationClient.test.ts
git commit -m "fix(image-gen): duiba 504 后回退轮询 gen-queue(任务实际仍在服务端跑到 succeeded)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 占位符竞态修复（A0）

**Files:**
- Modify: `src/App.tsx`（`createGeneratedImagePlaceholder` :701-717；`handleGenerateImage` :1590-1600）

**Interfaces:**
- Consumes: 既有 `assetsRef`（`assets` 的实时镜像）。
- Produces: 并发生成不再互相覆盖占位符。

- [ ] **Step 1: 占位符命名改用 assetsRef.current**

把 `createGeneratedImagePlaceholder`（App.tsx:701-717）里的命名行：

```typescript
      name: `生成图片 ${assets.filter((asset) => asset.id.startsWith("generated-image")).length + 1}`,
```

替换为：

```typescript
      name: `生成图片 ${assetsRef.current.filter((asset) => asset.id.startsWith("generated-image")).length + 1}`,
```

- [ ] **Step 2: 占位符插入改函数式更新**

把 `handleGenerateImage` 内（App.tsx:1593-1595）：

```typescript
    const assetsWithPlaceholder = [...assets, placeholder];
    setAssets(assetsWithPlaceholder);
    persistCanvasHistoryEntry(getCanvasUrlFromProject(project) || canvasUrl, canvasName, project, assetsWithPlaceholder);
```

替换为（基于实时镜像构造，避免并发闭包覆盖）：

```typescript
    const assetsWithPlaceholder = [...assetsRef.current, placeholder];
    setAssets(assetsWithPlaceholder);
    persistCanvasHistoryEntry(getCanvasUrlFromProject(project) || canvasUrl, canvasName, project, assetsWithPlaceholder);
```

随后同段内 `persistLocalCanvasFull(project, canvasName, ..., assetsWithPlaceholder)`（:1616）
传的也是新的 `assetsWithPlaceholder`，保持一致即可（无需再改）。

- [ ] **Step 3: 确认 assetsRef 在该作用域可见**

Run: `grep -n "assetsRef" src/App.tsx | head -3`
Expected: 能看到 `assetsRef` 的声明（约 :322 注释提到的实时镜像）与既有用法
（:780 / :1687）。若 `createGeneratedImagePlaceholder` 是组件内函数（在 `assetsRef` 之后定义）
则可直接引用——它在 :701，`assetsRef` 在 ~:322，顺序 OK。

- [ ] **Step 4: 构建校验**

Run: `npm run build`
Expected: 编译通过

- [ ] **Step 5: 跑测试**

Run: `npm run test`
Expected: PASS（无回归）

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "fix(image-gen): 占位符基于实时镜像构造,修复并发生成串位/重复占位

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 放大预览工具栏 + 内联改名（A1）

**Files:**
- Modify: `src/components/PreviewModal.tsx`（重写头部，新增 props）
- Modify: `src/App.tsx:1811-1826`（传入 `onAction` / `onRename`）
- Modify: `src/styles.css`（预览头部 flex 布局）

**Interfaces:**
- Consumes: 既有 `handleAssetAction(asset, action)` 与 `renameAsset(assetId, name)`。
- Produces: `PreviewModal` 新增可选 props `onAction?: (asset: CanvasAsset, action: AssetAction) => void`
  与 `onRename?: (assetId: string, name: string) => void`；头部含 改名/加入提示词/复用/下载/删除 + 上一个/下一个 + 关闭。

- [ ] **Step 1: 重写 PreviewModal 头部与 imports**

把 `PreviewModal.tsx` 顶部 import（:1-3）替换为：

```typescript
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Pencil, Plus, RefreshCcw, Trash2, X } from "lucide-react";
import type { AssetAction, CanvasAsset } from "../types";
```

把 props 接口（:5-12）替换为：

```typescript
interface PreviewModalProps {
  asset: CanvasAsset | null;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onAction?: (asset: CanvasAsset, action: AssetAction) => void;
  onRename?: (assetId: string, name: string) => void;
}
```

把函数签名与解构（:14）替换为：

```typescript
export function PreviewModal({
  asset,
  onClose,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  onAction,
  onRename
}: PreviewModalProps) {
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const nameInputRef = useRef<HTMLInputElement | null>(null);
```

- [ ] **Step 2: 重置改名态 + 替换头部 JSX**

在现有 `useEffect`（重置 videoSize，:17-19）后补一个 effect：

```typescript
  useEffect(() => {
    setEditingName(false);
    setDraftName(asset?.name ?? "");
  }, [asset?.id, asset?.name]);
```

把头部块（`<div className="preview-modal-header">` 整段，约 :35-59）替换为：

```typescript
        <div className="preview-modal-header">
          {editingName ? (
            <form
              className="preview-name-editor"
              onSubmit={(event) => {
                event.preventDefault();
                const next = draftName.trim();
                if (next && asset) {
                  onRename?.(asset.id, next);
                }
                setEditingName(false);
              }}
            >
              <input
                ref={nameInputRef}
                aria-label="编辑名称"
                value={draftName}
                autoFocus
                onChange={(event) => setDraftName(event.currentTarget.value)}
                onBlur={() => setEditingName(false)}
              />
            </form>
          ) : (
            <h2
              className="preview-title"
              title={asset.name}
              onDoubleClick={() => {
                setDraftName(asset.name);
                setEditingName(true);
              }}
            >
              {asset.name}
            </h2>
          )}
          <div className="preview-actions" aria-label="预览操作">
            <button type="button" className="preview-action-button" title="重命名" aria-label="重命名" onClick={() => { setDraftName(asset.name); setEditingName(true); }}>
              <Pencil size={16} />
            </button>
            <button type="button" className="preview-action-button" title="加入提示词资源引用" aria-label="加入提示词资源引用" onClick={() => onAction?.(asset, "insert")}>
              <Plus size={17} />
            </button>
            <button
              type="button"
              className="preview-action-button"
              title={asset.generationPrompt ? "复用提示词和资源" : "暂无可复用的生成提示词"}
              aria-label="复用提示词"
              disabled={!asset.generationPrompt}
              onClick={() => onAction?.(asset, "reuse-generation")}
            >
              <RefreshCcw size={16} />
            </button>
            <button type="button" className="preview-action-button" title="下载" aria-label="下载" onClick={() => onAction?.(asset, "download")}>
              <Download size={16} />
            </button>
            <button type="button" className="preview-action-button" title="删除" aria-label="删除" onClick={() => onAction?.(asset, "delete")}>
              <Trash2 size={16} />
            </button>
            <span className="preview-action-divider" aria-hidden="true" />
            <button type="button" className="preview-action-button" onClick={onPrevious} disabled={!hasPrevious} title="查看上一个节点" aria-label="查看上一个节点">
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="preview-action-button" onClick={onNext} disabled={!hasNext} title="查看下一个节点" aria-label="查看下一个节点">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
```

（保留原有的 `modal-close`(X) 按钮、`preview-frame` 媒体区不变。）

- [ ] **Step 3: App.tsx 传入回调，并让删除后关闭弹窗**

把 `PreviewModal` 渲染块（App.tsx:1811-1826）改为补两个 props：

```typescript
      <PreviewModal
        asset={previewAsset}
        onClose={() => setPreviewAsset(null)}
        hasPrevious={previewIndex > 0}
        hasNext={previewIndex >= 0 && previewIndex < previewAssets.length - 1}
        onPrevious={() => {
          if (previewIndex > 0) {
            setPreviewAsset(previewAssets[previewIndex - 1]);
          }
        }}
        onNext={() => {
          if (previewIndex >= 0 && previewIndex < previewAssets.length - 1) {
            setPreviewAsset(previewAssets[previewIndex + 1]);
          }
        }}
        onRename={renameAsset}
        onAction={(asset, action) => {
          if (action === "delete") {
            setPreviewAsset(null);
          }
          handleAssetAction(asset, action);
        }}
      />
```

（`handleDeleteAsset` 自带 confirm；先关弹窗再触发删除，避免删后弹窗悬空。）

- [ ] **Step 4: 加样式**

在 `src/styles.css` 末尾追加：

```css
.preview-modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.preview-title,
.preview-name-editor {
  flex: 1 1 auto;
  min-width: 0;
}
.preview-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
}
.preview-name-editor input {
  width: 100%;
  box-sizing: border-box;
}
.preview-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.preview-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
}
.preview-action-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.preview-action-divider {
  width: 1px;
  align-self: stretch;
  margin: 4px 4px;
  background: currentColor;
  opacity: 0.2;
}
```

- [ ] **Step 5: 构建校验**

Run: `npm run build`
Expected: 编译通过

- [ ] **Step 6: 跑测试**

Run: `npm run test`
Expected: PASS（若有 PreviewModal 既有快照/单测断言旧头部结构，按需更新）

- [ ] **Step 7: Commit**

```bash
git add src/components/PreviewModal.tsx src/App.tsx src/styles.css
git commit -m "feat(preview): 放大预览头部加固定工具栏(改名/加入/复用/下载/删除)+内联改名

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 批量删除（A2）

**Files:**
- Modify: `src/App.tsx`（新增 `handleDeleteSelected`；约 :865 `handleDownloadSelected` 旁）
- Modify: `src/App.tsx:1730-1736`（给 AppHeader 传 `onDeleteSelected`）
- Modify: `src/components/AppHeader.tsx`（新增按钮 + prop）

**Interfaces:**
- Consumes: 既有 `selectedAssetIds`、`assets`/`assetsRef`、删除链路
  （`companyApiFacade` + snapshot 删除，复用 `handleDeleteAsset` 内部逻辑）。
- Produces: `handleDeleteSelected(): Promise<void>`；`AppHeader` 新增
  `onDeleteSelected?: () => void`。

- [ ] **Step 1: 抽取可复用的单资产删除核心（不带 confirm）**

查看 `handleDeleteAsset`（App.tsx:879 起）确认其结构。新增一个不弹 confirm 的内部函数
`deleteAssetCore(asset)`，把 `handleDeleteAsset` 改为「confirm 后调用 core」。

在 `handleDeleteAsset` 上方新增（把现有 confirm 后的删除主体迁入 core）：

```typescript
  async function deleteAssetCore(asset: CanvasAsset) {
    if (!project || !canvasSnapshot) {
      const nextAssets = assetsRef.current.filter((item) => item.id !== asset.id);
      setAssets(nextAssets);
      setDefaultAssetOrder((current) =>
        sectionDefinitions.reduce<Record<AssetCategory, string[]>>(
          (order, section) => {
            order[section.id] = current[section.id].filter((id) => id !== asset.id);
            return order;
          },
          { characters: [], scenes: [], props: [], audio: [], video: [] }
        )
      );
      persistCanvasHistoryEntry(canvasUrl, canvasName, project, nextAssets);
      persistLocalCanvasFull(project ?? undefined, canvasName, getCanvasUrlFromProject(project) || canvasUrl, nextAssets);
      return;
    }
    const result = await companyApiFacade.deleteCanvasAsset({
      projectId: project.projectId,
      snapshot: canvasSnapshot,
      assetId: asset.id
    });
    const nextAssets = assetsRef.current.filter((item) => item.id !== asset.id);
    setCanvasSnapshot(result.snapshot);
    setAssets(nextAssets);
    setDefaultAssetOrder((current) =>
      sectionDefinitions.reduce<Record<AssetCategory, string[]>>(
        (order, section) => {
          order[section.id] = current[section.id].filter((id) => id !== asset.id);
          return order;
        },
        { characters: [], scenes: [], props: [], audio: [], video: [] }
      )
    );
    persistCanvasHistoryEntry(getCanvasUrlFromProject(project) || canvasUrl, canvasName, project, nextAssets);
    persistLocalCanvasFull(project, canvasName, getCanvasUrlFromProject(project) || canvasUrl, nextAssets);
  }
```

> 注意：上面 core 的具体调用须与既有 `handleDeleteAsset` 内的删除实现保持一致
> （函数名/字段以仓库现状为准）。实现时先读 `handleDeleteAsset` 全文（:879 起约 50 行），
> 把其 confirm 之后的主体原样搬入 core，再让 `handleDeleteAsset` 变成：
>
> ```typescript
>   async function handleDeleteAsset(asset: CanvasAsset) {
>     const confirmed = window.confirm(`确定要删除「${asset.name}」吗？`);
>     if (!confirmed) {
>       return;
>     }
>     try {
>       await deleteAssetCore(asset);
>       addActivityMessage(`已删除：${asset.name}`);
>     } catch (error) {
>       setCanvasError(error instanceof Error ? error.message : "删除失败");
>     }
>   }
> ```

- [ ] **Step 2: 新增 `handleDeleteSelected`（串行 + 一次确认）**

在 `handleDownloadSelected`（:865）下方新增：

```typescript
  async function handleDeleteSelected() {
    const selectedAssets = assetsRef.current.filter((asset) => selectedAssetIds.has(asset.id));
    if (selectedAssets.length === 0) {
      return;
    }
    const confirmed = window.confirm(`确定要删除选中的 ${selectedAssets.length} 个资源吗？`);
    if (!confirmed) {
      return;
    }
    let ok = 0;
    let failed = 0;
    // 串行删除，避免并发 PUT snapshot 互相覆盖。
    for (const asset of selectedAssets) {
      try {
        await deleteAssetCore(asset);
        ok += 1;
      } catch (error) {
        failed += 1;
        console.error("[批量删除] 失败:", asset.id, error);
      }
    }
    addActivityMessage(failed === 0 ? `已删除 ${ok} 个资源` : `已删除 ${ok} 个，${failed} 个失败`);
    cancelSelectionMode();
  }
```

- [ ] **Step 3: AppHeader 新增删除按钮**

`AppHeader.tsx`：import 补 `Trash2`：

```typescript
import { Coins, Download, LogOut, MousePointer2, RefreshCw, SquareCheck, Trash2, UserRound, X } from "lucide-react";
```

props 接口（:13-18 区）补一行 `onDeleteSelected?: () => void;`，解构（:29-34 区）补 `onDeleteSelected,`。
把选中模式下"下载选中"按钮（:72-81）后面、"取消"按钮之前插入：

```typescript
            <button
              type="button"
              className="header-tool-button"
              aria-label={`删除选中 ${selectedCount}`}
              onClick={onDeleteSelected}
              disabled={selectedCount === 0}
            >
              <Trash2 size={16} />
              <span>删除选中 {selectedCount}</span>
            </button>
```

并把非选中态入口按钮文案（:88-91）的 `多选下载` 改为 `多选`（现在含删除）：

```typescript
          <button type="button" className="header-tool-button" aria-label="多选" onClick={onToggleSelectionMode}>
            <MousePointer2 size={16} />
            <span>多选</span>
          </button>
```

- [ ] **Step 4: App.tsx 传入 onDeleteSelected**

在 `<AppHeader ... onDownloadSelected={handleDownloadSelected}`（:1736）后补：

```typescript
        onDeleteSelected={handleDeleteSelected}
```

- [ ] **Step 5: 构建校验**

Run: `npm run build`
Expected: 编译通过

- [ ] **Step 6: 跑测试**

Run: `npm run test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/AppHeader.tsx
git commit -m "feat(batch): 批量选中新增删除(串行删快照,一次确认)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: 本地上传/删除节点画布同步（B3，先实证再改）

**Files:**
- Diagnose only: 9333 裸 CDP（参考 `/tmp/cdp_eval.py`）
- Modify（依实证结果）: `src/api/uploadClient.ts`（`baseNode` / `createCompanyImageNode` 等）

**Interfaces:**
- 真实可显示的图片节点形状（抓包实证）：顶层含
  `{ id, type:"image", position:{x,y}, measured:{width:288,height:162}, data:{...} }`，
  `data` 含 `label, imageUrl, prompt, negativePrompt, model, aspectRatio, style, status:"completed", imageSource:"upload"}`。
  视频节点 `measured:{width:320,height:587}`，`data.status:"idle"`。
- app 当前 `baseNode`（uploadClient.ts:248）产出缺 `measured`、缺 `data.imageSource`、
  `data.status` 为 `"ready"/"generating"`（非画布枚举）。

- [ ] **Step 1: CDP 实证——确认渲染器实际卡哪个字段**

**实证结论（2026-06-24，画布 cmqlzufagtb0ulq1tejj5hwa7）：**
实时上传一张新图后，节点进了快照（12→13）、imageUrl 正确，但**未渲染**。
跨全部 13 个节点的规律 100% 一致：`measured:{width,height}` 存在 → 渲染；
缺 `measured` → 不渲染（`status`/`imageSource` 无关——老 uploaded 节点无 status 也照常渲染）。
**真因 = React Flow 需要 `measured` 才布局显示；app 的 baseNode 没写 `measured`。**
（旧的两个能显示的 uploaded 节点，是早期被渲染过后被 React Flow 回填了 measured 并持久化。）
故 Step 2 的核心是补 `measured`；`status`/`imageSource` 一并补齐以贴合公司端格式。

诊断方法（裸 CDP 连 9333，按 URL 选画布页）：`/tmp/cdp_eval_canvas.py`，
fetch `/api/projects/<id>/snapshot` 对比 `measured` 与 `.react-flow__node[data-id]` 渲染情况。
诊断脚本（复用 `/tmp/cdp_eval.py` 的连接逻辑，新建 `/tmp/cdp_node_diag.py` 或直接 eval）：

```bash
# 列出当前画布所有节点的 id/type/是否有 measured/data.status/data.imageSource
# 通过 ovO 登录窗 webview 的 CDP（9333）对画布页面执行：
#   window.__REACT_FLOW__ 或读取页面渲染出的节点 DOM/React state
```

操作：在 ovO 内本地上传一张图（生成一个 app 写入的节点），刷新画布，确认它**不显示**；
再用 CDP 取该 nodeId 的真实快照字段，与同画布一个**能显示**的节点逐字段 diff。

**记录结论**到本任务下（哪个/哪些字段缺失导致不渲染：`measured`？`data.status` 枚举？
`imageSource`？`position` 合法性？）。后续 Step 按结论改，不要凭猜。

- [ ] **Step 2: 按结论补齐节点字段**

依据 Step 1 结论改 `uploadClient.ts`。基线改动（若实证确认这些是缺失项）——
给 `CompanyNode` 增加 `measured`，在 `baseNode` 写入画布枚举 `status` 与 `imageSource`：

`CompanyNode` 类型（:30-37）增字段：

```typescript
type CompanyNode = {
  id: string;
  type: AssetKind;
  x: number;
  y: number;
  position: { x: number; y: number };
  measured: { width: number; height: number };
  data: Record<string, unknown>;
};
```

`baseNode`（:248-272）补 `measured` 与画布枚举。把 `baseNode` 的返回对象改为：

```typescript
function baseNode(asset: CanvasAsset, fields: Record<string, unknown>): CompanyNode {
  const isImage = asset.kind === "image";
  return {
    id: asset.id,
    type: asset.kind,
    x: 0,
    y: 0,
    position: { x: 0, y: 0 },
    measured: isImage ? { width: 288, height: 162 } : { width: 320, height: 587 },
    data: compactRecord({
      id: asset.id,
      assetId: asset.id,
      name: asset.name,
      label: asset.name,
      type: asset.kind,
      kind: asset.kind,
      category: asset.category,
      ...fields,
      assetUri: asset.url,
      assetStatus: "Active",
      thumbnailUrl: asset.thumbnailUrl,
      createdAt: asset.createdAt,
      // 画布渲染器认的枚举：图片 completed、视频 idle（非占位用的 ready/generating）。
      status: isImage ? "completed" : "idle",
      imageSource: isImage ? "upload" : undefined,
      sizeBytes: asset.sizeBytes
    })
  };
}
```

> 若 Step 1 实证显示生成图（非上传）应是 `imageSource:"generate"` 或其它值，
> 则按实证给生成 vs 上传分别赋值（可在 `createCompanyImageNode` 传入区分）。
> `withNodePosition`（:143-150）也要带上 `measured` 透传——它用 `...node` 展开，已自动保留。

- [ ] **Step 3: 删除侧实证**

在 ovO 内删除一个 app 可见节点，确认 `removeAssetFromSnapshot` 按 node.id 删到了
画布渲染层；刷新画布确认消失。若删不掉，检查 `matchesNodeAsset`（canvasClient.ts）
是否匹配到 `node.id`（app 写入节点 id 形如 `uploaded-image-<uuid>` / `generated-image-<uuid>`）。

- [ ] **Step 4: 构建 + 测试**

Run: `npm run build && npm run test`
Expected: 编译通过；若 `uploadClient` 有单测断言旧节点结构，按新字段更新。

- [ ] **Step 5: 真机回归**

ovO 内：本地上传一张图 → 切画布刷新 → 确认显示；删除该节点 → 刷新 → 确认消失。

- [ ] **Step 6: Commit**

```bash
git add src/api/uploadClient.ts
git commit -m "fix(canvas): 上传/生成节点补 measured+imageSource+画布枚举 status,修复画布不显示

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: 版本号 + 全量验证 + 推送

**Files:**
- Modify: `package.json`（version → 0.1.9）

- [ ] **Step 1: bump 版本号**

`package.json` 的 `"version": "0.1.8"` → `"version": "0.1.9"`。

- [ ] **Step 2: 全量构建 + 测试**

Run: `npm run build && npm run test`
Expected: 编译通过、全部测试 PASS。失败则回到对应任务修复，不要带病推送。

- [ ] **Step 3: Commit 版本号**

```bash
git add package.json
git commit -m "chore: bump version to 0.1.9

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: 推送 gitee**

```bash
git push gitee feature/ui-shell
```

Expected: 推送成功。确认远端 `gitee/feature/ui-shell` 含本轮所有提交。

---

## Self-Review（计划 vs spec 覆盖）

- A0 占位符竞态 → Task 5 ✓
- A1 预览工具栏 → Task 6 ✓
- A2 批量删除 → Task 7 ✓
- A3 比例兜底（字段+提示词）→ Task 3 ✓
- B1 504 回退 gen-queue → Task 4 ✓
- B2 排序按节点 ID 时间 → Task 1（工具）+ Task 2（接入）✓
- B3 本地节点同步（先实证）→ Task 8 ✓
- 版本号 v0.1.9 + 推送 → Task 9 ✓

**说明：** Task 8 的字段改动以 Step 1 的 CDP 实证结论为准，计划给的是抓包推断的基线；
若实证与基线不符，按实证调整 Step 2 的字段，不盲改。



