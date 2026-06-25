# 设计：公司画布地址栏 + 打开奇境 + 画布快照历史（自动/手动保存与恢复）

日期：2026-06-25
分支：feature/ui-shell
版本：0.1.11 → 0.1.12

## 背景与目标

当前 ovO 桌面端「获取画布资源」区域有三个按钮（Open公司画布 / Open公司画布(DevTools) / Open公司画布(API Fetch)），
它们打开的内嵌浏览器窗口没有地址栏；只有「登录公司账号」窗口才有地址栏（后退/前进/前往/复制/刷新）。
本次要做五件事：

1. 给三个公司画布窗口都补上和登录窗口一致的地址栏。
2. 新增「打开奇境」按钮（默认跳 `http://qijing.kjjhz.cn/`，同样带地址栏），并把三个公司画布按钮移到右侧竖排，顶部与画布名称框对齐。
3. 新增后台自动保存：点「获取画布资源」后立即存一份快照，之后每 10 分钟存一份；单画布环形缓冲最多 6 份，超出删最旧；切换画布时停掉旧画布的自动保存、转到新画布；退出 ovO 前再存一份。
4. 「恢复历史记录」按钮：列出最近 ≤6 份快照（年月日时分秒），点击即恢复。
5. 「保存记录」按钮：手动存一份，逻辑与自动保存一致。

UI 布局：
- 中间区从左到右动作行：`获取画布资源 》 保存记录 》 恢复历史记录`
- 右侧竖排从上到下：`Open公司画布 》 Open公司画布(DevTools) 》 Open公司画布(API Fetch)`
- 「打开奇境」放在中间地址栏那一行的右侧

## 关键决策（已与用户确认）

- **快照内容**：本地镜像（assets 资源、布局、画布名、画布地址）**+ 上次「获取画布资源」时服务端返回的 `canvasSnapshot` JSON**（随获取结果顺带存入内存，不单独重新拉取）。每次自动/手动保存时读内存中这两份数据，无需额外网络请求。
- **恢复行为（四步）**：
  1. 先把当前本地状态存一份（`reason: 'pre-restore'`）作为反悔保底；
  2. 把选中快照写回本地视图（setAssets / setCanvasName / setCanvasUrl / setCanvasSnapshot）；
  3. 把该快照的 `canvasSnapshot` 推回服务端（`saveProjectSnapshot`）；
  4. `loadCanvasFromUrl` 重新从服务端拉取刷新，保证「所见 == 线上 == 刚推的那份」。
  测试画布，允许真正改动线上画布。
- **为什么要推服务端**：不推的话，下次点「获取画布资源」又会把服务端数据拉回来覆盖本地，恢复就白做了。
- **首份时机**：点「获取画布资源」成功后**立即存第 1 份**，之后每 10 分钟一份。
- **before-quit flush**：只向**主窗口**（App.tsx 所在渲染进程）发 `ovo:snapshot:flush`，只等它一个 `flush-done` 回执（或 1.5s 超时兜底），不向画布浏览窗口广播，避免白等超时。
- **appendSnapshot 串行化**：主进程内用一个 `Promise` 链（`writeQueue`）串行执行 append，防止 auto/manual/quit 同时触发时读-改-写互相覆盖。
- **打开奇境**：放在中间地址栏行右侧；用与登录窗口一致的「带地址栏内嵌浏览器」，plain 模式（不挂 CDP / 不开 DevTools）。
- **地址栏**：plain/devtools/capture 三个窗口都加地址栏。capture 模式因 CDP 与 DevTools 互斥仍不开 DevTools，但地址栏照常工作。

## 架构与组件

### A. Electron 主进程：地址栏复用（问题 1、2 的窗口侧）

现状：`openLoginWindow` 内联了一套地址栏（`createLoginToolbarUrl` + `ipcMain.on(actionChannel)` 处理 back/forward/reload/go/copy + `did-navigate` 回写地址栏）。`openCanvasWindow` 没有地址栏，直接把 BrowserView 铺满窗口。

改动：从 `companySession.ts` 抽出一个共享辅助 `attachBrowserToolbar(window, view, initialUrl)`：
- 渲染地址栏 HTML（沿用现有 `createLoginToolbarUrl` 的 HTML，改名为 `createBrowserToolbarUrl`，行为不变）。
- 绑定 action IPC（back/forward/reload/go/copy）与导航回写（did-navigate / did-navigate-in-page / did-start-navigation）。
- 负责 `TOOLBAR_HEIGHT` 偏移下的 `resize` 逻辑，返回一个 `dispose()` 用于窗口关闭时清理 `ipcMain` 监听。

