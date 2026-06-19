# ovO六个问题修复设计方案

Date: 2026-06-18

## 概述

本文档针对用户提出的6个问题提供详细的分析和解决方案。

## 问题列表

1. **视频生成不了9:16** - UI选择9:16但生成16:9
2. **Windows自动更新** - 需要国内可访问的更新渠道
3. **画布节点同步** - 上传和生成的节点不出现在公司画布上
4. **音色和参考视频传递** - 检查是否正确传递
5. **视频生成Logo加载慢** - 超过10分钟还在加载
6. **UI美观度优化** - 在前面问题修复后进行

---

## 问题一：视频宽高比不匹配

### 根因分析

从代码审查和用户反馈确认：

1. **前端代码正确** - `generationClient.ts` 正确发送了 `aspectRatio: "9:16"` 和 `ratio: "9:16"` 参数
2. **用户选择正确** - UI上选择了9:16
3. **后端行为问题** - 当使用16:9的参考图片时，后端优先使用图片的宽高比，忽略了payload中的aspectRatio参数

**验证：**
- 用户使用2张16:9人物图 + 1张16:9场景图
- UI选择9:16
- 生成结果：1280x720 (16:9)

### 解决方案

#### 方案A：前端增强验证和提示（推荐）

**优点：**
- 不依赖后端修改
- 立即可以实施
- 用户体验改进

**实现：**
1. 在添加参考图片时检测图片的宽高比
2. 如果图片比例与UI选择的目标比例不匹配，显示警告
3. 提供"自动裁剪/调整"选项（可选）
4. 在生成按钮旁边显示"参考图片比例与目标比例不一致"的警告

**UI改动：**
```typescript
// 在 PromptDock 或 GeneratePanel 中增加警告
interface ReferenceWarning {
  type: "aspect-ratio-mismatch";
  message: string;
  details: string;
}

// 检测函数
function detectAspectRatioMismatch(
  references: ReferenceItem[],
  targetAspectRatio: string
): ReferenceWarning | null {
  const imageRefs = references.filter(r => r.kind === "image");
  if (imageRefs.length === 0) return null;
  
  // 检测图片比例
  const hasMismatch = imageRefs.some(ref => {
    // 需要从图片元数据中获取宽高
    // 实现细节见后续代码
  });
  
  if (hasMismatch) {
    return {
      type: "aspect-ratio-mismatch",
      message: "参考图片比例与目标比例不匹配",
      details: `您选择了 ${targetAspectRatio} 比例，但部分参考图片是其他比例。生成的视频可能不是预期比例。`
    };
  }
  
  return null;
}
```

#### 方案B：后端API修复（需要协调）

联系后端团队，修改 `/api/generate-video` 接口，使其优先遵循 `aspectRatio` 参数，而不是参考图片的比例。

**优点：**
- 根本解决问题
- 前端无需改动

**缺点：**
- 需要后端配合
- 可能需要较长时间

#### 方案C：前端自动裁剪图片（复杂）

在上传参考图片前，自动将图片裁剪/调整到目标比例。

**优点：**
- 彻底解决比例问题
- 不依赖后端

**缺点：**
- 实现复杂
- 可能损失图片内容
- 用户可能不希望自动裁剪

### 推荐方案

**短期：方案A** - 前端增强验证和提示
**长期：方案B** - 协调后端修复API行为

---

## 问题二：Windows自动更新机制

### 需求分析

1. 主要用户是Windows电脑
2. 代码托管在GitHub，但国内用户无法访问
3. 需要点击按钮更新、显示进度、自动重启

### 现状分析

当前 `package.json` 已配置 `electron-builder`，但没有自动更新功能。

### 解决方案

#### 方案A：electron-updater + Gitee镜像（推荐）

**优点：**
- 官方支持的自动更新方案
- Gitee可以国内访问
- 完整的更新流程

**实现步骤：**

1. **安装依赖：**
```bash
npm install electron-updater
```

2. **配置 electron-builder：**
```json
{
  "build": {
    "publish": [
      {
        "provider": "generic",
        "url": "https://gitee.com/your-username/ovo-releases/raw/master/",
        "channel": "latest"
      }
    ]
  }
}
```

3. **在主进程中实现更新检查：**
```typescript
// electron/updater.ts
import { autoUpdater } from "electron-updater";
import { BrowserWindow } from "electron";

// 配置更新服务器
autoUpdater.setFeedURL({
  provider: "generic",
  url: "https://gitee.com/your-username/ovo-releases/raw/master/"
});

// 禁用自动下载
autoUpdater.autoDownload = false;

export function checkForUpdates(mainWindow: BrowserWindow) {
  // 检查更新
  autoUpdater.checkForUpdates();
  
  // 发现更新
  autoUpdater.on("update-available", (info) => {
    mainWindow.webContents.send("update-available", info);
  });
  
  // 没有更新
  autoUpdater.on("update-not-available", () => {
    mainWindow.webContents.send("update-not-available");
  });
  
  // 下载进度
  autoUpdater.on("download-progress", (progress) => {
    mainWindow.webContents.send("download-progress", progress);
  });
  
  // 更新下载完成
  autoUpdater.on("update-downloaded", () => {
    mainWindow.webContents.send("update-downloaded");
  });
  
  // 错误
  autoUpdater.on("error", (error) => {
    mainWindow.webContents.send("update-error", error);
  });
}

export function downloadUpdate() {
  autoUpdater.downloadUpdate();
}

export function installUpdate() {
  autoUpdater.quitAndInstall();
}
```

