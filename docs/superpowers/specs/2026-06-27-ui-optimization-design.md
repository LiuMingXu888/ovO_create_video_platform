# ovO 视频平台 UI 优化与新功能开发设计文档

**日期**: 2026-06-27  
**版本**: v0.2.5  
**作者**: Claude (Brainstorming)

## 概述

本次迭代包含 6 个 UI 修复、3 个新功能开发，旨在提升用户体验和操作效率。

## 改造范围

### 修复任务 (6个)

1. **双击节点名字自动全选文本** - 提升编辑体验
2. **提示词框紧贴节点名称** - 优化布局间距
3. **删除顶部项目标题区域** - 简化界面
4. **一键复制资源添加分号** - 优化文本化格式
5. **提示词查看 UI 优化** - 横向滚动缩略图布局
6. **左侧画布高度对齐** - 统一视觉高度

### 新功能 (3个)

7. **ViewerJS 图片预览** - 增强图片查看能力
8. **撤销/重做功能** - 支持操作回退
9. **拖放上传** - 支持本地文件拖入

## 详细设计文档

### 组件改造
- [AssetCard 组件改造](./modules/2026-06-27-asset-card.md) - 双击自动全选
- [AppHeader 组件简化](./modules/2026-06-27-app-header.md) - 删除项目标题
- [PromptDock 组件优化](./modules/2026-06-27-prompt-dock.md) - 提示词优化
- [PromptInfoModal 组件重构](./modules/2026-06-27-prompt-info-modal.md) - 横向缩略图
- [PreviewModal 组件替换](./modules/2026-06-27-preview-modal.md) - ViewerJS 集成
- [CanvasControls 布局调整](./modules/2026-06-27-canvas-controls.md) - 高度对齐

### 新功能模块
- [撤销/重做系统设计](./modules/2026-06-27-undo-redo-system.md) - 历史栈管理
- [拖放上传功能设计](./modules/2026-06-27-drag-drop-upload.md) - react-dropzone 集成

## 依赖更新

```json
{
  "dependencies": {
    "react-dropzone": "^14.2.3",
    "viewerjs": "^1.11.6"
  },
  "devDependencies": {
    "@types/viewerjs": "^1.0.0"
  }
}
```

## 版本信息

- 当前版本: v0.2.4
- 目标版本: v0.2.5
- 远程仓库: git@gitee.com:siberian-aries/ov-o_create_video_platform.git
- 分支: feature/ui-shell

## 实施顺序

按组件分组实施，每个组件的改动集中完成后再进行下一个，便于测试和代码审查。

## 测试策略

**单元测试:**
- `undoRedoHistory.test.ts` - 栈操作逻辑
- `referenceText.test.ts` - 文本化格式

**集成测试:**
- 双击编辑自动全选
- 一键复制分号格式验证
- 拖放上传自动归类验证
- 撤销/重做操作可逆性验证
- ViewerJS 预览功能验证

## 向后兼容

- 旧的 PreviewModal 逻辑保存在 `PreviewModalLegacy.tsx`
- 所有 API 接口保持不变
- 可通过配置切换新旧预览模式（可选）
