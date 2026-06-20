# 去字幕 24h 自动路由 + 元数据持久化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点击「去字幕」按 24 小时窗口全自动选择免费(方舟)/付费(火山VOD)接口，并把生成元数据持久化到服务端快照，使退出重进后仍可见、可复用提示词。

**Architecture:** 先用 ovO 内置浏览器实测抓取真实的免费/付费去字幕请求契约(Task 1)，后续代码严格对齐。路由判定改为语义化 `"free"|"paid"`、未知默认付费。生成发起时把 `generationStartedAt/model` 写入服务端快照，`assetNormalizer` 读回，去字幕节点继承元数据，并放宽「复用生成」按钮。

**Tech Stack:** TypeScript + React + Vite + Vitest；Electron 桌面端；裸 CDP(端口 9333) 抓包；gitee 远端。

## Global Constraints

- 分支 `feature/ui-shell`，worktree `.worktrees/ui-shell`；**推 gitee** `git@gitee.com:siberian-aries/ov-o_create_video_platform.git`，不直接推 main。
- 测试命令 `npm test`(= `vitest run --passWithNoTests`)；构建 `npm run build`(tsc×2 + vite build)。
- 实测抓包：用 ovO app 内置浏览器 + computer-use 鼠标操作，**不使用 Google Chrome**；CDP 脚本沿用 `/tmp/ovo-cdp/`。测试画布 `cmqlzufagtb0ulq1tejj5hwa7`。
- 路由判定优先级(verbatim)：无 createdAt→paid；解析失败/未来时间→paid；age>24h→paid；age≤24h且 Seedance→free；age≤24h但非 Seedance→paid。
- 计时起点：服务端 `createdAt` 优先，回退本地 `generationStartedAt`。
- 持久化位置：服务端快照(跟画布走)。
- 复制提示词：只修现有「复用生成」按钮，不另加复制按钮。
- TDD：先写失败测试再实现；频繁提交，每任务粒度一次。

---

### Task 1: 实测抓取真实去字幕接口契约（免费 + 付费）

**Files:**
- Create: `findings.md`（worktree 根，记录两套契约对照表）

**Interfaces:**
- Consumes: 无（起点任务）。
- Produces: `findings.md` 中两套契约——免费/付费各自的【提交 URL、method、payload 全字段、taskId 字段路径、轮询 URL 模板、轮询 status 取值、结果视频地址字段】。Task 4 严格按此对齐 `endpoints.ts`/`subtitleClient.ts`。

- [ ] **Step 1: 启动 ovO app 并打开内置浏览器加载测试画布**

用 computer-use 启动 ovO app（已登录公司账号），打开内置浏览器，加载 `http://qijing.kjjhz.cn/canvas/cmqlzufagtb0ulq1tejj5hwa7`。确认 CDP 端口 9333 可连（沿用 `/tmp/ovo-cdp/` 脚本）。

- [ ] **Step 2: 抓「付费擦除」请求（旧视频）**

对画布上已存在的旧视频（>24h），右击/点击节点 → 「去字幕」→ 弹框点「付费擦除」。用 CDP 记录：提交请求完整 URL、method、请求头、payload 全字段；响应里 taskId 的字段名与层级；随后的轮询请求 URL 模板、status 取值、结果视频地址字段。写入 `findings.md`「付费」段。

- [ ] **Step 3: 新生成一个视频（为免费擦除准备素材）**

右击画布 → 添加节点 → 视频（参考图 2/3），切到「全能多参」，主体选 2 张图 + 2 个音频，视频选 1-1，填入用户提供的提示词（苏婉晴/老周拦安检场景），点生成。等待生成完成（节点变 ready）。

- [ ] **Step 4: 抓「免费擦除」请求（刚生成的新视频）**

点击新视频 → 「去字幕」→ 弹框点「免费擦除」。用 CDP 记录同 Step 2 的全部字段，写入 `findings.md`「免费」段。

- [ ] **Step 5: 整理契约对照表并提交**

在 `findings.md` 顶部写一张免费 vs 付费对照表（提交端点、payload 形状、taskId 路径、轮询端点、status 字符串、结果字段）。标注与 codex 旧端点 `/api/subtitle-remove(/ark)` 的差异。

