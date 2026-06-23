# 图片复用提示词、生图 504 诊断、React DevTools 接入 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给图片资源卡补「复用提示词和资源」按钮(含参考图数据),诊断并修复生图 504,接入仅开发模式的 React DevTools。

**Architecture:** 三块相互独立。任务A 纯前端 React(AssetCard + App 数据透传),任务B 先 live 诊断再按结论修 imageGenerationClient,任务C 开发期注入脚本 + 文档。每块单独可测、单独可回退。

**Tech Stack:** Electron + React 19 + TypeScript + Vite + Vitest;裸 CDP(/tmp/cdp_eval.py,端口 9333);gitee 远端。

## Global Constraints

- 分支: `feature/ui-shell`(worktree `.worktrees/ui-shell`),所有改动在此分支。
- 版本: worktree 当前 `0.1.4`,本轮全部完成后 bump 到 `0.1.5` 一次性推 gitee。
- 远端: `git@gitee.com:siberian-aries/ov-o_create_video_platform.git`。
- 复用语义统一为「复用」: 视频与图片按钮文案/aria 都用「复用提示词和资源」,行为是把 prompt + references 填回生成区(不是复制到剪贴板)。
- 复用现有 `AssetAction = "reuse-generation"`,不新增 action 类型。
- 测试命令: `npm test`(vitest run);构建: `npm run build`。当前测试基线 294 通过。
- 测试画布: `http://qijing.kjjhz.cn/canvas/cmqlzufagtb0ulq1tejj5hwa7`,可自由增删改。

---

## Task A: 图片卡「复用提示词和资源」按钮 + 参考图数据透传

**Files:**
- Modify: `src/App.tsx`(`createGeneratedImagePlaceholder` ~647-662;`handleGenerateImage` 的 `saveCanvasAsset` 调用 ~1487-1498)
- Modify: `src/components/AssetCard.tsx`(secondary actions 区 ~242-262;视频按钮文案 ~244-252)
- Modify: `src/components/AssetCard.test.tsx`(更新视频 aria 文案断言 + 新增图片 reuse 断言)
- Modify(可选,reload 持久化): `src/api/uploadClient.ts`(`createCompanyImageNode` ~152-156)

**Interfaces:**
- Consumes: `reuseGeneration(asset)`(App.tsx:598,已实现,prompt+references 填回);`cloneReferenceForReuse`(App.tsx:122);`onAction(asset, "reuse-generation")`(已有路由 App.tsx:777)。
- Produces: 图片卡新增「复用提示词和资源」按钮;`createGeneratedImagePlaceholder` 返回值含 `generationReferences: ReferenceItem[]`。

- [ ] **Step 1: 更新 AssetCard 测试 — 视频文案统一为「复用」**

把 `src/components/AssetCard.test.tsx` 中两处 `getByLabelText("复用生成 成片")` / `getByLabelText("复用生成 无提示")` 改为新 aria:

```tsx
// 第一个 it:
expect(screen.getByLabelText("复用提示词和资源 成片")).not.toBeDisabled();
// 第二个 it:
expect(screen.getByLabelText("复用提示词和资源 无提示")).toBeDisabled();
```

- [ ] **Step 2: 新增图片卡 reuse 按钮的失败测试**

在 `AssetCard.test.tsx` 末尾追加:

```tsx
describe("AssetCard image reuse button", () => {
  it("renders enabled reuse button for image with generationPrompt", () => {
    const asset = {
      id: "img1",
      name: "人物A",
      kind: "image",
      category: "characters",
      url: "https://cdn.example.com/a.png",
      status: "ready",
      generationPrompt: "一个角色"
    } as CanvasAsset;
    const onAction = vi.fn();
    render(
      <AssetCard asset={asset} onAction={onAction} onRename={() => {}} onChangeCategory={() => {}} />
    );
    const btn = screen.getByLabelText("复用提示词和资源 人物A");
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onAction).toHaveBeenCalledWith(asset, "reuse-generation");
  });

  it("disables image reuse button when no generationPrompt", () => {
    const asset = {
      id: "img2",
      name: "人物B",
      kind: "image",
      category: "scenes",
      url: "https://cdn.example.com/b.png",
      status: "ready"
    } as CanvasAsset;
    render(
      <AssetCard asset={asset} onAction={vi.fn()} onRename={() => {}} onChangeCategory={() => {}} />
    );
    expect(screen.getByLabelText("复用提示词和资源 人物B")).toBeDisabled();
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- AssetCard`
Expected: FAIL — 旧 aria「复用生成」找不到 + 图片 reuse 按钮不存在。

