# Phase 3B — MainEditor Local Parser UI + Live Clerk Acceptance

Date: **2026-10-11, Asia/Saigon**.

**Implementation and automated verification: PASS. Live Clerk browser acceptance: NOT RUN.** MainEditor now has an explicit local-only deterministic parser action and review-only preview. Existing Gemini generation remains the default. No project-saving behavior was added.

## 1. Files changed

All paths below are relative to `F:/tool-ai-dh/web-ai`:

| File | Change |
|---|---|
| `src/MainEditor.jsx` | Separately gated Local section; workflow/language state; uses existing script input. Original Gemini/media handler bodies remain byte-identical. |
| `src/LocalParserPanel.jsx` | Clerk hook, action/status/cancel UI, immutable-input lifecycle, safe scene/character/metadata preview. |
| `src/lib/localParserClient.js` | Exact request contract, local validation, bounded polling, timeouts, duplicate/stale prevention, response checks. |
| `api/lib/local-ai/auth.js` | Narrow browser GET header compatibility fix; Clerk verification and ownership unchanged. |
| `package.json`, `package-lock.json` | `jsdom` 30.1.2 as a dev-only test dependency. |
| `tests/local-parser-client.test.mjs` | 19 client/input/auth/state/retry/cancellation tests. |
| `tests/local-parser-ui.test.mjs` | 13 actual React DOM/jsdom preview, MainEditor and lifecycle tests. |
| `tests/local-parser-browser-headers.test.mjs` | 2 real Web HTTP tests with browser-style headers and signed test sessions. |
| `docs/local-ai-bridge.md` | Updated documentation for the preview UI and GET header contract. |
| `docs/local-parser-acceptance.md` | Exact manual setup and live Clerk checklist. |
| `docs/phase3b/*` | Logs, preview comparisons, real HTTP evidence, configuration/boundary checks. |
| `PHASE_3B_UI_PREVIEW_REPORT.md` | This report. |

No gateway files changed in Phase 3B. `src/main.jsx`, App, Firebase helpers, Workspace, StoryboardTab, Vite proxy, bridge job ownership/config/client and existing generation logic remain unchanged. Prior uncommitted work was preserved.

## 2. UI description and isolation

The Local section appears below the existing Gemini/Semi/Auto Flow buttons, separated by a cyan border. It has:

- Heading **Đọc kịch bản có cấu trúc · Local** and an explanation that it extracts scene_N fields, uses no Qwen, writes no new script, infers no descriptions/Voice Profiles and generates no audio/video.
- **Workflow Local** selector: Full AI or Semi-Content; **Ngôn ngữ kịch bản (không dịch)** selector: en/vi.
- Exact action label **Phân tích kịch bản có cấu trúc (Local)**; **Dừng chờ** only during an active request.
- Status and actionable error text, followed by a review-only result with counts, character list, expandable scenes in source order, a scrollable scene area, and complete source_metadata.

MainEditor previously had two independent Gemini action buttons, not a shared selected projectType. The new explicit local selector owns the projectType sent by this action; it does not infer workflow from script text or change which existing Gemini button does what.

Visibility requires all of `import.meta.env.DEV`, `VITE_ENABLE_LOCAL_PARSER=true` and a literal HTTP localhost/127.0.0.1 browser origin. Backend opt-in and production/Vercel rejection remain independent. Production was built with the frontend flag set true: the Local action, client API path and server-secret markers were absent from the production JavaScript bundle. No real settings were enabled persistently.

Screenshot / visual browser acceptance: **NOT RUN**. The description above corresponds to implemented JSX, with DOM behavior verified in jsdom; it is not presented as a real-browser screenshot or usability acceptance.

## 3. Clerk token and exact HTTP calls

`LocalParserPanel` uses `useAuth()` from the existing `@clerk/clerk-react` SDK/provider. Each HTTP request calls `getToken()` for the active session. Missing tokens or SDK acquisition errors stop with a sign-in message. No browser-supplied userId/projectId is submitted. Session changes replace the active preview component and invalidate old requests.

Only these requests are permitted by the client:

```text
POST /api/local-ai/analyze
Authorization: Bearer <current Clerk session token>
Content-Type: application/json
body: { projectType: "full-ai" | "semi", script: <exact state string>, language: "en" | "vi" }

GET /api/local-ai/jobs/<validated 48-hex Web handle>
Authorization: Bearer <current Clerk session token>
```

Fetch uses relative paths, `mode: same-origin`, `redirect: error`, `credentials: omit` and `referrerPolicy: same-origin`. Origin/Referer/Fetch Metadata are browser-managed; UI code does not forge them. Gateway token, upstream URL, internal ID and private backend environment are never referenced in UI source or responses.

Input validation rejects blank, oversized (>40000 code points / 262144 encoded request bytes), invalid workflow/language and obviously unstructured text without a scene_N heading **before** requesting a token or POSTing. Checks do not trim the submitted script. The source string is serialized unchanged.

**Browser newline limit:** a native textarea normalizes CRLF on paste/input. The new client preserves exactly the current textarea/React state string. Pure client tests also prove an input string containing original CRLF is forwarded unchanged. We do not claim that copy/paste preserves the input file's byte-level SHA-256.

