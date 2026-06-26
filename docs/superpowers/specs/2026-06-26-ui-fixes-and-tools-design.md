# UI Fixes and Tools Design Spec

**Date**: 2026-06-26  
**Project**: ovO_create_video_platform  
**Branch**: feature/ui-shell  
**Version Target**: v0.1.3 → v0.1.4

---

## Overview

This spec covers 6 implementation tasks:
- **4 Fix tasks**: UI/UX improvements
- **2 Feat tasks**: New functionality additions

All changes will be implemented in the `feature/ui-shell` branch worktree located at `/Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell`.

---

## Fix 1: Download Path Hint in Settings

### Problem
In the Settings modal, the download path field doesn't warn users about trailing slashes, which may cause path issues.

### Solution
Add a hint text after the download path input field: "不要加后面的斜杠"

### Implementation
- **File**: `src/components/SettingsModal.tsx`
- **Change**: Modify the `<small>` hint text at line 34

**Current**:
```tsx
<small>留空则下载到系统下载文件夹。</small>
```

**New**:
```tsx
<small>留空则下载到系统下载文件夹。不要加后面的斜杠。</small>
```

---

## Fix 2: Preview Modal Click-to-Close on Backdrop

### Problem
When the Preview modal is open, clicking the black backdrop (modal-backdrop) should close the modal, but currently it doesn't respond to clicks.

### Solution
Add an `onClick` handler on the backdrop div to call `onClose`.

### Implementation
- **File**: `src/components/PreviewModal.tsx`
- **Change**: Add `onClick={onClose}` to the backdrop div at line 62

**Current**:
```tsx
<div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${asset.name} 预览`} onWheel={(e) => e.preventDefault()}>
```

**New**:
```tsx
<div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${asset.name} 预览`} onClick={onClose} onWheel={(e) => e.preventDefault()}>
```

Note: The inner modal content div already has `onClick={(e) => e.stopPropagation()}` to prevent backdrop clicks from triggering when clicking inside the modal.

---

## Fix 3: Remove Prefix When Copying to Prompt

### Problem
When clicking "复用提示词" (reuse-generation action), the prompt is copied with category prefixes like "人物-" or "音频-" in the name. These prefixes should be removed for "人物" and "音频" categories only (not for "场景" or "道具").

### Solution
Strip "人物-" and "音频-" prefixes from the prompt text when reusing generation, while keeping "场景-" and "道具-" prefixes intact.

### Implementation
- **Files involved**:
  1. `src/App.tsx` - `reuseGeneration` function (lines 646-674)
  2. New utility function in `src/lib/assetNamePrefix.ts`

**Approach**:
1. Create a new utility function `stripPromptPrefix(name: string): string` in `assetNamePrefix.ts`
2. This function will:
   - Remove "人物-" prefix if name starts with it
   - Remove "音频-" prefix if name starts with it
   - Keep other prefixes ("场景-", "道具-") intact

**New utility function**:
```typescript
// In src/lib/assetNamePrefix.ts
export function stripPromptPrefix(name: string): string {
  if (name.startsWith("人物-")) {
    return name.slice(3); // "人物-" is 3 characters (Chinese characters)
  }
  if (name.startsWith("音频-")) {
    return name.slice(3);
  }
  return name;
}
```

**Modify reuseGeneration in App.tsx**:
```typescript
// Line ~651-652 in App.tsx
function reuseGeneration(asset: CanvasAsset) {
  if (!asset.generationPrompt) {
    addActivityMessage(`「${asset.name}」暂无可复用的生成提示词`);
    return;
  }

  // Strip prefix from prompt
  const strippedPrompt = stripPromptPrefix(asset.generationPrompt);
  setPrompt(strippedPrompt);
  
  // ... rest of the function
}
```

**Wait**: Actually, I need to understand the prompt better. The prompt is text content, not just a name. Let me reconsider...

Actually, looking at `buildReferenceText.ts`, the prompt contains references formatted like:
```
图片1图片2是小红、视频1是背景音乐
```

But the user's requirement is about removing prefixes from the **prompt content** when copying. Let me check the actual usage...

Looking at the code flow:
1. When user clicks "复用提示词" (`reuse-generation` action)
2. `reuseGeneration(asset)` is called
3. It sets `setPrompt(asset.generationPrompt)` directly

The `generationPrompt` is the actual prompt text used for generation. If it contains "人物-小红" or "音频-背景", those prefixes should be stripped.

**Corrected approach**:
Process the entire prompt text to remove "人物-" and "音频-" prefixes wherever they appear.

```typescript
// In src/lib/assetNamePrefix.ts
export function stripPromptPrefixes(text: string): string {
  // Remove "人物-" prefix from text
  let result = text;
  // Match "人物-" followed by content, remove the prefix
  result = result.replace(/人物-/g, '');
  // Match "音频-" followed by content, remove the prefix
  result = result.replace(/音频-/g, '');
  return result;
}
```

