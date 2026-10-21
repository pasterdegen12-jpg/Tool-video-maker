# Camera, subtitles and duration/cost audit

Date: 2026-10-21. Project: proj_1792167327214. No paid provider requests, no Firestore writes, no Qwen/GPU changes.

## CAMERA FIXED
Root cause: DEFAULT_SETTINGS and modal editable options initialized camera_fixed=false; sceneVideoPlan, client and server quote validation copied it without deriving canonical Camera. Existing completed scene 1/2 ledger records both contain false despite explicitly fixed Vietnamese Camera.

Fix: shared sceneCameraFixed reads only canonical Camera. Explicit English/Vietnamese fixed instructions map true, positive movement/negated fixed map false, unspecified directions preserve existing setting. Mixed fixed+moving instructions retain movement rather than silently freezing a moving shot. Modal, client and server derive the same value; custom prompt cannot change the Boolean. Server independently corrects stale client Boolean before hashing quote and durable snapshot. Provider submit uses that exact snapshot. References Mini keeps its unsupported flag absent from payload; original Camera remains in prompt. Old attempts/history are not rewritten.

## SUBTITLES
Actual subtitle-bearing output was not identified or visually rechecked in this run; source remains UNVERIFIED for the reported incident. Source inspection finds no HTML track/addTextTrack or caption overlay in current player, no subtitle/drawtext filter in current app editing/merge code. R2 archive copies provider bytes without rendering. Thus provider-burned captions are plausible, not proven for an unidentified clip. Existing two completed prompts have no subtitle suppression instruction.

Added conditional non-spoken visual direction to composeVideoPrompt: avoid unrequested subtitles/captions/on-screen dialogue/speech bubbles/overlays; preserve explicit authored text and physical signs. Does not freeze character acting. No invented API flag. Authored Dialogue, Camera, Action and Character remain intact. Optional guidance is omitted if it cannot fit the existing 2000-character application cap; all 21 real scenes fit it. Existing valid scenes are not newly blocked. Prompt-only suppression is not a guarantee; no new paid output was generated to assess quality.

## DURATION / COST — audit only
All 21 saved scenes currently lack duration_seconds and Time/time_origin metadata. Their original raw script contains only a whole-script ~115s estimate; that is not per-scene timing. Current fallback counts spoken words, applies 150 words/minute plus 0.8s, rounds upward to an integer (minimum4); request normalization then rounds/clamps to4–12 for1.5Pro or4–15 forMini. Empty speech fallback is5, not12. Saved positive finite duration takes precedence where present.

This project does NOT show frequent12s: distribution6s×2,7s×1,8s×7,9s×2,10s×7,11s×1,12s×1. Scene1 has28 words:28×0.4+0.8=12s. Scene2 has19 words:8.4s→9s. At28+ words, this rule commonly maps to12s for1.5Pro; longer estimates remain eligible, using provider maximum. No mapping-to12 default bug found. A floating-point artifact returns9.21 rather than9.20 at21 words and8.81 rather than8.80 at20 words; both still round to the same integer, so no verified extra paid second from it in this dataset. Algorithm deliberately unchanged.

| Scene | Words | Formula seconds | Estimate | Request seconds | 480p + audio quote USD | Existing output |
|---|---:|---:|---:|---:|---:|---|
| 1 | 28 | 12 | 12 | 12 | 0.2880 | Có |
| 2 | 19 | 8.4 | 9 | 9 | 0.2160 | Có |
| 3 | 21 | 9.21 | 10 | 10 | 0.2400 | Không |
| 4 | 16 | 7.2 | 8 | 8 | 0.1920 | Không |
| 5 | 23 | 10 | 10 | 10 | 0.2400 | Không |
| 6 | 21 | 9.21 | 10 | 10 | 0.2400 | Không |
| 7 | 21 | 9.21 | 10 | 10 | 0.2400 | Không |
| 8 | 21 | 9.21 | 10 | 10 | 0.2400 | Không |
| 9 | 24 | 10.4 | 11 | 11 | 0.2640 | Không |
| 10 | 23 | 10 | 10 | 10 | 0.2400 | Không |
| 11 | 17 | 7.6 | 8 | 8 | 0.1920 | Không |
| 12 | 15 | 6.8 | 7 | 7 | 0.1680 | Không |
| 13 | 13 | 6 | 6 | 6 | 0.1440 | Không |
| 14 | 18 | 8 | 8 | 8 | 0.1920 | Không |
| 15 | 18 | 8 | 8 | 8 | 0.1920 | Không |
| 16 | 20 | 8.81 | 9 | 9 | 0.2160 | Không |
| 17 | 21 | 9.21 | 10 | 10 | 0.2400 | Không |
| 18 | 17 | 7.6 | 8 | 8 | 0.1920 | Không |
| 19 | 12 | 5.6 | 6 | 6 | 0.1440 | Không |
| 20 | 18 | 8 | 8 | 8 | 0.1920 | Không |
| 21 | 18 | 8 | 8 | 8 | 0.1920 | Không |

All table prices are illustrative current I2V/480p/audio=true quotes, not actual charges for ungenerated scenes. Total normalized186s=$4.464. Hypothetically forcing all21 to12s would be252s=$6.048 (+$1.584,+35.48%); current code does not do this in this project.

Actual durable evidence: scene1 COMPLETED prediction298312fff69e419fa1e0b2a76167d8b2,12s,480p,16:9,audio=true,camera_fixed=false,internal quote/reservation$0.288. Scene2 COMPLETED prediction2031bf64ce524a2cb4b1444d7349dfc6,9s,same settings,internal$0.216. Both model bytedance/seedance-v1.5-pro/image-to-video; legacy missing mode denotes Start Frame. Combined internal$0.504 is NOT provider-billed proof. No provider invoice/actual billing data was read. Completed media durations were not remeasured in this run. Full read-only evidence: docs/camera-subtitle-20261021/real-evidence.json.

Documented I2V rates:480p $0.012/sec silent,$0.024/sec audio;720p $0.026/sec silent,$0.052/sec audio. Illustrative audio prices:4s=$0.096/$0.208,5s=$0.120/$0.260,8s=$0.192/$0.416,9s=$0.216/$0.468,10s=$0.240/$0.520,12s=$0.288/$0.624 (480p/720p). Mini reference-image rates:$0.06/$0.12/$0.30 per second for480p/720p/1080p,4–15seconds. No reference videos used.

Sources checked2026-10-21:
- https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-v1.5-pro-image-to-video
- https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-v1.5-pro-text-to-video (request table confirms camera_fixed; prose also calls it fixed_camera, so retain actual request field)
- https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-2.0-mini-text-to-video (no camera_fixed in request schema, supports prompt-based negative guidance)

Proposals only: compare multiple real screenplays and measured natural speech before adjusting150wpm/overhead; review any excessive saved estimates before changing prioritization. No new duration selector, cap, budget, allowlist, confirmation step, price lock or eligibility restriction. No duration algorithm or billing configuration changed.

## Validation / release
Pending final regression and deployment results. Before-change production READY at a7a860ab6dc9461a60dd96cd6508f7d1e972e02d, deployment dpl_GNzMrPbPjP4wi8XqWkkjNwheWURS.

Regression: 441/441 PASS; final focused suite PASS after shortening custom-direction heading to avoid reducing prompt capacity. Production build PASS with frontend provider keys empty. Targeted ESLint PASS, diff check PASS. Existing tests cover no-submit-on-modal-open, duplicate-submit guards, OUTPUT recovery and no new duration UI. Mock service test captures camera_fixed=true at provider.submit. No real paid test.
