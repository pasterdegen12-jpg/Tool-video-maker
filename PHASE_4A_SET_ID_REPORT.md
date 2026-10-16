# PHASE 4A — ✦ Set ID using Qwen Vision

Date: 2026-10-11 (Asia/Saigon). Scope stops at Phase 4A.

Implementation and CPU/mock verification: **PASS**. Real Qwen image detection: **NOT RUN**. This is not a claim of verified visual recognition quality or production readiness.

## 1. Verification summary

| Area | Status | Evidence / limits |
|---|---|---|
| Web complete suite | PASS | **145/145**, 0 failures/skips; includes all 92 baseline tests + 53 new tests |
| Gateway complete suite | PASS | **197/197**, 0 failures/skips; includes all 163 baseline tests + 34 new tests |
| Web production build | PASS | 1,842 modules; existing >500 kB chunk warning remains |
| Lint: new UI/client/schema and modified bridge | PASS | docs/phase4a/lint.txt; not a claim that the entire existing repository is lint-clean |
| Real local HTTP: CPU parsers | PASS | Original Full AI 23 scenes / Semi 22 scenes, fresh Web → FastAPI → JobManager execution |
| Real local HTTP: image API | PASS | Real TCP Web/FastAPI routes + real image decoder, **mock vision worker** |
| Mock vision / React UI | PASS | Explicit confirm, cancel, stale response rejection, ambiguity/no-human/error handling |
| Real Qwen GPU inference | NOT RUN | GPU_LOCK_MISSING; NVIDIA also reports other compute PIDs |
| GPU safety enforcement | PASS | Read-only reservation preflight rejected loading; no safety bypass or dedicated mode |
| Live Clerk browser acceptance | NOT RUN | Required local bridge Clerk/server configuration absent; no real session used |
| Live Firestore persistence test | NOT RUN | No cloud writes executed |
| Approved profile cloud persistence | NOT IMPLEMENTED | Authorized fallback: separate in-memory overlay; ownership/rules cannot be demonstrated |
| Automatic reuse of remote R2/OpenFrame assets | NOT IMPLEMENTED | No authorized project/asset lookup path established; local file transfer implemented instead |
| Real vision quality, grounding, latency/VRAM metrics | NOT RUN | No model was loaded; mocked descriptions are not vision evidence |

Logs and machine-readable evidence are in [docs/phase4a](./docs/phase4a). Configuration/use guide: [local-visual-id.md](./docs/local-visual-id.md).

## 2. Implemented behavior and backend

The inspected SetupTab had avatar/voice upload and a Generate placeholder, but no existing Set ID button. One ✦ Set ID action is now placed in each existing Full AI character card. The user chooses a local reference image (including the local original/crop of an OpenFrame), sees that image, requests detection, reviews the descriptor, and explicitly confirms or cancels. No new characters are created. Semi has no Visual ID controls or character inference.

A proposal is never automatically approved. A failed, timed-out, ambiguous or no-human result preserves the previous approved profile. Changing the character identity/name/avatar, selected candidate image, project, or signed-in session invalidates pending results. Cancel aborts browser waiting and explicitly says server work may continue. Existing audio/video generation functions are not called.

The new gateway operation is POST /v1/visual/profile; the browser uses POST /api/local-ai/visual-profile and Web-owned job handles. It uses the existing authenticated GPU queue and subprocess, with a distinct operation and prompt. It does not call the CPU screenplay parser or legacy script prompt.

A visual worker explicitly selected by GATEWAY_GPU_TASK=visual_profile defaults to the existing **Qwen3-VL-4B NF4** checkpoint at F:/Cooking-AI-review/models/qwen3-vl-4b. The inspected Cooking registry exposes qwen3_vl_4b_nf4; its generate_profiled supports custom messages/schema and image frames. The local chat templates support image placeholders. The adapter passes only one image and a fixed visible-appearance instruction; no character name/ID, script, scene, role, custom prompt or original filename reaches Qwen.

The adapter reuses Cooking code read-only, with NF4 double quantization, BF16 compute and the existing attention setting. Frames are normalized in RAM, with a maximum 896-pixel long edge and input-token check. In-memory PIL-readable frame streams avoid leftover private files on worker termination. Output generation is capped at min(384, configured max_output_tokens). These interfaces are source-inspected and CPU/mock-tested, **not real-model verified**.

8B requires explicit visual model-size selection; no automatic fallback. Default legacy 8B configuration is unchanged. A visual-purpose worker does not accept legacy GPU script requests, so it cannot silently run them on a different model. Explicit Full AI/Semi CPU workflows remain available independently. No model download/copy, Cooking modification or environment/GPU mode change occurred.

