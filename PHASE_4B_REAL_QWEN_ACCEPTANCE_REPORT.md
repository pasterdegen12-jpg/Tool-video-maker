# Phase 4B — Real Qwen Vision and Live Local Acceptance

Date: 2026-10-12, Asia/Saigon. Fresh GPU capture started at **13:57:31 +07:00**; configuration check at **13:58:13 +07:00**.

**Decision: NO-GO for real inference and live acceptance in this session.** GPU reservation cannot currently be established under the existing contract. Required live service configuration is also missing. No Qwen model was loaded, no reference image was submitted, and no browser acceptance operation was performed. No production code or configuration was changed.

## 1. Results and evidence boundaries

| Check | Phase 4B status | What was actually established |
|---|---|---|
| NVIDIA memory/process inspection | PASS | Fresh hardware queries executed successfully |
| GPU readiness | FAIL | Shared lock absent; 14 other PIDs returned by the existing process query |
| Actual reservation acquisition | NOT RUN | Read-only diagnosis stopped at the missing lock; no lock or mutex acquired |
| Python package/version and checkpoint inventory | PASS | Required versions match; 4B config, processor files and both weight shards exist |
| CUDA/NF4 kernel execution and checkpoint loading | NOT RUN | Metadata inspection does not establish runtime compatibility |
| Gateway configuration readiness | FAIL | `Settings.from_env()` executed; required service token absent |
| Web bridge configuration readiness | FAIL | `readConfig()` executed; returned `INTEGRATION_DISABLED` |
| Actual service-token equality | NOT RUN | Neither launch context has its required token |
| Real Qwen image inference | NOT RUN | GPU reservation blocked; no explicitly selected real test image or subsequent operator approval |
| Real output JSON/schema validation | NOT RUN | No real output exists |
| Visual grounding, no-human and ambiguity recognition | NOT RUN | No image inference performed |
| Live Clerk/browser acceptance | NOT RUN | Live bridge prerequisites missing; no real sign-in exercised |
| Live Plaintiff-to-scene propagation / cancel / repeat | NOT RUN | No real proposal or approved result |
| Original screenplay byte integrity | PASS | Both actual source files match their prior SHA-256 values |
| Before/after live Set ID screenplay comparison | NOT RUN | No live Set ID operation occurred |
| Phase 4A file integrity | PASS | All 34 manifest files still match their Phase 4A final hashes |
| New test suites/build/lint | NOT RUN | No implementation changes; prior test results are listed separately below |
| Firestore profile persistence | NOT IMPLEMENTED | Remains outside scope; no Firestore writes performed |

Evidence: [GPU preflight](F:/tool-ai-dh/web-ai/docs/phase4b/gpu-preflight.json), [runtime/model inventory](F:/tool-ai-dh/web-ai/docs/phase4b/runtime-model-inventory.json), [configuration readiness](F:/tool-ai-dh/web-ai/docs/phase4b/config-readiness.json), [integrity checks](F:/tool-ai-dh/web-ai/docs/phase4b/integrity-checks.json), [executed checks](F:/tool-ai-dh/web-ai/docs/phase4b/executed-checks.json), [source references](F:/tool-ai-dh/web-ai/docs/phase4b/source-references.json).

## 2. Current GPU readiness and process inventory

Fresh measurements, not the historical Phase 4A values:

| Item | Observed value |
|---|---|
| GPU | NVIDIA GeForce RTX 3060, device 0 |
| Driver | 536.23 |
| Total memory reported by NVIDIA | 12,288 MiB |
| Used memory | 665 MiB |
| Free memory | 11,463 MiB |
| Gateway conversion to decimal MB | Used 697.30 MB; free 12,019.83 MB |
| Existing pre-load free-memory minimum | 10,500 MB, unchanged |
| Existing baseline policy | Preferred through 1,200 MB used; acceptable through 1,500 MB; warning region requires its existing policy; stop above 1,800 MB |
| Existing post-load policy | CUDA-only placement, at least 3,000 MB remaining; not executed |

