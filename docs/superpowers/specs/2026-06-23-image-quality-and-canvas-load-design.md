# 设计:按模型画质 + 布局对齐 + 下载命名 + 画布加载韧性

日期:2026-06-23
分支:feature/ui-shell
版本:0.1.3 → 0.1.4

本轮 6 项:要求 1~4(画质/UI),修复 1~2(下载命名/画布加载)。所有改动均在 worktree `.worktrees/ui-shell`。

---

## 调查结论(已证实)

### 画质字段(来源:`storage/api/captures/capture-2026-06-22-165443.json` 真实抓包)

画质不是前端写死成单一值,而是**按模型分字段**;Gemini 不发画质字段,由后端固定为 4K。

| 模型(下拉显示) | 存储/快照值 | API id | 画质字段 | 真实取值 |
|---|---|---|---|---|
| GPT-Image-2(兑吧) | `GPT-Image-2(兑吧)` | gpt-image-2-duiba | `quality` | low / medium / high |
| GPT-Image-2 | `GPT-Image-2` | gpt-image-2 | `size` | 1K / 2K / 4K |
| Gemini 3 Pro(香蕉pro) | `Gemini 3 Pro` | gemini-3-pro-image-preview | 无 | 后端固定 4K |
| Gemini 3.1 Flash(香蕉2) | `Gemini 3.1 Flash` | gemini-3.1-flash-image-preview | 无 | 后端固定 4K |

当前 app bug:画质下拉对所有模型共用 `["1K","2K","4K"]`,且兑吧映射成 `quality==="4k"?"high":"medium"`(丢失 low、1K/2K 全部退化为 medium)。

### 画布加载失败根因(用 CDP 连运行中 ovO 实测)

- 两画布快照 GET 均 200。失败画布 `cmqovcnia...` = 242 资源、其中 **187 个需补前缀**;正常画布 `cmqov8cs...` = 75 节点、改名少。
- `services/canvasLoader.ts` 的 `normalizeAndSyncAssetPrefixes` 对**每个**要改名的资源单独 `await saveProjectSnapshot`(整快照 367KB PUT)→ 187 次串行 PUT,极慢且任一次失败即整体抛错 → "画布资源加载失败"。

### 布局(用 CDP 量过,视频 tab)

- 中间视频面板因 `.generate-panel-fixed { align-self:end }` → 实际宽 272、右对齐;图片面板无此覆盖 → 撑满 320。两者宽度不一致。
- 右侧提示列表高 128、底对齐 → top=800,比提示词/面板 top=774 低 26px。

---

## 决策(用户已确认)

1. Gemini 后缀"(香蕉pro)/(香蕉2)" **仅下拉显示**;存储/快照/发后端仍用规范名("Gemini 3 Pro"/"Gemini 3.1 Flash")。
2. Gemini 画质控件显示**锁定的单选"4K"**(禁用),不发任何画质字段。
3. 下载文件夹命名用**半角短横/点**:`资源文件(26-06-22-11.27.29)`。
4. 修复 2 = **根因(187→1 次 PUT 且非阻断)+ 单素材加载失败可单独重试 UI**。

---

## 改动设计

### 模型/画质数据模型重构(要求 1)

`src/lib/imageGenOptions.ts`:把模型从"显示名数组 + 显示名→id 字典"重构为一份带画质元数据的清单:

```
interface ImageModelOption {
  label: string;            // 下拉显示(可带香蕉后缀)
  value: string;            // settings.model 存储值 / 写入快照 / 兼容公司端
  apiId: string;            // 发 /api/generate-image 的 model
  qualityField: "size" | "quality" | null;
  qualityOptions: { value: ImageQuality; label: string }[]; // 该模型可选画质
  defaultQuality: ImageQuality;
}
```

- 兑吧:qualityField="quality",options 低/中/高(value low/medium/high),default 高(high)。
- GPT-Image-2:qualityField="size",options 1K/2K/4K(value 1k/2k/4k),default 4k。
- Gemini pro / flash:qualityField=null,options 仅 [{value:"4k",label:"4K"}],default 4k,UI 锁定禁用。

`src/types.ts`:`ImageQuality` 扩为 `"1k"|"2k"|"4k"|"low"|"medium"|"high"`。

