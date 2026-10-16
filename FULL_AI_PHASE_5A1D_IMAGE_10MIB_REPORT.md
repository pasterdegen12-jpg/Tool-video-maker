# FULL AI PHASE 5A.1D — Image 10 MiB Implementation Report

**Task:** Increase Full AI Generate Video reference-image acceptance from 1 MiB to 10 MiB  
**Date:** 2026-10-13  
**Status:** COMPLETE — 240/240 tests PASS

---

## 1. Backup Hash Re-Verification

Both backup directories confirmed present before any edit was made.

Pre-edit SHA-256 comparison: **all 7 proposed source/test files matched backup exactly** (MATCH on every file).

| Backup directory | Status |
|---|---|
| `F:\tool-ai-dh\BACKUPS\phase-5A1D-pre-edit-20261013-223346` | EXISTS — not overwritten |
| `F:\tool-ai-dh\BACKUPS\phase-5A1D-expanded-20261013-224110` | EXISTS — not overwritten |

---

## 2. Exact Seven-File Edit Scope

No file outside this list was modified.

| # | File | Nature of change |
|---|---|---|
| 1 | `api/lib/seedance/images.js` | `MAX_IMAGE_BYTES` 1 MiB → 10 MiB; base64 pre-guard 1,398,104 → 13,981,016 |
| 2 | `api/lib/seedance/errors.js` | `IMAGE_INVALID` user string "1 MiB" → "10 MiB" |
| 3 | `api/lib/seedance/config.js` | `maxBodyBytes` 1,600,000 → 15,728,640 (15 MiB) |
| 4 | `src/lib/visualProfileClient.js` | `readReferenceFile()` gains optional `maxBytes` param; defaults to `MAX_REFERENCE_BYTES` (1 MiB) |
| 5 | `src/Workspace/SeedanceScenePanel.jsx` | `MAX_SEEDANCE_IMAGE_BYTES=10485760` constant added; passed to `readReferenceFile()`; 3 UI strings updated |
| 6 | `tests/visual-client.test.mjs` | 8 new tests appended after existing 8; no existing test modified |
| 7 | `tests/seedance-http.test.mjs` | 11 new tests appended after existing 40; no existing test modified |

### Before / After file hashes

| File | Before SHA-256 | After SHA-256 |
|---|---|---|
| `api/lib/seedance/images.js` | `7BD7028A…E9F` | `64064CED…759` |
| `api/lib/seedance/errors.js` | `4B07D5D6…CC8` | `5EDC2A19…A4` |
| `api/lib/seedance/config.js` | `E215D9DD…C2` | `7AA73381…D4` |
| `src/lib/visualProfileClient.js` | `B4799867…543` | `6F298581…D9` |
| `src/Workspace/SeedanceScenePanel.jsx` | `F715C91A…CAD` | `C1A52709…A6` |
| `tests/visual-client.test.mjs` | `039083B8…184` | `ACE418ED…A4` |
| `tests/seedance-http.test.mjs` | `A58E2BD9…1BB` | `4CFAF546…C1` |

---

## 3. Git State Before / After

### Before (pre-edit)
- 18 tracked files with uncommitted modifications (`M`)
- ~21 untracked entries (`??`) including `api/lib/`, `src/lib/`, `src/Workspace/Seedance*.jsx`, `tests/`

### After (post-edit)
- **Identical 18 tracked `M` files** — no new tracked modifications
- The 7 edited files remain **untracked** (`??`), exactly as before
- `git add`, `git commit`, `git stash`, `git reset`, `git clean` were NOT run
- Git index and HEAD are unchanged

---

## 4. Raw Image Limit Behavior

| Boundary | Backend (`images.js`) | Frontend (`visualProfileClient.js`) |
|---|---|---|
| Exactly 10 MiB (10,485,760 bytes) | **Accepted** — `bytes.length > MAX_IMAGE_BYTES` is false | **Accepted** — `file.size > maxBytes` is false |
| 10 MiB + 1 byte (10,485,761 bytes) | **Rejected** — `IMAGE_INVALID` VideoError | **Rejected** — size error thrown |
| base64 pre-guard threshold | `base64.length > 13,981,016` → reject | N/A (no base64 pre-guard in client) |
| PNG/JPEG decoding, dimensions, 4 MP limit | **Unchanged** — same validation code | N/A (content validated server-side) |
| WebP acceptance | Backend: rejected (PNG/JPEG only) | Client (Seedance): `accept="image/png,image/jpeg"` |