```bash
git add findings.md
git commit -m "docs: capture real subtitle removal API contracts (free + paid)"
```

---

### Task 2: 路由判定改为语义化 `"free"|"paid"`，未知默认付费

**Files:**
- Modify: `src/api/subtitleClient.ts`（`chooseSubtitleRemovalRoute` + `SubtitleRemovalRoute` 类型 + `SubtitleRemovalResult.route`）
- Test: `src/api/subtitleClient.test.ts`

**Interfaces:**
- Consumes: `CanvasAsset` 的 `providerVideoUrl?`、`createdAt?`、`model?`（`model` 由 Task 3 加进类型；本任务函数签名按 `{ providerVideoUrl?: string; createdAt?: string; isSeedance?: boolean }` 接收）。
- Produces: `chooseSubtitleRemovalRoute(asset, now): "free" | "paid"`；`SubtitleRemovalRoute = "free" | "paid"`。Task 4 据此映射端点。

- [ ] **Step 1: 改写测试为 free/paid 语义并覆盖全分支**

替换 `subtitleClient.test.ts` 里旧的 `chooseSubtitleRemovalRoute` 相关用例，新增独立 describe：

```typescript
describe("chooseSubtitleRemovalRoute", () => {
  const now = new Date("2026-06-20T12:00:00.000Z");
  const base = { providerVideoUrl: "https://provider.example.com/v.mp4", isSeedance: true };

  it("returns paid when createdAt is missing", () => {
    expect(chooseSubtitleRemovalRoute({ ...base, createdAt: undefined }, now)).toBe("paid");
  });
  it("returns paid when createdAt is unparseable", () => {
    expect(chooseSubtitleRemovalRoute({ ...base, createdAt: "not-a-date" }, now)).toBe("paid");
  });
  it("returns paid when createdAt is in the future", () => {
    expect(chooseSubtitleRemovalRoute({ ...base, createdAt: "2026-06-20T13:00:00.000Z" }, now)).toBe("paid");
  });
  it("returns paid when older than 24h", () => {
    expect(chooseSubtitleRemovalRoute({ ...base, createdAt: "2026-06-19T11:00:00.000Z" }, now)).toBe("paid");
  });
  it("returns free when within 24h and Seedance", () => {
    expect(chooseSubtitleRemovalRoute({ ...base, createdAt: "2026-06-20T01:00:00.000Z" }, now)).toBe("free");
  });
  it("returns paid when within 24h but not Seedance", () => {
    expect(chooseSubtitleRemovalRoute({ ...base, isSeedance: false, createdAt: "2026-06-20T01:00:00.000Z" }, now)).toBe("paid");
  });
  it("treats exactly 24h as free boundary", () => {
    expect(chooseSubtitleRemovalRoute({ ...base, createdAt: "2026-06-19T12:00:00.000Z" }, now)).toBe("free");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/api/subtitleClient.test.ts`
Expected: FAIL（返回 `"ark"/"default"` 与新断言 `"free"/"paid"` 不符）

- [ ] **Step 3: 改写 `chooseSubtitleRemovalRoute` 与类型**

`subtitleClient.ts`：把 `type SubtitleRemovalRoute = "default" | "ark";` 改为 `"free" | "paid"`，`SubtitleRemovalResult.route` 同步改为 `"free" | "paid"`，并改写函数：

```typescript
export function chooseSubtitleRemovalRoute(
  asset: { providerVideoUrl?: string; createdAt?: string; isSeedance?: boolean },
  now: Date
): SubtitleRemovalRoute {
  if (!asset.createdAt) return "paid";
  const createdAtMs = Date.parse(asset.createdAt);
  const nowMs = now.getTime();
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(nowMs)) return "paid";
  const ageMs = nowMs - createdAtMs;
  if (ageMs < 0 || ageMs > FREE_SUBTITLE_ROUTE_WINDOW_MS) return "paid";
  return asset.isSeedance ? "free" : "paid";
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/api/subtitleClient.test.ts`
Expected: PASS。若 `removeSubtitles` 用例因 route 标签从 `"ark"/"default"` 变化而失败，本步只把这些 **标签断言** 同步改为 `"free"/"paid"`；端点 URL 对齐留 Task 4。