`DEFAULT_IMAGE_GENERATION_SETTINGS`:model 保持兑吧,quality 改为 `"high"`(兑吧默认)。

保留旧导出名(`IMAGE_MODELS` 等)按需以新结构派生,尽量减少调用点改动;或直接改调用点(`ImageGeneratePanel`、`imageGenerationClient`、测试)。

### 画质下拉按模型联动(要求 1)

`src/components/ImageGeneratePanel.tsx`:
- 画质下拉的 options 来自当前 model 的 `qualityOptions`;Gemini 时 `disabled` 且只显示 4K。
- 切换 model 时,把 quality 重置为新 model 的 `defaultQuality`(避免出现该模型非法画质)。
- 模型下拉用 `option.value` 作 value、`option.label` 作显示。

`src/api/imageGenerationClient.ts` `buildGenerateImagePayload`:
- 用 model 的 `qualityField` 决定发哪个字段:`size` → `value.toUpperCase()`(1K/2K/4K);`quality` → 直接发 value(low/medium/high);null → 不发。
- model 字段发 `apiId`(经 value→option→apiId 解析)。`resolveImageModelId` 改为按 value 查 apiId。

### 要求 2:去积分文案

`ImageGeneratePanel.tsx`:`生成图片(需要{...}积分)` → `生成图片`。(视频按钮不动。)

### 要求 3:两个面板等宽

`src/styles.css` `.generate-panel-fixed`:移除 `align-self: end;`(保留 `height:154px`),使视频面板与图片面板一样撑满 320 列宽。

### 要求 4:三栏顶部对齐

`src/styles.css` `.prompt-note-panel`:加 `height: 154px;`(与 `.prompt-token-editor` min-height / 面板 154 一致),底对齐下其 top 落到 774,与提示词、生成面板顶部齐平。若内容超出则内部滚动(已有/补 `overflow:auto`)。

### 修复 1:批量下载命名

`electron/companySession.ts`:新增 `createDownloadFolderName(date)` 返回 `资源文件(YY-MM-DD-HH.mm.ss)`(半角,合法);`saveAssetsToDownloads` 改用它。**不动** `createTimestampFolderName`(仍用于 capture 文件名)。分类子目录与文件名逻辑不变。

### 修复 2:画布加载韧性

(a) 根因 —— `services/canvasLoader.ts` `normalizeAndSyncAssetPrefixes`:
- 先遍历把**所有**改名应用到内存快照(链式 `renameAssetInSnapshot`),只在末尾 `await saveProjectSnapshot` **一次**。
- 该单次保存包 try/catch:失败只记日志/活动消息,**不抛错**,assets 已在内存,前缀下次加载再同步。→ 187 次 PUT 变 1 次,且失败不致整体加载失败。

(b) 单素材重试 —— `src/components/AssetCard.tsx`:
- `<img>/<video>` 加 `onError` → 该卡进入"加载失败"态:显示占位 + "重新获取"按钮。
- 点"重新获取":对该卡 src 加 cache-bust(`?retry=ts`)重新加载;成功则恢复正常显示。
- 仅影响单卡,不影响整画布;失败卡有明确提示。

---

## 不做(YAGNI)

- 不改 GPT 系两个模型的存储值/显示(用户只要求 Gemini 改名)。
- 不引入并发 PUT(单次 PUT 已解决)。
- 不改 capture 文件命名。
- 不动视频生成按钮文案/参数。

---

## 验证

- 单测:`imageGenerationClient.test.ts`(各模型 payload 字段)、`ImageGeneratePanel` 相关、`downloadPaths`/companySession 命名、`canvasLoader` 单次保存,以及受影响的 `App.test.tsx`。`npm test` 全绿。
- 实跑(CDP 连运行中 ovO):
  - 加载失败画布 `cmqovcnia...`:能完整加载、活动栏给出资源数;不再"画布资源加载失败"。
  - 图片 tab:四模型画质选项正确联动,Gemini 锁定 4K;按钮无积分文案;两 tab 面板等宽;三栏顶部齐平。
  - 批量下载:文件夹名形如 `资源文件(26-06-23-…)`。
- 推 gitee `feature/ui-shell`,版本 bump 0.1.3 → 0.1.4。
