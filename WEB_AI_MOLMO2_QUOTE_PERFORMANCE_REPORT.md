# Web AI production update — Molmo2, quote recovery and performance

## Character Set ID

Setup previously queued a job for a Windows Qwen worker to claim. Full AI Setup now uses Clerk-authenticated `POST /api/qwen?action=molmo_create|molmo_status|molmo_confirm|molmo_cancel`. The route shares an existing Vercel function. Hosted actions operate independently of the local worker flag. The existing private collection holds per-character prediction records; Firestore rules were not changed.

`api/_lib/molmo/{prompt,provider,output,service,store}.js` implements the integration. The sole provider POST is to `https://api.wavespeed.ai/api/v3/wavespeed-ai/molmo2/image-qa`. The request body is `{"images":["<validated saved R2 image URL>"],"text":"<full VISION_PROMPT>"}`. Prompt version `visual-id-2026-11-02-v1` contains the operator's complete instructions. The backend checks project ownership, the canonical image path, media type, byte budget and content hash. The browser supplies only the project and character identifiers. [WaveSpeed model contract](https://wavespeed.ai/docs/docs-api/wavespeed-ai/molmo2-image-qa)

A committed attempt precedes provider submission. An uncertain response requires recovery. Polls read the persisted prediction ID via `/predictions/{id}/result`. A lock limits concurrent result reads. Terminal results stop polling. The parser accepts a structured object or JSON text, including a fenced JSON response. It checks field names, types, length, explicit identity claims, visible attribute fields and normalized lowercase snake case. Unusable output gives a review error. Appearance accuracy requires human review.

`VisualProfiles.jsx` and `molmoClient.js` separate the candidate from approval. Approval updates only the existing character profile array in a transaction. The prompt composer resolves the approved appearance at generation time. Legacy Qwen IDs are readable. The emulator regression checks concurrent video publication, unchanged scene mappings and persistence across fresh store instances.

## Quote expiry

`VideoBatchPanel` restores historical batch items. `SceneVideoAction` previously displayed terminal batch failures beside a saved output and could continue showing the older failure during a new operation. `cloudVideoClient` also retained its consumed-submit latch after an explicit pre-admission expiry. A fresh user action now requests a new quote. Known terminal failures allow an explicit retry. Ambiguous paid outcomes stay in recovery.

`batch_tick` previously made a legitimate pre-dispatch expiry terminal. The worker now checks the current reservation, prediction and lease, preserves the expired record, and rotates the unpaid item's attempt ID. The next dispatch validates the current scene, media, settings and admission. Terminal batch history remains available in its details. Test transports verify one eventual submission and preservation of ambiguous paid reservations.

## Performance

Production baseline used `proj_1792167327214`, with 21 scenes, two video outputs and zero pending batch items. UI timings measure a click through two animation frames following the expected DOM change. The navigation test opens the project from History in the same session. Single browser samples depend on caches, network conditions and frame timing.

| Operation | Before | After | Difference |
|---|---:|---:|---:|
| Project route to painted Storyboard | 311 ms | Pending production smoke | — |
| Return to Storyboard tab | 35.8 ms | Pending production smoke | — |
| Open Gen Video modal | 40.1 ms | Pending production smoke | — |
| Switch to Setup | 37.3 ms | Pending production smoke | — |
| Update a saved production scene | NOT MEASURED | NOT MEASURED | No production edit in this test |
| Read project, grant and paginated ledger, median of 3 locally executed reads against production Firestore | 1,530 ms | 1,017 ms | 513 ms faster (33.5%) |

The paired benchmark read the same 184 records and six pages using both implementations. It measures read latency, not provider inference. Pages are fetched in bounded parallel groups inside the original transaction. Authorization stays current. Idle batch refresh spacing increases from 15 to 60 seconds. Offscreen output players now defer their media source until they approach the viewport. MainEditor already tries deterministic structured parsing before the Gemini fallback.

The baseline browser observed two Firestore resource entries, two video loads and a list response of 575 encoded bytes in 8.74 s. Cross-origin timing restrictions prevent treating resource entries as billed Firestore document reads. Set ID feedback with a real provider, production React render counts and isolated time to interactive were NOT MEASURED.

## Verification

Web regression, Firestore emulator, build, lint and deployment evidence are recorded below. Provider transports used by the suites are mocks. A real Molmo2 prediction, review and save is a separately authorized paid acceptance step.