## 4. Polling, cancellation and stale results

POST is attempted once. Ambiguous network/timeout/malformed admission reports that a server job may exist and never auto-retries. An immediate controller guard prevents duplicate clicks, including while Clerk token acquisition is pending; UI submit is disabled while busy.

The returned status_url must exactly match the relative Web path for the returned 48-hex handle. No arbitrary URL is followed. Each poll obtains a token, executes one GET and validates the response/job/workflow/canonical fields before showing results.

Bounds:

- At least 1 second between polls; honors Retry-After seconds or HTTP-date, including admission/backpressure.
- At most the smaller of server max_polls and 120 requests; at most the smaller of server expiry and 5 minutes from submission.
- Each HTTP/token acquisition operation has a 15-second browser deadline, also bounded by remaining job lifetime during polling.
- At most 3 consecutive transient errors; successful polling resets the consecutive-error counter, not the overall budget.
- Stop on completed/failed, 401, 404/410, non-retryable error, budget/deadline, cancellation, unmount or pagehide.

UI displays queued/running/completed/failed/expired/connectivity unavailable, with additional submitting/auth/error/cancelled states. A cancel aborts active fetch, clears polling timers and invalidates late promises. It states that the server job may still run; there is no server-cancel endpoint.

Script, workflow, language, Clerk session/sign-in state or the existing editor lock creates a fresh keyed preview instance. Old instances cancel on cleanup. Even a mock transport that ignores AbortSignal cannot apply its late result to the new editor. Pagehide also sets a cancelled state so back navigation does not restore an endlessly busy UI.

## 5. Preview results and data contract

Preview takes the actual envelope `result = {projectType, execution: deterministic_cpu, web_data: {characters, scenes}, source_metadata}`. Scenes are displayed in array/source order, not sorted or reconstructed. Character descriptions and voiceTone remain as supplied; empty values are marked empty without inventing content. All content is rendered using React text nodes, including JSON metadata. No trusted HTML, image/media element or script execution is created from source content.

| Check | Result | Evidence |
|---|---|---|
| Full AI 23 scenes: Character, Dialogue, Translate, Tone_of_Voice, Context, Camera, Action | **PASS 23/23** in actual React DOM replay | [full-ai.preview.json](docs/phase3b/full-ai.preview.json) |
| Full canonical Dialogue, no Voiceover alias | **PASS** | Field-by-field DOM/client checks; competing alias rejected |
| Full characters Judge/Defendant/Plaintiff | **PASS** in recorded response preview | Existing 10/8/5 mappings preserved |
| Semi 22 scenes: Voiceover, Footage, time_origin, Effect | **PASS 22/22** in actual React DOM replay | [semi.preview.json](docs/phase3b/semi.preview.json) |
| Semi characters=[], no Dialogue alias; absent fields empty | **PASS** | Canonical result checks and replay |
| Full source_metadata retained for review | **PASS** | Parsed JSON from rendered metadata equals original sidecar |
| Safe HTML-like speech/metadata | **PASS** synthetic negative test | Text preserved, no img/script/iframe/audio/video node |
| Local action invokes no Firebase, media generation or navigation | **PASS** automated MainEditor test | Write/media/navigation spies remain zero; request allowlist enforced |

The preview tests replay saved **real CPU outputs from Phase 3A**, with hash-verified original input files for client comparisons. HTTP and Clerk hooks in these UI tests are **mocked**. They are not Qwen outputs and not live Clerk browser acceptance.

All existing Web tests also reran their real CPU loopback integration with the two original files. Fresh evidence is in [real-http/full-ai.web-http.json](docs/phase3b/real-http/full-ai.web-http.json), [real-http/semi.web-http.json](docs/phase3b/real-http/semi.web-http.json) and [real-http/cpu-isolation.json](docs/phase3b/real-http/cpu-isolation.json): **23/23 and 22/22 PASS**, GPU worker disabled and no model imports. This path uses real Web backend/gateway/parser with signed **test** sessions; it does not include a signed-in browser.

Time equals Time_origin in all scenes of the real Semi sample. A real sample with different values remains **NOT RUN**.

## 6. Confirmed frontend/server compatibility issue and fix

Phase 3A required Origin on every request. Browsers commonly omit Origin for same-origin GET, so valid UI polling could otherwise fail 403. The browser also controls the Origin header; a frontend override is not a valid fix. This is documented by [MDN Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin) and [MDN forbidden request headers](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header).

The backend now accepts an **Origin-absent GET only** when both `Sec-Fetch-Site=same-origin` and the parsed Referer origin exactly match the configured Web origin. An explicit wrong/null Origin is rejected; POST still requires Origin. Missing/mismatched metadata fails closed. Fetch Metadata is browser-controlled, as described by [MDN Sec-Fetch-Site](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site).

This adjustment does not alter Clerk signature, issuer, authorized-party (`azp`), user/session, pending-session or job-owner checks. Two new tests exercise the browser-style headers over real Web HTTP with signed test tokens and confirm all identity/ownership gates still reject invalid requests. These header tests emulate browser headers; they are not represented as browser acceptance.

