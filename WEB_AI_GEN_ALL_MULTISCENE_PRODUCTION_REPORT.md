# Gen All Video — production delivery

Date: 2026-10-29. Baseline: e365626bb535a3acd21b965125b5c065f12963b3.

## IMPLEMENTED

Existing Full AI sidebar **Gen All Video** now opens one centered dark selection dialog. Eligible scenes default selected; completed/running/missing-input scenes explain their exclusion. Individual selection, select all, deselect all and exact final count are supported. Inline estimates use the existing server pricing calculation. No Duration control or extra approval popup.

Only **Generate N Videos** creates durable consent for the exact reviewed scene IDs/digests. Opening, selecting and closing do not create jobs. Completed scenes remain available for intentional regeneration through the existing individual modal.

`api/_lib/cloud-video/batch.js` extends `/api/video` with plan/create/list/tick/cancel. Batch intents live inside the existing private owner `_video_ledgers` document, with batch ID, exact selection hash, consent time, canonical input digest, settings, stable attempt IDs, retries and per-scene status. Existing ledger byte ceiling and Firestore rules remain unchanged. No grants, allowlist, caps or new infrastructure were added.

Each short tick executes one step through the existing single-scene quote → immutable upload ticket → transfer/hash verification → submit → poll → R2 archive → transactional scene publisher. It does not duplicate the provider adapter. The server derives a batch-specific consent context from the already authenticated Clerk subject and durable batch; it never creates or substitutes a JWT. Project authorization is rechecked on all actions.

Two browsers share an atomic owner lease and team admission transaction. Stable batch/attempt IDs prevent duplicate creation/submission. Pending work rechecks canonical source/settings/output before preparation. Cancellation stops unsubmitted work, including a submit-time transaction guard; accepted/unknown paid attempts are never blindly retried. Temporary 429/CONCURRENCY_LIMIT preparation errors honor Retry-After, bounded backoff and five retries. Unknown paid outcomes retain existing recovery and capacity protection.

Single-scene prompt composition, Character IDs, exact speech, camera flags, no-subtitle and brisk-speech guidance, current 4–10-second policy, pricing and output publisher are reused unchanged. Concurrent publication remains a Firestore transaction; old outputs/history and neighboring scenes are preserved. Browser completion callbacks update the existing OUTPUT and VIDEO GEN counter, without another player or database rewrite.

## Scheduling and limits

Concurrency is the minimum of existing owner/team limits, not an invented new allowance. Mocks verify two concurrent predictions; actual production value is recorded below after deployment. Account-specific WaveSpeed concurrency cannot be inferred from a generic tier table, so existing production settings are preserved.

No existing independent scheduler was found. Vercel Hobby cron is unsuitable for a seconds-scale dispatcher. Pending intents are durable; an authenticated open project advances them (one server step, at least five seconds between owner ticks; UI six seconds active / fifteen seconds idle with error backoff). After all browsers close, provider-accepted jobs continue at the provider, but pending submissions and result archival/publication resume on reopening. UI explicitly states this limitation. No long-running serverless loop or paid worker was added.

Existing single-scene References files are transient and not durably saved with scene options. Batch planning explicitly marks such saved configurations unsupported, directing users to the individual References modal; it never substitutes an unrelated Start Frame. Start Frame and Text batches are implemented. Local files chosen but not saved in a single-scene modal are not silently treated as persisted batch inputs.

References: [WaveSpeed account limits](https://wavespeed.ai/docs/account-levels), [Vercel function limits](https://vercel.com/docs/functions/limitations), [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing). Existing project is Hobby; three configured API entrypoints, twelve existing Lambda outputs, no new API function.

## MOCK TESTED / FIRESTORE VERIFIED

- Full Web suite: **523/523 PASS**, `docs/batch-video-20261029/web-tests-final.log`.
- Batch sizes 1, 2, 5, 21; exact per-scene prompt/image mapping; 4–10 policy, camera/audio/resolution; selected 1/3/5; mixed failures; unknown submission; bounded concurrency; 429 Retry-After; cancellation; two browsers; fresh service recovery; authentication rejection; paid-disabled rejection.
- Actual React/jsdom selection dialog: default exclusions, select/deselect, exact count, no requests on review/close, double-click creates exactly one batch.
- Firestore emulator: **9/9 PASS**, `emulator-final.log`. Concurrent batch creation deduplicates across fresh Admin stores. Concurrent out-of-order output publication preserves both scene results and unchanged neighbor; stale output is rejected. Existing private rules tests remain passing. No production rules changes.
- Production build: **PASS**, `build.log`, frontend provider keys empty. Existing large-chunk/dynamic-import warnings remain.
- Scoped lint: new/other changed modules clean. Workspace retains the same 46 pre-existing diagnostics; baseline-aware comparison finds **zero introduced diagnostics** (`lint-comparison.json`). No unrelated cleanup.
- Known credential scan: zero matching secrets in six built text assets. No credential rotation/config changes.

Commands: `node --experimental-vm-modules --test tests/*.test.mjs`; local Firebase emulator via `docs/batch-video-20261029/run-emulator.cjs`; `node docs/batch-video-20261029/check-lint.mjs`; `node docs/import-recurring-20261025/build.cjs`; `node docs/import-recurring-20261025/scan.cjs`.

## Real project read-only verification

Actual Firestore reads, not fixture inference:

| Project | Scenes | Existing output | Eligible | Invalid |
|---|---:|---:|---:|---:|
| proj_1792935914440 | 22 | 22 | 0 | 0 |
| proj_1793025882703 | 3 | 0 | 0 | 3 |
| video 1 — proj_1792426312622 | 22 | 5 | 17 | 0 |

The 17 eligible scenes in “video 1” total an estimated **$2.7840** using their current saved inputs/current policy. This is a plan, not a billed batch. Per-scene settings, IDs, input/text hashes and before/after project hashes are retained in `real-plan-before.json` / `real-plan-after.json`. Production acceptance will use the actual Clerk session and never click the final Generate action.

## Release and browser evidence

Pending release verification; appended below after scoped commit/deploy. **REAL PAID BATCH VERIFIED: NOT RUN**. No paid predictions authorized by this test task.
