# Production submit/dispatch incident — 2026-11-01

Project: `proj_1793429094428`, Scene 20; related batch scenes 21–23.

## Root cause and observed trace

The preceding storage patch `46cd9e0` introduced a shared-reference bug in `loadLedger` / `saveLedger` (`api/_lib/cloud-video/store.js`). The saved-page comparison baseline and the reconstructed mutable ledger contained the same nested objects. Updating an existing record or batch item mutated the baseline too; the comparison consequently skipped the page write. Root admission counters/lease fields could commit while record/item transitions did not. New quotes and new batch insertion worked, so quote-only testing missed the defect.

Read-only production snapshot at 2026-11-01 13:24 UTC: original project hash unchanged, 23 scenes, 19 outputs, no active owner or team records. Scene 21 was still QUOTED; the latest newly created Scene-20-only batch `f8819d120f83e4d45bd10145b8350e50091b0bde8713d6fa` held pending attempt `aad75c658d0d6222ae7ceb48b0992778182b942c03d9d5e9`, which did not exist in records. This is accepted batch intent, not a provider prediction.

| Transition | Evidence before correction |
|---|---|
| Latest physical click / exact HTTP action | UNKNOWN: historical browser events unavailable; existing logs omit action query/body |
| Authenticated API traffic | 43 recent `/api/video` requests in available Vercel log window returned 200; includes repeated POSTs |
| Queue acceptance | New Scene-20-only batch durably present; pending item, no attempt yet |
| Quote | Scene 21 QUOTED, previously controlled Scene 20 quote QUOTED |
| Reservation | No active owner/team record; no new paid consent or provider ID on those attempts |
| Dispatcher progression | Existing nested item/record changes silently discarded by page comparison; exact defect reproduced with shared services + Firestore emulator |
| Provider submission/response for latest click | UNKNOWN in historical logs; no saved prediction evidence. Do not infer provider contact from HTTP 200 |
| Account/key mismatch | Not demonstrated; expected provider dashboard/account has not been independently correlated |

An integrated regression fails on the deployed shared-reference implementation (zero completed scenes), then passes after isolating the comparison snapshots. It exercises actual batch service → cloud video service → Firestore pages, with fake upload/provider transport only. Both Text and Start Frame run through acceptance, prediction persistence, polling and output publication.

## Corrections

- `store.js`: deep-copy persisted page snapshots before handing mutable records to transaction callbacks. Existing history/IDs are retained; no migration reset.
- `trace.js`, `service.js`, `batch.js`, `provider.js`, `api/video.js`, `cloudVideoClient.js`: bounded scalar stage tracing using existing attempt/batch IDs. Record request receipt/outcome, queue claim, admission, dispatch, provider HTTP status, accepted ID, polling and publication. No tokens, API keys, full prompts, private images or signed URLs.
- `runtime.js`: shared dependency construction for API and consumer.
- `continuation.js`, `api/video-consumer.js`, `vercel.json`, package manifest/lock: Vercel's private durable queue invokes the same dispatcher independently of browser lifetime. Existing admission/leases guard at-least-once delivery. Only authorized durable batch intents can dispatch. Single-scene provider submission remains awaited in the authenticated API; server continuation polls accepted predictions. No automatic replay of ambiguous prediction POSTs.
- `VideoBatchPanel.jsx`: server-queue status; browser does not run redundant ticks once server continuation is acknowledged.
- Existing `/api/get-upload-url` handler moved unchanged to `api/_lib/cloud-video/legacy-upload.js` and routed through the video function to stay within 12 functions. Existing public upload contract/OPTIONS/reserved media-path protection is preserved; all video generation actions retain Clerk validation.
- Authenticated `queue_probe` is a non-paid diagnostics path. Its private callback only verifies project access and emits receipt; it never dispatches a video.

Queue scheduling failures return DISPATCH_UNAVAILABLE rather than pretending provider work started. A worker must publish the next durable wake-up before acknowledging its current message; deterministic message keys suppress duplicate scheduling, existing Firestore leases/reservations suppress duplicate paid dispatches. Ambiguous admissions stop continuation for manual recovery. A 24-hour continuation deadline bounds operational retries without releasing paid reservations. Pending single-scene submissions rejected by genuine capacity are still explicit retryable errors; they are not falsely labelled queued.

## Tests

- Web: 544/544 PASS (mock provider only).
- Firestore emulator: 11/11 PASS, including image ticket/verification, nested record and batch progression, reservation, accepted prediction ID, completion and preserved neighboring output.
- Production frontend build PASS with frontend provider keys empty; scoped lint PASS; built text scan 0 known-secret matches.
- Regressions cover durable server wake-ups without a browser, duplicate wake/delivery, queue publication failure with preserved intent, unknown provider outcome without resubmission, existing provider rejection/concurrency/lease tests, and legacy upload route compatibility.

Local evidence is under `docs/submit-incident-20261101/`; private backups/logs are Git-ignored. Tests use mock provider transport and must not be counted as live WaveSpeed generation.

## Production acceptance

Deployment, authenticated API/probe results and final integrity comparison will be appended after release. No new billed test is authorized. Existing user-created pending batches are preserved and may resume when their already-authorized workflow is awakened; no new batch or Generate click is initiated by the agent.

Documentation used: [Vercel private queue consumers](https://vercel.com/docs/queues/quickstart), [delivery and retry SDK contract](https://vercel.com/docs/queues/sdk). No new queue vendor, billing-plan upgrade, model switch, GPU operation, audio or Gemini transport change.