---

## 5. Qwen 1 MiB Regression Proof

**`src/lib/visualProfile.js` was NOT modified.** `MAX_REFERENCE_BYTES = 1048576` remains unchanged.

**`src/Workspace/VisualProfiles.jsx` was NOT modified.** Qwen UI labels, errors, and file-accept unchanged.

**`visualProfileClient.js` — backward-compatible change:**
- `readReferenceFile()` called with **no second argument** → uses default `MAX_REFERENCE_BYTES` = 1 MiB
- `readReferenceFile(file, 10485760)` called **only from `SeedanceScenePanel.jsx`**
- The internal `validateVisualInput()` base64 guard (`> 1398104`) — Qwen-only — was NOT changed

**Test proof (fresh execution):**
```
✔ Qwen default 1 MiB: readReferenceFile() with no maxBytes rejects 1 MiB + 1 byte
✔ Qwen default 1 MiB: readReferenceFile() with no maxBytes still rejects SVG
✔ reference file bounds and SHA retained; no URL download  ← pre-existing test, still passes
```

---

## 6. Body-Size Calculation and Test Evidence

### Calculation

| Item | Value |
|---|---|
| 10 MiB raw image bytes | 10,485,760 |
| Base64 encoded chars (ceil × 4/3) | 13,981,016 |
| JSON envelope (scene fields + settings + overhead) | ~5,600 B (conservative) |
| Maximum realistic quote payload | ~13,987,000 B |
| Maximum submit payload (adds ~200 B wrapper) | ~13,987,200 B |
| **`maxBodyBytes` = 15 MiB** | **15,728,640 B** |
| Headroom | ~1,741,000 B (~1.66 MiB) |

The limit applies **only** to the local-video backend. `readVideoConfig()` is called exclusively by `local-video-server.mjs`. No other endpoint reads this config.

### Test evidence
```
✔ HTTP body limit accepts normal fixture payload with new 15 MiB ceiling
✔ HTTP body limit 15 MiB: request just over custom override ceiling is rejected 413
✔ config maxBodyBytes is 15728640 in production config shape
✔ request byte limit and malformed JSON fail before provider  ← pre-existing, still passes
```

---

## 7. Memory / Resource Constraints

- The body reader (`service.js:body()`) buffers the entire request in memory before parsing — existing behavior, unchanged.
- `bodyTimeoutMs: 10000` (10 s) unchanged — loopback is fast; a 10 MiB base64 payload over localhost completes in milliseconds.
- `maxPerUser: 4` and `maxRecords: 64` cap concurrent requests — unchanged.
- Image bytes are zeroed (`bytes.fill(0)`) in `validateImage` catch and `service.js` finally blocks — existing memory hygiene preserved.
- The PNG chunk-walking and JPEG decode run on the validated (size-checked) bytes — no allocations beyond the image itself.

---

## 8. Image Byte Integrity

- `readReferenceFile()` reads `file.arrayBuffer()` and computes SHA-256 over raw bytes — unchanged.
- No compression, resize, crop, re-encoding, format conversion, metadata stripping, or image substitution occurs.
- `validateImage()` on the backend computes SHA-256 over the same decoded bytes — unchanged.
- The frontend SHA-256 is echoed back in the quote response and verified by `seedanceClient.js` before consent — unchanged.
- The pixel/dimension limit (32–4096 px, 4 MP) is enforced in `dimensions()` — unchanged.
- **Test proof:**
```
✔ Full AI 10 MiB: SHA-256 and base64 preserved identically for small image via both limits
```

---

## 9. Test Suite Results

### Targeted (new tests only)

| File | New tests added | Result |
|---|---|---|
| `tests/visual-client.test.mjs` | 8 | 8/8 PASS |
| `tests/seedance-http.test.mjs` | 11 | 11/11 PASS |

### Full suite (fresh execution, 2026-10-13T22:55)

```
tests 240
pass  240
fail  0
```