- [ ] **Step 4: AssetCard 视频按钮文案统一为「复用」**

`src/components/AssetCard.tsx` 视频 reuse 按钮(~244-252)改 title/aria:

```tsx
<button
  type="button"
  title={asset.generationPrompt ? "复用提示词和资源" : "暂无可复用的生成提示词"}
  aria-label={`复用提示词和资源 ${asset.name}`}
  disabled={!asset.generationPrompt}
  onClick={() => onAction(asset, "reuse-generation")}
>
  <RefreshCcw size={15} />
</button>
```

- [ ] **Step 5: AssetCard 图片卡新增 reuse 按钮**

在 `src/components/AssetCard.tsx` secondary actions 区,`imageCategoryActions.map(...)`(~220-230)之后、删除按钮(~263)之前,插入:

```tsx
{asset.kind === "image" && (
  <button
    type="button"
    title={asset.generationPrompt ? "复用提示词和资源" : "暂无可复用的生成提示词"}
    aria-label={`复用提示词和资源 ${asset.name}`}
    disabled={!asset.generationPrompt}
    onClick={() => onAction(asset, "reuse-generation")}
  >
    <RefreshCcw size={15} />
  </button>
)}
```

注意 `RefreshCcw` 已在第 1 行 import,无需新增。

- [ ] **Step 6: 运行测试确认通过**

Run: `npm test -- AssetCard`
Expected: PASS(含 4 个 reuse 相关断言)。

- [ ] **Step 7: App.tsx 图片占位符保存参考图**

`createGeneratedImagePlaceholder`(~647-662)返回对象补一行(放在 `generationPrompt: prompt` 后):

```tsx
      generationPrompt: prompt,
      generationReferences: references.map(cloneReferenceForReuse)
```

- [ ] **Step 8: App.tsx saveCanvasAsset 透传参考图**

`handleGenerateImage` 的 `saveCanvasAsset({...})` 调用(~1487-1498)在 `generationPrompt: promptText` 后补:

```tsx
        generationPrompt: promptText,
        generationReferences: placeholder.generationReferences
```

(facade 与 canvasLoader 的 saveCanvasAsset 入参已支持 `generationReferences`,无需改类型。)

- [ ] **Step 9:(可选)图片节点持久化参考图,对齐视频节点**

`src/api/uploadClient.ts` `createCompanyImageNode`(~152-156)改为:

```tsx
export function createCompanyImageNode(asset: CanvasAsset): CompanyNode {
  return baseNode(asset, {
    imageUrl: asset.url,
    generationPrompt: asset.generationPrompt,
    prompt: asset.generationPrompt,
    generationReferences: asset.generationReferences,
    referenceImages: getReferenceUrls(asset, "image")
  });
}
```

(`getReferenceUrls` 同文件已定义 ~275。此步让刷新/重载后图片仍可复用。)

- [ ] **Step 10: 全量构建 + 测试**

Run: `npm run build && npm test`
Expected: build 成功;测试全过(基线 294 + 新增 2 个图片断言,视频 2 个改了文案仍过)。

- [ ] **Step 11: 提交**

```bash
git add src/App.tsx src/components/AssetCard.tsx src/components/AssetCard.test.tsx src/api/uploadClient.ts
git commit -m "feat(canvas): image card reuse prompt+references, unify reuse label"
```

---

## Task B: 生图 504 — live 诊断与修复

**Files:**
- 诊断脚本: 复用/参考 `/tmp/cdp_eval.py`(裸 CDP 连 127.0.0.1:9333)
- Modify(诊断后定): `src/api/imageGenerationClient.ts`(`generateImage` ~83-105;`requestGenerateImage` ~107-130)
- Modify(若改逻辑): `src/api/imageGenerationClient.test.ts`
- 记录: 更新本计划「诊断结论」小节 + 记忆 `ovo-image-gen-ui-pending-endpoint.md`

**Interfaces:**
- Consumes: `transport.request<T>(path, {method,body})`(transport.ts,504 时 throw `ApiError{status:504}`);`endpoints.generateImage()` / `endpoints.genQueue(projectId, taskId)` / `endpoints.generateImageTask(id)`;`pollImageQueueUntilComplete(transport, projectId, nodeId, taskId, options, providerTaskId)`(已实现 ~158)。
- Produces: 诊断结论(504 来源 + 队列是否含 nodeId 任务);据此的修复或准确报错。

- [ ] **Step 1: 确认 ovO 运行且 9333 可连**