4. **在渲染进程中添加UI：**
```typescript
// 新增更新组件
interface UpdateState {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  progress: number;
  readyToInstall: boolean;
  error?: string;
}

function UpdateButton() {
  const [updateState, setUpdateState] = useState<UpdateState>({
    checking: false,
    available: false,
    downloading: false,
    progress: 0,
    readyToInstall: false
  });
  
  // 监听更新事件
  useEffect(() => {
    window.ovoDesktop.updater.onUpdateAvailable((info) => {
      setUpdateState(prev => ({ ...prev, available: true }));
    });
    
    window.ovoDesktop.updater.onDownloadProgress((progress) => {
      setUpdateState(prev => ({ 
        ...prev, 
        downloading: true,
        progress: progress.percent 
      }));
    });
    
    window.ovoDesktop.updater.onUpdateDownloaded(() => {
      setUpdateState(prev => ({ 
        ...prev, 
        downloading: false,
        readyToInstall: true 
      }));
    });
  }, []);
  
  const handleCheckUpdate = () => {
    setUpdateState(prev => ({ ...prev, checking: true }));
    window.ovoDesktop.updater.checkForUpdates();
  };
  
  const handleDownload = () => {
    window.ovoDesktop.updater.downloadUpdate();
  };
  
  const handleInstall = () => {
    window.ovoDesktop.updater.installUpdate();
  };
  
  return (
    <div>
      {!updateState.available && (
        <button onClick={handleCheckUpdate} disabled={updateState.checking}>
          {updateState.checking ? "检查中..." : "检查更新"}
        </button>
      )}
      
      {updateState.available && !updateState.downloading && !updateState.readyToInstall && (
        <button onClick={handleDownload}>下载更新</button>
      )}
      
      {updateState.downloading && (
        <div>
          <div>下载中... {Math.round(updateState.progress)}%</div>
          <progress value={updateState.progress} max={100} />
        </div>
      )}
      
      {updateState.readyToInstall && (
        <button onClick={handleInstall}>重启并安装</button>
      )}
    </div>
  );
}
```

5. **配置Gitee发布流程：**
   - 在Gitee创建 `ovo-releases` 仓库
   - 每次发布新版本时，上传：
     - `latest.yml` (更新元数据)
     - `ovO-x.x.x-win.exe` (安装包)
   - 可以使用GitHub Actions自动推送到Gitee

#### 方案B：阿里云OSS + electron-updater

**优点：**
- 更稳定的CDN
- 更快的下载速度

**缺点：**
- 需要阿里云账号
- 有存储和流量费用

#### 方案C：自建更新服务器

**优点：**
- 完全可控

**缺点：**
- 需要维护服务器
- 成本较高

### 推荐方案

**方案A：electron-updater + Gitee镜像**

---

## 问题三：画布节点同步问题

### 根因分析

在ovO中上传节点和生成视频后，不会自动同步到公司画布。

**可能的原因：**
1. 前端上传后没有调用画布同步API
2. 需要调用 `PUT /api/projects/{projectId}/snapshot` 保存画布状态
3. WebSocket/轮询同步机制缺失

### 解决方案

#### 调查当前实现

从代码看，`saveCanvasAsset` 函数在 `canvasLoader.ts` 中实现，它：
1. 上传文件获得URL
2. 创建画布节点
3. 调用 `PUT /api/projects/{projectId}/snapshot` 保存

**需要验证：**
1. 保存的snapshot是否正确包含了新节点
2. 保存后是否需要刷新才能在公司画布看到

#### 使用 Chrome DevTools 诊断

实现方案：
1. 使用现有的 `inspectCanvas` 功能
2. 在上传/生成后，自动打开诊断窗口
3. 验证API调用是否正确

**代码修改：**
```typescript
// 在 App.tsx 的上传/生成成功后
if (ENABLE_DEBUG) {
  await companyApiFacade.inspectCanvas(project.canvasUrl);
}
```

#### 方案A：增强画布同步（推荐）

确保每次上传/生成后：
1. 正确更新本地snapshot
2. 调用 `PUT /api/projects/{projectId}/snapshot`
3. 验证保存是否成功
4. 提供"同步到画布"按钮，手动触发同步

#### 方案B：实现实时协同

使用WebSocket或轮询实现实时同步，但这超出了当前范围。