- [ ] **Step 5: 提交**

```bash
git add src/api/subtitleClient.ts src/api/subtitleClient.test.ts
git commit -m "fix: subtitle route uses free/paid semantics, default paid when unknown"
```

---

### Task 3: 生成发起时把 `generationStartedAt`/`model` 写入服务端快照

**Files:**
- Modify: `src/types.ts`（`CanvasAsset` 加 `generationStartedAt?`、`model?`）
- Modify: `src/services/companyApiFacade.ts`（`saveCanvasAsset` 入参加 `createdAt?`、`generationStartedAt?`、`model?`）
- Modify: `src/services/canvasLoader.ts`（`saveCanvasAsset` 构造 asset 时透传上述字段）
- Modify: `src/App.tsx`（生成流程 `saveCanvasAsset` 调用处传入 `generationStartedAt`/`model`）
- Test: `src/services/canvasLoader.test.ts`

**Interfaces:**
- Consumes: `companyApiFacade.generateVideo` 返回的 `GenerateVideoResult`（仅 `taskId/videoUrl/providerVideoUrl/persisted`，无 model）。`model` 取自生成时的 `generationSettings`（`src/types.ts` 的 `GenerationSettings`，实现时确认其模型字段名，如无则用 `result` 不可得而留空）。
- Produces: 持久化的 `CanvasAsset.generationStartedAt: string`、`CanvasAsset.model?: string`。Task 5 读回，Task 2 的 `isSeedance` 由 `model` 推导。

- [ ] **Step 1: 写失败测试 —— canvasLoader 保存时透传新字段**

在 `canvasLoader.test.ts` 的 saveCanvasAsset 用例组中加：

```typescript
it("persists generationStartedAt and model onto the saved asset", async () => {
  const transport = makeTransport(); // 复用文件中已有的 transport mock 工厂
  const result = await saveCanvasAsset(transport, {
    projectId: "proj-1",
    snapshot: { nodes: [] },
    name: "成片",
    kind: "video",
    category: "video",
    url: "https://cdn.example.com/v.mp4",
    generationStartedAt: "2026-06-20T01:00:00.000Z",
    model: "Seedance 2.0"
  });
  expect(result.asset.generationStartedAt).toBe("2026-06-20T01:00:00.000Z");
  expect(result.asset.model).toBe("Seedance 2.0");
});
```

（若文件没有 `makeTransport` 工厂，按文件现有 mock 风格内联构造一个 `request` 返回保存成功快照的 transport。）

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/services/canvasLoader.test.ts`
Expected: FAIL（类型不接受 `generationStartedAt`/`model`，或 asset 上无这两字段）

- [ ] **Step 3: 加类型字段**

`src/types.ts` 的 `CanvasAsset` 接口加：

```typescript
  generationStartedAt?: string;
  model?: string;
```

- [ ] **Step 4: facade 与 canvasLoader 透传**

`companyApiFacade.ts` 的 `saveCanvasAsset` 入参对象类型加：

```typescript
    createdAt?: string;
    generationStartedAt?: string;
    model?: string;
```

`canvasLoader.ts` 的 `saveCanvasAsset` 构造 asset 处（当前 `createdAt: new Date().toISOString()` 一带）加：

```typescript
    createdAt: input.createdAt ?? new Date().toISOString(),
    generationStartedAt: input.generationStartedAt,
    model: input.model,
```

并在该函数 input 类型上同步加 `createdAt?`、`generationStartedAt?`、`model?`。

- [ ] **Step 5: App.tsx 生成流程传入**

`src/App.tsx` 生成成功后的 `companyApiFacade.saveCanvasAsset({...})` 调用处（约 `1278` 行）加入：

```typescript
          generationStartedAt: startTime ? new Date(startTime).toISOString() : new Date().toISOString(),
          model: generationSettings.model,
```

（`startTime` 是该流程已有的发起时间戳变量；`generationSettings.model` 字段名以 `GenerationSettings` 实际定义为准，实现时确认，没有则取可得的模型标识或省略 `model`。）

- [ ] **Step 6: 运行测试确认通过**

Run: `npm test -- src/services/canvasLoader.test.ts`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/types.ts src/services/companyApiFacade.ts src/services/canvasLoader.ts src/App.tsx src/services/canvasLoader.test.ts
git commit -m "feat: persist generationStartedAt and model on saved canvas assets"
```

