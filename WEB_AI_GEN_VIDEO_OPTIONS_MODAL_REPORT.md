# Gen Video options modal — 2026-10-19

## Scope and status

IMPLEMENTED; paid provider calls tested with mocks only. Production release and browser acceptance results are recorded below after deployment. Qwen work remains paused. No Audio, Gemini, Qwen, parser, credential, Firestore rule, or spending-policy change is included.

## Root cause verified from Git

Baseline: faa640b5d109e091afe9573dbc9bc4d6c6acb578.
- 9bd7a75 contained Seedance settings, internal prompt review and quote controls.
- 2b01225 removed selectable settings/review in SeedanceScenePanel in favor of the then-requested one-click flow.
- 7f376d7 routed production scene actions through SceneVideoAction directly into generation.
- faa640b5 repaired cloud OUTPUT placement/persistence; those fixes are retained.
- Workspace still contains a legacy modal, but it is outside the production cloud-video route. Its layout/options were useful references, not a safe whole-commit restoration.
- No historical Edit Video implementation was found by the repository-wide Git search. The new local trim editor is an implementation using the existing bundled FFmpeg dependency, not a claim that a deleted editor was recovered.

## Delivered behavior

Scene Gen Video AI opens a centered dark modal through a body portal. Dim backdrop, compact media previews, internal scrolling, fixed header/footer, keyboard focus handling, close and Cancel. Opening/changing/closing performs no quote/upload/prediction POST. Only Generate Video inside the modal invokes the cloud controller.

Current INPUT is preselected, replaceable with PNG/JPEG. INPUT and OUTPUT remain separate. Start Frame is the initial mode; aspect 9:16 and resolution 480p for a scene without saved options. Completed modern attempts reopen their saved settings. Unsaved changes are discarded on close. Completed scene cards can reopen the dialog without regenerating.

Canonical scene prompt is composed unchanged on both client and server; optional additional text follows it under a subordinate-direction heading. Original Character, Dialogue/legacy Voiceover, Action, Camera, Context and Tone remain untouched. Additional text is bounded at 1,000 characters; the combined existing prompt ceiling is 2,000 codepoints. Excess is rejected, never truncated.

Mode, model, reference hashes, settings, custom text, scene snapshot and per-click attempt key enter request hashing. Rapid click guards, durable SUBMITTING-before-provider ordering, accepted ID persistence, unresolved-attempt blocking, immutable image upload verification and no ambiguous automatic retry remain active. Sequential reference verification validates each image's own hash. Intentional new generation after completion has a new attempt key and preserves existing output until successful publication.

OUTPUT stays in the left scene media box. No player is inserted below the scene. Successful output options are saved with the job; previous outputs remain in videoHistory. Newer manual saves take precedence over stale preview state. No project migration is performed.

## Provider contracts

| Mode | Actual operation | Media | Supported UI settings | Verification |
|---|---|---|---|---|
| Start Frame → Video | bytedance/seedance-v1.5-pro/image-to-video | One PNG/JPEG | 4–12s; 480p/720p/1080p | TESTED WITH MOCKS; existing production I2V result retained |
| Text → Video | bytedance/seedance-v1.5-pro/text-to-video | No image upload | 4–12s; 480p/720p/1080p | TESTED WITH MOCKS; new real paid call NOT RUN |
| References → Video | bytedance/seedance-2.0-mini/text-to-video | 1–9 ordered reference_images | 4–15s; 480p/720p/1080p | TESTED WITH MOCKS; new real paid call NOT RUN |

All three expose documented ratios 21:9, 16:9, 4:3, 1:1, 3:4, 9:16. References is explicitly labeled Seedance 2.0 Mini. Seedance 1.5 is not silently substituted. Mini receives reference_images, prompt, duration, resolution, aspect_ratio, generate_audio and enable_web_search=false; unsupported camera_fixed/seed are omitted, with an explanation in the modal. Original Camera instructions remain in the prompt.

Official sources checked:
- https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-v1.5-pro-image-to-video
- https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-v1.5-pro-text-to-video
- https://wavespeed.ai/models/bytedance/seedance-v1.5-pro/text-to-video (public model pricing metadata)
- https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-2.0-mini-text-to-video

