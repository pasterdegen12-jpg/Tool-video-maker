# Fast speech and 4–10 second generation policy

Date: 2026-10-27. Baseline production: `9644681ad47658576ce20816b38e5bf17a228303`, deployment `dpl_EKSFZ5tuuAAvbQrtE317qv35uYre` READY, inspected before editing.

## Status

- IMPLEMENTED: deterministic faster speech estimate, a single updated speech-delivery section, application request range 4–10 seconds.
- MOCK TESTED: full Web suite **504/504 PASS**; scoped ESLint PASS; production build PASS with frontend provider keys empty. Built asset scan: zero known provider-secret matches.
- REAL DATA VERIFIED: 109 scenes, five actual recent Full AI projects, read-only Firestore inspection. No scene/media migration.
- DEPLOYED / PRODUCTION BROWSER VERIFIED: release evidence added below after deployment.
- REAL SPEECH QUALITY VERIFIED: **NOT VERIFIED**. No new paid prediction was submitted. Prompt changes cannot guarantee how the provider performs the speech.

## Cause and correction

The old generation resolver preferred any positive saved `duration_seconds` over spoken content. Its fallback and new-project analysis used 150 words/minute plus 0.8 seconds and rounded up. The old endpoint caps were 12 seconds (Start Frame/Text) and 15 seconds (References). These combined to keep legacy estimates at 12 even for new attempts. No duplicated translation count or universal hardcoded 12-second default was found in that path.

New attempts re-estimate current canonical Dialogue, with the established read-only fallback for legacy Full AI Voiceover. Conflicting spoken fields still fail explicitly. Translation metadata is not counted or sent as speech. No Gemini/Qwen calls are introduced.

Ordinary English/space-delimited dialogue uses 200 words/minute and brief punctuation overhead: 0.25 seconds plus 0.04 per comma/semicolon/colon and 0.08 per sentence ending, capped at 0.6 seconds. Vietnamese is treated as space-delimited syllables at 270/minute; CJK script characters at 300/minute (plus remaining space-delimited tokens). These are documented deterministic heuristics, not measured language-specific speech guarantees. Explicit slow speech uses 140 words/minute or 180 syllables/characters per minute, with 0.8 seconds for pauses.

New-project analysis saves its estimate once, without imposing a provider maximum on screenplay metadata. Existing positive saved estimates are preserved. For a new paid attempt, spoken content is re-estimated without rewriting that metadata. Silent scenes use their positive saved duration or minimum 4 and receive no speech instruction.

The outbound prompt now has one `SPEECH DELIVERY` section: brisk, fluent, natural pace; clear articulation; brief pauses; no drawn-out syllables; exact words, emotion and lip sync retained. Authored slow delivery gets a separate compatible instruction. Custom Prompt cannot affect the duration estimator. No unsupported `speech_rate`/`speaking_speed`, playback-rate change, time stretching or text cutting is introduced.

The existing 2,000-character application prompt cap remains: full guidance falls back to compact wording; if neither fits, authored content and visual constraints take priority, as before. All **109/109 sampled spoken scenes contain the new guidance**. Exceptionally crowded prompts may omit optional delivery guidance; no new prompt-length eligibility gate was added.

## Endpoint contracts and shared policy

Current official contracts inspected:

| Enabled mode | Actual model | Provider duration | Application duration |
|---|---|---|---|
| Start Frame | Seedance 1.5 Pro image-to-video | integer 4–12 | integer 4–10 |
| Text | Seedance 1.5 Pro text-to-video | integer 4–12 | integer 4–10 |
| References (images only) | Seedance 2.0 Mini text-to-video | integer 4–15 | integer 4–10 |

Sources: [I2V](https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-v1.5-pro-image-to-video), [T2V](https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-v1.5-pro-text-to-video), [References/Mini](https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-2.0-mini-text-to-video).

The common selector intersects provider support with 4–10, rounds the estimate to the nearest integer, and selects the nearest allowed value (longer value for a tie). Discrete provider support has regression coverage; none of the three enabled contracts currently requires discrete buckets. Long estimates select 10 and do not lock generation. Provider model choice is unchanged.