---

### Task 4: 对齐实测契约 + 把 createdAt/isSeedance 喂给 removeSubtitles

**Files:**
- Modify: `src/api/endpoints.ts`（按 `findings.md` 校正去字幕端点；不一致则改）
- Modify: `src/api/subtitleClient.ts`（`removeSubtitles` 按 route 映射端点/payload，传 `isSeedance`）
- Modify: `src/services/canvasLoader.ts:159`（`removeCanvasAssetSubtitles` 调用 `removeSubtitles` 时透传 `createdAt`/`isSeedance`）
- Test: `src/api/subtitleClient.test.ts`、`src/api/endpoints.test.ts`

**Interfaces:**
- Consumes: `findings.md`（Task 1 的真实契约）；`chooseSubtitleRemovalRoute`（Task 2，`"free"|"paid"`）；`CanvasAsset.model`/`createdAt`（Task 3）。
- Produces: `removeSubtitles(transport, asset, options)` 中 `asset` 接收 `{ url; providerVideoUrl?; createdAt?; isSeedance?: boolean }`；提交到与实测一致的免费/付费端点。

- [ ] **Step 1: 按 findings 更新 endpoints 测试**

依据 `findings.md` 的真实路径改 `endpoints.test.ts`。示例（**实际值以 findings 为准**，若实测就是 `/api/subtitle-remove` + `/ark` 则保持）：

```typescript
expect(endpoints.subtitleRemove()).toBe("<paid 提交路径 from findings>");
expect(endpoints.subtitleRemoveArk()).toBe("<free 提交路径 from findings>");
```

- [ ] **Step 2: 更新 subtitleClient 测试断言 route→端点/payload 映射**

在 `subtitleClient.test.ts` 的 `removeSubtitles` 用例里，断言 free route 打 free 端点、paid route 打 paid 端点，payload 字段与 findings 一致（taskId 读取路径、轮询路径、status 字符串、结果地址字段都按 findings）。给 `providerVideo` fixture 补 `isSeedance: true`。

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- src/api/subtitleClient.test.ts src/api/endpoints.test.ts`
Expected: FAIL（端点/字段与旧猜测不符）

- [ ] **Step 4: 按 findings 改 endpoints.ts 与 removeSubtitles**

`endpoints.ts`：把 `subtitleRemove`/`subtitleRemoveArk`/`subtitleRemoveTask`/`subtitleRemoveArkTask` 改成 findings 的真实路径（一致则不动）。
`subtitleClient.ts` 的 `removeSubtitles`：
- route 映射：`route === "free" ? endpoints.subtitleRemoveArk() : endpoints.subtitleRemove()`；轮询同理用 free/paid 对应 task 端点。
- body 按 findings 构造（免费/付费各自的 payload 形状；taskId 读取路径按 findings，必要时从 `data.taskId` 取）。
- 函数签名 asset 加 `isSeedance?: boolean`，传给 `chooseSubtitleRemovalRoute`。

- [ ] **Step 5: canvasLoader 透传 createdAt/isSeedance**

`canvasLoader.ts` `removeCanvasAssetSubtitles` 里调用 `removeSubtitles(transport, input.sourceAsset, …)` 处，确保 `input.sourceAsset` 含 `createdAt`，并推导 `isSeedance`：

```typescript
const sourceForRoute = {
  url: input.sourceAsset.url,
  providerVideoUrl: input.sourceAsset.providerVideoUrl,
  createdAt: input.sourceAsset.createdAt,
  isSeedance: isSeedanceModel(input.sourceAsset.model)
};
const result = await removeSubtitles(transport, sourceForRoute, { intervalMs: 1500, maxAttempts: 1400 });
```

并在 `canvasLoader.ts` 加一个最小判定（Seedance 原始视频）：

```typescript
function isSeedanceModel(model?: string): boolean {
  if (!model) return false;
  return /seedance/i.test(model);
}
```

（若 Task 1 实测显示免费接口不挑模型、任意 ≤24h 视频均免费，则把 `isSeedance` 恒传 `true`，并在 `findings.md` 记下该结论。）

- [ ] **Step 6: 运行测试确认通过**

Run: `npm test -- src/api/subtitleClient.test.ts src/api/endpoints.test.ts`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/api/endpoints.ts src/api/subtitleClient.ts src/services/canvasLoader.ts src/api/subtitleClient.test.ts src/api/endpoints.test.ts
git commit -m "fix: align subtitle endpoints/payload with captured contract, route by age+model"
```

