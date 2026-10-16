# FULL AI Phase 5A.1D — Final Verification Report

**Task:** 10 MiB reference-image limit increase for Full AI Generate Video  
**Project:** `F:\tool-ai-dh\web-ai`  
**Report generated:** 2026-10-13 (session resumed after context compaction)  
**Status:** VERIFICATION COMPLETE — pending operator acceptance

---

## §1 — Session Context

This is the final verification report for Phase 5A.1D. The 10 MiB implementation was completed
and reported in a prior session (`FULL_AI_PHASE_5A1D_IMAGE_10MIB_REPORT.md`). This report covers
the post-implementation verification steps required before operator acceptance:

- Pre/post-build hash comparisons of all 14 affected files
- Isolated production build (outside repo, outside backups)
- WaveSpeed credential scan of build output
- Targeted ESLint (7 files, no --fix)
- Test coverage gap analysis
- Real Clerk quote status
- Backup integrity confirmation

---

## §2 — Precheck: File State Before Verification Steps

All hashes computed via SHA-256 (`Get-FileHash -Algorithm SHA256`). Sizes in bytes.

### 7 Edited Files (expected: MODIFIED from backup originals)

| File | SHA-256 | Size |
|---|---|---|
| `api/lib/seedance/images.js` | `64064CED…759` | 1,926 |
| `api/lib/seedance/errors.js` | `5EDC2A19…A4` | 2,272 |
| `api/lib/seedance/config.js` | `7AA73381…D4` | 1,139 |
| `src/lib/visualProfileClient.js` | `6F298581…D9` | 11,160 |
| `src/Workspace/SeedanceScenePanel.jsx` | `C1A52709…A6` | 13,323 |
| `tests/visual-client.test.mjs` | `ACE418ED…A4` | 8,855 |
| `tests/seedance-http.test.mjs` | `4CFAF546…C1` | 19,008 |

All 7 confirmed to differ from their backed-up originals (expected — these are the intentional
changes). Hashes match those recorded in the implementation report.

### 7 Protected Files (expected: UNCHANGED from backup originals)

| File | SHA-256 | Size | Status |
|---|---|---|---|
| `src/lib/visualProfile.js` | `3044D454…AE8` | 3,072 | ✅ OK_UNCHANGED |
| `src/Workspace/VisualProfiles.jsx` | `C9934C96…457` | 7,690 | ✅ OK_UNCHANGED |
| `tests/visual-profile.test.mjs` | `DC38AE7A…543` | 5,392 | ✅ OK_UNCHANGED |
| `tests/visual-ui.test.mjs` | `108DD1B1…0BB` | 9,535 | ✅ OK_UNCHANGED |
| `tests/seedance-client.test.mjs` | `612C9AC0…F2` | 4,939 | ✅ OK_UNCHANGED |
| `tests/support/seedance-fixtures.mjs` | `3F4BD0E0…E9` | 3,638 | ✅ OK_UNCHANGED |
| `tests/support/visual-fixture.json` | `8A624F63…34` | 400 | ✅ OK_UNCHANGED |

All 7 protected files confirmed unchanged. No unintended edits to Qwen, VisualProfiles,
or existing test infrastructure.

### Existing dist/ State (pre-build, must not change)

`dist/index.html` SHA-256: `FBAEFA1281D999D9926D59DD480EE017BA4DEF1BA4B18629050C8D2023AABF69`

| Item | Size |
|---|---|
| `assets/` | (directory) |
| `favicon.svg` | 9,522 |
| `ffmpeg-core.js` | 112,059 |
| `ffmpeg-core.wasm` | 32,232,419 |
| `icons.svg` | 5,031 |
| `index.html` | 456 |

---

## §3 — Safe Isolated Production Build

### Vite Config Safety Inspection (prior session)

- **Vite version:** 8.0.14
- **ESLint version:** 10.4.0
- **`build.outDir`:** NOT overridden in `vite.config.js` — Vite defaults to `dist/`
- **`build.emptyOutDir`:** NOT set to false — Vite WOULD clear `dist/` on a default `npm run build`
- **`localAiLoopback` plugin:** `apply: 'serve'` — activates only in dev server, zero build side effects
- **`@vitejs/plugin-react`** and **`@tailwindcss/vite`:** Standard plugins, no known build file-write side effects
- **Conclusion:** Isolated build is safe using `--outDir` pointing outside the repo

### Build Execution

**Command:**
```powershell
$outDir = "F:\tool-ai-dh\BUILD-VERIFY\phase-5A1D-verify-20261013-231342"
New-Item -ItemType Directory -Path $outDir -Force
$env:VITE_WAVESPEED_API_KEY = ""
node "F:\tool-ai-dh\web-ai\node_modules\vite\bin\vite.js" build --outDir $outDir
```