### 推荐方案

**方案A** - 增强画布同步，确保每次操作后正确保存snapshot

---

## 问题四：音色和参考视频传递检查

### 验证方法

从 `generationClient.ts` 代码看，音色和参考视频的传递是正确的：

```typescript
referenceImages: getReferenceValues(input.references, "image"),
referenceVideos: getReferenceValues(input.references, "video"),
referenceAudios: getReferenceValues(input.references, "audio")
```

**验证步骤：**
1. 在 `buildCompanyGenerateVideoPayload` 中添加日志
2. 检查生成的payload是否包含 `referenceVideos` 和 `referenceAudios`
3. 进行一次真实生成，检查network请求payload

**添加调试日志：**
```typescript
export function buildCompanyGenerateVideoPayload(input: BuildGenerateVideoPayloadInput) {
  // ... 现有代码 ...
  
  const payload = {
    // ... 现有字段 ...
  };
  
  // 调试日志
  if (process.env.NODE_ENV === "development") {
    console.log("[Generation Payload]", {
      referenceImages: payload.referenceImages?.length ?? 0,
      referenceVideos: payload.referenceVideos?.length ?? 0,
      referenceAudios: payload.referenceAudios?.length ?? 0,
      fullPayload: payload
    });
  }
  
  return payload;
}
```

### 解决方案

**添加payload验证UI：**

在生成面板中显示当前选择的参考素材统计：
```
参考素材：
- 图片：2张
- 视频：1个
- 音频：2个
```

---

## 问题五：视频生成Logo加载问题

### 根因分析

"视频生成的logo还在加载中" - 需要澄清这个logo指的是什么：
1. 生成过程中的加载动画？
2. 生成完成的视频文件中嵌入的logo？

### 假设1：加载动画问题

从代码看，生成状态通过 `status` 字段管理：
- `generating`: 生成中
- `ready`: 完成
- `failed`: 失败

**可能的问题：**
1. 轮询逻辑卡住
2. 状态更新未触发
3. UI未正确响应状态变化

**检查最近的提交：**
从git log看到多个预览相关的修复，但都是关于预览显示的，不是生成状态的。

### 解决方案

#### 方案A：增加生成超时检测

```typescript
const GENERATION_TIMEOUT_MS = 10 * 60 * 1000; // 10分钟

// 在生成开始时设置超时
const timeoutId = setTimeout(() => {
  setGenerateStatus("生成超时，请重试");
  setAssets(current => current.map(asset =>
    asset.id === generatedAsset.id
      ? { ...asset, status: "failed", errorMessage: "生成超时" }
      : asset
  ));
}, GENERATION_TIMEOUT_MS);

// 生成成功/失败时清除超时
clearTimeout(timeoutId);
```

#### 方案B：显示详细的生成进度

```typescript
// 在轮询时显示已等待时间
const startTime = Date.now();
const updateProgress = () => {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  setGenerateStatus(`生成中... 已等待 ${elapsed}秒`);
};
```

---

## 问题六：UI美观度优化

在前面问题修复后单独处理。

### 优化方向

1. **布局优化**
   - 调整卡片间距
   - 优化响应式布局
   - 改进滚动体验

2. **颜色和字体**
   - 统一色彩方案
   - 改进对比度
   - 优化字体层级

3. **动画和交互**
   - 添加过渡动画
   - 改进拖拽反馈
   - 优化加载状态

4. **组件细节**
   - 按钮样式优化
   - 输入框体验改进
   - 卡片悬停效果

---

## 实施优先级

### P0 - 立即修复
1. **问题一** - 增加宽高比不匹配警告
2. **问题四** - 验证音色和视频传递（添加日志）
3. **问题五** - 增加生成超时检测

### P1 - 本周完成
1. **问题二** - 实现Windows自动更新
2. **问题三** - 修复画布同步问题

### P2 - 后续优化
1. **问题六** - UI美观度优化

---

## 测试计划

### 问题一测试
1. 使用16:9图片 + 选择9:16 → 应显示警告
2. 使用9:16图片 + 选择9:16 → 应正常生成9:16视频
3. 纯文字prompt + 选择9:16 → 验证是否生成9:16视频

### 问题二测试
1. 检查更新功能
2. 下载更新进度显示
3. 安装并重启流程

### 问题三测试
1. 上传图片后，在公司画布刷新，确认节点出现
2. 生成视频后，在公司画布刷新，确认视频节点出现
3. 使用DevTools诊断，验证API调用

### 问题四测试
1. 添加音频参考，查看console日志
2. 添加视频参考，查看console日志
3. 检查network请求payload

### 问题五测试
1. 开始生成，观察状态更新
2. 等待10分钟，确认超时提示
3. 正常生成完成，确认状态正确

---

## 下一步行动

1. 获得用户对本设计的确认
2. 创建详细的实施计划
3. 按优先级逐个实现
4. 每个修复后进行测试
5. 提交并推送到远端
