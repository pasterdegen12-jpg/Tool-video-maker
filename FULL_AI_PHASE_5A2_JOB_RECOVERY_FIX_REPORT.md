# Full AI Phase 5A.2 — Job recovery fix

Updated: 2026-10-15 (Asia/Saigon).

**Implementation and mock verification: PASS. Fresh real Clerk quote: PASS. New paid test: NOT RUN / NOT READY.** No provider upload, upload ticket, prediction POST, deployment or Git push occurred in this task. Paid remains false.

## Incident and root cause

The old service kept quotes and jobs in in-memory Maps. The browser received its local job ID only after upload plus prediction submission completed. Page refresh lost the browser controller; backend termination lost all IDs and stage information. A client disconnect by itself did not necessarily stop the provider request, but there was no durable record to consult afterward. Transport timeout, dropped connection, invalid response or process interruption after a POST could therefore leave a potentially charged request without a recoverable ID. The exact interruption trigger and original upload/submission outcome remain UNKNOWN; absence of a history row does not prove failure.

The provider upload URL becomes available after its authenticated upload-ticket response; it is temporary and is not persisted. The prediction ID becomes available in the submission response. The new callback writes a valid model-matching ID before validating the rest of that response or its output URLs.

## Implemented local durability

Journal directory: C:/Users/Admin/AppData/Local/WebAI/VideoAttempts. It is outside the project and Vite serving root; no Firestore dependency.

- A random 48-hex attempt ID is persisted at QUOTED and returned as attempt_id. The same ID is the eventual job_id. The existing in-memory, expiring quote still must be present for submit; a restart never silently replays a quote.
- The consented request persists UPLOADING before any upload call and returns HTTP 202 with its ID promptly. A bounded background task continues even when the client stops waiting.
- Stages: QUOTED → UPLOADING → UPLOADED → SUBMITTING → SUBMITTED → POLLING → COMPLETED / FAILED / UNKNOWN. Small timestamped transitions are retained in the record.
- SUBMITTING is fsynced before the potentially charged POST. Provider ID is fsynced immediately on receipt. If subsequent response validation fails but an ID is known, the job remains recoverable by GET.
- On restart, interrupted SUBMITTING without an ID becomes UNKNOWN, never FAILED. UPLOADING/UPLOADED interrupted before the POST are FAILED with their prior stages retained. Known-ID SUBMITTED/POLLING remains recoverable. Startup itself makes no provider call.
- Existing authenticated GET /api/local-video/jobs/:id may poll a known provider ID even while paid=false. New GET /api/local-video/attempts/:id reads only local metadata. GET /api/local-video/attempts?scope=<project/scene hash> lists up to 20 matching attempts for the exact Clerk user/session.
- Ownership uses hashes of issuer/user/session. Same-user different-session access is denied, preserving the existing security model. Cross-session recovery is deliberately not introduced. A different session can be told only that an unresolved submission blocks the same user, without exposing its record.
- The Storyboard keeps its existing editor and adds “Tìm / khôi phục lần gửi” and “Khôi phục / kiểm tra trạng thái”. These actions never call submit. UI shows upload, submission, waiting, ready, failed and unknown states, plus the local attempt ID. No scene/media persistence callback was added.

## Storage, permissions and failure behavior

Each strict, checksummed record contains only IDs/hashes, numeric timestamps, stage/state, bounded transition history, provider ID and the eventual output URL. It does not contain prompts, screenplay text, API keys, JWTs, cookies, raw images, base64 or signed upload tickets. Output URLs are private journal data and may expire.

Writes use an exclusive temporary file, file fsync and atomic rename. Windows permits up to 100 ms of retry for transient local rename locks only; provider POSTs are never retried. An interrupted/failed temporary write or corrupt/checksum-invalid record blocks startup/admission and is preserved for investigation. No automatic deletion or reconstruction of corrupt evidence. Directory fsync is used on POSIX; testing establishes process-crash recovery, not universal storage-controller/power-loss guarantees on Windows.

Windows ACL inheritance is removed, current-user and SYSTEM full access are granted, and saved ACLs are checked for other grants, including existing child records. POSIX uses directory 0700/files 0600. A PID lock permits only one backend writer; a live or unverifiable owner blocks startup, a dead owner can be recovered. Symlinks, non-regular files and hard-linked records are rejected.

Limits: 256 records, at most 64 KiB per record and 400 transition entries. Quotes expire after two minutes. Completed/failed records have 30-day retention and are pruned on new record creation. Active/UNKNOWN records are not silently aged out: they retain a bounded slot and eventually cause capacity denial until reviewed. This exception avoids erasing unresolved billing evidence; there is no automatic paid retry or journal-clearing UI.

