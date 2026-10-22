# Remote Qwen Set ID — single Windows worker

Production browsers use only same-origin HTTPS `/api/qwen`. They do not contact localhost or install Qwen. The Windows machine must be powered on, with the existing Gateway and outbound worker running, to process jobs.

## Startup / status / shutdown

1. In `F:\tool-ai-dh\local-ai-gateway`, start the unchanged Gateway:

   `.venv\Scripts\python.exe -B -m ai_gateway.service_control run`

2. In another terminal, verify model readiness:

   `.venv\Scripts\python.exe -B -m ai_gateway.service_control status`

3. In `F:\tool-ai-dh\web-ai`, run the outbound worker using the already-installed inference environment (Pillow only; this script does not load the model):

   `F:\tool-ai-dh\local-ai-gateway\.venv-inference\Scripts\python.exe -B scripts\qwen-outbound-worker.py`

   `--once` processes at most one available job for controlled acceptance. An OS file lock prevents a second consumer on the same machine. Ctrl+C stops the foreground worker. A crash releases that lock automatically; no stale PID deletion is needed. No boot task or automatic model restart loop is installed. Stop the worker before gracefully stopping Gateway with its existing `service_control stop` command.

Private configuration defaults to `%LOCALAPPDATA%\WebAI\QwenWorker\worker.private.json`. It is outside Git with Windows ACL restricted to the operator and SYSTEM. Fields: `origin` (exact production origin), `imageOrigin` (existing R2 public origin), `workerToken` (256-bit random credential), `gatewayConfig` (existing private Gateway configuration path). Never paste the token into chat/logs or a VITE variable. The worker has no Firebase Admin credential.

For rotation: stop worker, securely replace its random token, update only server-side `QWEN_WORKER_TOKEN_SHA256` to SHA-256 of the token, redeploy the existing Web backend, then restart worker. Do not change Clerk/video/audio keys. The frontend feature flag is `VITE_ENABLE_REMOTE_QWEN=true`; backend flag is `QWEN_REMOTE_ENABLED=true`. Disable those flags and redeploy to roll back remote inference; persisted confirmed IDs remain visible. Preserve queue documents for investigation/recovery.

## Queue and protocol

One consolidated function: `/api/qwen?action=...`. All operations are POST JSON with no-store responses. Browser actions `create`, `status`, `cancel`, `confirm` use existing Clerk issuer/azp/origin verification and canonical project access checks. No Qwen per-account allowlist/grants are added. Existing owner/userId/ownerId restrictions and explicitly disabled project policy remain enforced; legacy unowned projects retain the existing shared policy.

Worker-only actions: `worker_claim`, `worker_renew`, `worker_result`, `worker_retry`, `worker_fail`. A separate bearer is checked against its server hash with constant-time comparison; browser Origin requests are rejected. Worker cannot call confirmation with its credential. The backend validates each lease token and project/character version.

Firestore `_qwen_queue/state` holds bounded job metadata and worker heartbeat, not image bytes. `_qwen_results/{jobId}` holds unconfirmed proposal plus normalized JPEG reference. Both collections and nested documents deny ALL client SDK access in deployed rules. Existing collection rules remain unchanged; their historical broad access is not repaired by this transport task. Backend authorization is mandatory for every queue operation.

Job bindings: unique cryptographic ID, creator subject/owner hash, project, stable character, complete character fingerprint, original saved image URL/hash, idempotency key, attempts, lease hash, timestamps. State progression: queued → running → proposal_ready → confirmed only after explicit authenticated approval. Terminal alternatives: cancelled/expired/failed. Result submission never edits a project. Confirmation reuses `migrateCharacterIdentity` inside a Firestore transaction and updates only `data`/`characters`; current fields/media are retained. Existing identity owner attribution is retained when an authorized team member confirms a replacement.

The canonical saved `character.imageUrl` must belong to the configured HTTPS media origin and exact project path. No arbitrary browser URL is accepted. Backend and worker independently validate this path. Downloads pin public DNS addresses, reject redirects/private destinations, cap bytes and validate images. Worker verifies original byte hash, makes an EXIF-aware proportional JPEG copy <=896px and <=512KB, then invokes the unchanged Gateway. Originals are never rewritten. Actual supported originals: PNG/JPEG/WebP; single-frame <=24MP and <=25MiB, subject to decoder checks. Gateway independently validates the normalized image and returned image hash.

## Operational bounds and recovery

- One globally leased job at a time; existing Gateway independently serializes GPU work.
- Maximum 32 pending/running jobs, 128 retained metadata entries; 20 creates per minute globally. These are operational bounds, not user privileges or spending limits.
- Jobs/proposals expire 30 minutes after creation. Terminal metadata/results are removed opportunistically after 24 hours on the next queue transaction.
- Lease 90 seconds, renewed every 20 seconds. Worker crash requeues after expiry, with at most three attempts. Late/foreign lease results are rejected. Identical result retries are idempotent; changed duplicate results fail.
- Worker checks every 60 seconds while idle/offline (up to 300 seconds on transport failures). At continuous idle operation this is about 1,440 short function calls/day, ~43,200/month, plus job/browser traffic. Watch actual Vercel/Firestore quota; no new paid service is provisioned.
- Browser status recovery on mount/F5; 5 seconds while running, 15 seconds queued, 30 seconds when offline, only while the card is mounted. Network errors stop polling with an explicit recovery action; no automatic duplicate create.
- Worker reports ready only when existing Gateway health says model_ready, not busy, worker_state=ready. It never lowers GPU thresholds, kills competing processes, starts/restarts the model, changes firewall, or opens a listener. Gateway remains 127.0.0.1:8765.
- If an in-flight local inference is interrupted or a lease is cancelled, late proposals cannot save. The resident Gateway remains the final GPU concurrency gate.

Vercel currently emits 12 functions including this dispatcher; inference runs outside Vercel. Reference docs: [function runtimes](https://vercel.com/docs/functions/runtimes), [limits](https://vercel.com/docs/functions/limitations). Each backend operation is short; no function waits for Qwen generation.

## Acceptance boundaries

Mocks and emulator tests do not prove real Qwen or cross-computer access. Production acceptance must create a job through a real Clerk UI, observe an outbound worker claim and real result, and verify no automatic confirmation. A browser on the same physical machine can prove production HTTPS transport without localhost dependency, but physical Computer B/C acceptance must be separately recorded. Never click paid WaveSpeed Generate for this test.