## 3. Image source, authorization and security

Actual existing paths: Workspace.handleAvatarUpload and handleStartFrameUpload use local blob previews followed by R2 upload through /api/get-upload-url. Characters retain imageUrl; scenes retain startFrameUrl. Existing stored media are not altered by Set ID.

The inspected upload handler signs a client-supplied fileName and has no Clerk/project-owner check. Firebase autoSaveToFirebase creates a project without an owner/user field; updateProjectProgress uses setDoc with merge:true. firebase.json only configures hosting and contains no Firestore rules. Merge avoids replacing unrelated top-level keys, but cannot establish project ownership or safe concurrent character-array writes. Deployed Firestore rules were not tested, and are not assumed permissive or secure.

Therefore Phase 4A uses a minimal authenticated **local file transfer**, not an arbitrary URL/project-asset fetch. The user must select the original reference file from their computer; existing cloud avatars/OpenFrames are not auto-downloaded. This follows the task's permitted fallback instead of bypassing authorization.

Security controls verified:

- Current Clerk bearer verification, issuer/authorized-party checks and origin protections are reused; every poll re-authenticates. Web job ownership is the verified subject, never a submitted userId.
- Wrong-user polling returns 404. projectId/userId/characterId/URL/script/custom fields are rejected with 422 before forwarding. This is refusal of stored-project access, **not proof of an implemented project authorization system**.
- Only image_base64 + mime_type are accepted. PNG, JPEG, WebP; one frame; <=1 MiB decoded, 32–4096 px per edge and <=4 MP. Image JSON <=1,400,000 bytes, vision responses <=8 KiB.
- Web checks canonical base64, MIME and magic bytes; gateway verifies format, dimensions, frame count and fully decodes content before queue admission. Corrupt/truncated, animated and decompression-bomb images fail safely.
- No server URL fetch from input. The server-only bearer goes only to the fixed literal loopback gateway with redirects disabled. No image bytes or tokens are included in public errors/logs.
- Existing bounded admission, per-user/global job capacity, request deadlines, polling pace/limit, expiry and worker shutdown/reaping remain in use. An invalid private result/metrics cannot leak a partial successful profile.
- Both server and UI require explicit development flags. Production/Vercel rejects the API even with opt-in flags. Bridge binds 127.0.0.1. Vite's local AI proxy now checks the actual socket peer and rejects LAN peers regardless of forged Origin/X-Forwarded-For. Other Vite routes keep their existing behavior. No tunnel or deployment was created.

## 4. Output and approved profile contracts

Detection payload:

```json
{
  "operation": "visual_profile",
  "image_sha256": "hash of uploaded image bytes",
  "profile": {
    "status": "detected",
    "visual_id": "lowercase_snake_case_descriptor",
    "visual_description": "Concise visible-appearance description"
  }
}
```

These are field-shape examples, not real Qwen results. status may instead be ambiguous or no_human, requiring both descriptor strings to be empty. A job may complete with one of these explicit non-detection statuses; it cannot be approved. Strict JSON rejects duplicate keys, malformed/extra fields and invalid descriptors. detected requires 2–16 alphabetic snake_case segments, <=100 characters, and a nonempty description <=600 characters. Worker, JobManager, Web bridge and browser all validate the contract and image hash.

Optional effective-character.visualProfile contains status=approved, characterId, binding, visualId, visualDescription and referenceImage {dataUrl, sha256}. The binding identifies the selected stable character ID/name/current avatar revision. It does not replace character.id, name, description, imageUrl, voiceTone, voiceUrl or any media metadata.

New approvals live only in a separate workspace/session overlay. They are never inserted into projectCharacters, which avoids accidental inclusion in existing Firebase/media save handlers. No migration, Firestore schema change or new direct-write path exists. Legacy projects without visualProfile work unchanged; valid optional existing profiles can be read. The approved reference image is retained, since a textual ID alone cannot guarantee facial consistency in later video generation.

## 5. Character-to-scene mapping and source preservation

resolveSceneCharacterProfile(scene, characters, projectType) reads the existing Character string. It matches exact stable IDs or the project's trimmed, case-sensitive name convention. It rejects missing/deleted references, ambiguous name/ID collisions, duplicate matching references/IDs, and stale/unapproved profiles. It uses no fuzzy matching and does not migrate renamed scene references. Semi returns not_applicable.

Storyboard resolves the current profile at render time. One approval or replacement changes all corresponding effective scene badges; no Visual ID copies are written into scenes. Other characters remain unchanged.

Fresh real CPU regressions:

| Input | Actual result | Preservation |
|---|---|---|
| C:/Users/Admin/Downloads/kịch bản gen video AI.txt | 23 ordered scenes; Judge 10, Defendant 8, Plaintiff 5 | Entire canonical result equals Phase 3A capture; Dialogue/Character and all source fields preserved; no Voiceover/time_origin introduced |
| C:/Users/Admin/Downloads/kịch bản semi-content.txt | 22 ordered scenes; 22 Voiceover and 22 time_origin; characters=[] | Entire canonical result equals Phase 3A capture; Voiceover independent of Footage; missing fields stay empty |

Original SHA-256 values rechecked:

- Full: e24725a239b5084dfa4dfd57192cf636e2ebf423ee953ada760bce29d15ca74b
- Semi: 600431973c83c7c74603fcc1d347a0231c19a310a2a902669d3d8c99f12f9050

The real Full source actually references Plaintiff in scenes 3, 6, 9, 16 and 22. These were derived from Character values, not hardcoded into production. A **synthetic approved profile** was used solely to verify that all five resolve to the same profile and dynamically resolve to its replacement. The UI test renders the actual SetupTab and StoryboardTab against the real 23-scene result. Per-scene evidence: docs/phase4a/scene-mapping.json; source comparisons: docs/phase4a/real-http/{full-ai,semi}.web-http.json.

The real Semi sample has Time == Time_origin in all 22 scenes. No claim is made that this sample verifies differing values.

Byte comparisons against the start-of-phase snapshot confirm: all pre-existing Workspace/SetupTab/Storyboard logic is identical after removing only the new imports, provider wrapper, panel and badge insertions. MainEditor and firebase.js are byte-identical. Existing Generate Audio/media/Gemini logic, legacy Dialogue/Voiceover compatibility and references remain covered by baseline tests. No generation or live cloud writes were exercised.

## 6. Real GPU readiness and unverified quality

Actual read-only preflight (docs/phase4a/gpu-preflight.json):

- GPU: NVIDIA GeForce RTX 3060; total 12,884.90 MB, used 606.08 MB, free 12,111.05 MB (decimal MB).
- Existing configured minimum: 10,500 MB. Available memory alone does not establish readiness.
- F:/Cooking-AI-review/jobs/.speech_gpu.lock does not exist. GPUReservation in shared mode returned **GPU_LOCK_MISSING**, without creating the file.
- NVIDIA reported 13 other compute PIDs: 1240, 5780, 9224, 10724, 2888, 9704, 11616, 12596, 10732, 12436, 6336, 2928, 2496. The existing additional process gate would also require clearance.
- Dedicated GPU reservation is not confirmed. No process was terminated; dedicated mode was not enabled.
- Model config files exist for both 4B and 8B. Existence is not proof of successful load.
- Preflight imported no torch/CUDA. **No real inference was attempted after the reservation failure.**

ai_gateway/gpu.py, the complete pre-load gate block and post-load placement/VRAM gate block are unchanged (boundary-checks.json). Safe shutdown still only terminates the gateway's own child if required; CPU tests cover subprocess reaping.

Model loading time, first/second inference latency, actual tokens/sec, peak VRAM, detection accuracy, English quality, visual grounding, hallucination rate and multi-person/no-person recognition: **NOT RUN / not measured**. Schema validation and mocks prove software behavior, not recognition quality. Prompt instructions alone cannot prove that real Qwen will follow these requirements.

## 7. Test layers and executed commands

Web tests include unit contracts/mapping, mocked browser fetch, actual React DOM with a mocked Clerk hook, signed synthetic sessions verified by the real Clerk SDK, real CPU parser HTTP, and real image HTTP with a deliberately mock-only worker. The solid blue test PNG is clearly labeled synthetic. The mock may return an artificial human descriptor for transport testing; it is explicitly not evidence about the image.

Gateway tests include real Pillow decode, malformed JSON/image rejection, strict no-human/ambiguity contracts, image-only prompt/frame plumbing with fake processor/backend, queue limits/deadlines/shutdown, auth, backend reuse under a mock, private-result validation and all original regressions. No CUDA/model was loaded.

Commands actually executed using local temporary runners (paths retained; runners only capture logs and orchestrate CPU tests/build):