Then in `reuseGeneration`:
```typescript
import { stripPromptPrefixes } from "../lib/assetNamePrefix";

function reuseGeneration(asset: CanvasAsset) {
  if (!asset.generationPrompt) {
    addActivityMessage(`「${asset.name}」暂无可复用的生成提示词`);
    return;
  }

  const processedPrompt = stripPromptPrefixes(asset.generationPrompt);
  setPrompt(processedPrompt);
  // ... rest unchanged
}
```

---

## Fix 4: PromptInfoModal UI Adjustment

### Problem
The current PromptInfoModal layout needs adjustment:
- Referenced resources should be fixed at the top, displayed as a horizontal thumbnail list
- Prompt text below, with overflow showing as a scrollable list

### Current Layout
Looking at `PromptInfoModal.tsx` (lines 15-40):
- Title at top
- Thumbnails in middle (`prompt-info-thumbs`)
- Prompt lines below (`prompt-info-prompt`)

### Solution
The layout is already mostly correct. The CSS needs adjustment to:
1. Make thumbnails section fixed/sticky at top
2. Ensure prompt list is scrollable with proper height constraints

### Implementation
- **Files**:
  1. `src/components/PromptInfoModal.tsx` - Structure is fine
  2. `src/styles.css` - CSS adjustments for `.prompt-info-thumbs` and `.prompt-info-prompt`

**CSS Changes** (in styles.css around lines 1474-1480):

```css
/* PromptInfoModal - keep thumbs fixed at top, prompt scrollable below */
.prompt-info-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.prompt-info-thumbs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  flex-shrink: 0; /* Don't shrink - always visible */
  min-height: 96px; /* Fixed height for thumb row */
}

.prompt-info-thumb {
  flex: 0 0 auto;
  width: 96px;
  height: 96px;
  border-radius: 8px;
  overflow: hidden;
  background: #00000010;
  display: grid;
  place-items: center;
}

.prompt-info-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.prompt-info-thumb span {
  font-size: 12px;
  padding: 4px;
  text-align: center;
}

.prompt-info-prompt {
  margin: 0;
  padding-left: 18px;
  overflow-y: auto;
  flex: 1; /* Take remaining space */
  min-height: 0; /* Allow shrinking for scroll */
  max-height: 50vh;
  line-height: 1.6;
}

.prompt-info-empty {
  color: #888;
}
```

---

## Feat 1: Tools Mode

### Requirements
Add a "工具" (Tools) mode as the third tab in the generate mode tabs, alongside "视频生成" and "图片生成".

**Current status**: Placeholder page only - show title "工具页面" (no actual tools implemented yet).

### UI Location
- **Component**: `src/components/PromptDock.tsx`
- **Section**: `.generate-mode-tabs` (lines 102-121)
- Add third tab button for "工具"

### Implementation Plan

#### 1. Add New Generate Mode Type
Update `src/types.ts`:
```typescript
export type GenerateMode = "video" | "image" | "tools";
```

#### 2. Create Tools Placeholder
New file: `src/components/ToolsPlaceholder.tsx`

```typescript
export function ToolsPlaceholder() {
  return (
    <aside className="generate-panel generate-panel-tools-placeholder" aria-label="工具">
      <div className="tools-placeholder-content">
        <h3>工具页面</h3>
        <p className="tools-placeholder-hint">功能开发中...</p>
      </div>
    </aside>
  );
}
```

#### 3. Update PromptDock
Modify `src/components/PromptDock.tsx`:
- Add third tab button
- Render `ToolsPlaceholder` when `generateMode === "tools"`

```tsx
// In PromptDock.tsx, generate-mode-tabs section
<div className="generate-mode-tabs" role="tablist" aria-label="生成类型">
  <button type="button" role="tab" aria-selected={generateMode === "video"} ...>视频生成</button>
  <button type="button" role="tab" aria-selected={generateMode === "image"} ...>图片生成</button>
  <button type="button" role="tab" aria-selected={generateMode === "tools"} ...>工具</button>
</div>

{generateMode === "video" && <GeneratePanel ... />}
{generateMode === "image" && <ImageGeneratePanel ... />}
{generateMode === "tools" && <ToolsPlaceholder />}
```

#### 4. CSS Styles
Add styles for `.generate-panel-tools-placeholder` in `styles.css`:

```css
.generate-panel-tools-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 154px;
  border: 1px solid #d7d4cc;
  border-radius: 8px;
  background: #ffffff;
}

.tools-placeholder-content {
  text-align: center;
  color: #68705f;
}

.tools-placeholder-content h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.tools-placeholder-hint {
  margin: 8px 0 0;
  font-size: 12px;
}
```

---

