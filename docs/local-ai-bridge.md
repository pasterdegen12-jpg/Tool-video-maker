# Local CPU script import bridge (Phase 3A)

This is an **opt-in, local backend API** for deterministic extraction. MainEditor still uses Gemini. Phase 3B adds a separately gated review-only MainEditor action; it does not write Firestore, mutate media, generate translations/Voice Profiles or invoke Qwen. See [local-parser-acceptance.md](local-parser-acceptance.md).

## Start locally

Use Node 20.9+ (verified with Node 24.16.0). Install the lockfile dependencies with `npm ci` when setting up a fresh checkout.

Configure the gateway in its own process with its existing service token and **`GATEWAY_START_GPU_WORKER=false`**. Use its documented startup procedure in `F:/tool-ai-dh/local-ai-gateway/HTTP_WORKFLOWS.md`. Phase 4B.2 makes this the Gateway default and removes Cooking application/interpreter/shared-lock dependencies. Its separate inference environment remains uninstalled; CPU parsing does not require it. This bridge does not start the gateway or change its GPU gates. Both services must remain bound to loopback.

For the Web bridge, create a git-ignored `.env.local-ai.local` in the Web root containing the following **template**. Replace placeholders locally; do not commit tokens:

```dotenv
NODE_ENV=development
LOCAL_AI_BRIDGE_ENABLED=true
LOCAL_AI_GATEWAY_URL=http://127.0.0.1:8000
LOCAL_AI_GATEWAY_TOKEN=<existing gateway service token, at least 32 characters>
LOCAL_AI_WEB_ORIGIN=http://localhost:5173
CLERK_ISSUER=https://<your Clerk instance domain>
CLERK_JWT_KEY="-----BEGIN PUBLIC KEY-----\n<Clerk JWT PEM public key>\n-----END PUBLIC KEY-----"
```

`8000` is an example port; use the actual local gateway listener port. The URL must be an HTTP literal `127.0.0.1` origin, with no path, query, credentials or redirects. `CLERK_ISSUER` and the JWT public key must be from the **same Clerk instance used by Web AI**. The public key is available from Clerk's API keys page. `CLERK_SECRET_KEY` is not needed for the networkless verifier. Replace the configured public key when the instance rotates it, and restart the bridge.

Start the bridge:

```text
node --env-file=.env.local-ai.local scripts/local-ai-server.mjs
```

Alternatively, provide the environment through your shell and run `npm run dev:local-ai`. These commands do not load an env file automatically unless `--env-file` is supplied. The bridge listens on `127.0.0.1:8789`. Missing configuration fails closed. No environment file or real credentials were created by Phase 3A implementation.

For local Web development, run `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` and open `http://localhost:5173`. The existing Vite configuration reserves `/api/local-ai` for the local bridge **before** the generic public `/api` proxy. Even with the bridge stopped, these requests never fall through to the cloud API. Existing Gemini routes are unchanged. The MainEditor preview invokes this namespace only with DEV mode, VITE_ENABLE_LOCAL_PARSER=true and a local browser origin.

The server rejects deployment to Vercel (`VERCEL` present) and all environments other than `NODE_ENV=development`, even if the feature flag is true. No public tunnel or deployment is part of this phase. Vercel's `127.0.0.1` is Vercel itself, not the user's PC.

## Authentication and ownership

POST requires the configured Origin. GET may use that Origin or, when a browser omits it, both an exact-origin Referer and Sec-Fetch-Site: same-origin. Every request still requires a valid Clerk bearer:

```text
Origin: http://localhost:5173
Authorization: Bearer <current Clerk session token>
```

The origin must match `LOCAL_AI_WEB_ORIGIN`. The bearer is the user's Clerk session token, **not** the gateway service token. A future UI client should obtain it from Clerk's existing session API and refresh it when necessary. Cookie-only requests are rejected. No wildcard CORS is enabled.