## Retry / idempotency safeguards

Both existing consent checks, exact quote fingerprint, original prompt/image validation, quote expiration and paid flag remain enforced. Durable deduplication uses the same user and a stable scene/profile/settings/image fingerprint, independent of quote time, price timestamp or Clerk session. An existing matching consumed attempt blocks a new POST during retention. Any UNKNOWN attempt blocks new submissions for that user. No self-service override, hidden reset or automatic reconciliation is implemented. Operator review and a separately authorized decision are needed for an unresolved attempt.

Official [submission documentation](https://wavespeed.ai/docs/submit-task), [API integration](https://wavespeed.ai/docs/docs-api) and [JavaScript SDK documentation](https://wavespeed.ai/docs/javascript-sdk) warn against blind submission POST retries. No documented Seedance submission idempotency-key contract was established in the reviewed references. Local deduplication is not a claim of provider-side exactly-once execution. Webhook delivery idempotency is a different mechanism and is not used here.

## Verification

| Check | Actual result |
|---|---|
| Existing focused HTTP regressions | 51/51 PASS |
| New journal/restart/crash tests | 11/11 PASS |
| Full Web suite, final source | 262/262 PASS; zero failed/skipped; 51.7 s |
| Targeted lint | PASS |
| Safe isolated production build | PASS; ordinary >500 kB chunk warning |
| Known-secret scan of emitted artifacts | 10 files; zero matches for configured legacy/backend key values |
| Protected source/config/test files | 72/72 unchanged against verification snapshot |
| Real Clerk journal lookup | PASS; no pre-fix record exists in the new journal |
| Real Clerk quote with original JPEG | PASS; paid=false |
| Scene integrity | PASS for rendered original fields before/after; zero changes |
| New provider upload / prediction | NOT RUN |

Tests cover accepted/rejected/ambiguous provider responses, upload failure, two actual mock subprocess terminations before/after ID persistence, restart recovery with paid=false, completed result recovery, duplicate blocking across restart, exact session ownership/origin/auth checks, corrupt/partial files, writer exclusion, capacity/pruning, image/credential exclusion, GET-only client/UI recovery, unchanged existing quote/consent and 25 MiB/24 MP image tests. Existing 23 Full AI / 22 Semi regressions passed. CPU bridge/mock-vision tests remain part of the full suite; no real Qwen/GPU inference was run.

Initial new tests revealed a test-variable typo, independent subprocess test signing keys and a Windows file-read/rename race; these were corrected before the final complete run. Initial sandbox test launch returned EPERM; approved mock-only execution then completed. No auto-review rejection remains.

Commands executed:
~~~text
node --test tests/seedance-http.test.mjs
node --experimental-vm-modules --test tests/seedance-client.test.mjs tests/seedance-ui.test.mjs
node --test tests/seedance-recovery.test.mjs
node --experimental-vm-modules --test --test-concurrency=1 tests/*.test.mjs
node node_modules/eslint/bin/eslint.js [14 changed/new source/test/helper paths]
node C:/Users/Admin/AppData/Local/Temp/web-ai-recovery-build-lHmhIT/build.mjs
node --import ./docs/job-recovery/safe-local-env.mjs scripts/local-video-server.mjs
node --import ./docs/job-recovery/safe-local-env.mjs node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
~~~

The isolated build explicitly empties both provider environment variables before importing Vite and outputs to C:/Users/Admin/AppData/Local/Temp/web-ai-recovery-build-lHmhIT/output. Existing dist/builds/backups are untouched. Logs and evidence: docs/job-recovery/full-tests.log, lint.log, build.log, verification.json, live-prepared.json and screenshots.

## Exact file changes / backups

Modified existing files:
- api/lib/seedance/service.js
- api/lib/seedance/provider.js
- api/lib/seedance/config.js
- api/lib/seedance/errors.js
- scripts/local-video-server.mjs
- src/lib/seedanceClient.js
- src/Workspace/SeedanceScenePanel.jsx
- tests/support/seedance-fixtures.mjs
- tests/seedance-client.test.mjs
- tests/seedance-ui.test.mjs

New implementation/tests: api/lib/seedance/journal.js, tests/seedance-recovery.test.mjs, tests/support/seedance-crash-worker.mjs. New acceptance helper/evidence: docs/job-recovery/ and this report.

Every modified existing file was copied before editing with SHA-256 manifest to C:/Users/Admin/AppData/Local/Temp/web-ai-job-recovery-backup-3L1KwZ. The legacy test's docs/phase5a/mock-http.json output was saved separately as new evidence and its original bytes restored from that backup. No unrelated source, audio, Qwen/Set ID, Cooking, Gateway, Firebase, Gemini or existing media URLs were edited. No Git reset/clean/restore/checkout/stash/commit/push.

## Earlier attempt reconciliation

Prior read-only history and billing evidence remains docs/phase5a2/paid-attempt-recovery-2026-10-15.json. The history response was HTTP 200/code 200 with data.items=null; billing was items=[] and has_more=false. The recovery script used optional chaining rather than a strict history schema validator. Null yielded no records to inspect; it is not proof of a failed submission. The public history documentation presents an array, so null should be reported explicitly, as it is here, rather than used as authorization to retry. This application has no automatic history reconciliation parser.

There is no known recoverable provider ID for the old attempt and no matching record was returned by those prior scoped queries. Its final outcome and actual charge remain UNKNOWN. No new authenticated provider history/billing calls were made during this fix, and the new journal cannot retroactively recover a record that was never written.

## Preparation for the next separately approved test

Project: Dự án Full AI - 12:33:38 AM (proj_1789061618441). Scene 3 — Thẩm phán.

Spoken text: You relocated it directly under your tires. Ms. Harper, please explain the incident.

Original image: Editing_photo_room_background_2K_20260910150656.jpeg_2K_20260912152737.jpeg; 590,888 bytes; 1536×2752. SHA-256: 94304d0e23551917a4e4a9ca44a8f4cc7a59d39f0b22dcca7bf1987be2d0f46b. No resize, recompression or metadata removal. Actual preview: docs/job-recovery/live-image-and-recovery.png.

Settings: duration=6, resolution=480p, aspect_ratio=16:9, generate_audio=true, camera_fixed=true, seed=-1. Exact prompt SHA-256: 63fc5272ee91a5587ebc504626cabdf05690c082f556463bfaa7102dd0febec4.

~~~text
Use the original authored values below. Do not add or paraphrase spoken dialogue, actions or camera instructions. Only ORIGINAL SPOKEN DIALOGUE is spoken text.

ORIGINAL CONTEXT:
opening

ORIGINAL CHARACTER:
Thẩm phán

ORIGINAL ACTION:
Giữ nguyên góc nhìn của nhân vật, không thay đổi hướng nhìn. Cảm xúc lạnh lùng, dứt khoát lật mở hồ sơ. Cử chỉ tay của nhân vật theo hội thoại và cảm xúc của nhân vật. Không đập búa, không gõ búa, không cầm búa

ORIGINAL CAMERA:
Camera cố định, không được di chuyển camera, không được thay đổi góc hay độ zoom của camera. Không có nhạc nền

ORIGINAL SPOKEN DIALOGUE:
You relocated it directly under your tires. Ms. Harper, please explain the incident.

ORIGINAL TONE:
Nghiêm nghị (Lạnh lùng)
~~~

Endpoint for a future approved request only: POST https://api.wavespeed.ai/api/v3/bytedance/seedance-v1.5-pro/image-to-video.

Fresh real Clerk quote PASS, USD 0.1440 reference; both consent boxes unchecked, paid submit disabled. Quote expires after two minutes and must be renewed after any backend restart. Official model pricing lists 480p/audio USD 0.12 per five seconds with linear duration; no actual new charge. [Seedance model documentation](https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-v1.5-pro-image-to-video). Numerical model-specific image limits/provider acceptance are still unverified. Generic upload limits do not prove model admission.

Local services listen only on 127.0.0.1:8790 and 127.0.0.1:5173. The acceptance preload forces paid=false and both WaveSpeed key variables empty at runtime. .env.video.local also remains paid=false and VITE_WAVESPEED_API_KEY empty. This task did not write the new key sent in chat into configuration: it too is now exposed. The existing file key is unchanged from the prior recovery check; secure replacement is NOT COMPLETE. Operator must revoke exposed keys and install a new backend key directly in the local file, never chat. No credential values are in this report or journal.

**Stop / readiness:** code and real local quote are ready; another paid test is not authorized by this task. Before a new paid request, securely replace the key, reconcile the old attempt as far as possible (UNKNOWN is not FAILED), then obtain NEW explicit approval for exactly one request including transfer of the original image bytes/metadata and exact prompt, the settings/price above and possible charges despite unsatisfactory quality. Do not upload or submit automatically. Do not use the empty-key acceptance preload to launch a paid test.

Final working-tree check: git diff --check reports pre-existing trailing whitespace in src/Workspace/StoryboardTab.jsx at lines 15 and 218. That protected file was not edited by this task; the issue was left intact. Targeted lint and final build remain PASS.
