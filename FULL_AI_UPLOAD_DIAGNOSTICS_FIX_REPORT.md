# Full AI — Upload diagnostics and real scene 3 verification

Completed 2026-10-16, Asia/Saigon. Scope: diagnose and repair image upload only; paid generation remains disabled.

**Result: real upload PASS.** The exact original scene 3 JPEG received HTTP 200 for both the WaveSpeed upload ticket and the signed image PUT. No video prediction was submitted. This does not establish Seedance output quality or successful video generation.

## Input and real observations

- Project: Dự án Full AI - 12:33:38 AM, `proj_1789061618441`; scene 3 — Thẩm phán.
- File: `C:/Users/Admin/Downloads/Editing_photo_room_background_2K_20260910150656.jpeg_2K_20260912152737.jpeg`.
- Original JPEG: 590,888 bytes, 1536 × 2752; no compression, resizing or replacement.
- SHA-256 before/after: `94304d0e23551917a4e4a9ca44a8f4cc7a59d39f0b22dcca7bf1987be2d0f46b`.
- The diagnostic uses the existing production image decoder/validator, shared uploader and DNS-pinned HTTPS transport. It does not invoke Clerk, quote or video submission endpoints and does not fabricate a JWT.

| Run, Asia/Saigon | Changes under test | Ticket | PUT | Result |
|---|---|---|---|---|
| Oct 15, 23:03:59 | Diagnostics added; original upload checks | HTTP 200 | NOT RUN | FAIL: `TICKET_VALIDATE / INVALID_PROVIDER_RESPONSE / TICKET_FILENAME` |
| Oct 15, 23:07:14 | Accept a validated provider-assigned filename | HTTP 200 | HTTP 403 | FAIL: `IMAGE_PUT / UPLOAD_FAILED / HTTP_STATUS` |
| Oct 16, 20:42:57 | Exact Content-Length for buffered request bodies | HTTP 200 | HTTP 200 | **PASS** |

All three runs recorded `paid_enabled=false` and `prediction_requests=0`. Each was one deliberate diagnostic run; there is no automatic upload or prediction retry loop. A command issued before the third input file existed refused locally, made no network call and did not create a fourth run.

Run 2 and run 3 confirm `filename_matches_request=false`, `filename_is_string=true`, `size_matches=true`, `type_is_image=true`, and `method_is_put=true`. Successful run 3 took approximately 1.98 seconds from uploader start to completion, excluding initial image decoding.

## Cause and repair

**Confirmed defect: requiring the response filename to equal the request filename.** WaveSpeed returned a different storage filename. The application rejected the otherwise HTTP-200 ticket before PUT. The returned name is metadata; no local path or URL is constructed from it. The fix accepts a bounded filename with the correct image suffix and rejects control characters, path separators, incompatible extensions and oversized values. Type, exact byte count, content type, ticket expiry, allowed headers and URL safety checks remain active.

**Transport correction: explicitly send the exact Content-Length.** The previous `req.write(body)` path supplied no length and allowed chunked framing. Buffered JSON and image requests now carry their actual UTF-8/buffer byte length. Conflicting lengths, duplicate length headers and explicit transfer encoding fail before network access. Caller headers and image bytes are not mutated; the backend key is never copied into the signed PUT.

After that transport correction, the exact image PUT passed with HTTP 200. The earlier 403 body was not retained, so its provider-specific cause is **not independently proven**; it would be inaccurate to claim the provider explicitly reported a missing Content-Length or signature mismatch. The fixed upload path is verified to work. No further network experiment was made after success.