Run: `python3 -c "import urllib.request,json; print(json.load(urllib.request.urlopen('http://127.0.0.1:9333/json'))[0]['url'])"`
Expected: 打印当前页面 URL(渲染进程)。若连不上,请用户确认 ovO 已启动并已登录、已加载测试画布。

- [ ] **Step 2: live 触发一次生图并抓请求**

用 `/tmp/cdp_eval.py` 注入 Network 监听(或在渲染进程 eval 包一层 fetch 日志),在测试画布 `cmqlzufagtb0ulq1tejj5hwa7` 走正常生图 UI 触发一次。记录:
- POST `endpoints.generateImage()` 的状态码与响应体;
- 若 504,紧接着 GET `endpoints.genQueue(projectId, <无taskId或placeholder.id>)` 看是否出现该 nodeId/任务。

把原始请求/响应写入 `docs/superpowers/specs/2026-06-23-image-gen-504-capture.md`。

- [ ] **Step 3: 判定分支**

- **分支 X(任务已进队列)**: POST 504 但 gen-queue 几秒内出现该 nodeId 任务 → 走 Step 4X。
- **分支 Y(上游真超时)**: 504 且队列始终无该任务 → 走 Step 4Y。

记录判定结果到 504-capture 文档。

- [ ] **Step 4X: 失败测试 — POST 504 时转队列轮询**

`src/api/imageGenerationClient.test.ts` 新增:模拟 transport 首个 POST 抛 `{status:504}`,但 `genQueue` 后续返回含 nodeId 的 succeeded 任务,断言 `generateImage` 返回该 imageUrl 而非 throw。

Run: `npm test -- imageGenerationClient`
Expected: FAIL。

- [ ] **Step 5X: 实现 — POST 超时/504 容错转队列**