Pricing is internal only, recomputed and compared before transfer/submission; changing settings cannot reuse a stale quote. No public price-confirmation dialog. Image-only References pricing is used; video/audio references are not implemented or misrepresented.

## Media editing and validation

Image application admission remains PNG/JPEG, 25 MiB, 24 MP, dimensions 32–16384, with real-byte format/hash validation. Local video editor admission: MP4/WebM, matching container signature, 100 MiB; trim accepts decoded duration up to 10 minutes. These are application/editor limits, not invented claims about provider video-input support.

Uploaded videos are previewed and routed to Edit Video, never passed as an I2V image. Edit Input / Edit Output opens a local FFmpeg trim workflow with start/end, playable preview, download and explicit Save. A separate FFmpeg worker preserves the existing Audio/Merge worker. Original media is not overwritten. Manual output or edited copies update only the selected scene's video fields in a transaction after explicit Save, check that output has not changed concurrently, and preserve history.

Editor controls and contract are tested; real browser export and manual cloud save status are stated in acceptance below. An opened editor alone is not evidence that export succeeded.

## Existing production policy — read only

Live Vercel settings were queried specifically, without printing keys:
- VIDEO_DAILY_MICRO_USD=0 and VIDEO_TEAM_DAILY_MICRO_USD=0: no daily cap.
- VIDEO_MAX_REQUEST_MICRO_USD=500000: existing $0.50 per-request ceiling.
- CLOUD_VIDEO_PAID_ENABLED=true: existing production configuration, unchanged by this task.

The code also caps the configured per-request ceiling at $0.50. Consequently 1080p/5s with audio ($0.52), or Scene 1's 12s References at 480p ($0.72), are rejected before transfer/prediction. No new cap was invented; changing this existing policy requires a separate operator decision. No paid Generate action is performed in acceptance.

## Verification

- Full Web suite: final run 413/413 PASS, including two additional UI regressions for newer manual output and saved fixed-camera settings.
- An intermediate rerun hit a timing-sensitive existing kill-process recovery test (UPLOADING versus SUBMITTED). Isolated recovery rerun: 11/11; subsequent full suite: 411/411. No crash test was weakened.
- Firestore emulator: 7/7 PASS, sensitive collections denied and backend transactions/history preserved. Existing broad legacy collection behavior is unchanged.
- Scoped lint PASS; Workspace comparison retains its 46 pre-existing diagnostics with no additions. One narrow purity suppression documents the async explicit-Save event handler, which never runs during render.
- Vite production build PASS with frontend provider keys empty.
- Vercel production build PASS; 11 emitted functions (within the 12-function Hobby limit). Exact-known-secret scan of dist and Vercel static assets PASS; scoped 18-file release scan PASS.
- Existing 23/22 parser and protected-feature regressions are part of the full suite; source files for those features are excluded from release.

Actual commands: node docs/video-options-20261019/run-checks.cjs test; recovery; lint; build; vercel. node docs/video-options-20261019/run-emulator.cjs. node docs/video-options-20261019/workspace-lint.cjs. Additional read-only production-policy and acceptance-baseline helpers are in the same evidence directory.

## Release and browser acceptance

Pending final release verification. Pre-acceptance real project: Dự án Full AI - 11:15:27 PM, proj_1792167327214, 21 scenes, 2 saved outputs. Hash-only project and ledger snapshots are stored locally for before/after comparison. No cloud data has been changed during preparation.

## Explicit limitations

New T2V/References calls and new resolution combinations are NOT REAL PROVIDER VERIFIED. Automated tests mock paid endpoints. Existing successful I2V MP4s provide output/F5 evidence only. Reference videos/audio and full timeline compositing are not implemented; Edit Video is a real local trim editor. The legacy HTTP local-video panel remains separate from the production HTTPS cloud route. This release targets the requested production modal, without altering that local backend or GPU services.

## Changed files

Scoped list: docs/video-options-20261019/release-files.json. Production modules: SceneVideoAction, StoryboardTab, VideoOptionsModal, VideoTrimEditor, Workspace manual-save handler; cloudVideoOptions/Contract/Client, sceneVideoOutput, videoEditing; cloud core/service/publish and provider model allowlist. Tests: cloud-video, scene-video-flow and video-options-contract. Unrelated dirty reports, Qwen artifacts and phase5a/mock-http.json are preserved and excluded.
