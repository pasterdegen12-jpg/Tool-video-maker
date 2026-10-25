# Recurring screenplay import investigation

2026-10-25. Scope: deterministic structured screenplay import and inline validation only. No video/provider, camera/subtitle, duration, budget, authorization, Qwen, audio, Gemini credentials, Firebase schema/rules or existing project edits.

## Findings and limits

The earlier fix was committed as `af25dbd195394ac7f4581560746a8d66b1b8512a` and deployed on October 23. Current production before this task was `c727525f383a2edeae94b7262d3dd63f007c4a4a`, deployment `dpl_ea9wM7g3sruGxtscecdL3Kyvf89i`, READY. That commit includes the earlier import fix. Production served `/assets/index-a91BEono.js`. The already-open browser document initially retained `/assets/index-BJ-vrton.js` from d70cf61, which also includes af25dbd. This is not evidence that stale assets caused this report. No service-worker registration was found in application source.

The exact supplied excerpt `Character: Judge — Judge` passes the pre-change parser and existing MainEditor button-flow test. The previous report also records a real one-scene import and reload at proj_1792738316527. Therefore the earlier fix was neither absent nor generally ineffective for that exact excerpt.

**Actual recurring cause reproduced:** the operator pasted the complete 22-scene HOA_NURSE_01 screenplay into the authorized production MainEditor during this task. Captured verbatim (16,959 characters) without editing. It uses `Judge — `, `Defendant (Mr. Kowalski) — ` and `Plaintiff (Miss Price) — `, not just the screenshot's repeated Judge label. Exact CPU execution fails at scene_1: `characterName` splits the terminal separator into `Judge` and an empty string, and the unequal-component check throws. A diagnostic copy removing only the empty suffix then fails at scene_2 because the character-name whitelist rejects parentheses. These are two independently reproduced blockers. The earlier fix/test suite explicitly rejected `Judge —` and omitted role/name qualifiers; its single-scene acceptance could not catch this full script. Browser baseline click timed out around native alert; no live alert text was captured, so CPU trace is the precise failure evidence.

Verified uncovered gap: `characterName` in `src/lib/structuredScript.js` split ASCII hyphens only with spaces on both sides. `Judge-Judge`, `Judge -Judge`, and `Judge- Judge` were accepted as different literal names, not one Judge. Baseline output retained locally. This caused inconsistent character identity, not an AMBIGUOUS_CHARACTER exception for those three strings. The earlier tests omitted these variants.

The only exact AMBIGUOUS_CHARACTER producer in Web source is `characterName` (throw currently line 26). Its branch rejects empty names, unequal explicit label components, metadata field names, unsupported characters, or explicit multi-speaker conjunctions. MainEditor's catch propagated it through native alert. There is no second hidden Full AI scene validator emitting that code. The local Gateway client separately permits AMBIGUOUS_CHARACTER_REFERENCE, but that development-only parser panel is not the production Full AI button path.

## Implemented

- `structuredScript.js`: spaced/asymmetrically spaced dash separators use one resolver. For an unspaced internal hyphen, only equal normalized halves collapse, preserving names such as Mary-Jane. NFC, case and whitespace normalization remain shared by character validation, registry identity and scene assignment. Judge—Lawyer remains an actionable error. No semantic role/name guessing or visual ID generation.
- A single empty terminal description is accepted after a nonempty label; leading/interior empty components remain invalid. A balanced parenthesized name qualifier is retained as part of the complete canonical label. `Defendant (Mr. Kowalski)` remains that exact name and is not silently aliased to another Defendant or person. Distinct role/name declarations joined with a dash still fail. Raw Character declarations, including the terminal marker, remain in originalScript; no script mutation.
- `MainEditor.jsx`: Full AI and structured Semi import failures use a small inline error below the existing textarea, with accessible alert/description. Character errors include scene, exact field value, reason and corrective action. Editing clears the stale message; invalid import keeps text and writes no project. Existing in-flight Full AI guard remains.
- Tests extend the real MainEditor handler, Firebase save helper with mocked SDK, and navigation spy; no helper-only substitute. The media baseline test explicitly excludes only the new inline-error markup before checking the original unchanged media-workflow hash.

Flow: textarea → parseStructuredScript(scene_N splitter, field slices, characterName) → canonical registry/scenes → existing duration analysis → autoSaveToFirebase → existing prepareNewProjectScenes → setDoc → Workspace navigation/hydration. Structured errors do not fall back to Gemini. Unstructured input retains the existing Gemini path. No reference image, Qwen availability or confirmed visual ID is required. Set ID remains later and optional.

## Tests

Focused tests cover screenshot dialogue, all dash spacing/case variants, NFC Vietnamese multi-word names, repeated hyphenated names, distinct characters, unchanged source fields, invalid retry and duplicate-click prevention. Full MainEditor UI test imports the existing real 23-scene baseline and compares every scene's Character, Dialogue, Translate, Camera, Action, Context and Tone; no Gemini calls. Six-scene controlled variation test verifies three canonical names through the same handler. This controlled sample is not the operator's missing full failing screenplay.

Browser textarea normalizes CRLF to LF before React receives it; originalScript is tested against the exact textarea value. Parser-level tests separately preserve raw CRLF and multiline quoted fields. No production newline rewrite was added.

Four existing saved original scripts (21/22/22/22 scenes) were also parsed read-only from local evidence without errors. These are not claimed to be the currently failing script. Existing real Full AI 23/Semi 22 fixture tests remain separate. No Firebase persistence/security logic changed, so no emulator configuration/rules change was needed.

Final full Web **483/483 PASS**, focused import/media suite PASS, scoped ESLint PASS, production build PASS (existing chunk/dynamic-import warnings only). Frontend provider keys empty during build; six built assets scanned with zero matches for known local secret values. Initial full run exposed a test's raw-CRLF expectation and a whole-UI checksum that needed the exact authorized markup exclusion; both corrected, final full rerun passed. Private evidence stays in `docs/import-recurring-20261025/` and is not committed.

The exact operator 22-scene script also passed a private copy of the real MainEditor UI harness: 22 scenes in order, three complete character names, originalScript identical, all 22 Dialogue/Translate/Context/Tone/Camera/Action values equal to independently extracted source lines, one save/navigation, zero Gemini calls. This uses mocked Firebase and is explicitly separate from live acceptance. Committed reduced regressions retain the same real grammar without committing the user's full screenplay.

## Production acceptance

Operator signed in to the actual production Clerk session. Acceptance pending deployment. Only a structured project import is authorized here; no paid model, audio, video or Set ID inference will be submitted.
