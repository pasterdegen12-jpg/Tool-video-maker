# Phase 3B — live Clerk / MainEditor acceptance checklist

**Current status: NOT RUN with a real signed-in browser.** The environment has the existing frontend `VITE_CLERK_PUBLISHABLE_KEY`, but no configured `CLERK_JWT_KEY`, `CLERK_ISSUER`, `LOCAL_AI_GATEWAY_URL`, `LOCAL_AI_GATEWAY_TOKEN` or enabled bridge. Neither `.env`/`.env.local` nor the inherited shell environment supplied them. No Clerk setting was changed and no bypass was created.

Automated React DOM tests use a mocked Clerk hook. Backend auth tests use signed ephemeral test tokens. Neither is live Clerk acceptance.

## Prepare three local processes

Use the existing Clerk instance already configured by Web AI. Get its JWT PEM public key and exact issuer from that instance; do not create another authentication system or change production Clerk settings. Use a current browser session from the same instance. Test tooling uses Node 24.16.0; jsdom 30 requires a compatible recent Node runtime (24.15+ on the Node 24 line).

1. Gateway terminal in `F:\tool-ai-dh\local-ai-gateway`: supply the existing service token privately as `GATEWAY_SERVICE_TOKEN`, then run the following. Do not alter GPU reservation or locks.

   ```bat
   set GATEWAY_START_GPU_WORKER=false
   set GATEWAY_PORT=8765
   .venv\Scripts\python.exe -B -m ai_gateway
   ```

   This entry point binds to `127.0.0.1`. Authenticated `/health` may be 503; require `cpu_workflows.ready=true`, `worker_state=disabled`, `model_load_count=0` for this checklist.

2. Bridge terminal in `F:\tool-ai-dh\web-ai`: create a private, git-ignored `.env.local-ai.local` using the template in [local-ai-bridge.md](local-ai-bridge.md). Set `LOCAL_AI_GATEWAY_URL=http://127.0.0.1:8765`, matching gateway token, `LOCAL_AI_WEB_ORIGIN=http://localhost:5173`, correct Clerk issuer/public key, `NODE_ENV=development` and `LOCAL_AI_BRIDGE_ENABLED=true`. Then run:

   ```text
   node --env-file=.env.local-ai.local scripts/local-ai-server.mjs
   ```

   It listens only on `127.0.0.1:8789`. No real credential file was created during implementation.

3. Vite terminal in `F:\tool-ai-dh\web-ai`:

   ```bat
   set NODE_ENV=development
   set VITE_ENABLE_LOCAL_PARSER=true
   npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
   ```

   Open **http://localhost:5173**. Do not silently switch to port 5174 or the `127.0.0.1` browser hostname: these are different origins for Clerk `azp`. Vite proxies `/api/local-ai` to the local bridge. If choosing a different local origin intentionally, update the bridge allowed origin and use the matching Clerk session; do not remove issuer/azp/session checks.

## Verify with an actual browser session

Record each step as PASS/FAIL with the time and browser origin, without exporting cookies/session tokens/service tokens.

- [ ] Sign in through the existing Clerk UI. Confirm the address bar is `http://localhost:5173` and the bridge origin configuration is identical. Do not infer this from the example URL alone.
- [ ] MainEditor shows the separate cyan-accented Local section below existing Gemini actions. With the frontend flag off, it disappears. With the backend disabled, the request fails without falling back to Gemini.
- [ ] Paste the original `C:/Users/Admin/Downloads/kịch bản gen video AI.txt`. Choose **Full AI**, **English (en)**. Click **Phân tích kịch bản có cấu trúc (Local)** once.
- [ ] In Network, verify one `POST /api/local-ai/analyze`, body keys exactly `projectType, script, language`, followed only by `GET /api/local-ai/jobs/{48-hex Web handle}`. Do not copy Authorization values into the report.
- [ ] Confirm 23 scenes in source order; Judge 10, Defendant 8, Plaintiff 5; 23 exact Dialogue strings and translations; no Voiceover alias or cutting time_origin. Review source_metadata and empty descriptions/voiceTone.
- [ ] Paste the original `C:/Users/Admin/Downloads/kịch bản semi-content.txt`. Choose **Semi-Content**, **Tiếng Việt (vi)**. Confirm 22 scenes; Voiceover, Footage, time_origin and Effect separate; zero character entities; absent source fields remain empty; complete header/scene metadata is available.
- [ ] Compare submitted `script` with the textarea's current value. Browser textareas normalize pasted CRLF to LF; the client performs no additional trimming, newline normalization, translation or rewriting. Do not claim file-byte identity from copy/paste. In this Semi sample Time equals Time_origin throughout; a differing-time real sample remains untested.
- [ ] Verify polling waits at least 1 second and follows Retry-After. A same-origin browser GET may omit Origin; confirm it sends Referer at the configured origin plus `Sec-Fetch-Site: same-origin`. Browsers blocking both origin/referrer metadata fail closed. Do not forge these headers in UI code.
- [ ] During waiting, double-click prevention permits only one POST. Click **Dừng chờ**: GETs stop; the text states server work may continue. No server cancellation is claimed.
- [ ] Change script/workflow/language while waiting: previous request aborts, previous preview disappears, a late result cannot fill the new preview. Leaving MainEditor, pagehide or signing out also stops waiting.
- [ ] Let a session expire/sign out: the UI requests sign-in or stops on 401. It never bypasses Clerk or blindly retries POST. A fresh session is needed before explicit retry.
- [ ] Verify missing/expired job, unavailable backend and queue-limit handling as feasible. An ambiguous POST timeout warns that a job may already exist; it does not resubmit automatically.
- [ ] Verify there are no Firestore writes, project navigation, changed scene/media URLs, audio/video generation or automatic Gemini fallback from the Local action. Do not click existing Gemini generation buttons during this no-persistence acceptance run.
- [ ] Confirm rendering of source text is plain text. No HTML supplied in script/metadata becomes an executable element.

Record actual observations and any screenshot only after executing these steps. Production/cloud connectivity, Firestore import and real Qwen inference are outside this checklist and remain disabled/unimplemented in this phase.