`openLoginWindow` 与 `openCanvasWindow` 都改用 `attachBrowserToolbar`：
- `openCanvasWindow`（plain/devtools/capture）：BrowserView 从 `y = TOOLBAR_HEIGHT` 开始；capture 仍挂 CDP、devtools 仍开 DevTools，互斥规则不变；地址栏照常。
- 抽取后 `companySession.ts` 不显著增大（净增少量，删除重复内联块）。

「打开奇境」复用 `openCanvasWindow("http://qijing.kjjhz.cn/", "plain")`，无需新 IPC。

### B. 快照存储（问题 3/4/5 的持久层）

新增 `electron/canvasSnapshotStore.ts`：
- 目录 `userData/canvas-snapshots/`，文件 `<safeProjectId>.json`，结构 `{ entries: SnapshotEntry[] }`（沿用 `canvasStore.ts` 的 projectId 清洗，防路径穿越）。
- `listSnapshots(projectId)`：返回**轻量元数据**数组（`id` / `createdAt` / `canvasName` / `assetCount`），按时间倒序。
- `appendSnapshot(projectId, entry)`：追加后按 `createdAt` 升序裁剪到最多 6 份（环形缓冲，删最旧），返回更新后的元数据列表。
- `getSnapshot(projectId, id)`：返回单份**完整** entry（含 assets + canvasSnapshot）。

新增 IPC（`main.ts` 注册，`preload.cts` 暴露 `ovoDesktop.snapshots`）：
- `ovo:snapshot:list` → `listSnapshots`
- `ovo:snapshot:append` → `appendSnapshot`
- `ovo:snapshot:get` → `getSnapshot`

### C. 快照纯逻辑（渲染端，可单测）

新增 `src/lib/canvasSnapshots.ts`：
- 类型 `SnapshotEntry { id; createdAt; projectId; canvasName; canvasUrl; assets: CanvasAsset[]; canvasSnapshot: unknown; assetCount }`
  与 `SnapshotMeta { id; createdAt; canvasName; assetCount }`。
- `buildSnapshotEntry(input, now: Date)`：组装 entry；`createdAt = now.toISOString()`，`id` 由 `createdAt` 派生（如有同毫秒冲突再追加计数后缀）。`now` 由调用方注入，便于单测确定性断言（App 运行时传 `new Date()`）。
- `formatSnapshotTimestamp(createdAt)` → `YYYY年MM月DD日 HH:mm:ss`。

### D. 自动保存控制器（渲染端）

在 `App.tsx` 内用 `useRef` + 一个小封装管理：
- `snapshotStateRef`：始终持有最新的 `{ project, canvasName, canvasUrl, assets, canvasSnapshot }`。
  - `canvasSnapshot` 在 `loadCanvasFromUrl` 拿到服务端数据后写入，之后不再更新（不重复拉服务端）。
  - assets/canvasName/canvasUrl 随各自 setState 同步（复用现有 `assetsRef` 模式）。
- `takeSnapshot(reason)`：从 `snapshotStateRef` 读当前态 → `buildSnapshotEntry` → `ovoDesktop.snapshots.append`；无 `projectId` 时跳过，静默返回。
- `startAutoSave(projectId)`：清掉已有 interval/projectId → **立即 `takeSnapshot('load')`** → `setInterval(takeSnapshot, 10*60*1000)`。再次以不同画布调用即「停旧转新」。
- `stopAutoSave()`：清 interval。
- 触发点：`loadCanvasFromUrl` 成功末尾调用 `startAutoSave(project.projectId)`。

退出前保存：`main.ts` `before-quit`：
- 首次进入时 `event.preventDefault()`，只向**主窗口**（mainWindow）`webContents.send('ovo:snapshot:flush')`，等待它回 `ovo:snapshot:flush-done`（或 1.5s 超时兜底），置 `flushed=true` 后 `app.quit()`。不向画布浏览窗口广播（它们没有快照 state，不会回执，避免白等超时）。
- 渲染端收到 `flush` 即 `await takeSnapshot('quit')` 再回 `flush-done`。

### E. 恢复流程（问题 4）

`handleRestoreSnapshot(id)` 四步：
1. **先存保底**：`await takeSnapshot('pre-restore')`（防止恢复错了有反悔）。
2. **取完整快照**：`ovoDesktop.snapshots.get(projectId, id)`。
3. **回写本地视图**：`setAssets / setCanvasName / setCanvasUrl / setCanvasSnapshot` + `persistLocalCanvasFull`。
4. **推回服务端**：`saveProjectSnapshot(transport, projectId, entry.canvasSnapshot)`；推完后 `loadCanvasFromUrl(canvasUrl)` 重新拉取刷新，保证「所见 == 线上 == 刚推的那份」。下次点「获取」拉回来的就是恢复的这份，不会再被覆盖。
5. `addActivityMessage` 反馈；任一步失败走 `setCanvasError`（回推失败必须显式提示，因为改动线上）。

