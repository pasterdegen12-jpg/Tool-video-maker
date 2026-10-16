# FULL AI Phase 5A.1E — WaveSpeed Credential Exposure Audit Report

**Mode:** Read-only security investigation  
**Project:** `F:\tool-ai-dh\web-ai`  
**Date:** 2026-10-13  
**Status:** INVESTIGATION COMPLETE — operator decision required before any remediation

> No existing application files were modified during this investigation.  
> No credentials were printed, uploaded, or transmitted.  
> No git operations (add/commit/reset/clean/stash) were performed.

---

## §1 — Vite Environment Variable Precedence: Correction of Prior Report

The Phase 5A.1D Final Verification Report incorrectly stated:

> *"Vite reads `.env` files from disk at build time and the value set in `.env.video.local`
> took precedence over the process-level environment variable."*

This diagnosis was **NOT VERIFIED** and contradicts official Vite documentation.

### Verified Vite Behavior (Vite 8.0.14 — `node_modules/vite/dist/node/chunks/node.js`)

The actual `loadEnv()` implementation uses two sequential loops:

```js
// Loop 1: collect VITE_ vars from parsed .env files
for (const [key, value] of Object.entries(parsed))
  if (prefixes.some(prefix => key.startsWith(prefix))) env[key] = value;

// Loop 2: OVERRIDE with process.env (VITE_ prefixed keys win)
for (const key in process.env)
  if (prefixes.some(prefix => key.startsWith(prefix))) env[key] = process.env[key];
```