The production path is Storyboard → modal → cloud controller → `/api/video` → quote snapshot → provider serializer. All three modes use the same policy; client and server independently derive the request from canonical scene content. Final HTTP transport also rejects values outside 4–10 before POST. Snapshot stores `durationPolicy=brisk-4-10-v1`, generation estimate, selected settings and matching cost. Existing canonical duration is retained separately.

Full AI Gen All remains unsupported (existing message in Workspace); no new batch route was enabled. Edit Video remains local trimming/export, not provider regeneration. The legacy localhost-only `/api/local-video` panel retains its existing narrower 4–9 experimental contract and old estimator; it is not the enabled production Full AI modal. Its shared transport also cannot send new 11/12-second predictions. No local workflow expansion was made in this production hotfix.

Stale pre-release quotes with 11/12+ seconds return `QUOTE_EXPIRED` before a paid reservation or POST. A fresh normal quote is required. No automatic submit/retry was introduced. Completed and already accepted/in-flight historical 12-second records keep their settings/cost and remain pollable/recoverable; these read paths do not validate against the new request cap.

## Real project comparison

Read-only sample: latest five Full AI projects with at least ten scenes, excluding explicitly marked test imports. Per-scene evidence: [CSV](docs/fast-speech-20261027/real-comparison.csv) and [JSON](docs/fast-speech-20261027/real-comparison.json). Rows distinguish old-policy calculation from actually recorded paid history; missing history is null, not invented.

| Project | Scenes |
|---|---:|
| proj_1793026193256 | 21 |
| proj_1792935914440 | 22 |
| proj_1792935850053 | 22 |
| proj_1792738221007 | 22 |
| proj_1792591144210 | 22 |
| Total | 109 |

| New request | Count |
|---|---:|
| 4s | 25 |
| 5s | 8 |
| 6s | 12 |
| 7s | 11 |
| 8s | 15 |
| 9s | 14 |
| 10s | 24 |

Old policy mapped 42/109 to 12 seconds; 23 sampled scenes also have an actual historical paid 12-second record. New estimates exceed 10 seconds for 20 scenes. Another four round up into the 10-second bucket. Thus 24/109 (22.0%) reach the maximum, reflecting longer speech rather than a universal fallback.

At unchanged rates and matched resolution/audio settings, old-policy modeled total is **$24.9840**, new modeled total **$18.6000**, a reduction of **$6.3840 (25.55%)**. These are quote comparisons, not realized billed savings. Each row records actual prior duration/cost separately where available. No dialogue was altered.

For content actually needing more than ten seconds, neither a prompt nor this estimate guarantees complete audible speech within ten seconds. Text remains exact and generation remains available, per operator policy. Authored slow speech may be especially affected.

## Verification

Commands executed from the Web repository:

```text
git status --short
git diff --stat
git log -8 --oneline
node docs/fast-speech-20261027/real-data.mjs
npm test
node --test tests/local-ai-real-http.test.mjs
node node_modules/eslint/bin/eslint.js <the scoped changed source and test files>
node docs/import-recurring-20261025/build.cjs
node docs/import-recurring-20261025/scan.cjs
node docs/fast-speech-20261027/check-coverage.mjs
```

Final suite: 504 pass, 0 fail. Earlier old-policy assertions were updated to the intentional new policy. One intermediate CPU-only parser startup timed out under parallel load; isolated rerun and final full suite passed. The parser test explicitly disables GPU/model worker; no Qwen inference was run.

Regression coverage includes integer and discrete mapping; all three serialized mock HTTP bodies; exact quote/payload equality; 11/12 rejection before transport; stale quote with no reservation; completed/in-flight history recovery; realistic short and long speech; original fields/translation preservation; slow and silent speech; no Duration selector; image/options/defaults; custom prompt; no POST on opening; one final click; duplicate-click protection; output placement/F5/counters. A real React modal with an 80-word scene remains enabled and submits a 10-second request to mocks with its complete text.

No credentials, pricing rates, account access, spending policy, Qwen worker/queue, audio transport, camera behavior, subtitles constraint or cloud storage implementation were changed. Unrelated working-tree changes were left unstaged.