The observed free-memory and baseline numbers satisfy the numerical pre-load thresholds. **This is not GPU-readiness PASS:** reservation and other-process requirements still fail. Free VRAM does not establish exclusive availability or guarantee successful model loading.

The NVIDIA compute-app query reported these 14 PIDs. Direct Windows limited-query process/token APIs verified the owner of 13 as `DESKTOP-OAQCL63\Admin`.

| PID | Process identity | Owner result |
|---:|---|---|
| 1228 | NVIDIA returned `[Insufficient Permissions]` | Unavailable; Windows access denied, error 5 |
| 6080 | explorer.exe | Admin, verified |
| 9624 | SearchApp.exe | Admin, verified |
| 10836 | LockApp.exe | Admin, verified |
| 10448 | TextInputHost.exe | Admin, verified |
| 1496 | vgtray.exe | Admin, verified |
| 6908 | ChatGPT.exe, Codex application | Admin, verified |
| 6376 | Zalo.exe | Admin, verified |
| 12904 | ZaloCall.exe | Admin, verified |
| 9920 | codex-computer-use-swift.exe | Admin, verified |
| 2592 | Video.UI.exe | Admin, verified |
| 13300 | SystemSettings.exe | Admin, verified |
| 1544 | Cortana.exe | Admin, verified |
| 14960 | Telegram.exe | Admin, verified |

All per-process GPU memory values are `[N/A]`. This inventory does not prove that each process is executing CUDA kernels, quantify its allocation, or establish that PID 1228 is harmless. No recognizable Cooking worker appears among the 13 identified entries, but that does not prove all Cooking workloads are absent.

An earlier CIM owner query returned `QUERY UNAVAILABLE` for all entries; it is retained in [process-inventory.json](F:/tool-ai-dh/web-ai/docs/phase4b/process-inventory.json). The later direct Windows queries above provide the successful ownership evidence. No process was stopped or altered.

`QwenAdapter.start()` rejects any nonempty `other_compute_pids` list at [inference.py:37](F:/tool-ai-dh/local-ai-gateway/ai_gateway/inference.py:37), without a desktop-process exemption. The actual `gpu_snapshot()` function was executed and returned the list above. The adapter itself was **not started**; `GPU_BUSY` describes the next failing source condition if the reservation issue were resolved, not a fabricated runtime exception from model startup.

## 3. Shared-lock lifecycle and reservation blocker

Observed path: `F:/Cooking-AI-review/jobs/.speech_gpu.lock`.

- It was absent both before and after the read-only probe.
- Gateway defaults to `gpu_mode=shared`. [GPUReservation.acquire](F:/tool-ai-dh/local-ai-gateway/ai_gateway/gpu.py:14) requires the file to exist; its missing-file branch raises `GPU_LOCK_MISSING` at line 36. It never provisions the shared file.
- When a legitimate file exists, gateway opens it read-only and exclusively locks byte 0 using `LockFileEx`, in addition to its own Windows mutex.
- Cooking speech obtains `FileLock` around its worker at [speech_service.py:131](F:/Cooking-AI-review/app/services/speech_service.py:131). Other inspected callers include [run_phase3a2.py:109](F:/Cooking-AI-review/scripts/run_phase3a2.py:109) and [dedicated_worker.py:290](F:/Cooking-AI-review/scripts/dedicated_worker.py:290).
- Installed Cooking `filelock` is **3.32.3**. Its Windows implementation opens or creates the file during acquisition. It unlocks/closes and attempts to unlink it on release unless `preserve_lock_file` is enabled. That option defaults to `False`; these inspected Cooking callers do not enable it. See [_windows.py:198](F:/Cooking-AI-review/.venv/Lib/site-packages/filelock/_windows.py:198) and [_api.py:661](F:/Cooking-AI-review/.venv/Lib/site-packages/filelock/_api.py:661).

