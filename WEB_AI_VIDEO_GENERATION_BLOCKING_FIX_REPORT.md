# Production video generation blocking — 2026-10-31

Target: `proj_1793429094428`. Baseline release: `e8c4fe08432698c365216a175477ea9a9ed55b45`.

## Confirmed root cause

Real Clerk browser showed `LEDGER_STORAGE_FULL` on scene 20 and the batch panel. Firestore read-only inspection confirmed the shared owner's ledger was **849,986 bytes**, with **160 attempts and 11 batches**. `createCloudStore.transact` in `api/_lib/cloud-video/store.js` required the entire aggregate owner/team JSON to remain below 850,000 bytes. The next quote/reservation/status write exceeded that application guard. This is not a daily spending cap, provider limit, or Visual ID requirement.

The actual project has 23 scenes and 19 saved outputs. Scene 20's attempt is READY with verified media, no paid consent and no prediction ID; its batch item failed with LEDGER_STORAGE_FULL. Scenes 21–23 remain pending. Earlier unrelated batch failures include SCENE_CHANGED and QUOTE_EXPIRED and were not erased or reclassified.

Real Clerk pre-fix reproduction: `POST source` HTTP 200, then `POST quote` HTTP 503 with `LEDGER_STORAGE_FULL`. No submit called. Scene 20 modal opens, original image is visible, Generate is enabled despite missing approved Visual ID. The first demonstrated failure is durable ledger mutation before a new paid submission. Existing generated output, R2 storage and scene publication already worked for scenes 1–19. Missing approved Visual ID is informational in Storyboard and is not part of the generation permission condition.

## Minimal correction

Only the cloud-video storage adapter changes. Historical records and batch intents move into bounded private pages below the same `_video_ledgers/{owner}` path. A small root manifest retains admission counters, spending/rate state and queue lease. Pages target 200 KB; a single oversized entry still fails safely. This removes the aggregate single-document ceiling without deleting history or merely increasing the limit.

Legacy inline ledgers remain readable. On the next successful transaction, root manifest and all pages commit atomically, preserving every attempt, idempotency hash, paid reservation, batch intent and job state. Subsequent writes touch changed pages only. Snapshot reads reconstruct the original service interface, so single-scene and Gen All reuse the exact same service and transaction admission checks. Reads scale with pages rather than one read per historical attempt. This is still a whole-ledger compatibility adapter, not indexed archival; very large lifetime histories may eventually justify a separately scoped query optimization.

Firestore rules already deny browser access recursively under `_video_ledgers`; no permission/rule change. No project screenplay, media, Character IDs, audio, Gemini, Qwen, GPU, provider key, price, concurrency or duration policy change. No Duration selector or new account gate. Existing 4–10 request behavior and all modal options remain unchanged.

## Tests and release

Full Web regression: 523/523 PASS with mocked provider transport. Production build and scoped storage lint PASS. Built text asset scan: zero known secret matches. Firestore emulator: **10/10 PASS**, verifying migration above the old aggregate ceiling, exact history preservation, concurrent writers, abort/oversized-entry atomicity and browser rule denial, in addition to existing output publication tests.

Evidence: `docs/video-blocking-20261031/`. Private local pre-change backup is Git-ignored; no credentials printed. Deployment and live smoke results are appended after release. No new paid prediction is permitted during this task. Real provider generation after the correction remains pending operator authorization.

## Rollback

Do not roll back blindly to a storage adapter that only reads inline `records`. After page migration, rollback must retain this dual-reader or first perform a separately reviewed export/restore with all active consumers stopped. The original private backup preserves the pre-change ledger; it must never overwrite newer paid attempts. Project/R2 output data is not migrated.