## Feat 2: Node Naming Input

### Requirements
Add a naming input field for generated content:
- Position: Above prompt editor, below reference strip
- Label: ":节点名称"
- Behavior:
  1. When reusing prompt from another node, copy the name to this input
  2. When clicking "生成图片", clear both prompt and name
  3. The name is saved to the generated node data

### UI Location
- **Component**: `src/components/PromptDock.tsx`
- Position: Between `.reference-strip` and `.prompt-row`

### Implementation Plan

#### 1. Add State in App.tsx
```typescript
const [nodeName, setNodeName] = useState("");
```

#### 2. Update PromptDock Props
Add props to PromptDock:
```typescript
interface PromptDockProps {
  // ... existing props
  nodeName: string;
  onNodeNameChange: (value: string) => void;
}
```

#### 3. Add Input Field in PromptDock
```tsx
// After reference-strip, before prompt-row
<div className="node-name-row">
  <label className="node-name-label">
    <span>:节点名称</span>
    <input
      type="text"
      value={nodeName}
      placeholder="为生成的节点命名"
      onChange={(e) => onNodeNameChange(e.currentTarget.value)}
    />
  </label>
</div>
```

#### 4. Update reuseGeneration Function
In `App.tsx`, when reusing generation:
```typescript
function reuseGeneration(asset: CanvasAsset) {
  // ... existing prompt handling
  
  // Copy asset name to node name input
  setNodeName(stripPromptPrefixes(asset.name));
  
  // ... rest of function
}
```

#### 5. Clear on Generate
In `handleGenerateImage` and `handleGeneratePreview`:
```typescript
// When generating
setPrompt("");
setReferences([]);
setReferenceIssues([]);
setNodeName(""); // Also clear node name
```

#### 6. Use Name in Placeholder
In `createGeneratedImagePlaceholder` and `createGeneratedVideoPlaceholder`:
```typescript
function createGeneratedImagePlaceholder(category: AssetCategory): CanvasAsset {
  const placeholderId = createId("generated-image");
  const baseName = nodeName.trim() || `生成图片 ${count + 1}`;
  return {
    id: placeholderId,
    name: baseName, // Use user-provided name if available
    // ... rest of properties
  };
}
```

#### 7. CSS Styles
```css
.node-name-row {
  display: flex;
  width: min(96vw, 1800px);
  gap: 8px;
  align-items: center;
}

.node-name-label {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: #68705f;
}

.node-name-label input {
  flex: 1;
  min-width: 0;
  height: 36px;
  border: 1px solid #d7d4cc;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  outline: none;
}

.node-name-label input:focus {
  border-color: #d94c54;
}
```

---

## Testing Plan

After implementation, test each feature:

1. **Fix 1**: Open Settings modal, verify hint text appears
2. **Fix 2**: Open Preview modal, click backdrop, verify it closes
3. **Fix 3**: 
   - Create node with "人物-小红" name
   - Reuse its prompt
   - Verify prompt doesn't contain "人物-" prefix
4. **Fix 4**: 
   - Open prompt info modal on a node with references
   - Verify thumbs at top, prompt scrollable below
5. **Feat 1**:
   - Click Tools tab
   - Verify audio speed and prompt conversion buttons appear
6. **Feat 2**:
   - Enter node name
   - Generate image
   - Verify node uses the entered name
   - Verify name cleared after generation

---

## Version Bump

After all changes are verified:
1. Update `package.json` version from `0.1.3` to `0.1.4`
2. Commit with message: `chore: bump v0.1.4`
3. Push to gitee remote: `git@gitee.com:siberian-aries/ov-o_create_video_platform.git`

---

## Files Changed Summary

1. `src/components/SettingsModal.tsx` - Fix 1
2. `src/components/PreviewModal.tsx` - Fix 2
3. `src/lib/assetNamePrefix.ts` - Fix 3 (new utility)
4. `src/App.tsx` - Fix 3, Feat 2
5. `src/styles.css` - Fix 4, Feat 1, Feat 2
6. `src/components/PromptInfoModal.tsx` - Fix 4 (minor adjustments if needed)
7. `src/types.ts` - Feat 1 (GenerateMode type)
8. `src/components/PromptDock.tsx` - Feat 1, Feat 2
9. `src/components/ToolsPanel.tsx` - Feat 1 (new file)
10. `package.json` - Version bump

---

## Implementation Order

1. Fix 1 (simplest)
2. Fix 2 (simple)
3. Fix 3 (requires new utility + app integration)
4. Fix 4 (CSS adjustments)
5. Feat 2 (state + UI + logic integration)
6. Feat 1 (new component + integration)
7. Version bump and push

---

## Notes

- All changes maintain existing code patterns and styles
- No breaking changes to existing functionality
- Type safety maintained throughout
- Accessibility (aria-labels) preserved in new elements