**Loop 2 runs after Loop 1.** Process environment variables with a `VITE_` prefix DO override
file-based values. This is consistent with the [official Vite documentation](https://vite.dev/guide/env-and-mode):
*"Env variables already defined when Vite starts have the highest priority."*

### Actual Root Cause: PowerShell Empty String → Node.js Missing Key

The override failed because of a **Windows PowerShell / Node.js interoperability quirk**:

| Step | Behavior |
|---|---|
| `$env:VITE_WAVESPEED_API_KEY = ""` in PowerShell | Sets the variable to an empty string |
| `[System.Environment]::GetEnvironmentVariable("VITE_WAVESPEED_API_KEY")` | Returns `$null` (not `""`) |
| Node.js child process `VITE_WAVESPEED_API_KEY in process.env` | `false` — key is **absent** |
| Vite Loop 2 `for (const key in process.env)` | Key not iterated — file-parsed value is NOT overridden |

**Verified by direct test:**
```
$env:VITE_TEST_EMPTY_VAR = ""
node -e "console.log('VITE_TEST_EMPTY_VAR' in process.env)"
→ false
```

When an empty string is assigned to a PowerShell env var, Windows does not propagate it to
child processes as an empty-string entry. Node.js never sees the key, so Vite's Loop 2 cannot
suppress the value from `.env`.

**The Vite documentation is correct. The prior root-cause diagnosis was wrong.**

**Corrected root cause:** The isolated build command used `$env:VITE_WAVESPEED_API_KEY = ""`
which, on Windows, is equivalent to the key not being set at all in the Node.js child process.
Vite therefore read the non-empty value from `.env` without override.

---

## §2 — Exact-Match Result for the Suspected Credential

**Method:** In-memory comparison between `.env` value and build output content.
The key value was never printed, logged, or stored in this report.

| Dimension | Result |
|---|---|
| `.env` `VITE_WAVESPEED_API_KEY` value length | 52 characters |
| `.env.video.local` `VITE_WAVESPEED_API_KEY` value length | 0 (empty) |
| `.env.local` — key present | NO |
| Exact matches in isolated build `index-Cp-Rllva.js` | **4 occurrences** |
| **EXACT_MATCH_RESULT** | **EXACT_MATCH** |

The 52-character string from `.env` appears verbatim 4 times in the isolated build output.
The `wsk_live…` prefix pattern is consistent with a live WaveSpeed API key.

---

## §3 — Verified Injection Path

### Primary injection vector: `import.meta.env.VITE_WAVESPEED_API_KEY`

**File:** [`src/Workspace/Workspace.jsx`](file:///F:/tool-ai-dh/web-ai/src/Workspace/Workspace.jsx)  
**Lines:** 671 and 693  

```jsx
// Line 671 — POST submit
headers: {
  "Authorization": `Bearer ${import.meta.env.VITE_WAVESPEED_API_KEY}`,
  "Content-Type": "application/json"
}

// Line 693 — poll GET
headers: { "Authorization": `Bearer ${import.meta.env.VITE_WAVESPEED_API_KEY}` }
```

### How Vite bundles `import.meta.env.VITE_WAVESPEED_API_KEY`

At build time, Vite statically replaces all `import.meta.env.VITE_*` references with their
resolved string values. This is a **build-time constant substitution** — the string value from
`.env` is inlined as a literal into the bundled JS. The browser receives the key as a plaintext
string in `index-Cp-Rllva.js`.

### No hardcoded fallback

A search for `wsk_` literals in all `src/` source files found **zero hardcoded key occurrences**.
The injection is entirely through `import.meta.env` substitution.

### Why `.env` was the source (not `.env.video.local`)

`.env.video.local` contains `VITE_WAVESPEED_API_KEY=` (empty value). `.env` contains the
52-character live key. Vite's `getEnvFilesForMode()` loads files in this order for `production`
mode, with later entries overriding earlier ones:

1. `.env` — **contains the live key**
2. `.env.local` — does not contain this key  
3. `.env.production` — does not exist
4. `.env.production.local` — does not exist

`.env.video.local` is only loaded when `mode=video.local`, which is not the default production
build mode. Therefore, the value from `.env` was the active value during the isolated build.

### No Vite `define` config injection

`vite.config.js` contains no `define:` block and no manual env injection. The injection is
entirely through standard `import.meta.env` substitution.

### Injection path summary

```
.env (line 13): VITE_WAVESPEED_API_KEY=<52-char live key>
    ↓ read by Vite loadEnv() at build time
    ↓ substituted into all import.meta.env.VITE_WAVESPEED_API_KEY references
src/Workspace/Workspace.jsx lines 671, 693
    ↓ bundled into
dist/assets/index-Cp-Rllva.js (existing dist — built earlier, see §4)
F:\tool-ai-dh\BUILD-VERIFY\...\assets\index-Cp-Rllva.js (isolated build)
```

**Injection path: VERIFIED**

---

## §4 — Exposure in Existing `dist/`

### Existing `dist/` credential scan

The existing `dist/` directory at `F:\tool-ai-dh\web-ai\dist` was scanned for the exact
52-character key value (in-memory comparison, no value printed).

| File | Exact key occurrences |
|---|---|
| `dist/assets/index-NxQkttCS.js` | **0** |
| `dist/assets/ffmpeg-core-CI9Irx9p.js` | **0** |
| `dist/assets/worker-BzdDEeh7.js` | **0** |
| `dist/ffmpeg-core.js` | **0** |
| `dist/index.html` | **0** |
| **TOTAL** | **0** |

**Exposure in existing `dist/`: NO**

The existing `dist/` directory was built with an empty `VITE_WAVESPEED_API_KEY`.
The Phase 5A.1B Audio Credential Remediation Proposal notes:
> *"Bản dist hiện có đã được build với WaveSpeed key rỗng ở Phase 5A.1."*  
> (The current dist was built with an empty WaveSpeed key in Phase 5A.1)

This is consistent: the existing `dist/` predates the Phase 5A.1D verification session and was
built under conditions that suppressed the key (likely using a different method or under a
different environment state where the key was not set).

**The existing `dist/` does NOT contain the live credential.**

---

## §5 — Exposure in Isolated Build Output

| Location | File | Exact occurrences | Exposed |
|---|---|---|---|
| `F:\tool-ai-dh\BUILD-VERIFY\phase-5A1D-verify-20261013-231342\assets\` | `index-Cp-Rllva.js` | **4** | **YES** |
| `F:\tool-ai-dh\BUILD-VERIFY\phase-5A1D-verify-20261013-231336\` | (empty — failed build) | 0 | NO |

**The isolated build output at `F:\tool-ai-dh\BUILD-VERIFY\phase-5A1D-verify-20261013-231342`
contains the live WaveSpeed API key.**

---

## §6 — Evidence from Source and Git Scope

### Tracked source files (git HEAD)

- `src/Workspace/Workspace.jsx` — uses `import.meta.env.VITE_WAVESPEED_API_KEY` at lines 671, 693
- **This version is tracked and committed.** `git log` shows it was introduced in commits
  `206e3ad` and refined in `64b2bbe` (both dated 2026-06-23).
- No literal `wsk_live…` key was found in any tracked source file.

### Git pickaxe search — literal key value

A `git log -S "wsk_"` search across all branches returned commits `64b2bbe` and `206e3ad`.
Manual inspection of those commits confirms the matches were **`import.meta.env` references**,
not hardcoded key values. **No literal credential was ever committed to git.**

### Env files — git tracking status

All three env files (`.env`, `.env.local`, `.env.video.local`) are **NOT tracked by git**.
They are excluded by `.gitignore` (entries: `.env` and `.env*`).

| Env file | Git-tracked | Contains live key |
|---|---|---|
| `.env` | NO (gitignored) | YES (52 chars, line 13) |
| `.env.local` | NO (gitignored) | NO (key absent) |
| `.env.video.local` | NO (gitignored) | NO (value empty) |

### Git index and HEAD

The `VITE_WAVESPEED_API_KEY` env variable reference (`import.meta.env.VITE_WAVESPEED_API_KEY`)
exists in tracked `Workspace.jsx` in both the git index and HEAD. However, the **key value
itself has never been committed** to any tracked file or the git index.

### Git history coverage

This audit covers:
- ✅ All currently tracked files in HEAD
- ✅ Pickaxe search across all branches for literal `wsk_` and `VITE_WAVESPEED_API_KEY`
- ❌ Full git-history blob scan: NOT performed (would require checking every blob in
  every commit across all branches for the exact 52-character key value).
  A complete historical audit is possible but was not performed in this read-only pass.

---

## §7 — Public Deployment Status

### Not confirmed and not accessed

The `vite.config.js` proxy configuration references:
```js
'/api': { target: 'https://www.aivideomaker.live', ... }
```

This indicates a production deployment exists at `https://www.aivideomaker.live`.

**No Vercel or CDN access was performed in this investigation.**

### Assessment

| Question | Answer |
|---|---|
| Is a Vercel/production deployment known to exist? | YES — proxy target `www.aivideomaker.live` |
| Was the production bundle inspected? | NO — not accessed |
| Is the existing local `dist/` (credential-clean) known to have been deployed? | UNDETERMINED |
| Could an older build containing the live key have been deployed previously? | POSSIBLE — cannot exclude |
| Is active exploitation confirmed? | UNDETERMINED |

**Recommendation:** Before any other action, the operator should check whether the live key
appears in the production bundle at `https://www.aivideomaker.live`. A safe read-only check:

```
# Proposed operator action (NOT executed by this agent):
# Download the deployed JS bundle from the public URL and check for the key pattern.
# This requires no authentication and modifies nothing.
# Operator should run this ONLY after reviewing this report.
```

This check is proposed for operator execution, not automated.

---

## §8 — Build Output Containment

### Current location assessment

| Factor | Detail |
|---|---|
| Path | `F:\tool-ai-dh\BUILD-VERIFY\phase-5A1D-verify-20261013-231342\` |
| Drive type | Local NTFS filesystem (`F:`) |
| Cloud sync indicators | None detected (not in OneDrive/Dropbox/Google Drive path) |
| Web-served | Not detected — no IIS/nginx config found pointing to this path |
| Git-tracked | NO — outside the web-ai repository |
| Publicly accessible | Not directly — requires local machine access |

**The build output is on a local-only drive with no detected sync or serve path.**
However, this assessment is based on path naming and drive type only. The operator should
confirm that `F:` is not a network drive or remotely mounted share.

### Containment recommendation

1. **Do NOT delete the build output automatically** (per operator instruction §5).
2. The operator should, at their convenience and with confirmation, **delete the directory**
   `F:\tool-ai-dh\BUILD-VERIFY\phase-5A1D-verify-20261013-231342` to eliminate the local
   copy of the exposed key.
3. Before deletion, confirm no other processes or build systems depend on it.
4. The empty failed build at `F:\tool-ai-dh\BUILD-VERIFY\phase-5A1D-verify-20261013-231336`
   contains no credential and may be deleted without urgency.

---

## §9 — Credential Rotation Urgency

### Risk classification

| Exposure vector | Status |
|---|---|
| Local isolated build output (not synced, not served) | CONFIRMED — low immediate risk |
| Existing local `dist/` | NOT EXPOSED |
| Git history (all branches) | NOT CONFIRMED (full blob scan not performed) |
| Production deployment at `www.aivideomaker.live` | UNDETERMINED — must verify |
| Source code (hardcoded) | NOT PRESENT |

### Urgency assessment

**If the production bundle has been deployed with the live key:**

The key is publicly accessible to any user of the application, as it is inlined in the
frontend JS bundle that browsers download. Anyone who opens browser DevTools or fetches the
bundle URL can extract the key. **In this scenario, rotation should be treated as urgent.**

**If the production bundle was built with an empty key (as indicated by the local `dist/`):**

The key has not been publicly exposed via the deployed application. The risk is limited to:
- The local isolated build output (controlled, not synced)
- Anyone with direct access to the local machine

**In either case, the `import.meta.env` usage is a structural vulnerability** — any future
build run with a non-empty `.env` value will expose the key. The Phase 5A.1B proposal
(moving credential to backend) addresses this structurally.

---

## §10 — Impact on Legacy Generate Audio

`src/Workspace/Workspace.jsx` lines 671 and 693 use `VITE_WAVESPEED_API_KEY` for two
Generate Audio requests:

1. **Line 671:** POST to Minimax TTS or Qwen Voice Clone endpoint
2. **Line 693:** GET poll for async job status

Both paths use the same key via `import.meta.env`. The Generate Audio feature currently
requires this key to be set in `.env` to function.

**If the key is rotated:**

- All existing browser sessions with the old bundle will fail to generate audio
  (Authorization header will carry the revoked key)
- The new key must be placed in `.env` AND the application must be rebuilt and redeployed
  to propagate the new key to the frontend bundle
- There is a window between rotation and new deploy where Generate Audio is non-functional

**If the key is rotated AND the frontend is rebuilt with `VITE_WAVESPEED_API_KEY` empty:**

- Generate Audio will silently fail (empty `Bearer ` token in Authorization header)
- This is the expected behavior while the Phase 5A.1B backend migration is completed

**The Phase 5A.1B Credential Remediation Proposal** already outlines the correct procedure
(§ "Triển khai và rotation do operator kiểm soát"): deploy the backend audio route first,
rebuild the client without the `VITE_` key, then rotate the old key. This minimizes the gap
where audio is non-functional.

---

## §11 — Minimal Proposed Remediation

> **STOP — operator approval is required before any of the following steps are executed.**
> This section is a proposal only. Nothing below has been implemented.

### Immediate (containment)

| Action | File / Location | Safe to do now |
|---|---|---|
| Delete isolated build output | `F:\tool-ai-dh\BUILD-VERIFY\phase-5A1D-verify-20261013-231342\` | Operator decision |
| Verify production bundle for key presence | `https://www.aivideomaker.live` (read-only fetch) | Operator decision |

### Structural (requires separate approval)

The following is the minimal change that prevents the key from entering any future build.
**This is not an authorization — it requires operator approval as a separate task.**

| # | File | Change | Notes |
|---|---|---|---|
| 1 | `.env` | Set `VITE_WAVESPEED_API_KEY=` (empty) | Removes key from Vite's default build env |
| 2 | `src/Workspace/Workspace.jsx` | Replace direct WaveSpeed fetch with a backend proxy call (lines ~640–710) | Per Phase 5A.1B proposal |
| 3 | New backend route | `api/wavespeed-audio/submit.js` + `api/wavespeed-audio/jobs/[handle].js` | Per Phase 5A.1B proposal |
| 4 | New backend lib | `api/lib/wavespeed-audio/*` (auth, validate, provider, config) | Per Phase 5A.1B proposal |
| 5 | New secret | `WAVESPEED_AUDIO_API_KEY` (backend-only, not `VITE_`-prefixed) | New key, not the existing one |

This is exactly the scope described in `docs/phase5a1b/AUDIO_CREDENTIAL_REMEDIATION_PROPOSAL.md`.

### What NOT to do

- Do NOT set `VITE_WAVESPEED_API_KEY` to a placeholder string in `.env` — this would embed
  the placeholder in every build, not suppress the key
- Do NOT create `.env.production.local` as a workaround without establishing the true cause
  (the true cause is now established: use a non-empty non-secret sentinel value, or remove
  the `VITE_` var entirely and use a backend route)
- Do NOT use `$env:VITE_WAVESPEED_API_KEY = ""` as a build-time suppression — confirmed not
  to work on Windows (PowerShell empty-string env var is invisible to Node.js child processes)
- Do NOT rebuild with the live key present in `.env` until the source injection is fixed

---

## §12 — Confirmation: No Existing Application Files Changed

| Category | Changed? |
|---|---|
| Source files (`src/`) | **NO** |
| API files (`api/`) | **NO** |
| Test files (`tests/`) | **NO** |
| Configuration files (`vite.config.js`, `package.json`, etc.) | **NO** |
| Environment files (`.env`, `.env.local`, `.env.video.local`) | **NO** |
| Backup directories | **NOT TOUCHED** |
| `dist/` directory | **NOT MODIFIED** |
| Git index / HEAD / branches | **NOT MODIFIED** |
| Existing reports | **NOT MODIFIED** |

**This report is the only new file created during Phase 5A.1E.**

---

## Summary Table

| Item | Finding |
|---|---|
| §1 — Vite env precedence correction | Process env wins — prior diagnosis wrong. Actual cause: PowerShell empty string not visible to Node.js |
| §2 — Exact-match result | **EXACT_MATCH** — 4 occurrences in isolated build |
| §3 — Injection path | **VERIFIED**: `import.meta.env.VITE_WAVESPEED_API_KEY` in `Workspace.jsx` L671/L693 → Vite build-time substitution from `.env` |
| §4 — Existing `dist/` exposure | **NO** — 0 matches in all dist assets |
| §5 — Isolated build exposure | **YES** — 4 matches in `BUILD-VERIFY/.../index-Cp-Rllva.js` |
| §6 — Git tracked source | Env var *reference* committed; literal key value: NOT in git |
| §7 — Public deployment | **UNDETERMINED** — production bundle not inspected |
| §8 — Containment | Build output is local-only; no sync/serve path detected |
| §9 — Rotation urgency | **CONDITIONAL** — urgent if production bundle contains key; moderate if not |
| §10 — Generate Audio impact | Rotation will break Generate Audio until Phase 5A.1B migration is deployed |
| §11 — Remediation | PROPOSAL ONLY — Phase 5A.1B backend migration is the correct fix |
| §12 — Files changed | **NONE** |

---

*End of Phase 5A.1E Credential Exposure Audit Report*  
*Operator decision required before any remediation, rotation, cleanup or production change.*
