# Full AI Image Upload Fix — 2026-10-14

**Local fix: PASS. Production: NOT FIXED / deployment blocked. Paid provider calls: NOT RUN.**

## Actual causes and environment distinction

| Stage | Finding before fix | Result after fix |
|---|---|---|
| Full AI browser picker | SeedanceScenePanel called shared readReferenceFile with 10 MiB override. Reader checked MIME/bytes and encoded the original; no pixel check. Qwen default was independently 1 MiB. | Dedicated Full AI reader checks PNG/JPEG magic, bytes and header dimensions before preview; shows filename, actual bytes/dimensions/hash. Browser decode error clears selection. |
| Real image | 590,888-byte JPEG, 1536×2752 = 4,227,072 pixels. It passed browser byte validation. | Same exact file accepted; no compression, resize, crop, metadata removal or conversion. |
| Local POST /api/local-video/quote | Authenticated request reached backend; jpeg-js maxResolutionInMP=4 / dimensions 32–4096 and 4,000,000 pixels rejected it. Generic IMAGE_INVALID obscured the actual cause. | Positive quote through real signed-in Clerk UI succeeds. |
| JSON/body reader | Old 15 MiB cap supported 10 MiB base64; it did not reject this 590 KB file. | Video-specific cap 36,001,112 bytes = 34,952,536 base64 characters for 25 MiB + 1 MiB scene/settings/envelope allowance. No global limit changed. |
| Version mismatch | Original 10 MiB UI and 4 MP backend were consistent with source; different limits were intentional but confusing. | Vite serves new panel and restarted backend serves new validation; final real quote proves agreement. |
| OpenFrame / Tải Nền | Separate R2 upload flow via /api/get-upload-url then PUT. Changes saved image URL; it is not the local quote reference input. | Unchanged; agent did not invoke it. Earlier operator changes are not claimed as immutable baseline. |
| Qwen Set ID | Separate visual-profile picker/default 1 MiB. | Unchanged; no inference. |

Clear errors now distinguish unsupported type, byte cap, detected pixel/dimension excess, damaged/undecodable image and excessive local HTTP body. Format/header errors happen before quote in the client; strict decoding/CRC errors are also enforced after authenticated HTTP admission. Request-body deadline remains 10 seconds; server request timeout 15 seconds and header timeout 10 seconds remain unchanged. Client deadline remains 75 seconds.

## Exact scope and resource bounds

Input: **PNG/JPEG ≤26,214,400 bytes (25 MiB), ≤24,000,000 pixels, 32–16,384 px per dimension**. The independent dimension bound allows 6000×4000. No added formats.

Modified existing files (complete pre-edit copies and SHA-256 verified outside repository):
- src/Workspace/SeedanceScenePanel.jsx
- src/lib/seedanceClient.js
- api/lib/seedance/images.js
- api/lib/seedance/errors.js
- api/lib/seedance/config.js
- api/lib/seedance/service.js
- tests/seedance-http.test.mjs

New source/tests: src/lib/seedanceImage.js, src/lib/seedanceImageClient.js, tests/seedance-image-admission.test.mjs. This report and docs/image-upload-fix contain evidence only.

Backup: C:/Users/Admin/AppData/Local/Temp/web-ai-image-fix-fijv7p (manifest.json). Existing tracked and untracked work was preserved. 73 unrelated protected source/config/test files match the prior baseline, including Qwen, audio, Firebase, Gemini and environment files. Existing docs modified by the legacy test writer were saved outside the repository and restored byte-for-byte from the backup. No git destructive operations, commit, push, deployment or backup deletion. Existing dist was not a build target.

Backend checks canonical base64, PNG/JPEG signatures, valid dimensions before decode, full decoding and PNG CRCs. PNG IDAT inflation has an exact scanline output bound including Adam7, preventing the library's unbounded interlaced inflater from seeing an unbounded stream. Duplicate IHDR, bad CRC, APNG and invalid/truncated streams fail closed. JPEG decoding has a 24 MP and 512 MiB decoder allocation ceiling. This is a decoder ceiling, **not a claim that total process RSS is 512 MiB**; JSON/base64/preview add bounded copies. One body-read/prepare reservation per handler bounds simultaneous buffering/decoding; at most two active provider uploads may retain image buffers. Browser hash conversion avoids a per-byte intermediate array. No dependencies were installed. Runtime verified: Node v24.16.0 (uses built-in zlib.crc32).