The official `@clerk/backend` verifier checks the signature and validity window with the configured public key and authorized party. The bridge also enforces the configured issuer, origin claim, user/session identity and non-pending session. The implementation follows [Clerk's networkless token verification API](https://clerk.com/docs/reference/backend/verify-token). Live Clerk sign-in is a remaining manual acceptance check; automated tests use ephemeral signed test tokens with the real verifier.

The verified subject owns an opaque 48-hex bridge job handle. Gateway IDs stay server-side. A different user receives the same 404 as an unknown job; the gateway is never called for that lookup. `userId`, `projectId`, arbitrary URLs and query parameters are rejected. This API only parses a submitted script: it has no project lookup, Firebase SDK, persistence or project-update operation. Project-resource authorization must be added before any future endpoint reads or writes stored projects.

Ownership is in memory in one local server process. Restart loses handles; reauthentication does not recreate them. Records retain only owner, workflow, source hash, upstream ID and polling counters/deadline, not input scripts, results or session tokens. At most 64 records globally and 8 per user are retained for five minutes; expired records are pruned on admission or owner lookup. This store is intentionally unsuitable for distributed/serverless deployment.

## API

`POST /api/local-ai/analyze` with `Content-Type: application/json`:

```json
{"projectType":"full-ai","script":"<original screenplay>","language":"en"}
```

Use `projectType: "semi"` and, for example, `language: "vi"` for Semi. `projectType` is mandatory and never inferred or omitted upstream. `language` defaults to `en`, uses the gateway language-tag grammar and does not cause translation. The request is limited to 262144 bytes and 40000 Unicode code points. The original script is forwarded without trimming or rewriting. The body deadline is ten seconds.

Admission returns HTTP 202:

```json
{"job_id":"<48-hex Web job handle>","state":"queued","status_url":"/api/local-ai/jobs/<same handle>","expires_at":"<ISO timestamp>","max_polls":120}
```

`Location` points to that relative Web route. `Retry-After: 1` tells the caller when to poll.

`GET /api/local-ai/jobs/{handle}` performs exactly one upstream GET, with fresh Clerk verification on each call. It returns HTTP 200 for `queued`, `running`, `completed` and `failed`. The body contains `job_id, state, result, error, metrics, expires_at, polls_remaining`. Queued/running have `result=null, error=null`. Failed jobs have `result=null` and a sanitized validation/worker error. Completed `result` preserves:

```json
{"projectType":"full-ai","execution":"deterministic_cpu","web_data":{"characters":[],"scenes":[]},"source_metadata":{}}
```

This example illustrates the envelope, not an actual empty-script result. Full AI scenes use canonical `Dialogue`, never `Voiceover` or cutting `time_origin`. Semi scenes use canonical `Voiceover`, with separate Footage/Effect/time_origin and `characters=[]`, never `Dialogue`. The source sidecar is retained. No content is inferred or normalized. Responses are checked for workflow, source hash, IDs, canonical fields, scene sidecar alignment and expected job states. A mismatched response is rejected, not silently repaired.

## Bounded polling and errors

The backend does not retry upstream calls. Each request has a ten-second upstream deadline, including response-body reading, and a 2 MiB response limit. No server request waits for a whole job to finish.

Caller rules implemented by the Phase 3B UI and applicable to a manual API client:

1. Submit once. A failed POST with `submission: "unknown"` may already have created a job; stop and present the ambiguity. Do not automatically POST again.
2. Poll only the relative Web `status_url`, at least one second apart. Stop on `completed` or `failed`.
3. Stop by `expires_at` or after 120 attempts, including retry attempts. The server independently enforces these bounds and rejects simultaneous polls.
4. For retryable GET errors, respect `Retry-After`; retries still consume the polling budget. Refresh a Clerk session on 401 before any manual continuation. Stop on 404/410 or non-retryable errors.

| Response | Meaning / action |
|---|---|
| 401 `UNAUTHORIZED` | Missing, invalid, expired or pending Clerk session. Sign in/refresh the session. |
| 403 `FORBIDDEN_ORIGIN` | Wrong local origin or Host. |
| 404 `INTEGRATION_DISABLED` | Feature off or cloud/production runtime. |
| 404 `JOB_NOT_FOUND` | Unknown/foreign/expired job or gateway/bridge restart. Stop polling. |
| 410 `POLL_EXPIRED` / `POLL_LIMIT` | Deadline/attempt budget reached. Stop polling. |
| 413 / 415 / 422 | Request too large, wrong media type, or invalid contract. Correct input. |
| 429 `POLL_TOO_FAST` / `BRIDGE_CAPACITY` / `GATEWAY_CAPACITY` | Respect bounded Retry-After. No automatic POST retries. |
| 503 `GATEWAY_AUTH_FAILED` | Gateway rejected its server service token. Fix server configuration, not the user's Clerk session. |
| 503 `GATEWAY_UNAVAILABLE` / `GATEWAY_NETWORK_ERROR` | Check local gateway process and CPU readiness. GET may be retried within bounds. |
| 504 `GATEWAY_TIMEOUT` | GET may be retried within bounds; POST outcome is unknown. |
| 502 `GATEWAY_INVALID_RESPONSE` | Stop and investigate upstream compatibility. |

Public HTTP errors have `error: {code, message, retryable, submission?}`. Raw upstream bodies, headers, tokens, exception stacks and URLs are not echoed. Failed CPU jobs preserve allowlisted validation codes plus safe scene/field/line positions, with fixed public messages.

The bridge deliberately has no GPU-health prerequisite. In CPU mode, authenticated `/health` can return 503 with `cpu_workflows.ready=true`, `worker_state=disabled`, `model_load_count=0`. That is sufficient for CPU parsing; it is not evidence of real model availability.

## Tests and future acceptance

`npm test` runs existing Web tests and the new bridge tests. The integration test starts a disposable real gateway on a free loopback port using `GATEWAY_START_GPU_WORKER=false` and guards against model imports/worker startup. It requires the existing gateway virtualenv and the two exact original Downloads files. Missing or hash-changed inputs FAIL; no substitute scripts are used. `PHASE3A_GATEWAY_ROOT` can override the gateway folder. `PHASE3A_EVIDENCE_DIR` selects the output directory; otherwise evidence stays in a temporary directory. Tests always stop their own services.

A review-only local UI is now available. Persistence/import confirmation, cloud support, durable distributed job ownership, live Clerk acceptance and real Qwen inference remain separate work. Cloud support requires an explicitly approved authenticated private transport, suitable service hosting and persistent ownership; do not remove the deployment guard merely to try a loopback URL in Vercel.