Therefore a missing lock is consistent with a normal idle Cooking lifecycle. It is neither proof of exclusive GPU ownership nor proof of a broken Cooking worker. A lock file may also persist when cleanup cannot unlink it; existence alone would not prove availability.

**Confirmed operational mismatch:** gateway needs an already provisioned shared lock, while the inspected producer normally creates it only for a job and cleans it up afterward. The inspected Cooking source and root Markdown documentation did not provide a standalone, authorized persistent-lock provisioning/handoff procedure. This is a bounded finding, not a claim about undocumented operator procedures elsewhere.

The existing dedicated-worker guide is an **8B Scene 1 benchmark procedure on PC #2**, not a provisioning-only command for this 4B visual gateway. Running speech or that benchmark merely to create the file would launch unrelated work and would not solve the lifecycle contract. None was run. No dummy lock, lock deletion, `preserve_lock_file` patch, dedicated-mode change, VRAM relaxation or PID-filter change was made.

Required operator action: establish and document legitimate GPU ownership and a compatible reservation lifecycle, or select a genuinely reserved host and explicitly authorize its use. If no compliant shared-lock procedure exists, that needs a separately authorized design decision; Phase 4B does not invent one. A confirmation alone does not make the current 14-PID snapshot pass the unchanged gate.

## 4. Actual model selection and Python support

**Actual model loaded: none.** Neither 4B nor 8B was started.

The inspected launch environment contains no `GATEWAY_*` overrides or service token. Gateway cannot construct valid settings in that environment. Its source defaults remain `gpu_task=legacy_script`, legacy model path `F:/Cooking-AI-review/models/qwen3-vl-8b`, `gpu_mode=shared`, and worker startup enabled. These are defaults, not evidence of a running worker.

The intended Phase 4B selection requires `GATEWAY_GPU_TASK=visual_profile`. With `GATEWAY_VISUAL_MODEL_SIZE=4b`, [Settings.worker_config](F:/tool-ai-dh/local-ai-gateway/ai_gateway/config.py:60) selects the existing `F:/Cooking-AI-review/models/qwen3-vl-4b` unless an explicit visual path is supplied. No automatic 8B fallback was invoked or proposed.

The actual Cooking interpreter was run with `-I -B`, using only standard-library metadata and file inspection:

| Component | Installed version |
|---|---|
| Python | 3.12.14, Windows AMD64 |
| torch | 2.5.1+cu121 |
| transformers | 4.57.1 |
| bitsandbytes | 0.50.2 |
| accelerate | 1.11.0 |
| Pillow | 11.3.0 |
| lm-format-enforcer | 0.11.3 |
| filelock | 3.32.3 |
| pydantic | 2.11.7 |

The three exact versions enforced by the adapter match. Installed Transformers source contains `Qwen3VLForConditionalGeneration`. The 4B checkpoint config declares `qwen3_vl`, the expected architecture and hidden size 2560. Both shards referenced by its index exist: 4,967,229,296 and 3,908,490,048 bytes. Processor/tokenizer files and `chat_template.json` exist. Their presence/configuration was checked; weight hashes and checkpoint deserialization were not verified. File size on disk is not a VRAM estimate.

The read-only Cooking loader inspection confirms local-only loading, NF4 double quantization, BF16 compute and explicit CUDA device 0. Runtime CUDA availability, driver/kernel interoperability, tokenizer/processor execution, actual NF4 loading and image generation remain **NOT RUN**. Neither diagnostic imported Torch or created a CUDA context.

## 5. Clerk and local configuration readiness

Only expected configuration presence and safe boolean conditions were recorded. No key/token values, secret hashes or unrelated environment values were printed.