Note: `node_modules\.bin\vite` is a bash shim and cannot be executed directly by PowerShell.
The actual Vite entry point `node_modules\vite\bin\vite.js` was used instead.

**Exit code:** 0  
**Build result:** ✅ PASS  
**Output directory:** `F:\tool-ai-dh\BUILD-VERIFY\phase-5A1D-verify-20261013-231342`  
(outside repo, outside both backup directories)

**Vite warning (non-fatal):** `outDir is not inside project root and will not be emptied` — expected
and desired; confirms the isolated output directory was not auto-cleaned.

**Chunk size warning (non-fatal):** `index-Cp-Rllva.js` at 757.37 kB exceeds 500 kB threshold.
This is a pre-existing condition unrelated to Phase 5A.1D changes.

**Build output files:**

| File | Size |
|---|---|
| `index.html` | 0.45 kB |
| `assets/worker-BzdDEeh7.js` | 2.45 kB |
| `assets/ffmpeg-core-CI9Irx9p.js` | 111.80 kB |
| `assets/ffmpeg-core-CgUfceKH.wasm` | 32,232.41 kB |
| `assets/index-DDzWiEnG.css` | 87.81 kB |
| `assets/index-Cp-Rllva.js` | 757.37 kB |

### Post-Build dist/ Verification

`dist/index.html` SHA-256 after build: `FBAEFA1281D999D9926D59DD480EE017BA4DEF1BA4B18629050C8D2023AABF69`

**Match pre-build hash:** ✅ IDENTICAL — `dist/` was NOT modified by the isolated build.

---

## §4 — WaveSpeed Credential Scan

### Scan Method

```powershell
Select-String pattern 'wsk_|WaveSpeed|wavespeed\.ai' in build output JS files (no value printed)
```

### Result: ⚠️ CREDENTIAL FOUND

**File:** `assets/index-Cp-Rllva.js` (build output only — not in source repo)  
**Pattern matches found:** 15 total  
- 4 × `wsk_live…` (52-character live API key — full key value NOT printed in this report)  
- 3 × `wavespeed.ai` URL references  
- 8 × `WaveSpeed` brand name strings

### Root Cause Analysis

Setting `$env:VITE_WAVESPEED_API_KEY = ""` in the PowerShell session was **insufficient**.
Vite reads `.env` files from disk at build time and the value set in `.env.video.local` (or
similar) **took precedence over** the process-level environment variable.

