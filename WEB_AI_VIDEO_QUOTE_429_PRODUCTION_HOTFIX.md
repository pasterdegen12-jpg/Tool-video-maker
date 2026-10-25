# Production quote HTTP 429 hotfix — 2026-10-25

## Finding and evidence

Affected project: `proj_1792935914440` (22 scenes). The application quote transaction in `api/_lib/cloud-video/service.js` rejected **every new quote once the owner's durable ledger contained 80 records**, regardless of age or completed status: `LEDGER_CAPACITY`, HTTP 429. The shared account ledger actually contains 79 COMPLETED records and one expired unpaid READY quote, totaling 353,545 serialized bytes. This was a permanent history-count lock, not a rolling request allowance. The owner key hashes Clerk issuer + subject, so the shared account's entire project history contributes; session IDs do not partition it.

Vercel production logs show serverless POST `/api/video` 429 at 2026-10-25 16:34:54.225Z and 16:35:16.531Z on deployment `dpl_B6FMTa3sCA6aki3FKa8zX1DJzrDG`. These records establish an application function response, not an observed WAF rejection. Historical logs contain neither query string nor response body/headers: the exact historical response code and Retry-After were **not captured**. The operator identifies the failing action as quote. Do not confuse this with direct capture of that browser response.

Read-only real project/ledger reproduction, with the old HEAD service and corrected service running in memory, establishes the actual blocking branch:

| Check | Result |
|---|---|
| Old service with actual 80-record history | `LEDGER_CAPACITY`, 429 |
| Corrected service, identical project/history, Scene 16 | Quote succeeds |
| Actual stored image validation | PASS: 768×1376, 104,162 bytes |
| Scene 16 duration/settings | 10 seconds, 9:16, 480p; reference quote $0.2400 |
| Complete project before/after comparison | Unchanged; all 22 scenes including characters, authored fields, images and outputs |
| Cloud writes / provider calls in reproduction | 0 / 0 |

This is a real-data CPU service test using an explicitly synthetic **local-only** session and memory store. It is **not** a real Clerk production quote or inference. Local evidence: `docs/quote-429-20261025/reproduction.json`; private project snapshots are excluded from the commit.

## Request flow and protections

The controller requests quote only after the final Generate Video click, not on render, opening, selecting, changing options, closing/reopening, or F5. No automatic quote retry loop was found. The controller active guard and scene click guard deduplicate concurrent submission. Existing polling is for accepted jobs, not quote preparation. Multiple genuine final clicks from shared-account sessions share the quote counter; no evidence of an automatic quote storm was found.

Existing quote throttles remain 10/minute per owner and 30/minute per team. Counters have a 60-second window and are separate from paid submission. Observed last committed quote window count was 1, rather than a saturated 10/30. Failed Firestore transactions do not commit counters. These abuse throttles are unchanged because evidence identifies the history cap, not request volume, as the blocker; high simultaneous team traffic can still encounter a temporary throttle. No new capacity, account grant, budget or duration lock was introduced.

Quote does not submit a provider prediction, reserve paid spend or upload an image. Authentication, project ownership, input validation, existing admission/concurrency checks, session binding, durable idempotency and submission tracking remain unchanged. Successful CPU quotation does not prove live Clerk authorization; existing automated authorization tests cover it.

## Scoped changes

- `api/_lib/cloud-video/service.js`: remove the arbitrary 80-history-record admission check; preserve all historical records.
- `api/_lib/cloud-video/core.js`: temporary rate rejection carries remaining-window seconds.
- `api/video.js`: return valid `Retry-After`; log only safe error code/status, never credentials or media URLs.
- `api/_lib/cloud-video/store.js`: retain the existing 850,000-byte document guard; distinguish real storage exhaustion as `LEDGER_STORAGE_FULL` / 503. No history cleanup or data migration. This guard still requires future storage scaling when approached; this hotfix does not promise unlimited ledger growth.
- `src/lib/cloudVideoClient.js`: handle temporary 429 (including non-JSON platform responses), respect seconds/date Retry-After, retain selections, allow manual retry without reload; never schedule automatic retries.
- `src/Workspace/SceneVideoAction.jsx`: no misleading job-recovery action for quote errors that have no attempt ID.
- Focused regressions in the two cloud video test files.

No modal option, Camera, subtitle, duration, Audio, Gemini, Qwen or project data change. Existing outputs/history retained.

## Verification

- Focused cloud service/client tests: PASS.
- `npm test`: **489/489 PASS**, zero skipped; mock provider only.
- Scoped ESLint on eight modified code/test files: PASS.
- Production build with frontend WaveSpeed/Gemini keys empty: PASS; existing chunk-size/dynamic-import warnings remain.
- Initial restricted test/build runs failed on Windows process permission (`spawn EPERM`); rerun with process permission succeeded. These were not application failures.
- Tests include 80 completed records, two shared-owner sessions, unchanged history/spend, no provider requests for quotes, temporary window recovery, Retry-After headers/seconds/date/absent/HTML responses, retained inputs/manual retry. Existing full suite covers auth/project denial, modal modes/defaults/no Duration control, open without generation, double-submit protection and output recovery.

Vercel config remains one existing `api/video.js` function with `maxDuration:120`, no added endpoint/function. [Vercel limits](https://vercel.com/docs/functions/limitations) document 300 seconds for Hobby Fluid Compute and 4.5 MB request/response payload; quote uses small declarations, not base64 media. No timeout/payload evidence explains these 429s; no platform limits changed.

Clerk development warning is separate: prior real sign-in showed Development mode and development issuer. [Clerk environments](https://clerk.com/docs/guides/development/managing-environments) separate production and development instances/session architecture. Production migration requires a coordinated issuer/key/user-session plan; no credentials were replaced. No evidence ties this warning to the reproduced ledger failure.

## Release and remaining acceptance

Release identifiers and post-deployment checks will be appended after the scoped commit is deployed.

Browser Use was retried and reports **Local browser use is disabled in Work settings**. Real affected-project modal/Clerk quote acceptance is **NOT RUN**. CPU reproduction and public smoke checks must not be reported as browser acceptance.

Safe operator check after deployment: F5 the affected project, open Scene 16 Gen Video AI, inspect image/options, close with Hủy, reopen, then inspect another scene. **Do not click final Generate Video** during this no-paid acceptance: current controller intentionally bundles quote and subsequent submission under that final click. A quote-only authenticated diagnostic is still required when browser access is restored; no fake token or paid click is an acceptable substitute.

No paid predictions were submitted by this task. No provider upload, existing-media overwrite or Firestore mutation was performed by the diagnostic.
