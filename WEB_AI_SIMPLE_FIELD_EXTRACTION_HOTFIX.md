# Simple structured field extraction — 2026-10-26

## Root cause and correction

MainEditor `handleFullAIWorkflow` calls `parseStructuredScript` before duration analysis, `autoSaveToFirebase`, and Workspace navigation. Its Character helper split dashes, validated a name pattern, compared semantic-looking aliases and rejected unknown combinations as AMBIGUOUS_CHARACTER. Its ID key also normalized Unicode, case and internal whitespace, merging distinct authored values. This caused `judge_1 — Judge` to fail before project creation.

Only production file changed: `src/lib/structuredScript.js`. Removed semantic helper entirely. Character is now its complete extracted text (surrounding whitespace trimmed). Existing code-point-based project-local IDs derive from that exact text; exact repeats reuse a profile, different raw values stay separate. Missing/empty Character stays empty and creates no empty profile. No visual identity, image or registry required.

Field-label extraction, first-colon splitting, quoted/multiline grammar, original screenplay, Dialogue/Voiceover conflict protection and structural validation remain intact. Context/Camera/Action/Tone/translation remain literal values. No MainEditor redesign, Firestore schema change, migration, Qwen/Audio/Gemini fallback/video change. The unrelated `AMBIGUOUS_CHARACTER_REFERENCE` gateway error is outside the structured MainEditor path and unchanged.

## Tests

- Full suite: **504/504 PASS**, 0 skipped.
- Scoped lint: PASS.
- Production build with frontend provider keys empty: PASS (existing bundle/dynamic-import warnings only).
- Tests replace old semantic-merge expectations with exact preservation: all six operator examples, identifiers, metadata-like names, mixed names, case/Unicode/spacing distinctions, punctuation, extra colons, multiline fields, translated Dialogue and 21 numbered scenes.
- Actual React MainEditor textarea → button → parser → actual Firebase save helper → navigation tested with mocked SDK/auth: 21 scenes, exact raw Character/profile values, original text retained, no Qwen/Gemini/network/image requirement. Existing real 23/22 fixture regressions remain in suite.
- Mock tests are not live Firestore acceptance. Production browser results appended after release.

## Release

Before editing, Git changes were inspected/preserved. Existing production `e2f6df646f2ea5c0d372f52658ec48ff20fedcb8` was READY on `dpl_Y1MbGCwvJWg1zqfhffGfEz6Ynjqo`. Only parser, three regression files and this report are included in the corrective commit. Release IDs and actual browser verification follow below.

No paid provider calls authorized or performed. Production acceptance will create only the explicitly requested small test project and will not modify existing projects.