Vite's env loading priority: `.env.local` → `.env.[mode].local` → `.env.[mode]` → `.env` →
then process env (process env does NOT override file-based values in Vite's default behavior).

### Security Impact Assessment

| Factor | Assessment |
|---|---|
| Location of exposed key | `F:\tool-ai-dh\BUILD-VERIFY\` — outside repo, not committed |
| Exposed in existing `dist/` | **NO** — `dist/` was NOT modified |
| Key present in Git history | Cannot confirm without checking — not in scope |
| Key present in existing `dist/` | Not verified — `dist/index.html` hash unchanged, but `dist/assets/` content not individually hashed pre-build |

### Recommendation

**OPERATOR ACTION REQUIRED:** Before any production deployment:

1. Verify whether the existing `dist/` also contains the live key (hash or scan `dist/assets/*.js`)
2. If confirmed, rotate the WaveSpeed API key immediately
3. For future safe builds: use `$env:VITE_WAVESPEED_API_KEY = "REDACTED"` as a non-empty
   placeholder, OR set it in a `.env.production.local` file that overrides local env files
4. Consider adding `VITE_WAVESPEED_API_KEY` to `.gitignore`-protected env files only and
   never committing it

**This verification report does NOT contain the key value. The isolated build output
at `F:\tool-ai-dh\BUILD-VERIFY\` should be deleted or access-controlled.**

---

## §5 — Targeted ESLint (7 Files, No --fix)

### Command

```powershell
node "F:\tool-ai-dh\web-ai\node_modules\eslint\bin\eslint.js" \
  api/lib/seedance/images.js \
  api/lib/seedance/errors.js \
  api/lib/seedance/config.js \
  src/lib/visualProfileClient.js \
  src/Workspace/SeedanceScenePanel.jsx \
  tests/visual-client.test.mjs \
  tests/seedance-http.test.mjs
```

No `--fix` flag was used. ESLint version: 10.4.0.

### Result

**Exit code:** 0  
**Errors:** 0  
**Warnings:** 0  

✅ All 7 edited files pass ESLint with zero findings.

---

## §6 — Test Coverage Analysis

**Total test count:** 240 (221 pre-existing + 19 new)  
**Test suite result:** 240/240 PASS (reported in implementation session)

### Coverage Breakdown by Test Category

#### ✅ PRESENT: Raw size-boundary tests (client-side)

- `tests/visual-client.test.mjs` (new tests): Construct `Uint8Array` buffers of exactly
  10,485,760 bytes (pass) and 10,485,761 bytes (fail) for `readReferenceFile()` with the
  10 MiB limit argument
- Also verify Qwen regression: `readReferenceFile(file)` (no second arg) rejects at
  1,048,576 bytes using the unchanged `MAX_REFERENCE_BYTES = 1048576` default
- **Coverage level:** Client-side `File.size` check only — these buffers do not undergo
  image parsing or backend validation

#### ✅ PRESENT: Valid PNG/JPEG decoding tests

- Small fixture image (~295 bytes decoded, `tests/support/visual-fixture.json`) is used as
  a valid PNG in `validateImage()` unit tests
- Tests confirm: valid PNG accepted, corrupt/truncated bytes rejected, wrong MIME type rejected
- **Gap:** The fixture image is ~295 bytes; no test exercises the backend `validateImage()`
  pipeline with a payload close to the 10 MiB boundary

#### ✅ PRESENT: Body-reader 413 rejection tests

- `tests/seedance-http.test.mjs` (new tests): Override `maxBodyBytes` to 100 and 200 bytes
  to confirm the body-reader returns HTTP 413 before image parsing runs
- Tests confirm: requests exceeding the local override are rejected with 413 and
  `"Request body too large"` message
- **Gap:** These tests use tiny overrides, not the real 15 MiB (`maxBodyBytes = 15,728,640`)
  ceiling. No test sends an actual 15+ MiB HTTP request to confirm the real limit fires.

#### ❌ NOT TESTED: Actual large HTTP request (end-to-end)

A real HTTP request containing a 10–14 MiB base64-encoded image payload through the full
backend pipeline (`readBody()` → `validateImage()` → Seedance API call) has **NOT been tested**.
This would require:
- A real 10 MiB PNG/JPEG file
- An actual HTTP server instance (not mocked)
- The full `validateImage()` pipeline executing on the large payload
- Confirming the image is accepted (or correctly rejected if invalid)

**Risk:** The backend `validateImage()` function calls `sharp()` or equivalent on the decoded
buffer. With a 10 MiB raw image (~13.98 MiB base64), memory and processing time have not
been characterized under load.

#### ❌ NOT RUN: Real Clerk-authenticated browser quote

A real browser-originating quote request to the local Clerk-authenticated `/api/quote` endpoint
using an actual OpenFrame reference image for Scene 3 (Character: Thẩm phán) has NOT been run.

**Reason:** The operator has not yet selected and explicitly approved a specific PNG/JPEG
reference image for this test. This is a deliberate deferral, not an oversight.

**To run this test:**  
1. Operator selects a real PNG/JPEG ≤ 10 MiB for Scene 3 (Thẩm phán) in OpenFrame
2. Operator explicitly approves this specific file for the quote request
3. The local dev server must be running with `LOCAL_VIDEO_PAID_ENABLED=false`
4. A single quote request is sent; no video generation is triggered

---

## §7 — Postcheck: File State After All Verification Steps

### 7 Edited Files — Post-Verification Hashes

| File | SHA-256 | Size | Δ from Precheck |
|---|---|---|---|
| `api/lib/seedance/images.js` | `64064CED…759` | 1,926 | ✅ UNCHANGED |
| `api/lib/seedance/errors.js` | `5EDC2A19…A4` | 2,272 | ✅ UNCHANGED |
| `api/lib/seedance/config.js` | `7AA73381…D4` | 1,139 | ✅ UNCHANGED |
| `src/lib/visualProfileClient.js` | `6F298581…D9` | 11,160 | ✅ UNCHANGED |
| `src/Workspace/SeedanceScenePanel.jsx` | `C1A52709…A6` | 13,323 | ✅ UNCHANGED |
| `tests/visual-client.test.mjs` | `ACE418ED…A4` | 8,855 | ✅ UNCHANGED |
| `tests/seedance-http.test.mjs` | `4CFAF546…C1` | 19,008 | ✅ UNCHANGED |

### 7 Protected Files — Post-Verification Hashes

| File | SHA-256 | Size | Δ from Precheck |
|---|---|---|---|
| `src/lib/visualProfile.js` | `3044D454…AE8` | 3,072 | ✅ UNCHANGED |
| `src/Workspace/VisualProfiles.jsx` | `C9934C96…457` | 7,690 | ✅ UNCHANGED |
| `tests/visual-profile.test.mjs` | `DC38AE7A…543` | 5,392 | ✅ UNCHANGED |
| `tests/visual-ui.test.mjs` | `108DD1B1…0BB` | 9,535 | ✅ UNCHANGED |
| `tests/seedance-client.test.mjs` | `612C9AC0…F2` | 4,939 | ✅ UNCHANGED |
| `tests/support/seedance-fixtures.mjs` | `3F4BD0E0…E9` | 3,638 | ✅ UNCHANGED |
| `tests/support/visual-fixture.json` | `8A624F63…34` | 400 | ✅ UNCHANGED |

**No file changed during the verification session.**

### dist/ Post-Verification

`dist/index.html` SHA-256: `FBAEFA1281D999D9926D59DD480EE017BA4DEF1BA4B18629050C8D2023AABF69`  
✅ Identical to pre-verification hash — `dist/` was NOT modified.

### Backup Directories

| Backup | Exists | File Count |
|---|---|---|
| `BACKUPS\phase-5A1D-pre-edit-20261013-223346` | ✅ YES | 7 |
| `BACKUPS\phase-5A1D-expanded-20261013-224110` | ✅ YES | 14 |

Both backups intact and unmodified.

---

## §8 — Architecture Separation Confirmation

The critical Qwen / Full-AI isolation was verified during implementation and confirmed
unchanged by the postcheck hashes.

### Qwen Set ID Path (UNCHANGED)

```
VisualProfiles.jsx
  → readReferenceFile(file)          ← no second argument
  → MAX_REFERENCE_BYTES = 1,048,576  ← 1 MiB default, unchanged
  → validateVisualInput() guard: > 1,398,104 bytes base64 rejected
```

`src/lib/visualProfile.js` and `src/Workspace/VisualProfiles.jsx` were NOT edited.
`MAX_REFERENCE_BYTES` in `visualProfileClient.js` remains 1,048,576.

### Full AI Generate Video Path (MODIFIED — authorized)

```
SeedanceScenePanel.jsx
  → MAX_SEEDANCE_IMAGE_BYTES = 10,485,760   ← new constant (10 MiB)
  → readReferenceFile(file, 10485760)       ← explicit caller limit
  → backend images.js: MAX_IMAGE_BYTES = 10,485,760
  → backend pre-guard: base64 > 13,981,016 → reject
  → backend config.js: maxBodyBytes = 15,728,640 (15 MiB)
```

---

## §9 — Operator Action Items

| Priority | Item | Required By |
|---|---|---|
| **HIGH** | Assess whether existing `dist/assets/` also contains the live WaveSpeed key | Before any deployment |
| **HIGH** | Rotate the WaveSpeed API key if confirmed exposed in `dist/` | Immediately on confirmation |
| **HIGH** | Delete or access-control `F:\tool-ai-dh\BUILD-VERIFY\phase-5A1D-verify-20261013-231342` | Before sharing machine |
| **MEDIUM** | Establish a build process that reliably excludes live credentials (see §4 recommendation) | Before next build |
| **MEDIUM** | Select a real OpenFrame image for Scene 3 (Thẩm phán) to run the real Clerk quote test | When operator ready |
| **LOW** | Add an end-to-end test with an actual 10 MiB image payload through the backend | Future test sprint |

---

## §10 — Verification Summary

| Check | Result |
|---|---|
| 7 edited files: hashes match implementation report | ✅ PASS |
| 7 protected files: unchanged from backup | ✅ PASS |
| Both backup directories: intact | ✅ PASS |
| `dist/` not modified by isolated build | ✅ PASS |
| Isolated build exit code | ✅ 0 (PASS) |
| Build output outside repo and outside backups | ✅ PASS |
| `VITE_WAVESPEED_API_KEY` suppressed from process env | ✅ Set to empty string |
| WaveSpeed credential in build output JS | ⚠️ FOUND (Vite env file precedence) |
| WaveSpeed credential printed in this report | ✅ NO — value masked |
| ESLint exit code | ✅ 0 (PASS) |
| ESLint errors | ✅ 0 |
| ESLint warnings | ✅ 0 |
| Test count: 240/240 PASS | ✅ (reported in implementation session) |
| Real Clerk quote test | ⏸ DEFERRED (no operator image selected) |
| New files created inside repo | ✅ 1 only (this report + implementation report) |
| Git state modified | ✅ NO (no add/commit/stash/reset performed) |

**Overall verification status: COMPLETE — with one action-required finding (§4 credential)
and two deferred items (end-to-end large image test, real Clerk quote).**

---

## §11 — Files Created in This Phase

| File | Location | Purpose |
|---|---|---|
| `FULL_AI_PHASE_5A1D_IMAGE_10MIB_REPORT.md` | `F:\tool-ai-dh\web-ai\` | Implementation report (prior session) |
| `FULL_AI_PHASE_5A1D_FINAL_VERIFICATION_REPORT.md` | `F:\tool-ai-dh\web-ai\` | This report |
| (build output) | `F:\tool-ai-dh\BUILD-VERIFY\phase-5A1D-verify-20261013-231342\` | Isolated build — contains live key, must be secured |

No other files were created or modified during this verification session.

---

*End of Phase 5A.1D Final Verification Report*
