# 去字幕 (Subtitle Removal) — REAL HTTP Contract

Captured against the live qijing web app inside ovO (CDP port 9333), canvas
`cmqlzufagtb0ulq1tejj5hwa7`. PAID route captured **empirically end-to-end** (a
real paid job ran to `succeeded`). FREE route captured from the runtime app
bundle (chunk `2157-fc5f25aee196605f.js`) because the FREE button was disabled
for the available videos at capture time (see §4 — this is itself a finding).

Auth: every request goes through `withAuth(...)` which injects the bearer
token/cookie header (referenced by name only — **NOT recorded here**).

---

## 1. Comparison table — FREE vs PAID

| Aspect | PAID (任意视频 / 火山 VOD) | FREE (方舟 / Seedance, 24h) |
|---|---|---|
| **Submit endpoint** | `POST /api/subtitle-remove` | `POST /api/subtitle-remove/ark` |
| **Submit payload shape** | `{ videoUrl, _meta:{ nodeId, projectId, label, episodeId? } }` | `{ videoUrl, _meta:{ nodeId, projectId, label, episodeId? } }` (identical shape) |
| **`videoUrl` value** | the node's `sourceVideoUrl` (OSS mp4, normalized via `aJ()`) | the node's **`sourceProviderUrl`** = the Seedance/Ark *provider* original URL (NOT the OSS url) |
| **`label`** | `"字幕擦除"` | `"字幕擦除（免费）"` |
| **Submit response** | `{ runId, status:"running", _genTaskId }` — **top-level** (not under `data`) | same shape: `{ runId, _genTaskId, ... }` — top-level |
| **taskId location** | `runId` (top-level). `_genTaskId` is the internal queue task id (→ `queueTaskId`) | `runId` (top-level). `_genTaskId` → `queueTaskId` |
| **Poll endpoint** | `GET /api/subtitle-remove/{runId}` | `GET /api/subtitle-remove/ark/{runId}` |
| **Poll interval / cap** | every **5s**, up to **360** iterations (~30 min); 5 consecutive errors → abort | every **5s**, up to **360** iterations; 5 consecutive errors → abort |
| **Poll status strings** | `running` (in-progress), `succeeded` (done), `failed` (error) | `running`, `succeeded`, `failed` (same) |
| **Result-url field** | **`videoUrl`** (top-level in poll response). Mirrors into node `outputVideoUrl` | **`videoUrl`** (top-level). Mirrors into node `outputVideoUrl` |
| **Poll error field** | `error` (string, null when ok) | `error` |
| **Node `channel` value** | `"paid"` | `"free"` |
| **Client-side gate** | none (任意视频均可) | requires node `sourceProviderUrl != null`; else sets node error `未找到方舟原始 URL，无法使用免费通道（可使用通用擦除）` and never submits |

`runId` observed format (paid): `hb:0c3dcc084bc86ea896261f09fb23d29f`
(`hb:` prefix). `_genTaskId` observed: `cmqmio71b03dcm200zkbw7x0n` (cuid).

---

## 2. Raw request / response — PAID (empirically captured)

Source video node: `vid-mqm1ni83-qhl6z69` (model **Seedance 2.0**).
New result node created: `subrm-mqmim3n4-hrwpbv5` (type `subtitleRemove`).

### 2.1 Submit
```
POST /api/subtitle-remove          (Content-Type: application/json, withAuth header)
```
Request body (ALL keys):
```json
{
  "videoUrl": "https://aimanju-caojia.oss-cn-hangzhou.aliyuncs.com/users/cmpm7d828001em22x9en36d4e/videos/5c69f6ddff1f45932eedce17be3ba1311a32d3be9ac8cd97108acc1914a42171.mp4",
  "_meta": {
    "nodeId": "subrm-mqmim3n4-hrwpbv5",
    "projectId": "cmqlzufagtb0ulq1tejj5hwa7",
    "label": "字幕擦除"
  }
}
```
> Note: `_meta` carried only `nodeId/projectId/label` for this paid run. The
> code path also supports `_meta.episodeId` when the node has one (see §3).

Response body (200, top-level):
```json
{
  "runId": "hb:0c3dcc084bc86ea896261f09fb23d29f",
  "status": "running",
  "_genTaskId": "cmqmio71b03dcm200zkbw7x0n"
}
```