---

### Task 5: assetNormalizer 读回 `model`

**Files:**
- Modify: `src/lib/assetNormalizer.ts`（`RawAssetRecord` 加 `model?`；`pickMediaFields` 取 `model`；`normalizeRawAsset` 输出 `model`）
- Test: `src/lib/assetNormalizer.test.ts`

**Interfaces:**
- Consumes: 服务端快照记录里的 `model`/`createdAt`/`generationStartedAt`（Task 3 写入）。
- Produces: `CanvasAsset.model` 从快照读回，供 Task 4 的 `isSeedanceModel` 与 Task 2 路由使用。

- [ ] **Step 1: 写失败测试**

在 `assetNormalizer.test.ts` 加：

```typescript
it("reads back model and createdAt from snapshot records", () => {
  const assets = normalizeAssetsFromSnapshot({
    nodes: [
      {
        assetId: "v1",
        kind: "video",
        url: "https://cdn.example.com/v.mp4",
        model: "Seedance 2.0",
        createdAt: "2026-06-20T01:00:00.000Z"
      }
    ]
  });
  const video = assets.find((a) => a.id === "v1");
  expect(video?.model).toBe("Seedance 2.0");
  expect(video?.createdAt).toBe("2026-06-20T01:00:00.000Z");
});
```

（函数名 `normalizeAssetsFromSnapshot` 以文件实际导出为准，实现时确认入口函数名。）

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/lib/assetNormalizer.test.ts`
Expected: FAIL（`model` 为 undefined）

- [ ] **Step 3: 加 model 读取**

`assetNormalizer.ts`：`RawAssetRecord` 接口加 `model?: string;`；`pickMediaFields` 返回对象加 `model: stringValue(record.model),`；`normalizeRawAsset` 返回对象加 `model: record.model,`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/lib/assetNormalizer.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/assetNormalizer.ts src/lib/assetNormalizer.test.ts
git commit -m "feat: read back model from canvas snapshot for subtitle routing"
```

---

### Task 6: 放宽「复用生成」按钮——只要有提示词即可用

**Files:**
- Modify: `src/components/AssetCard.tsx:220-222`（disabled/title 条件）
- Modify: `src/App.tsx:533`（`reuseGeneration` 放宽）
- Test: `src/components/AssetCard.test.tsx`（无则按现有组件测试风格新建最小用例）

**Interfaces:**
- Consumes: `CanvasAsset.generationPrompt`、`generationReferences?`。
- Produces: 「复用生成」按钮在仅有 `generationPrompt` 时可点；点击仅填提示词、引用为空时不填引用。

- [ ] **Step 1: 写失败测试**

在 `AssetCard.test.tsx`（无则新建，import 同目录已有组件测试的渲染工具）：

```typescript
it("enables reuse button when only generationPrompt exists", () => {
  const asset = { id: "v1", name: "成片", kind: "video", category: "video",
    url: "https://cdn.example.com/v.mp4", generationPrompt: "提示词" } as CanvasAsset;
  render(<AssetCard asset={asset} onAction={() => {}} /* 其余必填 props 按组件签名补 */ />);
  const btn = screen.getByLabelText("复用生成 成片");
  expect(btn).not.toBeDisabled();
});

it("disables reuse button when no generationPrompt", () => {
  const asset = { id: "v2", name: "无提示", kind: "video", category: "video",
    url: "https://cdn.example.com/v2.mp4" } as CanvasAsset;
  render(<AssetCard asset={asset} onAction={() => {}} />);
  expect(screen.getByLabelText("复用生成 无提示")).toBeDisabled();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/components/AssetCard.test.tsx`