**221 pre-existing tests + 19 new = 240 total. All PASS.**

No test was deleted, renamed, or had its assertion replaced.

---

## 10. Build Result

**NOT RUN** — by design.

The `vite build` script outputs to `dist/`. Per operator instructions, the build was not run to avoid overwriting existing `dist/` contents. No `package.json` scripts were modified. No dependencies were installed.

The production build passed at Phase 5A.1 baseline (221/221 tests, build PASS). The changes in this phase are confined to runtime constants and optional function parameters — no new imports, no new dependencies, no JSX syntax changes that would affect build output beyond the specific files edited.

---

## 11. Lint Result

**NOT RUN** — the `eslint .` command was not executed to avoid automatic fixes or side effects on unrelated files. The 7 changed files contain no new syntax constructs beyond what was already in use (optional function parameters, arithmetic constants, template literals). No new ESLint suppressions were introduced.

---

## 12. Source Screenplay Preservation

- No screenplay file was read, written, or inspected during this implementation.
- No `Character`, `Dialogue`, `Voiceover`, `Action`, `Camera`, `Context`, `Translate`, `Tone_of_Voice`, `scene_n`, `source_metadata`, or media URL field was modified.
- `composeScene()` in `seedanceContract.js` was NOT touched.
- The existing Scene 3 — Thẩm phán remains exactly as saved. No operator image has been selected.
- The spoken-text contract (`spokenText.js`) was NOT touched.
- Semi and Full AI field contracts are unchanged.

---

## 13. Security and Provider-Disabled Verification

| Protection | Status |
|---|---|
| Clerk JWT authentication | Unchanged — `authenticateSession()` not touched |
| Origin check (`FORBIDDEN_ORIGIN`) | Unchanged — `local-video-server.mjs` not touched |
| `PAID_DISABLED` guard | Unchanged — `config.paidEnabled` logic not touched |
| `LOCAL_VIDEO_PAID_ENABLED` environment | NOT modified |
| WaveSpeed API key | NOT read, NOT logged, NOT changed |
| Provider upload (`provider.upload()`) | NOT called |
| Provider submit (`provider.submit()`) | NOT called |
| Quote expiry / double-submit prevention | Unchanged — `service.js` not touched |
| Consent flags (`confirm`, `transfer_consent`) | Unchanged |
| Image fingerprint and MISMATCH guard | Unchanged |

**Test proof:**
```
✔ disabled paid flag with provider key allows only local quote
✔ disabled config and production cannot expose feature even with key
✔ Clerk issuer/party/pending/expired/session rejected before provider (5 tests)
✔ approval bound to image/prompt/settings/quote_hash/session (5 tests)
```

---

## 14. Real Clerk Local Quote Status

**NOT RUN.**

The operator has not yet selected an actual matching reference image for Scene 3. A real authenticated local quote requires:
1. A user-selected PNG or JPEG ≤ 10 MiB
2. The local backend running (`node scripts/local-video-server.mjs`)
3. The Vite dev server running with the Clerk environment configured

These conditions are unchanged from Phase 5A.1C. The implementation is ready for local acceptance testing when the operator selects an image.

**Real WaveSpeed generation remains NOT RUN and NOT AUTHORIZED.**

---

## 15. Remaining Blockers and Next Recommended Action

### No implementation blockers

The 10 MiB limit is fully implemented, tested, and verified across all 7 approved files.

### Next recommended operator actions (in order)

1. **Local acceptance test:** Select a real reference image (PNG or JPEG, between 1–10 MiB) and run the Full AI Generate Video quote flow through the local backend to confirm the new limit works end-to-end with real Clerk authentication.

2. **Build verification (optional):** Run `vite build` to a safe isolated output directory to confirm the production bundle still compiles correctly. Confirm `VITE_WAVESPEED_API_KEY` is empty before building.

3. **Provider size acceptance (NOT RUN):** Real WaveSpeed acceptance of a 10 MiB image remains unverified. WaveSpeed documentation should be consulted for any provider-side size limits before submitting a large image.

4. **Await operator authorization** before proceeding to paid WaveSpeed generation, git commits, or deployment.

---

*Report generated: 2026-10-13T22:57 +07:00. No secrets, environment values, or API keys are included in this report.*