## 7. Live Clerk acceptance and exact blocker

**NOT RUN.** Inspection found `VITE_CLERK_PUBLISHABLE_KEY` in the existing Web `.env`, but no `CLERK_JWT_KEY`, `CLERK_ISSUER`, `LOCAL_AI_GATEWAY_URL`, `LOCAL_AI_GATEWAY_TOKEN` or enabled bridge in `.env`, `.env.local` or the inherited environment. No real signed-in browser session was acquired. No live authentication success is claimed.

The bridge's expected origin in its current defaults is **http://localhost:5173**. Vite defaults to port 5173 but accepts PORT; no live browser origin was observed. The acceptance checklist explicitly pins port/hostname and requires checking the actual address bar against the bridge configuration and Clerk session. `127.0.0.1:5173` and `localhost:5173` are not interchangeable for `azp`.

Manual steps, CPU startup and exact checks: [docs/local-parser-acceptance.md](docs/local-parser-acceptance.md). Configuration availability evidence: [live-acceptance-status.json](docs/phase3b/live-acceptance-status.json). No JWT key, issuer or authorization setting was weakened merely to pass a test.

## 8. Tests, build and lint

| Verification | Final status |
|---|---|
| All existing 58 Web tests retained | **PASS 58/58** |
| New client tests | **PASS 19/19** |
| New React DOM tests | **PASS 13/13** |
| New browser-header compatibility tests | **PASS 2/2** |
| Total Web suite | **PASS 92/92**, zero skipped/cancelled |
| Production build with VITE_ENABLE_LOCAL_PARSER=true | **PASS**; feature absent from production JavaScript |
| Lint LocalParserPanel, localParserClient, backend auth | **PASS** |
| Full MainEditor lint | **FAIL — 5 pre-existing findings**, unchanged count/messages; no new findings |
| Incremental MainEditor lint comparison | **PASS — no new findings** |
| git diff --check | **PASS**, line-ending notices only |
| Gateway standalone 163-test suite | **NOT RUN in Phase 3B**, because gateway source/tests were not changed; prior 163/163 baseline not presented as a new run |
| Real signed-in browser / screenshot / Vite browser chain | **NOT RUN** |
| Real Qwen inference | **NOT RUN** |

MainEditor baseline lint findings: unused React, setDarkMode and err; existing blobUrlsRef cleanup dependency warning; missing Error cause in existing Gemini error handling. These unrelated handlers were not refactored. Evidence: [main-editor-lint-comparison.json](docs/phase3b/main-editor-lint-comparison.json).

Production build keeps the pre-existing >500 kB chunk warning. jsdom is dev-only; tests ran on Node 24.16.0. The existing VM-module tests still use Node's experimental VM modules flag.

Commands actually executed include:

```text
npm install --save-dev --save-exact jsdom@30.1.2 --ignore-scripts --no-audit --no-fund --offline=false
node --test --test-reporter=tap tests/local-parser-client.test.mjs
node --experimental-vm-modules --test --test-reporter=tap tests/local-parser-ui.test.mjs
node C:\Users\Admin\AppData\Local\Temp\web-phase3b-psN1yj\verify.mjs web-tests
node C:\Users\Admin\AppData\Local\Temp\web-phase3b-psN1yj\verify.mjs build
node C:\Users\Admin\AppData\Local\Temp\web-phase3b-psN1yj\verify.mjs lint
node C:\Users\Admin\AppData\Local\Temp\web-phase3b-psN1yj\lint-main.mjs
git diff --check
```

The temporary runner expands all eight Web test files into `node --experimental-vm-modules --test --test-reporter=tap ...`, sets PHASE3A/3B evidence directories, invokes the actual Vite build command and ESLint on the three changed modules. Logs: [web-tests.txt](docs/phase3b/web-tests.txt), [build.txt](docs/phase3b/build.txt), [lint.txt](docs/phase3b/lint.txt). Regular rerun command is `npm test`.

## 9. Boundaries and remaining work

[boundary-checks.json](docs/phase3b/boundary-checks.json) records unchanged protected Web files, identical original Gemini/media handler bodies, no new backend-secret/Local-action markers in the production JavaScript, and no gateway file changes in Phase 3B. Existing audio/media/Firebase behavior was not exercised against live services; automated preview side-effect tests and existing compatibility tests passed.

- Live Clerk/Vite/browser acceptance is blocked on the missing server configuration and a real signed-in session. This is the **next recommended step**, using the checklist, before treating the UI as accepted for everyday use.
- Project import/save confirmation, Firestore authorization/mutations and Workspace application are **NOT IMPLEMENTED**. The Local feature is review-only, with no inert import button or fake save result.
- Cloud bridge deployment/private connectivity is **NOT IMPLEMENTED**; production/Vercel guards remain. No public tunnel was configured.
- Real Qwen/GPU readiness, Voice Profile quality and AI inference performance remain **NOT RUN**. No Cooking-AI-review, GPU reservation or audio generation changes were made.

**Stop at Phase 3B.** No automatic progression to Firestore import, Qwen inference or cloud deployment.