Authentication, origin checks, ownership, quote TTL, one-use submission, prompt/image fingerprints and both consent checks remain operational. An authenticated large quote makes no provider call.

## Fresh verification

| Check | Actual result |
|---|---|
| Full Web suite, final source | **248/248 PASS**, 0 failed, 0 skipped, sequential run 29.8s |
| Focused image + HTTP run before final PNG hardening | 57/57 PASS; final suite also includes the added Adam7 and 24MP JPEG tests |
| Targeted lint on all 10 changed/new source/test files | PASS, exit 0 |
| Isolated production build, final frontend | PASS, Vite 8.0.14; ordinary >500KB chunk warning |
| Emitted build secret scan | 10 files scanned; zero matches for the known legacy provider secret |
| Qwen 1 MiB default / existing UI tests | PASS, original utility and Qwen modules unchanged |
| 23 Full AI / 22 Semi source regression | PASS, original files and spoken text remain intact |
| Real Clerk quote with operator image | **PASS**, paid=false |
| Provider upload / prediction / billing | **NOT RUN**, no charge requested |

Commands executed:
~~~text
node --test tests/seedance-image-admission.test.mjs tests/seedance-http.test.mjs
node --experimental-vm-modules --test tests/*.test.mjs
node --experimental-vm-modules --test --test-concurrency=1 tests/*.test.mjs
node node_modules/eslint/bin/eslint.js src/lib/seedanceImage.js src/lib/seedanceImageClient.js src/lib/seedanceClient.js src/Workspace/SeedanceScenePanel.jsx api/lib/seedance/images.js api/lib/seedance/errors.js api/lib/seedance/config.js api/lib/seedance/service.js tests/seedance-image-admission.test.mjs tests/seedance-http.test.mjs
node C:/Users/Admin/AppData/Local/Temp/web-ai-image-build-final-852VYR/build.mjs
node --env-file=.env.video.local --import ./docs/phase5a2/require-safe-local-env.mjs scripts/local-video-server.mjs
~~~

Initial runner attempt was blocked by sandbox child-process EPERM; approved local test execution succeeded. Initial focused tests exposed two error-class compatibility assertions, fixed without weakening validation. A final parallel full-suite run during build had 246/248 pass: two existing CPU bridge startup deadlines failed. The complete sequential rerun passed 248/248. Existing full-suite tests include CPU parser/mock-vision Gateway subprocesses; no Gateway/Cooking source was edited and no Qwen model, GPU or real vision inference was loaded.

New regressions use real generated images: noisy 1900×1900 PNG >10 MiB (also >1 MiB), actual HTTP quote with that image, valid PNG exactly 25 MiB with CRC-valid ancillary data, +1 byte rejection, PNG and JPEG 6000×4000 decoding, >24 MP rejection, original byte/hash preservation, ordinary 1536×2752 JPEG, corrupt/truncated/signature/CRC/Adam7 cases, configured oversized HTTP request rejection and auth-first behavior. Size-only checks are not used as evidence of decoder success. Existing tests cover ownership, consent, expiration, stale quotes and single-use submission.

## Real saved-project acceptance

Project **Dự án Full AI - 12:33:38 AM**, proj_1789061618441, scene **3 — Thẩm phán**.

Original legacy Voiceover: “You relocated it directly under your tires. Ms. Harper, please explain the incident.”

File: Editing_photo_room_background_2K_20260910150656.jpeg_2K_20260912152737.jpeg from C:/Users/Admin/Downloads. SHA-256 before/after and quoted hash:
~~~text
94304d0e23551917a4e4a9ca44a8f4cc7a59d39f0b22dcca7bf1987be2d0f46b
~~~

Browser decoded preview at original 1536×2752. Final real Clerk quote: 6s, 480p, 16:9, audio=true, camera_fixed=true, seed=-1; reference price USD0.1440, not an actual bill. Prompt hash: 63fc5272ee91a5587ebc504626cabdf05690c082f556463bfaa7102dd0febec4. Client verified exact prompt/image hashes and settings before presenting quote. Settings change and image reselection each invalidated prior quote/consent. All rendered scene fields, including media URLs, match this task's before/after snapshots; no Firestore action was performed. These are DOM comparisons, not a Firestore export.

Evidence: docs/image-upload-fix/image-fix-live-final.json and image-fix-live-final.png. Both consents unchecked and paid button disabled. Backend remains LOCAL_VIDEO_PAID_ENABLED=false; no provider upload, prediction or automatic retry.

## Provider compatibility

Official [Seedance documentation](https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-v1.5-pro-image-to-video) specifies JPG/PNG images, but no numerical model-specific byte/pixel/dimension cap was found. Those model limits and mandatory preprocessing requirements are **UNVERIFIED**. Official [upload documentation](https://wavespeed.ai/docs/upload-files-api) states a 209,715,200-byte generic upload ceiling and exact-byte PUT to a temporary upload URL. Generic storage acceptance is not proof of Seedance acceptance of a 25 MiB/24 MP image.

UI explicitly distinguishes local admission/quote from provider acceptance. No derivative is necessary to fix the established local blocker; no optimizer was implemented or silently applied. If provider constraints later require a derivative, a separately approved flow must show the proposed change and bind consent/hash to that derivative. No real provider acceptance is claimed.

## Production findings and deployment preparation

Read-only GET of https://www.aivideomaker.live returned bundle **/assets/index-BvTeWk4S.js** (hash in verification.json). It contains OpenFrame/Avatar upload UI but no /api/local-video/quote or new Set ID panel markers. GET /api/local-video/quote returned **200 text/html**, not a functioning JSON video API. Exact deployed Git commit and Vercel project linkage are **UNVERIFIED**; no .vercel/project.json is present. Repository vercel.json rewrites /api/* and SPA paths; api/ has no local-video production handlers. Current source intentionally hides video controls in production and readVideoConfig refuses VERCEL/production.

Production browser requires its own Clerk sign-in. Operator login was requested; no authorized signed-in production picker was available. **Actual production upload rejection remains NOT REPRODUCED / unknown**. No user image was uploaded there. Existing R2 source can report generic “Không thể upload Ảnh Nền vĩnh viễn.” for signing/PUT failures; there is no evidence to assign that failure to the local 4 MP validator.

**Critical confirmed exposure:** the public JS bundle contains an exact match to the existing local legacy VITE_WAVESPEED_API_KEY. Value was never printed or copied into backend config. Treat this credential as exposed; operator should authorize revocation/rotation and review usage. No rotation was performed. Removing it from a production build breaks current direct-client Generate Audio unless that flow is migrated server-side or the operator accepts an explicit temporary interruption.

Safe isolated build: C:/Users/Admin/AppData/Local/Temp/web-ai-image-build-final-852VYR/output. Its launcher sets both WaveSpeed variables to empty directly in Node before importing Vite, asserts the frontend variable is present-and-empty, and paid=false. This avoids the observed PowerShell empty-assignment issue. Known-secret exact-match scan is PASS; it is not a universal proof about unknown credentials. Existing dist and prior isolated builds were preserved.

**Deployment is NO-GO, not merely awaiting a deploy click.** Frontend-only deployment cannot fix production video. [Vercel Functions](https://vercel.com/docs/functions/limitations) limit request bodies to 4.5 MB, below the 36 MB video JSON envelope. A supported authenticated backend is required: either a separately hosted Node service behind an approved same-origin route with TLS, exact Clerk issuer/authorized-party, bounded decoder/concurrency/body limits and server-only keys; or authenticated private object-storage admission followed by server verification with durable ownership/TTL/single-use records. Do not expose localhost or reuse the current unauthenticated R2 signer as a video admission bypass. This backend expansion is not silently implemented in an image-limit patch.

Remaining operator actions, in order: (1) sign in to production and identify the failing picker/error for read-only reproduction; (2) approve secure audio credential remediation/rotation or an explicit temporary audio interruption; (3) approve the production backend/hosting and secret configuration, then validate in staging with paid=false; (4) approve deployment only after those blockers are resolved. A first paid scene is a separate approval after a fresh exact quote. No deployment, DNS, Git push, audio change or paid test was performed.