### F. UI 重构（`CanvasControls.tsx` + `styles.css`）

`.canvas-controls` 由 2 列改 3 列：`220px minmax(0,1fr) auto`，`align-items: start`（右列顶部与名称框对齐）。
- 左列：现有历史画布侧栏，不变。
- 中列（竖向）：
  - 名称行（不变）
  - 地址行：`[url-field | 打开奇境按钮]`（同一行，按钮在右）
  - 动作行：`获取画布资源 》 保存记录 》 恢复历史记录`
  - 状态行 / 错误行（不变）
- 右列（竖向，从上到下）：`Open公司画布 》 Open公司画布(DevTools) 》 Open公司画布(API Fetch)`

`恢复历史记录`：按钮点击展开一个 popover/下拉，列出 `listSnapshots` 的 ≤6 项（显示 `formatSnapshotTimestamp` + 资源数），点击项触发恢复；空列表显示「暂无历史记录」。组件挂载/恢复区打开时刷新列表。

新增 `CanvasControlsProps`：`onSaveSnapshot()`、`snapshotHistory: SnapshotMeta[]`、`onOpenSnapshotHistory()`（拉列表）、`onRestoreSnapshot(id)`、`onOpenQijing()`。

### G. 版本号

`package.json` 0.1.11 → 0.1.12；`preload.cts` 的 `version` 字段与 AppHeader 默认值保持同步（现有约定）。

## 数据流

加载：`获取画布资源` → `loadCanvasFromUrl` → 设状态（含 `canvasSnapshot`）+ `persistLocalCanvasFull` → `startAutoSave(projectId)`（立即存 1 份，读内存中已有 canvasSnapshot，不重新拉服务端）。
自动：每 10min `takeSnapshot('auto')` → 主进程串行 append + 裁剪 6。
手动：`保存记录` → `takeSnapshot('manual')`。
退出：`before-quit` → 只向主窗口 flush → `takeSnapshot('quit')` → quit（1.5s 超时兜底）。
恢复：`恢复历史记录` → 选项 → ① `takeSnapshot('pre-restore')` → ② `get` → ③ 本地回写 → ④ `saveProjectSnapshot` 回推 → ⑤ `loadCanvasFromUrl` 重新加载刷新。

## 错误处理

- 快照存取失败：`console.warn` + 不阻塞主流程（沿用 `localCanvasStore` 的吞错模式）；恢复的服务端回推失败要 `setCanvasError` 显式提示（因为是用户主动操作 + 改动线上）。
- 无 `projectId`（未加载任何画布）：自动/手动保存与恢复均为 no-op，按钮可禁用。
- before-quit flush 超时（1.5s）兜底直接退出，避免卡死。

## 测试

- 单测：`canvasSnapshots.test.ts`（buildSnapshotEntry / 6 份裁剪 / 时间格式化）；`canvasSnapshotStore` 的 append 裁剪逻辑（若可在 node 环境测）。
- 组件测试：`CanvasControls.test.tsx` 更新为新 UI 契约（三列、动作行三按钮、右列三按钮、打开奇境、恢复列表 popover）。
- 集成测试：`App.test.tsx` 更新——加载后触发 startAutoSave、手动保存调用 append、恢复调用 get + saveProjectSnapshot。**（按既往教训：UI 重构必须带上集成测试，不能只跑组件单测。）**
- 全量 `npm test` + `npm run build` 必须通过。

## 验收

- 三个公司画布窗口均有可用地址栏（复制/刷新/前往/前进后退）。
- 「打开奇境」打开带地址栏的 `http://qijing.kjjhz.cn/`。
- 布局符合：中行 `获取》保存》恢复`，右列 `Open》DevTools》API Fetch`，右列顶部与名称框对齐。
- 加载后立即生成 1 份快照，10min 一份，最多 6 份，超出删最旧；切画布会停旧转新；退出前再存一份。
- 恢复列表显示年月日时分秒；点击恢复后线上画布与所选快照一致。

## 范围外（YAGNI）

- 跨画布的全局快照管理界面、快照命名/导出、快照差异对比。
- 自动保存间隔可配置化（固定 10min）。
- 快照云端同步（仅本地磁盘）。