Expected: FAIL（当前 disabled 还要求 references）

- [ ] **Step 3: 放宽 AssetCard 条件**

`AssetCard.tsx`：

```tsx
                title={asset.generationPrompt ? "复用生成" : "暂无可复用的生成提示词"}
                aria-label={`复用生成 ${asset.name}`}
                disabled={!asset.generationPrompt}
```

- [ ] **Step 4: 放宽 App.tsx reuseGeneration**

`src/App.tsx` 的 `reuseGeneration`：

```typescript
  function reuseGeneration(asset: CanvasAsset) {
    if (!asset.generationPrompt) {
      addActivityMessage(`「${asset.name}」暂无可复用的生成提示词`);
      return;
    }

    setPrompt(asset.generationPrompt);

    if (!asset.generationReferences?.length) {
      setReferences([]);
      setReferenceIssues([]);
      addActivityMessage(`已复用「${asset.name}」的提示词（无参考资源）`);
      return;
    }

    const nextReferences = asset.generationReferences.map(cloneReferenceForReuse);
    const validation = validateReferenceItems(nextReferences);

    if (validation.valid) {
      setReferenceIssues([]);
      setReferences(nextReferences);
      addActivityMessage(`已复用「${asset.name}」的提示词和引用`);
      return;
    }

    setReferences([]);
    setReferenceIssues(validation.errors.map((message) => ({ id: createId("reference-error"), message })));
    addActivityMessage(validation.errors.join(" / "));
  }
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- src/components/AssetCard.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/components/AssetCard.tsx src/App.tsx src/components/AssetCard.test.tsx
git commit -m "feat: enable reuse-generation when only prompt exists"
```

---

### Task 7: 去字幕节点继承元数据 + 错误诊断透传

**Files:**
- Modify: `src/api/subtitleClient.ts`（`removeSubtitles` taskId 缺失时抛带诊断的错）
- Modify: `src/services/canvasLoader.ts`（`createSubtitleRemovedAsset` 继承元数据）
- Modify: `src/App.tsx`（`createSubtitlePlaceholder` 继承 `generationStartedAt/model`；activity log 打路由依据）
- Test: `src/api/subtitleClient.test.ts`、`src/services/canvasLoader.test.ts`

**Interfaces:**
- Consumes: Task 4 的 route 映射；`CanvasAsset` 全字段。
- Produces: 去字幕产出节点带 `generationPrompt/generationReferences/generationStartedAt/model`；提交失败时错误信息含 route+URL+状态。

- [ ] **Step 1: 写失败测试 —— taskId 缺失抛带诊断错**

`subtitleClient.test.ts` 加：

```typescript
it("throws a diagnostic error when submit returns no taskId", async () => {
  const transport: ApiTransport = { request: vi.fn().mockResolvedValueOnce({}) };
  await expect(
    removeSubtitles(transport, { url: "https://cdn.example.com/v.mp4", createdAt: "2026-06-20T01:00:00.000Z", isSeedance: true, providerVideoUrl: "https://provider.example.com/v.mp4" },
      { intervalMs: 0, maxAttempts: 1, now: new Date("2026-06-20T02:00:00.000Z") })
  ).rejects.toThrow(/未返回任务 ID.*(free|paid)/);
});
```

- [ ] **Step 2: 写失败测试 —— 去字幕节点继承元数据**

`canvasLoader.test.ts` 加（在 removeCanvasAssetSubtitles 用例组）：

```typescript
it("inherits generation metadata onto the subtitle-removed asset", async () => {
  const transport = makeTransport(); // 复用文件已有的成功路径 mock
  const source = { id: "v1", name: "成片", kind: "video", category: "video",
    url: "https://cdn.example.com/v.mp4", providerVideoUrl: "https://provider.example.com/v.mp4",
    createdAt: "2026-06-20T01:00:00.000Z", generationPrompt: "提示词",
    generationReferences: [], generationStartedAt: "2026-06-20T01:00:00.000Z", model: "Seedance 2.0" } as CanvasAsset;
  const placeholder = { ...source, id: "v1-sub", name: "去字幕-成片", status: "generating" } as CanvasAsset;
  const out = await removeCanvasAssetSubtitles(transport, { projectId: "p1", sourceAsset: source, placeholderAsset: placeholder });
  expect(out.asset.generationPrompt).toBe("提示词");
  expect(out.asset.generationStartedAt).toBe("2026-06-20T01:00:00.000Z");
  expect(out.asset.model).toBe("Seedance 2.0");
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- src/api/subtitleClient.test.ts src/services/canvasLoader.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现诊断错误 + 元数据继承**

`subtitleClient.ts` 的 `removeSubtitles`，taskId 缺失分支：

```typescript
  if (!submitResult.taskId) {
    throw new Error(`去字幕接口未返回任务 ID（route=${route}, endpoint=${endpoint}）`);
  }
