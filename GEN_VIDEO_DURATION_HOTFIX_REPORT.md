# Gen Video duration correction — 2026-10-19

## Scope

Remove the unrequested Duration option. No new video feature. Previous options release was 16977167c1242805010177e262f86c170f8a0076; operator confirmed its UI manually, then requested this duration correction.

## Verified root cause

VideoOptionsModal exposed a duration select and copied saved attempt settings into editable state. cloudVideoContract recalculated duration from dialogue each time, with a modal fallback of 12 seconds. MainEditor did not persist an analyzed Full AI scene duration at all. Merely hiding the selector would have retained the incorrect architecture.

## Narrow correction

- MainEditor now performs a deterministic duration-analysis pass after structured/Gemini extraction and before the existing new-project save. The Gemini transport, model, prompt and parsing behavior are unchanged.
- Canonical new Full AI field: duration_seconds, integer seconds. Existing speech rule is retained: 150 words/minute plus 0.8s pause, rounded up to whole seconds with the established minimum of 4s. This rule runs during analysis only, not on modal open. Existing supplied canonical duration is retained if valid and sufficient; no provider maximum clamp occurs.
- Modal has exactly two selectors: Aspect Ratio and Resolution. No Duration select, slider, number input, fallback or editable duration state. Internal duration is read from scene.duration_seconds. Historical videoJob.settings.duration is not a canonical source and cannot override it.
- Different scenes retain different saved durations. Mode/resolution/aspect/media/custom prompt changes cannot alter duration. The real trim editor's start/end controls still edit a separate media copy; they never change generation duration.
- Missing, noninteger, too-short or provider-incompatible saved duration produces an actionable analysis/contract error. Start Frame/Text still support integer 4–12s and References integer 4–15s. No dialogue truncation, silent rounding of saved data or provider clamp.
- Backend reads canonical duration from its own stored scene, checks exact request equality, retains the validated speech sufficiency check using fixed analysis assumptions, and includes canonicalDuration in the durable attempt/request hash. Cost and provider payload use that same value.
- Changing saved duration after quote invalidates the attempt; publication checks it as well. Existing records lacking canonicalDuration retain their prior snapshot/recovery compatibility. No old record or project migration.
- Existing OUTPUT, R2 archive, history, F5 recovery, counters and other six modal options are unchanged.

## Legacy project impact — verified read-only

Project proj_1792167327214 has 21 scenes, zero with duration_seconds, and two saved outputs. No cloud writes were performed. Existing outputs remain playable/recoverable. New generation for these legacy scenes will be blocked with a missing-duration message until duration is determined and saved through an explicitly authorized screenplay-analysis workflow. This hotfix does not backfill, infer from an old prediction, overwrite the project, or create another project automatically.

## Verification

- Full Web suite: 419/419 PASS.
- Focused behavior covers no Duration selector; canonical persistence; different scenes; saved historical settings cannot override canonical duration; options/custom text do not change it; quote/cost/provider equality across all three models; missing/invalid/overlong values; stale duration invalidation; preserved controls and no paid POST on open/change/cancel.
- Automated provider calls are mocked; no real paid WaveSpeed call.
- Scoped lint PASS; MainEditor 0 errors before/after. Firestore emulator 7/7 PASS. Vercel production build PASS; 11 functions. Known-secret scans of client artifacts and scoped release files PASS.
- Commands: node docs/video-duration-20261019/run-checks.cjs test, lint, vercel; node docs/video-duration-20261019/run-emulator.cjs; node docs/video-duration-20261019/main-editor-lint.cjs; scoped artifact scan.

## Release

Pending final build and corrective commit/deployment verification. Scope list is in docs/video-duration-20261019/release-files.json. Unrelated dirty Qwen reports, prior acceptance-report updates and phase5a artifacts are excluded.