Checked inherited environment and these scoped files: Web `.env`, `.env.local`, `.env.development`, `.env.development.local`, `.env.local-ai.local`; gateway `.env`, `.env.local`. Only Web `.env` and `.env.local` exist. Gateway `start.cmd` / `Settings.from_env()` do not automatically load dotenv files.

| Requirement | Current observation |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Present in Web `.env`; validity/session not tested |
| `VITE_ENABLE_LOCAL_VISUAL_ID=true` | Missing |
| `NODE_ENV=development` for bridge | Missing in bridge launch environment |
| `LOCAL_AI_BRIDGE_ENABLED=true` | Missing |
| `LOCAL_AI_VISUAL_ENABLED=true` | Missing |
| No `VERCEL` flag | Satisfied in inspected environment |
| `CLERK_JWT_KEY` | Missing |
| `CLERK_ISSUER` | Missing |
| `LOCAL_AI_WEB_ORIGIN` | Not explicit; code default is `http://localhost:5173` |
| `LOCAL_AI_GATEWAY_URL` | Missing |
| `LOCAL_AI_GATEWAY_TOKEN` | Missing |
| `GATEWAY_SERVICE_TOKEN` | Missing; equality check NOT RUN |
| `GATEWAY_GPU_TASK=visual_profile` | Missing; default remains legacy script |
| `GATEWAY_VISUAL_MODEL_SIZE=4b` | Not explicit; 4B is the visual-purpose default |

`readConfig()` genuinely ran and returned `INTEGRATION_DISABLED`; no live Clerk token verification ran. Scope is the inspected launch contexts, not hidden environment values of unrelated running processes.

Safe operator setup, after resolving GPU ownership and approving continuation:

1. Configure the ignored Web `.env.local-ai.local` privately using the existing [bridge instructions](F:/tool-ai-dh/web-ai/docs/local-ai-bridge.md). Supply the real Clerk issuer and JWT PEM public verification key for the same instance as Web AI. Add `NODE_ENV=development`, `LOCAL_AI_BRIDGE_ENABLED=true` and `LOCAL_AI_VISUAL_ENABLED=true`. Leave `VERCEL` unset. Do not paste credentials into this report/chat.
2. Set the browser origin to the exact origin used, normally `http://localhost:5173`. Set the gateway URL to the actual local listener, using literal `http://127.0.0.1` and its port. Supply the same private service token on both server sides, at least 32 characters with no whitespace; never use a `VITE_*` variable for it.
3. Enable only the frontend feature flag `VITE_ENABLE_LOCAL_VISUAL_ID=true` in Web's local Vite environment. Configure gateway visual purpose and 4B selection explicitly in its process environment. Do not start it yet while the reservation blocker remains. The older CPU-only instruction `GATEWAY_START_GPU_WORKER=false` is insufficient for vision acceptance.
4. Once all GPU prerequisites pass and continuation is explicitly approved, use the existing gateway startup procedure without changing safety gates. The bridge command is `node --env-file=.env.local-ai.local scripts/local-ai-server.mjs`; the frontend command is `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`. These startup commands were **not executed in Phase 4B**.
5. Sign in using the existing Clerk UI. Select an existing Full AI project and the real local reference image explicitly intended for the selected character. Do not create a substitute project or synthetic image. No issuer, azp, session, origin or owner check may be bypassed.

## 6. Real-image acceptance, quality and performance

No actual reference image has been explicitly selected for this run. Existing screenplay files do not identify an authorized image. The mock PNG was not used as a substitute, and no remote character asset was fetched.

| Measurement | Actual result |
|---|---|
| Model loading time | NOT RUN / not measured |
| First / repeated inference latency | NOT RUN / not measured |
| Output tokens/second | NOT RUN / not measured |
| Peak allocated/reserved or device VRAM during inference | NOT RUN / not measured |
| Real output JSON/schema validity | NOT RUN |
| Visible-attribute accuracy / English description quality | NOT RUN |
| Ambiguous multiple-person recognition | NOT RUN |
| No-person recognition | NOT RUN |
| Reuse of one model load / absence of CUDA OOM under inference | NOT RUN |

