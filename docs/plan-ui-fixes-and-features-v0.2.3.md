# UI修复和新功能实现计划 v0.2.3

## 任务概述

共6个任务：4个修复 + 2个新功能

### 修复任务

1. **设置页面提示** - 下载路径后面提示不要加斜杠
2. **预览模态框关闭** - 点击黑色蒙层可以关闭弹窗
3. **提示词前缀过滤** - 复制时去除"人物-"和"音频-"开头，保留"场景-"和"道具-"
4. **提示词查看UI调整** - 引用资源固定最上面横向显示缩略图，下面是提示词列表

### 新功能

5. **节点名称输入框** - 在资源引用下面、提示词上面添加节点名称输入；复用时名字也复制
6. **工具模式** - 在"自由/工作流"switch后添加"工具"选项，横向排列

## 实现细节

### Fix 1: 设置页面提示
**文件**: `src/components/SettingsModal.tsx`
**位置**: 第34行 `<small>` 标签
**修改**: 将提示文字改为"留空则下载到系统下载文件夹。路径末尾不要加斜杠。"

### Fix 2: 预览模态框关闭
**文件**: `src/components/PreviewModal.tsx`
**位置**: 第62行 `modal-backdrop` div
**修改**: 添加 `onClick={onClose}` 到 backdrop div，同时给 `preview-modal` div 添加 `onClick={(e) => e.stopPropagation()}`

### Fix 3: 提示词前缀过滤
**文件**: `src/lib/referenceText.ts`
**当前逻辑**: `buildReferenceText` 生成 "图片1是xxx、视频1是xxx"
**修改**: 
- 在 `buildReferenceText` 中，对 `group.name` 进行处理
- 去除 "人物-" 和 "音频-" 前缀（模糊匹配）
- 保留 "场景-" 和 "道具-" 前缀

实现：
```typescript
function stripAssetPrefix(name: string): string {
  // 去除"人物-"或"人物 -"等变体
  const stripped = name.replace(/^人物[\s\-]*/, '').replace(/^音频[\s\-]*/, '');
  return stripped || name; // 如果替换后为空，返回原名
}
```

### Fix 4: 提示词查看UI调整
**文件**: `src/components/PromptInfoModal.tsx`
**当前布局**: 引用素材在上，提示词在下（都是简单显示）
**修改**: 
- 引用素材改为横向显示缩略图（已经是横向了，确认样式）
- 提示词改为列表显示（已经是列表了，确认样式）
- 调整CSS确保引用固定在最上面

### Fix 5: 节点名称输入框
**文件**: 
- `src/components/PromptDock.tsx` - UI组件
- `src/App.tsx` - 状态管理和逻辑

**实现**:
1. 在 `PromptDock` 中添加一个新的 `nodeName` prop 和 `onNodeNameChange` callback
2. 在提示词编辑器上方、资源引用下方添加输入框
3. 修改 `reuseGeneration` 函数，复用时同时复制节点名称
4. 生成时使用该名称而不是默认的"生成视频 X"

UI布局：
```
参考素材条（reference-strip）
节点名称: [输入框]  <-- 新增
提示词编辑器
```

### Fix 6: 工具模式
**文件**: 
- `src/components/ModeSwitch.tsx` - 修改模式切换组件
- `src/App.tsx` - 添加工具页面占位

**实现**:
1. 修改 `AppMode` 类型：`type AppMode = "free" | "workflow" | "tools";`
2. 修改 `ModeSwitch` 组件，添加第三个选项"工具"
3. 在 `App.tsx` 中添加工具页面占位组件
4. 更新条件渲染逻辑

## 文件清单

需要修改的文件：
1. `src/components/SettingsModal.tsx`
2. `src/components/PreviewModal.tsx`
3. `src/lib/referenceText.ts`
4. `src/components/PromptInfoModal.tsx`（确认样式）
5. `src/components/PromptDock.tsx`
6. `src/components/ModeSwitch.tsx`
7. `src/types.ts`（AppMode类型）
8. `src/App.tsx`
9. `src/styles.css`（可能需要调整样式）
10. `package.json`（版本号升级到 v0.2.3）

## 注意事项

1. 节点名称功能需要保存到 `generationPrompt` 相关的状态中
2. 复用功能需要同时复制节点名称
3. 生成图片时，用户反馈"生成图片的时候，提示词的内容就清除掉了" - 这可能是期望的行为，需要确认是否是bug
4. 工具模式目前只是占位，先显示"这是工具"

## 测试要点

1. 设置页面显示正确的提示信息
2. 预览模态框点击蒙层可以关闭
3. 文字化引用时，人物和音频前缀被去除，场景和道具保留
4. 提示词查看UI正确显示
5. 节点名称输入框正常工作，复用时名称也被复制
6. 工具模式切换正常，显示占位页面