```

`pollSubtitleRemoval` 的超时分支带上已轮询次数与最后一次 status：

```typescript
  throw new Error(`去字幕任务轮询超时（已轮询 ${options.maxAttempts} 次，最后状态=${lastStatus ?? "未知"}）`);
```

（循环内用 `let lastStatus = result.status;` 记录最近一次 status。）


`canvasLoader.ts` 的 `createSubtitleRemovedAsset` 改为继承源元数据（当前 `...placeholderAsset` 已带，确认 placeholder 自身已含这些字段即可；若 placeholder 不含，则改为从单独传入的 source 继承）。本任务在 `removeCanvasAssetSubtitles` 入口确保 `placeholderAsset` 已包含 `generationStartedAt/model`（由 Step 5 的 placeholder 构造保证）。

- [ ] **Step 5: App.tsx placeholder 继承 + activity 路由日志**

`createSubtitlePlaceholder`（约 586 行）的返回对象加：

```typescript
      generationStartedAt: asset.generationStartedAt,
      model: asset.model,
```

`handleRemoveSubtitles` 里 `addActivityMessage(`去字幕中：${placeholder.name}`)` 改为带路由依据：

```typescript
    const routeForLog = chooseSubtitleRemovalRoute(
      { providerVideoUrl: asset.providerVideoUrl, createdAt: asset.createdAt, isSeedance: /seedance/i.test(asset.model ?? "") },
      new Date()
    );
    addActivityMessage(`去字幕中：${placeholder.name}（${routeForLog === "free" ? "免费" : "付费"}，createdAt=${asset.createdAt ?? "无"}）`);
```

（`chooseSubtitleRemovalRoute` 从 `../api/subtitleClient` import。）

- [ ] **Step 6: 运行测试确认通过**

Run: `npm test -- src/api/subtitleClient.test.ts src/services/canvasLoader.test.ts`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/api/subtitleClient.ts src/services/canvasLoader.ts src/App.tsx src/api/subtitleClient.test.ts src/services/canvasLoader.test.ts
git commit -m "feat: inherit generation metadata on subtitle nodes, surface route in diagnostics"
```

---

### Task 8: 全量验证 + 实测回归 + 推 gitee

**Files:**
- 无新增（验证 + 清理 codex 遗留 `progress.md`/`task_plan.md`）

**Interfaces:**
- Consumes: 全部前序任务。
- Produces: 绿色测试、通过的 build、gitee 已推送。

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: PASS（若 `App.test`/updater 满载并行偶发 flaky，按 memory 经验隔离复跑确认：`npm test -- src/App.test.tsx`）

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 成功（tsc×2 + vite build 无错）

- [ ] **Step 3: 实测回归（ovO app 内置浏览器）**

按 `findings.md`：①旧视频走付费擦除成功；②新生成视频走免费擦除成功；③参考图 1 红字消失；④退出重进画布后视频节点仍在、提示词「复用生成」按钮可点。任一失败回到对应任务修复。

- [ ] **Step 4: 清理 codex 遗留计划文件**

```bash
git rm -f progress.md task_plan.md
git commit -m "chore: remove stale codex planning scratch files"
```

（`findings.md` 保留作为契约依据。）

- [ ] **Step 5: 推 gitee**

```bash
git push gitee feature/ui-shell
```

Expected: 推送成功（远端 `git@gitee.com:siberian-aries/ov-o_create_video_platform.git`）。若 `gitee` remote 名不同，先 `git remote -v` 确认。

