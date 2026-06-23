# 生图 504 — live CDP 诊断结论 (2026-06-23)

环境: ovO 运行中, 9333 远程调试; 渲染进程 http://127.0.0.1:5173/; 已登录公司账号;
画布 cmq6fwhft0bg5m2l5u78zby8x (用户确认用当前已加载画布复现)。
方法: 在渲染进程包裹 window.ovoDesktop.api.request 抓 IPC 请求/响应 (请求实际走 Electron 主进程, 非渲染进程 fetch, 故 CDP Network 域看不到 — 必须包 IPC)。

## 复现 (单次 CDP 触发)

POST /api/generate-image, payload:
  { prompt:"一只橘色的猫…", model:"gpt-image-2-duiba", aspectRatio:"9:16",
    quality:"high", _meta:{ nodeId:"diag-504-probe-1", projectId:"cmq6fwhft…", label:"诊断504探针" } }

**结果: 未抛异常, 主进程在 60028ms (恰好 ~60s) 后返回 { ok:false, status:504, data:null, message:"请求失败 (504)" }。**

## 关键证据 — 任务其实成功了 (分支 X)

紧接着 GET /api/gen-queue?projectId=cmq6fwhft… :
- t+0: nodeId=diag-504-probe-1 的任务存在, status="running", createdAt 07:16:36, source="canvas"。
- t+~2min 再查: 同任务 status="succeeded",
  resultUrl=https://aimanju-caojia.oss-cn-hangzhou.aliyuncs.com/.../images/df68…f963c4f.png,
  completedAt 07:18:19 (即 ~1m43s 完成)。

## 根因

生图上游耗时 ~100s, 但 **桌面端(主进程)请求层在 60s 硬超时**, 把提交 POST 截断成 504。
desktopTransport.unwrapDesktopResult 把 {ok:false,status:504} 抛成 ApiError{status:504,message:"请求失败 (504)"};
imageGenerationClient.requestGenerateImage 直接把它当失败抛出 → UI 裸 504。
**但任务此时已进 gen-queue 并最终 succeeded。** 不是上游真失败, 是客户端过早放弃。

## 判定: 分支 X (任务已进队列)

修复 = 提交命中 504 (且有 projectId+nodeId) 时不立即失败, 转入按 nodeId 轮询 gen-queue 直到 succeeded/failed,
拿到 resultUrl 即成功; 仍超时再报明确中文错误。对齐计划 Step 4X/5X。
注意 submit 返回的 taskId 在 504 时缺失, 队列轮询用 nodeId 匹配 (gen-queue 任务对象有 nodeId 字段)。

## 修复后 live 复验 (controller, 2026-06-23)

按新 generateImage 逻辑在运行中的 app live 复跑:
- 提交: POST /api/generate-image → 504 @ 60090ms (复现一致)。
- 恢复: 按 nodeId 轮询 gen-queue, 第 20 次 (~30s) 拿到 succeeded +
  resultUrl=https://aimanju-caojia.oss-cn-hangzhou.aliyuncs.com/.../images/333c…a8640.png。
结论: 504 → 队列兜底 → 真实出图, 端到端成功。不再裸 504。