### 2.2 Poll
```
GET /api/subtitle-remove/hb:0c3dcc084bc86ea896261f09fb23d29f     (withAuth)
```
While running (repeated every ~5s):
```json
{ "runId": "hb:0c3dcc084bc86ea896261f09fb23d29f", "status": "running", "videoUrl": null, "error": null }
```
Terminal (success):
```json
{
  "runId": "hb:0c3dcc084bc86ea896261f09fb23d29f",
  "status": "succeeded",
  "videoUrl": "https://aimanju-caojia.oss-cn-hangzhou.aliyuncs.com/users/cmpm7d828001em22x9en36d4e/videos/d23c0e3fef82ca0989ca6244818d882bb9bc3b6cd55fa6d97c5eacf250f0b415.mp4",
  "error": null
}
```
Failure terminal shape (from bundle): `{ status:"failed", videoUrl:null, error:"<msg>" }`.

### 2.3 Side effect — project snapshot PUT
On submit the client also fires:
```
PUT /api/projects/cmqlzufagtb0ulq1tejj5hwa7/snapshot
→ 200 { "hash":"...", "changed":true, "ossSaved":true, "dbSaved":true }
```
It persists the new `subtitleRemove` node. The node data written (load-bearing
fields downstream code must align to):
```json
{
  "id": "subrm-mqmim3n4-hrwpbv5",
  "type": "subtitleRemove",
  "data": {
    "label": "1-1 去字幕",
    "sourceVideoUrl": "https://.../5c69...171.mp4",
    "outputVideoUrl": null,
    "status": "processing",
    "sourceProviderUrl": null,
    "sourceGeneratedAt": null,
    "sourceModel": "Seedance 2.0",
    "errorMessage": null,
    "runId": null,
    "queueTaskId": null,
    "generationStartedAt": 1781969568545,
    "channel": "paid"
  }
}
```
(`sourceProviderUrl: null` here = exactly why FREE was unavailable, see §4.)

---

## 3. Raw contract — FREE (方舟/Ark) — from app bundle `2157-fc5f25aee196605f.js`

The exact runtime functions (verbatim from the live bundle):

### 3.1 Submit wrapper `j(e)` (ark)
```js
async function j(e){
  let a=await fetch(apiUrl("/api/subtitle-remove/ark"), withAuth({
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(e),
    signal:AbortSignal.timeout(660000)
  }));
  if(!a.ok) throw Error((await a.json().catch(()=>({}))).error || "方舟字幕擦除请求失败");
  return a.json();
}
```
The request object `e` passed in (from the free-channel handler):
```js
{ videoUrl: o,                 // o = node.sourceProviderUrl (Ark/Seedance provider URL)
  _meta: { nodeId: e,
           projectId: r || "local",
           label: "字幕擦除（免费）",
           episodeId: i.episodeId } }
```

### 3.2 Poll wrapper `k(e)` + loop `w(e,a)` (ark)
```js
async function k(e){
  let a=await fetch(apiUrl(`/api/subtitle-remove/ark/${e}`), withAuth());
  if(!a.ok) throw Error((await a.json().catch(()=>({}))).error || "方舟字幕擦除轮询失败");
  return a.json();
}
async function w(e,a){                       // e = runId, a = onStatus callback
  let n=0;
  for(let t=0;t<360;t++){
    try{
      let t=await k(e);
      if(n=0, a?.(t.status), "succeeded"===t.status) return {videoUrl:t.videoUrl, error:null};
      if("failed"===t.status) return {videoUrl:null, error:t.error||"字幕擦除失败"};
    }catch(a){ if(n++, n>=5) return {videoUrl:null, error:"字幕擦除轮询失败"}; }
    await new Promise(e=>setTimeout(e,5000));
  }
  return {videoUrl:null, error:"字幕擦除处理超时"};
}
```

### 3.3 Free-channel orchestration (gate + submit)
```js
if(!o) return void updateNodeData(e,{
  status:"error",
  errorMessage:"未找到方舟原始 URL，无法使用免费通道（可使用通用擦除）"
});
// o = node.sourceProviderUrl
updateNodeData(e,{status:"processing", errorMessage:null, outputVideoUrl:null,
                  runId:null, queueTaskId:null, generationStartedAt:Date.now(), channel:"free"});
let n = await M({
  nodeId:e,
  request: ()=> sr({ videoUrl:o, _meta:{nodeId:e, projectId:r||"local",
                                        label:"字幕擦除（免费）", episodeId:i.episodeId} }),
  poll: e => UA(e),
  onTaskCreated: ({queueTaskId:n, runId:t}) => updateNodeData(e,{status:"processing", queueTaskId:n, runId:t})
});
n.videoUrl && updateNodeData(e,{outputVideoUrl:n.videoUrl, status:"completed", ...});
```

