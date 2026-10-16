# Local Visual ID — Phase 4B.2 standalone runtime update

Status: implementation and CPU/mock verification. Real Qwen inference and live Clerk acceptance have not run. Firestore profile persistence is NOT IMPLEMENTED.

## Use

This feature is local development only. The existing local bridge configuration in [local-ai-bridge.md](./local-ai-bridge.md) remains required, including the Clerk public verification key/issuer and server-only gateway token. Add these opt-in flags to your local environment; do not place service credentials in VITE variables:

- Web Vite: VITE_ENABLE_LOCAL_VISUAL_ID=true
- Web bridge: LOCAL_AI_VISUAL_ENABLED=true (in addition to LOCAL_AI_BRIDGE_ENABLED=true, NODE_ENV=development, no VERCEL)
- Gateway worker purpose: GATEWAY_GPU_TASK=visual_profile
- Vision selection: GATEWAY_VISUAL_MODEL_SIZE=4b (default for this purpose). Existing model path defaults to F:/Cooking-AI-review/models/qwen3-vl-4b. 8B selection is unsupported by the standalone runtime. No fallback/download occurs.

Phase 4B.2 implements a Gateway-owned loader, policy, mutex and contained worker. GATEWAY_START_GPU_WORKER defaults to false and GATEWAY_GPU_MODE is standalone. The separate Gateway inference environment has not been installed. Cooking application code, interpreter, services and lock files are not runtime dependencies; only the specified read-only checkpoint remains external. Real vision startup requires separate approval, fresh GPU/process/memory checks and containment. Gateway exclusion does not guarantee physical GPU exclusivity. Historical GPU_LOCK_MISSING findings describe the removed shared-lock implementation, not the current GPU state. No live GPU readiness measurement was performed in Phase 4B.2. The visual lane still excludes legacy GPU script generation; explicit full-ai/semi CPU parsing remains independent.

Open a Full AI project's Setup Nhân vật. Each character has one ✦ Set ID action. Select a local PNG/JPEG/WebP reference file (or the local original/crop of the OpenFrame); the selected character card provides the mapping. Review the exact preview image. Click Set ID, review the proposed descriptor, then explicitly confirm. An ambiguous/missing-person response has no confirmation action. Cancel stops browser waiting; it does not assert that GPU work was canceled.

The approved profile and its reference image remain in memory only. Changing tabs keeps the approved profile; leaving/reloading the workspace or changing the signed-in session loses it. Storyboard resolves profiles from the current character list without writing scene fields. Existing cloud character avatars, screenplay, voice/media and project save handlers are untouched. Remote R2/OpenFrame URLs are not fetched by this feature because project/asset ownership enforcement could not be demonstrated. Choose the local source file instead.

## Image/API contract

POST /api/local-ai/visual-profile accepts exactly image_base64 and mime_type, authenticated with the current Clerk session. It sends exactly those two fields to POST /v1/visual/profile on the configured loopback gateway. No character name/ID, screenplay, project ID, asset URL, file path or custom prompt is accepted. Web job handles are owned by the verified Clerk subject; polling re-verifies the session. The gateway bearer stays server-side.

Images: <=1 MiB decoded; PNG/JPEG/WebP only; one frame; width/height 32–4096 and <=4,000,000 pixels. JSON body <=1,400,000 bytes. Web checks MIME/magic/canonical base64; gateway verifies and fully decodes pixels before queue admission. Inference normalizes EXIF orientation/RGB, removes metadata, limits the frame to an 896-pixel long edge, checks input-token limits, and uses an in-memory frame with the standalone Gateway Qwen runtime. Private images are never written to disk by this feature. The original reference image remains in the browser's session profile.

Detection response: operation=visual_profile, image_sha256 matching the upload, and profile with exactly status, visual_id, visual_description. detected requires a lowercase snake_case ID (2–16 alphabetic segments, <=100 chars) and nonempty description <=600 chars. ambiguous/no_human require empty descriptor fields. Strict JSON and validation at worker, JobManager, Web and browser boundaries; no repair/fake fallback. Output constraint checks do not prove visual grounding or English-language quality; those require real Qwen testing.

Request/response deadlines reuse the local bridge (10s upstream requests, 10s upload, 5min handle TTL, <=120 polls, >=1s interval). Browser requests have a 15s ceiling, bounded polling and no automatic POST retry. Vision response bodies are <=8 KiB. The existing GPU job deadline, queue capacity, service auth, subprocess reaping and shutdown behavior are retained.

## Profile contract

Optional visualProfile on an effective character: status=approved, characterId, binding (stable ID/name/current avatar revision), visualId, visualDescription, referenceImage {dataUrl, sha256}. The implementation holds this in a separate scoped overlay, never in projectCharacters or Firebase updates. Existing optional approved profile data can be read if its binding/contract is valid; old projects without it work unchanged. Visual ID is distinct from character ID/name and voice IDs.

Resolution uses the scene's existing Character string and exact trimmed name or exact stable ID. It rejects collisions across ID/name and duplicate IDs/names, deleted/missing references and unapproved/stale profiles. It does not fuzzy-match or migrate renamed scene references. All matching scenes resolve dynamically to one approved profile. A textual descriptor alone does not guarantee face consistency in future video generation.

Vite keeps its existing host setting for other workflows, but its local AI proxy namespace now rejects non-loopback socket peers before proxying. Origin or X-Forwarded-For headers cannot bypass that check. The bridge itself still binds literal 127.0.0.1; no tunnel/public deployment was created.