`generateImage`(~83）改: 当有 `projectId` 且 `nodeId` 时,把 `requestGenerateImage` 包进 try;捕获 `error.status === 504`(或网络超时)时不直接 throw,改为以 `nodeId` 进入 `pollImageQueueUntilComplete`(taskId 缺省用 nodeId 兜底匹配);队列拿到结果即成功,仍超时再 throw 明确信息「生成请求网关超时,且队列未返回结果」。

```ts
// 伪代码骨架,实现时按真实字段补全
try {
  const submit = await requestGenerateImage(transport, input);
  // ...原逻辑
} catch (error) {
  const status = (error as ApiError)?.status;
  if ((status === 504) && input.projectId && input.nodeId) {
    const recovered = await pollImageQueueUntilComplete(
      transport, input.projectId, input.nodeId, input.nodeId, options
    );
    const url = extractImageUrl(recovered);
    if (url) return { taskId: input.nodeId, imageUrl: url };
    throw new Error("生成请求网关超时，且队列未返回结果，请稍后在画布查看或重试");
  }
  throw error;
}
```

- [ ] **Step 4Y/5Y: 失败测试 + 实现 — 准确报错(若分支 Y)**

若是上游真超时: 不伪造成功。`requestGenerateImage` 捕获 504 时 throw 友好信息「生成服务暂时繁忙(网关超时),请稍后重试」。测试断言 504 → 该 message。不加自动重试(避免重复扣积分),由用户手动重试。

- [ ] **Step 6: 运行测试确认通过**

Run: `npm test -- imageGenerationClient`
Expected: PASS。

- [ ] **Step 7: live 复验**

用 9333 再触发一次生图,确认: 要么成功出图,要么得到明确中文报错(不再是裸 `请求失败(504)`)。结论补进 504-capture 文档。

- [ ] **Step 8: 提交**

```bash
git add src/api/imageGenerationClient.ts src/api/imageGenerationClient.test.ts docs/superpowers/specs/2026-06-23-image-gen-504-capture.md
git commit -m "fix(image-gen): handle gateway 504 on submit (diagnosed via live CDP)"
```

---

## Task C: React DevTools — 仅开发模式注入 + 使用文档

**Files:**
- Modify: `package.json`(devDependencies + 可选 script)
- Modify: `src/main.tsx`(开发分支动态注入 8097 脚本)
- Create: `docs/react-devtools-usage.md`
- Test: 复用现有构建产物 grep 校验(无独立单测)

**Interfaces:**
- Consumes: Vite `import.meta.env.DEV`(dev 为 true,build 为 false)。
- Produces: dev 模式渲染进程连 standalone DevTools(localhost:8097);生产产物不含注入。

- [ ] **Step 1: 安装 react-devtools(pin 精确版本)**

Run: `npm install -D react-devtools@6.1.5`
(实现时若该版本不可用,取 npm 上与 React 19 兼容的最新稳定版并在文档记下实际版本。)
Expected: package.json devDependencies 出现 `react-devtools`。

- [ ] **Step 2: main.tsx 开发模式注入连接脚本**

`src/main.tsx` 在 `ReactDOM.createRoot` **之前**插入。standalone devtools 注入需在 React 加载前连上 8097,用动态 `connectToDevTools` 不可靠(React19),改为在 dev 下注入 backend 脚本:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

if (import.meta.env.DEV) {
  // standalone react-devtools 默认监听 8097;开发期连上后可看组件树
  const script = document.createElement("script");
  script.src = "http://localhost:8097";
  document.head.appendChild(script);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

注: 若注入 script 因 React 已初始化而连不上组件树,改用 main.tsx 顶部 `if (import.meta.env.DEV) { await import("react-devtools"); }` 之前的 backend 连接;实现时以"能看到组件树"为准,二选一,并在文档写明实际方式。

- [ ] **Step 3: 加便捷 script(可选)**

`package.json` scripts 增:

```json
    "devtools": "react-devtools",
```

- [ ] **Step 4: 构建并验证生产产物不含注入**

Run: `npm run build && grep -rn "8097" dist/ || echo "OK: no 8097 in dist"`
Expected: `OK: no 8097 in dist`(`import.meta.env.DEV` 在 build 下为 false,该分支被 tree-shake)。

- [ ] **Step 5: 写使用文档**

Create `docs/react-devtools-usage.md`:

```markdown
# React DevTools 使用说明(开发调试)

仅开发模式生效,生产打包不含。

## 下次怎么用
1. 终端起独立 DevTools 窗口: `npm run devtools`(或 `npx react-devtools`),会弹出一个等待连接的窗口。
2. 另开终端启动 ovO 开发模式: `npm run dev:electron`。
3. 渲染进程在 dev 下自动连 localhost:8097,DevTools 窗口出现组件树即成功。

## 原理
`src/main.tsx` 在 `import.meta.env.DEV` 为真时注入连接脚本指向 8097。
`npm run build` 时该分支为 false,被 tree-shake,生产产物里 grep 不到 8097。

## 实际连接方式
本项目采用: <实现时填: script 注入 / import 方式>,react-devtools 版本 <实际版本>。
```

(尖括号占位在实现 Step 2/1 后用真实值替换。)

- [ ] **Step 6: 测试基线不破**

Run: `npm test`
Expected: 全过(本任务不加单测,确认未破坏现有)。

- [ ] **Step 7: 提交**

```bash
git add package.json package-lock.json src/main.tsx docs/react-devtools-usage.md
git commit -m "chore(dev): inject react-devtools in dev mode only + usage doc"
```

---

## Task D: 版本号 + 推送 gitee

**Files:**
- Modify: `package.json`(version 0.1.4 → 0.1.5)

- [ ] **Step 1: 最终全量校验**

Run: `npm run build && npm test`
Expected: build 成功 + 测试全过。

- [ ] **Step 2: bump 版本**

`package.json` `"version": "0.1.4"` → `"0.1.5"`。
(如有 `package-lock.json` / electron-builder 配置同步版本,一并改。)

- [ ] **Step 3: 提交版本号**

```bash
git add package.json package-lock.json
git commit -m "chore: bump version to 0.1.5"
```

- [ ] **Step 4: 推送 gitee**

```bash
git push gitee feature/ui-shell
```
Expected: 推送成功。若需打 tag,确认用户偏好后再 `git tag v0.1.5 && git push gitee v0.1.5`。

---

## 诊断结论(Task B 执行时回填)

- 504 来源 endpoint:
- POST 504 后 gen-queue 是否含该 nodeId 任务:
- 采用分支(X / Y):
- 修复方式:

---

## Self-Review 记录

- **Spec 覆盖**: 任务1→Task A(含参考图数据决策);任务2→Task B(先 live 复现决策);任务3→Task C(仅开发模式注入决策);版本/推送→Task D(全做完推 v0.1.5 决策)。全覆盖。
- **Placeholder**: Task B 的修复实现依赖 live 诊断结论,已用「分支 X/Y」给出两条完整可执行路径 + 伪代码骨架,非占位;Task C 的两处尖括号是"执行后回填实际值",非逻辑占位。
- **类型一致**: `generationReferences: ReferenceItem[]`、`reuse-generation` action、`pollImageQueueUntilComplete` 签名、`saveCanvasAsset` 入参均与现有代码核对一致。
