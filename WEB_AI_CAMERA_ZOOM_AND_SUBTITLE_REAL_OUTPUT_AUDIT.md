# Real output audit: camera zoom and burned-in subtitles

2026-10-23. Baseline HEAD/production d70cf61be35fe9b43af1fd0e5e71862431da793c, deployment dpl_7JAXCmGBFY5GZ8n3wgqfZMXkqJZF READY. Unrelated dirty files preserved. No paid prediction, project write, source-media edit or completed-media modification.

## A. Verified implementation findings

- `src/lib/sceneCamera.js`: an English negated list (`Fixed camera. No pan, tilt or zoom.`) removed only its first comma-delimited part; remaining tilt/zoom switched the Boolean false. Reproduced in CPU regression and corrected. This pattern does **not** occur in the six selected Vietnamese-camera jobs; it does not explain those incidents.
- `src/lib/cloudVideoOptions.js`: fixed-camera scenes retained the original Vietnamese camera instruction, but had no generated instruction defining stable framing, initial subject scale and background. Added one conditional locked-framing section. This is a prompt mitigation, not proof that omission caused the output or guarantees correction.
- `api/_lib/seedance/provider.js`: historical serialized HTTP requests/receipt parameters were not retained. Added allowlisted structured server-log diagnostics, not ledger fields, to close that evidence gap for future operator submissions.
- No current true→false loss found for the selected Vietnamese Camera. No generic push-in/zoom boilerplate, repeated speech, translation-as-speech, unsupported subtitle flag or second downstream template was found. Do not mislabel these as fixed bugs.

## B. Changes

Only three production files above. Camera negation handling preserves explicit moving-camera scenes. Canonical conflicts or a moving Camera instruction in Action/Custom Prompt produce an inline, nonblocking warning through the existing warning UI; authored content is not deleted. No new option, popup, gate, account rule or price rule.

For explicit fixed intent, one FRAMING section requests a continuous locked tripod shot, unchanged angle/scale/background, no pan/tilt/dolly/orbit/reframe/zoom, with natural performance. Moving-camera scenes receive no lock. Near the existing cap, labels and generated guidance compact; dialogue and scene values never truncate, and picture/framing constraints remain. Existing long-prompt regression stays valid. References mode retains prompt guidance but receives no unsupported camera_fixed parameter.

The existing VISUAL / single SPOKEN AUDIO / PICTURE / PERFORMANCE separation remains. Auxiliary Translate stays excluded; intentional physical writing stays permitted. No language, duration, resolution, aspect, seed or audio changes. No UI/player/archive/ledger/schema/worker changes.

Diagnostics log a random request correlation ID, exact serialized body SHA-256, prompt SHA-256/length, endpoint, scalar settings, and media-presence flags/count; a matching acceptance event records the validated prediction ID. No prompt, dialogue, source URL, image bytes, token or key is logged. Events occur at the actual transport boundary and are best effort; they cannot retry or block a billable request. They establish attempted outgoing values, not provider internal compliance. Logs have hosting retention limits and do not retroactively prove historical payloads.

## C. Actual historical request evidence

Fresh Firestore read: **45 completed prediction records**, four projects. All currently recorded completed jobs are Start Frame → Seedance 1.5 Pro I2V. No completed T2V/References jobs were available; these modes are tested only with mock transport.

45 stored prompt hashes match; zero exact dialogue duplication or auxiliary translation inclusion against current canonical scenes. The three newest predictions use the d70cf61 VISUAL/SPOKEN AUDIO template; their records contain camera_fixed=true. They were created after that release, but historical records do not contain deployment SHA or raw wire capture, so exact serving deployment is not independently proven by timestamp alone.

Authenticated **GET only** to `/api/v3/predictions/{id}/result` for all six samples returned completed, exact IDs/model. Responses expose no input/settings field. Browser dashboard inspection was unavailable: “Local browser use is disabled in Work settings.” Therefore provider-side received camera_fixed is **UNKNOWN** for each selected historical prediction. Ledger true is not relabeled as a captured provider receipt.

Current source trace: structured parser retains Camera → persisted scene → Workspace hydration → VideoOptionsModal derives sceneCameraFixed → client derives sceneVideoPlan → server prepareQuote independently derives camera from saved scene → immutable prompt/settings record → providerVideoPayload retains supported settings → createProvider JSON.stringify sends exactly that payload. No camelCase cameraFixed request key. Diagnostics use cameraFixed only as an internal log label. Raw provider payload remains camera_fixed.

## D. Existing video analysis

All table rows belong to **proj_1792591144210**. Endpoint for every row: `bytedance/seedance-v1.5-pro/image-to-video`. Camera source and camera prompt text for all rows are exactly: `Camera cố định, không được di chuyển camera, không được thay đổi góc hay độ zoom của camera. Không có nhạc nền`. No additional automatic movement directive or Custom Prompt in these records. No last_image in the app adapter; no reference-video mode used.

