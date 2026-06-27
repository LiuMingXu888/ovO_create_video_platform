# v0.2.4 计划（feature/ui-shell）

分支：feature/ui-shell（worktree: .worktrees/ui-shell）
版本：0.2.3 → 0.2.4
远端：gitee（git@gitee.com:siberian-aries/ov-o_create_video_platform.git）

## fix1 — 点击历史画布本地优先显示
**决策（已确认）**：本地秒显 + 后台静默拉 snapshot。
- 点击历史画布项当前只 setCanvasUrl/Name，不加载资源。改为点击即打开。
- 命中本地缓存（readLocalCanvas(projectId) 有 assets）：立即用本地 assets 渲染资源（无 spinner），
  设置最小 project 占位（{projectId, canvasUrl, title, loadedAt}），
  后台静默调用服务端 loadCanvasResources 仅回填 project + canvasSnapshot（不替换已显示的本地 assets），
  让生成/改名等需要 snapshot 的功能可用。
- 未命中本地缓存：走原 loadCanvasFromUrl（服务端加载，带 spinner）。
- 顶部「获取画布资源」按钮保持＝强制服务端全量刷新（用户拉最新的入口）。

文件：
- src/App.tsx：
  - 新增 async openCanvasFromHistory(entry)，替换 onSelectCanvasHistory 绑定（原 selectCanvasHistory 行为并入）。
  - 新增 async syncCanvasMetaFromServer(url)：静默 setProject + setCanvasSnapshot + startAutoSave + resumePendingImageTasks；失败仅 console.warn，保留本地视图。
  - 渲染处 onSelectCanvasHistory={openCanvasFromHistory}。

## fix2 — 引用提示词按钮去前缀，补 道具- / 场景-
文件：src/lib/referenceText.ts → stripAssetPrefix 增加 ^场景[\s\-]* 与 ^道具[\s\-]* 的 replace。
（仅改 referenceText.ts；assetNamePrefix.ts 的 stripPromptPrefixes 不在该按钮路径，不动。）

## fix3 — 删除「视频生成/图片生成」旁的「工具」tab
- src/components/PromptDock.tsx：删除工具 tab 按钮（148-156），三元改为 video|image，删除 ToolsPlaceholder 分支。
- src/types.ts:18：GenerateMode = "video" | "image"（去掉 "tools"）。
- 删除 src/components/ToolsPlaceholder.tsx（已无引用；且原 173 行用了却没 import＝潜在编译错，删用法即修复）。
- 清理 styles.css 中 ToolsPlaceholder 注释块。
- 注意：ModeSwitch 的 AppMode "tools"（顶部应用模式「工具」）是另一套，不动。

## fix4 — 提示词区布局
- src/components/PromptDock.tsx：删除「:节点名称」行（node-name-row，98-108）。
  删除后顺序＝ 引用按钮(reference-strip) → 节点名称(node-name-field) → 提示词书写框(prompt-row)。
- src/styles.css：
  - .node-name-field input 宽度固定 500（flex:0 0 500px; width:500px）。
  - 收紧 .node-name-field 垂直 padding 使三者紧贴。
  - 删除已无用的 .node-name-row / .node-name-label 规则。

## 版本 & 推送
- package.json version → 0.2.4。
- 验证：npm run build（tsc 类型检查 + vite build）、npm test（vitest）。
- 提交并推送 gitee feature/ui-shell。

## 验证
- 类型检查/构建通过、测试通过。
- 实测（用户）：测试画布 http://qijing.kjjhz.cn/canvas/cmqlzufagtb0ulq1tejj5hwa7