### 3.4 Shared submit→poll orchestrator `M` (proves taskId location)
```js
async function M(e){
  let a = await e.request();          // a = submit response json (top-level)
  let n = a._genTaskId ?? null;       // queueTaskId
  e.onTaskCreated?.({ queueTaskId:n, runId:a.runId });
  return e.poll(a.runId);             // poll keyed by top-level runId
}
```
So for BOTH free and paid: `runId` and `_genTaskId` are **top-level** in the
submit response, and the poll URL is keyed by `runId`.

---

## 4. FREE capture status — BLOCKED at runtime (recorded)

I drove the UI: selecting video node 1 opens the generation panel; the bottom
row exposes `超分 | 去字幕 | 尾帧成图`. Clicking **去字幕** opens the
`字幕擦除` dialog with two buttons: **免费擦除** (green) and **付费擦除** (red).

For the available Seedance 2.0 node, **免费擦除 was `disabled`** (`button.disabled
=== true`). The dialog body explained why:

> 方舟字幕擦除（免费）：仅适用于 Seedance 2.0 / Fast 模型生成的原始视频，24h 内可用。
> **未找到方舟原始 URL（可能视频是更早期生成，重新生成后即可使用免费通道）**

Root cause (matches the node data in §2.3): the source video node had
`sourceProviderUrl: null` / `seedanceProviderUrl` unset, so the client cannot
populate `videoUrl` for the ark route and greys out 免费擦除. This is the same
gate as §3.3. A freshly generated Seedance 2.0 video (where the queue backfills
`seedanceProviderUrl`) within 24h would enable it.

I did **not** generate a fresh Seedance video to unblock this, because the FREE
endpoint, method, payload shape, response shape, poll URL, poll cadence, and
status strings are all fully and unambiguously recovered from the live bundle
(§3) and are structurally identical to the empirically-verified PAID route
(§2) except for the `/ark` path segment and the `videoUrl` source field. The
only thing not directly observed on the wire for FREE is a live `succeeded`
poll body — but the bundle's `w()` loop reads the identical `{status, videoUrl,
error}` shape as the paid `f()` loop, confirmed against the live paid poll.

If a downstream task strictly requires a live FREE wire capture, the unblock
recipe is: generate a new Seedance 2.0 video on this canvas, wait for the queue
to backfill `seedanceProviderUrl` on the node, then 去字幕 → 免费擦除 within
24h. The submit will then POST `/api/subtitle-remove/ark` with
`videoUrl = <that provider URL>`.

---

## 5. Differences from codex's guessed endpoints `/api/subtitle-remove(/ark)`

**Codex's guesses are CORRECT.** Both paths match exactly:

| Codex guess | Actual | Verdict |
|---|---|---|
| `/api/subtitle-remove` (paid submit) | `POST /api/subtitle-remove` | exact |
| `/api/subtitle-remove/ark` (free submit) | `POST /api/subtitle-remove/ark` | exact |
| (poll, paid) | `GET /api/subtitle-remove/{runId}` | confirmed |
| (poll, free) | `GET /api/subtitle-remove/ark/{runId}` | confirmed |

Refinements / things codex's guess does **not** capture but downstream code
must get right:

1. **Submit body is `{ videoUrl, _meta:{nodeId, projectId, label, episodeId?} }`** —
   NOT a flat `{videoUrl}` and NOT keys like `providerVideoUrl`/`taskId`/`model`
   in the request. The provider-vs-OSS distinction lives entirely in *which URL*
   you put into the single `videoUrl` field (OSS url for paid; provider url for
   free), not in a separate key.
2. **taskId is `runId` at top-level** of the submit response (plus `_genTaskId`
   → `queueTaskId`). Not under `data`. Poll is keyed by `runId`.
3. **Result URL field is `videoUrl`** in the poll response (not `outputUrl` /
   `providerVideoUrl`). The node-side field is `outputVideoUrl`.
4. **Status strings are exactly `running` / `succeeded` / `failed`** (lowercase).
   Not `processing`/`completed` on the wire (those are *node*-data statuses).
5. **Poll cadence 5s, max 360 polls, abort after 5 consecutive fetch errors.**
6. **FREE route requires node `sourceProviderUrl` (a.k.a. `seedanceProviderUrl`)**;
   the OSS `videoUrl` will NOT work for the ark route. The button is client-side
   gated on this being non-null and (per dialog) Seedance 2.0/Fast + within 24h.
7. Node type written to the canvas is **`subtitleRemove`** with fields:
   `sourceVideoUrl, outputVideoUrl, sourceProviderUrl, sourceGeneratedAt,
   sourceModel, runId, queueTaskId, channel ("free"|"paid"), generationStartedAt,
   status, errorMessage`.
