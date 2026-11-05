# Molmo2 Set ID correction — 2026-11-05

## Findings and changes

- The old actual vision prompt contained a gray-haired, white-bearded man example (twice), plus a long JSON contract. This is a plausible source of example contamination, not a proven cause for the reported image: no authorized live inference was run in this task.
- The request `text` now contains exactly the operator's short English prompt, without examples. Prompt version bumped to `visual-id-2026-11-05-v2`.
- New responses are plain English descriptions. Local deterministic formatting removes grammar words and normalizes punctuation/case. It preserves descriptive words, never supplies missing attributes and never truncates to the existing 100-character ID limit. Unsupported/uncertain, malformed or overlong results fail recoverably, preserving the old ID. Original description is stored separately in `proposal.visual_description`.
- Legacy JSON decoding remains exclusively for predictions submitted under the previous prompt version. Existing saved IDs remain readable.
- Small Edit control opens an inline field with Enter/Save and Cancel. Backend authenticates and authorizes, normalizes, checks identity conflicts and compares the previous identity revision in a Firestore transaction. Manual edit calls no image model or provider endpoint.
- Manual save updates only the selected character's appearance overlay. Stable Character ID, name, image, dialogue, scene fields, audio and video remain unchanged. Existing scene resolution supplies the new ID to every linked scene and video prompt. Previous aliases remain valid.
- The manual overlay description derives from the corrected ID, so the old AI description cannot reintroduce the attributes the user removed. Original AI result stays in its job history.
- Manual save atomically supersedes active predictions; a late poll cannot commit over it. Another concurrent edit or changed image is rejected. Explicit Set ID can regenerate later; old value remains until successful persistence.
- UI now displays the existing specific recoverable error messages instead of hiding them behind one generic error. Existing five-minute polling bound, terminal stops, bounded network retries, dedupe and uncertain-submit reservation remain. No automatic paid retries were introduced. An uncertain submission deliberately stays reserved to avoid duplicate charges; the button is no longer busy but another click does not blindly resubmit it.
- Existing current-image server lookup, image hash/binding checks, CORS avatar display, uploads and multi-character Set ID remain intact.

## Verification

- `node --experimental-vm-modules --test --test-concurrency=3 tests/*.test.mjs`: **600/600 PASS**.
- Firestore emulator (`tests/emulator/firebase.json`, `tests/emulator/firestore.test.mjs`): **13/13 PASS**. Includes real emulator transaction/manual save and fresh document/service reads; provider is mocked.
- Production Vite build: **PASS**, frontend WaveSpeed/Gemini keys empty in process.
- ESLint on changed production JS/JSX: **PASS**.
- Focused tests cover exact prompt, correct selected image, plain and legacy response parsing, normalization, manual save/remount, prompt resolution, unchanged scene/media data, duplicate submissions, image changes, late results, failed writes, terminal failures, bounded polling, avatar upload controls and multi-selection.
- Logs: `docs/molmo-fix-20261105/`.
- No paid Molmo2 inference or video generation. Real model appearance accuracy: **NOT RUN**. Production ID values are not changed for testing.

## Changed production files

`api/_lib/molmo/prompt.js`, `output.js`, `service.js`; `src/lib/visualIdText.js`, `molmoClient.js`; `src/Workspace/VisualProfiles.jsx`.

Tests: `tests/molmo.test.mjs`, `tests/visual-ui.test.mjs`, `tests/emulator/firestore.test.mjs`.

## Deployment

Release SHA, READY status and read-only production UI acceptance recorded after deployment below.