| Scene / prediction | Ledger camera_fixed / provider received | Source dimensions / ratio | MP4 | Burned-in captions observed | Framing in decoded MP4 | Confidence |
|---|---|---|---|---|---|---|
| 6 / 5fe09bfc18e3479ca8fd781afee6c0d6 | true / UNKNOWN | 3072×5504 / .5581 | 480×864, 6.583s | Yes, torso/lower speech captions | Strong progressive tightening: wall boundaries and background spectators move outward/enlarge while desk disappears; not merely head movement | High for MP4 reframing and captions; optical zoom vs generative warping cannot be distinguished |
| 5 / 7d87eb7a282f4e3b948ffe403f3a4710 | true / UNKNOWN | 3072×5504 / .5581 | 480×864, 8s | None observed in 1fps samples | Desk/wood-panel edges and background spectators change scale/composition along with subject | High for framing change; exact physical camera mechanism unknown |
| 4 / 5af328d5ad134533b063ae637485f8c0 | true / UNKNOWN | 3072×5504 / .5581 | 480×864, 8s | None observed in samples | Character stands; ceiling becomes visible and desk/background reposition. Both physical performance and reframing occur; do not call subject growth alone zoom | High for standing/reframing; optical zoom unknown |
| 4 / 81947019b674454a9c8fa19e0c68ff81 | true / UNKNOWN | 3072×5504 / .5581 | 480×864, 8s | Yes, torso captions | Character leans/gestures; sampled composition changes, not a calibrated camera-motion measurement | High for captions; medium for framing classification |
| 4 / 0331bf709d854e1ca24768efab9dc8ea | true / UNKNOWN | 3072×5504 / .5581 | 480×864, 8s | Yes, top captions/green highlights | Character leans/gestures; no isolated optical-zoom claim | High for captions |
| 3 / d698da808366496fbc98ceafa4dfd762 | true / UNKNOWN | 768×1376 / .5581 | 480×864, 8s | None observed in samples | Wall joints and table frame progressively tighter while subject enlarges | High for encoded reframing; generative warp vs lens zoom unknown |

One frame/second across each clip was decoded, including beginning/middle/near end; absence in samples is not proof of no transient text in every frame. All source downloads match the recorded SHA-256. Sources contain a corner graphic and physical paper writing, **no dialogue captions** on visual inspection. The three new inputs were also compared with earlier verified references (unchanged bytes where shared).

All six archived MP4 files are byte-identical to currently accessible provider files. They have video/audio streams only, no subtitle stream. Captions and reframing are in decoded pixels, not HTML overlays or an R2 transformation. The input ratio .5581 versus output .5556 is a small ~0.47% difference; it may cause a small initial fit difference, but cannot by itself explain progressive large tightening during a clip. No ratio change was applied.

Player source `StoryboardTab.jsx` uses `w-full h-full object-contain` for OUTPUT, and modal preview also uses contain. No dynamic zoom transform in this path. Earlier live browser evidence on the same release showed zero text tracks and readyState=4. Current live CSS/browser recheck NOT RUN due disabled tool; source evidence plus raw MP4 establishes that a player-only fix would not resolve these samples. Archive is byte copy; separate trim/export paths are not involved in these original R2 files.

## E. Regression verification

Focused tests cover negated camera lists, positive movement, authored/custom conflicts, exact quote→payload→HTTP JSON, supported per-mode keys, correlated diagnostics without secrets, original speech/translation, and preserved cap. Existing UI regressions cover no automatic paid submission, usable Generate, no Duration selector, OUTPUT/history and recovery.

Final full Web suite **479/479 PASS** after the negation refinement; targeted camera suite **6/6 PASS**. Read-only comparison confirms all four inspected cloud projects unchanged. Six built assets scanned: zero matches for known local secret values. Build PASS; scoped ESLint PASS. Real protected 21-scene project across three modes: 63 mock-transport cases PASS; max composed prompt1267 characters. No real provider POST. Known-secret bundle scan and read-only integrity check run separately.

## F. Release

Pending scoped commit and deployment. No environment/domain change. Private evidence under docs/camera-quality-20261023 stays local, including exact recorded prompts; no private dialogue or signed URLs are included in this report.

Additional CPU acceptance uses the actual current project proj_1792591144210 Scenes 4, 5 and 6: nine quote→serialized mock-HTTP cases across three modes PASS. I2V/T2V retain camera_fixed=true; References omits the unsupported key. Original scene data unchanged. Prepared I2V durations/prices remain 8s/$0.192, 8s/$0.192 and 6s/$0.144 respectively. These are backend calculations with mock image metadata and mock transport, not live Clerk quotes or new provider jobs.

## G. Real output quality

**NOT VERIFIED — NO NEW PAID VIDEO GENERATED in this task.** The three new operator-generated videos since the previous task were inspected as existing evidence. In particular Scene 6 proves the previous prompt revision did not eliminate subtitles/zoom. This audit does not call either visual defect solved.

## H. Provider limitations / supported next steps

The [WaveSpeed 1.5 Pro I2V request schema](https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-v1.5-pro-image-to-video) documents camera_fixed, optional last_image and native audio, but no subtitle-off/no_zoom/negative_prompt switch. [T2V](https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-v1.5-pro-text-to-video) supports camera_fixed; [Mini reference mode](https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-2.0-mini-text-to-video) does not. Payload schema unchanged.

[BytePlus guidance](https://docs.byteplus.com/id/docs/modelark/seedance-2-5-prompt-guide?redirect=1) describes repeated dialogue/per-word emotion instructions and reference captions as possible contributors. It concerns newer Seedance versions, not a guarantee for this 1.5 endpoint; those patterns were not found in the selected jobs.

Operator options: inspect a future individually authorized generation with correlated HTTP diagnostics, or use these existing prediction IDs to request provider investigation of camera_fixed compliance and generated captions. Do not automatically regenerate or change model. Existing editor trimming cannot remove burned-in text without losing content; no cleanup/reencoding was attempted. If a future captured correct payload still produces text/zoom, classify it as provider-generation compliance failure rather than another successful Boolean fix. Prompt changes cannot repair existing MP4 pixels.