The current adapter constructs one image plus the fixed `PROMPT` at [inference.py:110](F:/tool-ai-dh/local-ai-gateway/ai_gateway/inference.py:110). The route contract accepts image bytes and MIME type, not screenplay, roles, scene names or a custom prompt. This is source evidence only; no real model input/output trace was produced. Schema correctness alone would not establish grounding.

## 7. Live propagation and screenplay immutability

Live Plaintiff approval, Storyboard propagation, preservation of other profiles, repeat detection and cancellation are all **NOT RUN**. Expected Plaintiff scenes remain **3, 6, 9, 16 and 22**, derived from the real fixture's Character values. Production resolution remains dynamic; no scene numbers were added to code.

Historical [Phase 4A scene evidence](F:/tool-ai-dh/web-ai/docs/phase4a/scene-mapping.json) covers the real CPU-parsed fixture with a **synthetic approved profile**. It must not be read as a real Qwen result or a signed-in browser result.

Fresh byte checks of the exact original files:

| Input | Bytes | SHA-256 | Result |
|---|---:|---|---|
| `C:/Users/Admin/Downloads/kịch bản gen video AI.txt` | 17,406 | `e24725a239b5084dfa4dfd57192cf636e2ebf423ee953ada760bce29d15ca74b` | PASS, unchanged |
| `C:/Users/Admin/Downloads/kịch bản semi-content.txt` | 13,164 | `600431973c83c7c74603fcc1d347a0231c19a310a2a902669d3d8c99f12f9050` | PASS, unchanged |

Full AI 23 scenes and Semi 22 scenes were previously verified by the CPU parser. Phase 4B rechecked the complete original bytes, not a newly executed parser or live project snapshot. Thus preservation of original files is PASS; before/after live UI field comparisons remain NOT RUN. Semi's no-character behavior is source/prior regression evidence, not a new live acceptance result. The Semi sample's Time and Time_origin values coincide; a differing-values case remains unverified.

When unblocked, compare every scene and original authored field before and after each live operation: order/count, Character, Dialogue, Translate, Action, Context, Camera, Tone_of_Voice and all remaining source fields. Approving a Visual ID must not replace scene Character or alter Semi data. Do not click project save or invoke any other Firestore-writing action in this phase.

## 8. Commands actually executed and files changed

Read-only diagnostic executions:

```text
nvidia-smi --query-gpu=index,name,memory.total,memory.used,memory.free,driver_version --format=csv,noheader,nounits
nvidia-smi --query-compute-apps=pid,process_name,used_gpu_memory --format=csv,noheader,nounits
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -NonInteractive -File C:\Users\Admin\AppData\Local\Temp\web-phase4b-YGicLQ\process_inventory.ps1
```

From `F:/tool-ai-dh/local-ai-gateway`:

```text
.venv\Scripts\python.exe -I -B C:\Users\Admin\AppData\Local\Temp\web-phase4b-YGicLQ\gpu_probe.py
```

From `F:/Cooking-AI-review`:

```text
.venv\Scripts\python.exe -I -B C:\Users\Admin\AppData\Local\Temp\web-phase4b-YGicLQ\runtime_probe.py
```

From `F:/tool-ai-dh/web-ai`:

```text
node C:\Users\Admin\AppData\Local\Temp\web-phase4b-YGicLQ\config_probe.mjs
git diff --stat
git check-ignore .env.local-ai.local .env.local
```

The GPU probe also executed device-0 NVIDIA queries and the existing `gpu_snapshot()`. Python scripts used `-B` to avoid writing bytecode. Node filesystem reads performed targeted inspection and SHA-256 comparisons. Temporary diagnostic source paths and hashes, including failed inspection attempts and successful alternatives, are recorded in `executed-checks.json`.