The flow continues to use the documented ticket followed by signed PUT; it does not switch endpoints, rewrite storage hosts or weaken URL validation. Reference: [WaveSpeed upload API](https://wavespeed.ai/docs/upload-files-api).

## Error evidence now retained

`api/lib/seedance/diagnostics.js` admits only fixed application-owned enums, a numeric HTTP status (or null) and a timestamp. It records:

- Ticket request vs ticket validation.
- Upload/download URL checks vs signed image PUT.
- Upload-completion journal write vs prediction-submission phase.
- Safe failure code/reason, including allowlisted storage XML error classifications when returned.

Raw response bodies, provider messages, signed URLs, headers, credentials, image bytes and exception causes are excluded. `service.js` persists the sanitized `failure` in the existing attempt record and writes a bounded structured fallback log before attempting persistence, so a journal write failure can still be diagnosed. Failed upload status messages identify the failed step and available HTTP status. No frontend component or original screenplay field needed editing.

The journal accepts old records without `failure`; those records are not migrated or given invented diagnostics. Unknown/extra diagnostic fields are rejected. Existing durability, single-writer, consent, Clerk, ownership, deduplication and uncertain-submission protections are retained.

The upload-only diagnostic has no prediction method or HTTP server route. Its CLI requires `--run`, exact image SHA-256, an unused report path, a backend key, empty frontend key and `LOCAL_VIDEO_PAID_ENABLED=false`. Its request boundary permits one ticket POST and at most one image PUT. Reusing the report path fails before network access. A report left RUNNING after interruption requires review; it is not automatically retried.

## Verification

| Verification | Actual result |
|---|---|
| Existing regressions plus new tests | **292/292 PASS** — baseline 262 plus 30 added tests |
| Targeted production-source lint | **PASS** |
| Production build, both WaveSpeed environment keys empty | **PASS**, existing large-chunk warning only |
| Build secret scan | 10 output files scanned; configured credential values/key pattern not found |
| Exact image integrity | **PASS**, same SHA-256 and byte count |
| Prior protected-file manifest | 72 checked; only transport and its tests changed as intended |
| Original FAILED attempt | Byte-for-byte preserved through backend startup |
| Live backend missing-session request | HTTP **401** |
| Live real Clerk UI acceptance after this repair | **NOT RUN**, no UI submission requested |
| Qwen/Cooking/Gateway/GPU work | **NOT RUN** |
| Video generation/output review/billing reconciliation | **NOT RUN** in this upload-only task |

CPU tests cover assigned filenames, invalid metadata, expiry, credentials in upload headers, each failed upload stage, response sanitization, durable error recovery with paid=false, old journals, corrupt diagnostic fields, local persistence failure before prediction, unchanged paid gates, precise HTTP framing and the diagnostic one-shot guard. Mock results are separate from the three real-upload evidence files.

Commands actually executed include:

```text
node --test tests/seedance-http.test.mjs tests/seedance-transport.test.mjs tests/seedance-recovery.test.mjs
node --test tests/seedance-upload-diagnostics.test.mjs
node --test tests/seedance-upload-diagnostics.test.mjs tests/seedance-transport.test.mjs
node scripts/diagnose-video-upload.mjs --run docs/upload-diagnostics/run-1-input.json
node scripts/diagnose-video-upload.mjs --run docs/upload-diagnostics/run-2-input.json
node scripts/diagnose-video-upload.mjs --run docs/upload-diagnostics/run-3-input.json
npm test
node node_modules/eslint/bin/eslint.js api/lib/seedance/provider.js api/lib/seedance/transport.js api/lib/seedance/service.js api/lib/seedance/journal.js api/lib/seedance/diagnostics.js
node docs/upload-diagnostics/build-safe.mjs
node docs/job-recovery/persistent-local-services.mjs backend
node docs/job-recovery/persistent-local-services.mjs frontend
```

The initial sandboxed test command could not spawn test processes (`EPERM`); it passed after running with approved process permissions. This was an execution-environment failure, not a test assertion failure.

## Final local state and boundaries

- `.env.video.local` was not edited in this task; paid flag remains false, frontend WaveSpeed key empty.
- Backend: PID 15196, `127.0.0.1:8790`, paid=false. Its existing journal startup handled the dead prior writer normally; no manual lock bypass was used.
- Vite: PID 1548, `127.0.0.1:5173`; both WaveSpeed keys empty in the frontend process.
- No prediction endpoint, Firestore write, original screenplay/media update, audio operation, GPU operation or deployment was performed.
- No API key, signed storage URL or raw provider response is included in this report or the diagnostic evidence.
- The previous durable attempt `453784079c656769af51a6b6effc04bc6e91163f80b4e722` remains FAILED; upload success does not change that old attempt or create a video. The older pre-journal attempt remains UNKNOWN.
- Existing duplicate protection for the old FAILED input was not bypassed. A future paid attempt requires a separate explicit operator decision and an approved retry path; this task does not authorize it.

## Changed files and evidence

Production files modified: `api/lib/seedance/provider.js`, `transport.js`, `service.js`, `journal.js`. Added `api/lib/seedance/diagnostics.js` and the local-only `scripts/diagnose-video-upload.mjs`. Added `tests/seedance-upload-diagnostics.test.mjs`; extended `tests/seedance-transport.test.mjs`.

Production-file backups, input descriptors, three sanitized real upload reports, logs, build output and `verification.json` are under `docs/upload-diagnostics/`. Prior reports and backups are preserved. No Git reset/clean/restore/commit/push was used.

Rollback should restore only these scoped source changes and preserve all attempt files. Older code cannot read newly added failure metadata; do not silently downgrade the journal reader or strip evidence. The original live FAILED record still has its original format and bytes.

**Upload repair verified. Paid video generation remains disabled and untested after this repair.**