```text
F:\tool-ai-dh\local-ai-gateway\.venv\Scripts\python.exe -B C:\Users\Admin\AppData\Local\Temp\web-phase4a-AqrICM\preflight.py
F:\tool-ai-dh\local-ai-gateway\.venv\Scripts\python.exe C:\Users\Admin\AppData\Local\Temp\web-phase4a-AqrICM\install_pillow.py
F:\tool-ai-dh\local-ai-gateway\.venv\Scripts\python.exe -B C:\Users\Admin\AppData\Local\Temp\web-phase4a-AqrICM\verify_gateway.py
node C:\Users\Admin\AppData\Local\Temp\web-phase4a-AqrICM\verify.mjs web-tests
node C:\Users\Admin\AppData\Local\Temp\web-phase4a-AqrICM\verify.mjs build
node C:\Users\Admin\AppData\Local\Temp\web-phase4a-AqrICM\verify.mjs lint
node C:\Users\Admin\AppData\Local\Temp\web-phase4a-AqrICM\live_status.mjs
```

Gateway runner invokes pytest tests -q -p no:cacheprovider with a temporary basetemp and JUnit output under docs/phase4a. Web runner enumerates every tests/*.test.mjs and invokes node --experimental-vm-modules --test. Build invokes the installed Vite CLI with VITE_ENABLE_LOCAL_VISUAL_ID=true while production gating remains enforced. Pillow 12.3.0 was installed only in the gateway venv and pinned in its requirement files; no model dependencies/weights were installed and Cooking was not changed.

Initial test-run issues (new tests assumed 400 rather than the existing 422 contract, asynchronous test file-read timing, and new-code lint findings) were corrected. Final suites have zero failures. Gateway reports the pre-existing Starlette/httpx deprecation warning; Web reports the existing bundle size warning.

Live configuration presence was checked without printing secret values (live-status.json). CLERK_JWT_KEY/CLERK_ISSUER and local bridge/vision settings were absent in this process and Web .env/.env.local. No login, live Clerk session, browser acceptance or Firestore save is claimed.

## 8. Files changed

Only this phase's additions/edits are listed; pre-existing dirty worktree content was retained. Exact before/after hashes: docs/phase4a/change-manifest.json.

Web implementation:

- src/Workspace/VisualProfiles.jsx — scoped in-memory approvals, image selection/detection/review UI and scene badge.
- src/Workspace/SetupTab.jsx, Workspace.jsx, StoryboardTab.jsx — small insertions into existing UI.
- src/lib/visualProfile.js — strict contract, approval construction and deterministic resolver.
- src/lib/visualProfileClient.js — bounded image-only upload/poll/cancel client.
- api/local-ai/visual-profile.js; api/lib/local-ai/visual.js — new route and bounded visual request/result checks.
- api/lib/local-ai/{bridge,client,config,errors}.js — distinct operation within existing auth/ownership/transport, explicit visual flag and operation-neutral safe messages.
- scripts/local-ai-loopback.mjs; vite.config.js — reject remote peers on the local AI proxy namespace.

Web tests/docs:

- tests/visual-{profile,bridge,client,ui,real-http,loopback}.test.mjs.
- tests/support/visual-fixture.json and gateway_visual_mock.py (test-only, never a production mock backend).
- tests/spoken-text-contract.test.mjs — JSX test loader now resolves the newly imported child component; all previous assertions retained.
- docs/local-visual-id.md, docs/phase4a/* evidence and this report.

Gateway:

- ai_gateway/visual.py — image/input/output contracts, safe decoding, fixed prompt, strict result processing.
- ai_gateway/{api,jobs,process,worker}.py — dedicated visual operation through existing queue/protocol/deadline/shutdown; discard partial failed results.
- ai_gateway/{config,inference}.py — explicit worker purpose/4B-or-8B selection and bounded image adapter; GPU gates unchanged.
- tests/test_visual.py — 34 new CPU/mock tests.
- requirements.txt, requirements.lock.txt — Pillow 12.3.0 for CPU image validation.

## 9. Remaining blockers and recommendation

1. Real model execution is blocked by the missing provisioned shared lock and reported competing GPU processes. Resolve the reservation through the existing Cooking/GPU ownership mechanism; do not bypass gates or infer permission for dedicated mode. Then run real 4B image acceptance with actual selected reference images.
2. Live Clerk local-browser acceptance remains NOT RUN until the existing Clerk verification/server environment is configured. This phase does not alter credentials or use a fabricated live session.
3. Cloud profile persistence and automatic remote asset reuse remain NOT IMPLEMENTED until project ownership/Firestore rules and authorized asset access can be demonstrated. The current approved profile is intentionally session-local and lost on reload/leave/session change; it is not silently saved.
4. Real vision must still prove visible-only descriptions, correct ambiguity/no-human responses and consistent quality. No Qwen visual quality or runtime performance claim is made from mocks.

Recommendation: ready for controlled local acceptance **after** GPU and Clerk prerequisites are satisfied; not yet validated for real Qwen use or durable cloud profiles. Stop at Phase 4A. Seedance/video/cost/WaveSpeed integration was not started.