New workspace artifacts only:

- `PHASE_4B_REAL_QWEN_ACCEPTANCE_REPORT.md`.
- `docs/phase4b/process-inventory.json`.
- `docs/phase4b/gpu-preflight.json`.
- `docs/phase4b/runtime-model-inventory.json`.
- `docs/phase4b/config-readiness.json`.
- `docs/phase4b/integrity-checks.json`.
- `docs/phase4b/source-references.json`.
- `docs/phase4b/executed-checks.json`.

Four diagnostic scripts were created only in the temporary directory shown above. There were no production source, dependency, environment, database, model, Cooking, audio/media, Gemini or GPU-policy edits. Existing dirty-worktree changes were retained. All 34 Phase 4A manifest files and 19 files captured at the beginning of this phase match their comparison hashes.

## 9. Test/build results by verification layer

No demonstrated real-detection implementation defect was reached, so no repair or new regression test was introduced. The instruction to run all relevant suites/build/lint after code changes was not triggered. Do not represent the following retained results as newly executed Phase 4B tests:

| Layer | Phase 4A recorded result | Phase 4B execution |
|---|---|---|
| Web unit/UI/contract suite | PASS, 145/145 | NOT RUN |
| Gateway CPU/mock suite | PASS, 197/197 | NOT RUN |
| Real HTTP CPU screenplay parsing | PASS, Full 23 / Semi 22 | NOT RUN; input hashes rechecked |
| Real HTTP image transport with mock worker | PASS | NOT RUN |
| Production build | PASS; existing large-chunk warning | NOT RUN |
| Targeted lint | PASS, scoped files only | NOT RUN |
| Real GPU Qwen inference | NOT RUN | NOT RUN |
| Real Clerk browser session | NOT RUN | NOT RUN |
| Live Firestore persistence | NOT RUN; feature NOT IMPLEMENTED | NOT RUN, prohibited in this phase |

Prior logs remain under [docs/phase4a](F:/tool-ai-dh/web-ai/docs/phase4a). Fresh Phase 4B diagnostics are the separate evidence set linked above.

## 10. Remaining blockers and operator decision

1. **GPU reservation — blocking.** The shared file is absent and its inspected lifecycle is temporary. Provide an authorized reservation/provisioning procedure compatible with both services, or explicitly choose a reserved host. Do not create a marker just to satisfy the existence check.
2. **Other GPU PIDs — independently blocking.** Fourteen entries are reported; one owner remains inaccessible. The operator must establish a host state that passes the unchanged process gate. No application termination or filter exemption is prescribed or performed by this report.
3. **Live configuration — blocking.** Privately configure actual Clerk verification settings, matching server tokens, bridge/frontend flags and explicit visual 4B purpose. Then authenticate through the normal browser flow.
4. **Real input and approval — pending.** Explicitly select the real character reference image and approve proceeding only after legitimate GPU access is confirmed. Multiple-person/no-person acceptance additionally requires appropriate real images.

A separate idle PC is a **conditionally viable deployment target**, not a verified solution. It must have the existing 4B checkpoint and compatible environment, explicit operator-approved GPU ownership, and pass the same pre/post-load gates. Even dedicated mode would not remove the other-PID or VRAM checks and has not been enabled. The existing PC #2 guide targets a different 8B benchmark; it does not prove this visual gateway works there.

The current Web bridge accepts only a literal loopback gateway URL. To use a separate PC without a new transport feature, the local Web frontend, bridge and gateway must run together on that PC. Merely pointing the current bridge at a LAN/public GPU server will be rejected. No machine setup, model copying/downloading, network exposure or deployment was performed.

**Operator confirmation is required by Phase 4B Steps 2 and 4 before any action affecting GPU workloads or real loading.** Please identify the approved host/reservation procedure, provide the local configuration privately, and select the real image before requesting continuation. Phase 4B stops here; visual quality and live acceptance remain unverified.
