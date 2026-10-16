# PHASE 4B.2 — Standalone Gateway implementation report

Date: 2026-10-12, Asia/Saigon. Final CPU suite started at 21:21:57 +07:00.

**Implementation + CPU acceptance: PASS. Real GPU readiness / real Qwen inference: NOT RUN.**

The Gateway now owns its loader, GPU policy, worker exclusion and contained process lifecycle. Final freshly executed regression: **255 passed, 0 failed, 0 errors, 0 skipped**, 9.761 seconds according to JUnit. This duration is test-suite time, not model loading or inference performance.

GPU startup remains disabled by default. No inference environment was created, no packages were installed, no Qwen weights were loaded, no CUDA was initialized, and no production mutex or real GPU reservation was acquired. This report does not authorize or initiate the next phase.

## 1. Scope and exact changes

Gateway root: F:/tool-ai-dh/local-ai-gateway.

The [installed-file manifest](docs/phase4b2/installed-files.json) contains all **27 Gateway files written** and their final SHA-256 values. The [Gateway diff](docs/phase4b2/gateway-changes.diff) compares them with originals captured before editing; unrelated working-tree changes were not reset.

| Files relative to Gateway | Final change |
|---|---|
| ai_gateway/config.py | Independent interpreter, standalone/4B visual defaults, GPU disabled, rejection of obsolete application/shared-lock settings and unsupported selections; no checkpoint probe during CPU configuration |
| ai_gateway/inference.py | Gateway runtime/policy/strict parser; removes Cooking import path, backend registry and frame shim; approved checkpoint check; explicit legacy-generation refusal |
| ai_gateway/qwen_runtime.py — new | Lazy upstream loader, fake-injectable dependencies, constrained visual generation, metrics and cleanup |
| ai_gateway/gpu_policy.py — new | Pure pre-load, post-load and resident policy; preserved thresholds and CUDA-only placement |
| ai_gateway/gpu.py | Gateway-only named mutex; no Cooking file locking; retained conservative NVIDIA snapshot checks |
| ai_gateway/process.py | Owned interpreter and scratch paths; sanitized environment; contained bootstrap; bounded readiness; cleanup on startup error/cancellation, shutdown and timeout |
| ai_gateway/windows_worker.py — new | Windows Job Object, retained owned process handle, verified bootstrap membership, tree cleanup and bounded failure path |
| ai_gateway/worker_bootstrap.py — new | Isolated CPU bootstrap; no inference imports before parent start command |
| ai_gateway/worker.py | Private protocol retained; resident safety monitor; fatal safety failures stop the owned worker |
| ai_gateway/jobs.py | Accurate standalone model/SDPA health metadata; deterministic CPU lane unchanged |
| scripts/inspect_runtime.py | Metadata-only inspector; no checkpoint access, model/processor import, CUDA/NVIDIA probe or reservation |
| requirements-inference.txt, requirements-inference-torch.txt, requirements-inference.lock.txt — new | Gateway-owned direct dependency pins; uninstalled pre-install manifests |
| README.md, HTTP_WORKFLOWS.md | Current ownership, disabled startup, HTTP behavior, safety limits, migration/rollback and acceptance limitations |
| .env.example, setup.cmd | Removes obsolete Cooking runtime/bootstrap instructions; documents disabled standalone defaults; CPU setup uses system Python 3.12 launcher |
| tests/conftest.py | CPU hard guards installed before test collection and in every test-owned Python child |
| tests/test_gpu_safety.py, tests/test_process.py, tests/test_visual.py | Replaces unsafe/obsolete production-lock and worker tests; preserves HTTP/image assertions |
| tests/test_analysis.py, tests/test_http_workflows.py | Replaces old Cooking-backend assumption and removed shared-lock configuration assertions |
| tests/test_standalone_runtime.py, tests/test_gpu_policy.py, tests/test_worker_containment.py — new | Loader mocks, boundary/refusal states, mutex/process lifecycle and independent configuration tests |

The two setup/template files and two additional existing test files were necessary compatibility corrections to the approved configuration/test refactor: otherwise setup still executed Cooking's interpreter and tests still required removed application behavior. setup.cmd was **edited only, never executed**.

Web changes are documentation only:

- docs/local-visual-id.md
- docs/local-ai-bridge.md
- This report and evidence under docs/phase4b2.

No Web source/UI, Clerk, Firestore, audio, Gemini, media or Seedance code was changed. No schema or database migration occurred. The before/after [scope hashes](docs/phase4b2/scope-integrity.json) cover 74 existing files, including **41 Web src/api files, all unchanged**. Gateway workflow_parser.py, workflow_schemas.py, workflow_execution.py, web_adapters.py, schemas.py, analysis.py, api.py and visual.py remain unchanged. This is a scoped hash comparison, not a claim that the entire pre-existing worktree was clean.

## 2. Cooking independence

**PASS — no Cooking application runtime dependency in the new worker path.**

- No Cooking application imports, backend classes, frame types, worker/pipeline APIs or sys.path injection.
- No Cooking interpreter selection. The new inference interpreter must resolve inside the Gateway root; the default is .venv-inference/Scripts/python.exe.
- No Cooking .speech_gpu.lock access, no Cooking services/queues/jobs, and no coordination with Cooking lifecycle.
- The only supported external asset is the read-only F:/Cooking-AI-review/models/qwen3-vl-4b checkpoint. This phase did not open its metadata or weights. Checkpoint validation in tests used an explicitly injected temporary mock checkpoint.
- Old GATEWAY_COOKING_ROOT, GATEWAY_GPU_LOCK_PATH and GATEWAY_MODEL_PATH names remain only to reject obsolete configuration explicitly. shared/dedicated modes and 8B are rejected, without fallback.

An existing provenance detail was retained transparently: Gateway .venv/pyvenv.cfg still records the historical Cooking interpreter in its creation command/executable fields. That environment was not rebuilt or edited. The **actual current process image, Python DLL, base prefix and base executable** resolve to the system Codex Python runtime under C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python, as measured from the running CPU process in [cpu-inspection.json](docs/phase4b2/cpu-inspection.json). These historical strings are not used as the new worker interpreter.

No Cooking source, environment, lock, configuration, cache or service was read, executed or modified by this implementation/test work. Negative guard tests use forbidden path strings and reject before access. No Cooking source was copied. This confirmation is based on the operations performed and CPU guards; no scan/hash of Cooking files was attempted merely to prove non-modification.

## 3. Standalone loader contract

**PASS with mocks; real loader execution NOT RUN.**

QwenRuntime is importable without Torch/Transformers/bitsandbytes. Only load() imports real inference dependencies, after exact core-version checks.

Implemented:

- Qwen3VLForConditionalGeneration and AutoProcessor through public library APIs.
- NF4, double quantization, BF16 compute/dtype, device_map={"": "cuda:0"}, upstream SDPA.
- local_files_only=True, trust_remote_code=False, no model fallback/download operation.
- Single resident model and explicit close(); cleanup after a failed load.
- Existing image normalization/validation reused; one image, maximum 896-pixel long edge.
- Existing input-token budget checked before transfer/generation; visual generation capped at 384 tokens.
- JSON-schema token constraints through lm-format-enforcer; existing strict JSON/Pydantic/result validation retained.
- Metrics prepared for load time, generated tokens, tokens/second and peak Torch allocation/reservation.

Tests inject fake processor/model/Torch/constraint objects. Their JSON, timings and memory numbers are **test data**, not real inference measurements. SDPA performance, actual checkpoint compatibility, bitsandbytes loading and visual grounding are NOT RUN.

Legacy GPU script generation is explicitly unavailable in this 4B visual deployment. The historical 8B courtroom smoke remains an unexecuted legacy artifact; it is not acceptance for this new visual runtime.

## 4. GPU safety

**PASS for CPU policy tests. Physical GPU availability/exclusivity: NOT RUN.**

| Rule | Implemented requirement |
|---|---|
| Pre-load free memory | >= 10,500 decimal MB; configuration cannot lower it |
| Baseline used memory | <= 1,500 decimal MB |
| Post-load/resident free memory | >= 3,000 decimal MB |
| Initial placement | Nonempty CUDA-only device map and all parameters on cuda:0; no CPU/disk offload |
| Process inventory | Reject competing compute PID, malformed inventory and explicitly unknown/ambiguous ownership |
| NVIDIA query failure | Fail closed |
| Unsupported configuration | Reject old shared/dedicated mode, external interpreter and 8B; no fallback |

The existing NVIDIA MiB-to-decimal-MB conversion and compute-process query behavior remain. The only excluded PID is the current worker itself; no other PID exemptions were added. WDDM/ambiguous competing compute entries are not reclassified as harmless. Policy boundary and malformed-input tests use CPU dictionaries.

Checks occur before/after load and before/after generation. A resident monitor also exits the owned worker on failed safety checks. Its observation interval includes NVIDIA query duration; it does not provide instantaneous protection.

**Limitation:** snapshots and a Gateway-only mutex cannot prevent unrelated GPU allocations between observations, or prove exclusive ownership of physical hardware. The retained process query is conservative but is not a universal scheduler for every graphics/API workload. Separate fresh operator-reviewed readiness remains necessary. No live nvidia-smi query, PID exemption, driver change, external-process termination or threshold reduction occurred in this phase.

## 5. Mutex and Job Object

**PASS — actual Windows primitives exercised using CPU test resources.**

Production mutex identifier in source: Global\LocalQwenGateway_GPU0_Phase1. CPU tests block acquisition of it and permit only unique Local\LocalQwenGateway_TEST_<uuid> names.

Mutex tests cover contention from a separate process, release/reacquisition, abandonment after an owned process exits, and owning-thread enforcement. WAIT_ABANDONED fails the current admission and requires restart/revalidation; it is not treated as a clean lease.

Process containment:

1. Create an unnamed, noninheritable Job Object with KILL_ON_JOB_CLOSE and no breakaway.
2. Spawn a fresh CPU bootstrap using the configured owned interpreter, -I and -B.
3. Assign the retained CPython Popen process handle, never an arbitrary reopened PID.
4. Verify the hello PID belongs to that Job Object; Windows virtualenv launcher and actual interpreter may be different processes.
5. Only then send the start configuration permitting inference imports.
6. Bound readiness, shutdown and cleanup; closing the owning Job handle kills its contained descendants.

Real CPU-only multiprocess tests cover:

- Bootstrap handshake, invalid/foreign PID and containment refusal.
- Graceful shutdown and forced shutdown.
- Request timeout and model-ready timeout.
- Startup fatal/protocol failure cleanup.
- Cancellation while awaiting the bootstrap.
- Owned child and grandchild cleanup.
- Supervisor os._exit crash: retained observation handles confirm both descendants exit.

Early startup cleanup closes stdin before killing/reaping the retained child, preventing a waiting bootstrap from retaining an open input pipe after a virtualenv redirection failure. No start command is sent on containment failure.

Initial test assumptions that one worker equals one OS process were corrected to verify Job membership; containment was not weakened. The implementation uses CPython Windows subprocess transport internals for the retained handle, so a Python/runtime change requires revalidation.

## 6. Executed tests and commands

Working directory: F:\tool-ai-dh\local-ai-gateway.
Interpreter: existing Gateway CPU .venv, Python 3.12.14.
No installation command was executed.

### Final full regression — PASS

~~~text
.venv\Scripts\python.exe -B -m pytest tests -q -p no:cacheprovider --basetemp=C:\Users\Admin\AppData\Local\Temp\gateway-standalone-5GOYWz\pytest-regression-3 --junitxml=F:\tool-ai-dh\web-ai\docs\phase4b2\regression-3.xml
~~~

Evidence: [JUnit XML](docs/phase4b2/regression-3.xml), [execution summary](docs/phase4b2/execution-summary.json).

| Test module | Passed |
|---|---:|
| test_analysis | 25 |
| test_api | 11 |
| test_gpu_policy | 22 |
| test_gpu_safety | 4 |
| test_http_workflows | 29 |
| test_jobs | 8 |
| test_process | 8 |
| test_real_workflows | 2 |
| test_spoken_contract | 3 |
| test_standalone_runtime | 22 |
| test_visual | 34 |
| test_worker_containment | 7 |
| test_workflows | 80 |
| **Total** | **255** |

The safe targeted run on this continuation executed:

~~~text
.venv\Scripts\python.exe -B -m pytest tests\test_gpu_safety.py tests\test_gpu_policy.py tests\test_standalone_runtime.py tests\test_worker_containment.py tests\test_process.py tests\test_visual.py -q -p no:cacheprovider --basetemp=C:\Users\Admin\AppData\Local\Temp\gateway-standalone-5GOYWz\pytest-targeted-4 --junitxml=F:\tool-ai-dh\web-ai\docs\phase4b2\targeted-4.xml
~~~

Result: **93/93 PASS at that revision**. Later tests are included in the final 255.

Intermediate broader runs used the same full-regression command with suffixes regression-1 and regression-2:

- regression-1: **250 PASS / 1 FAIL**. The failing test required the removed Cooking generate_profiled adapter. Replaced with explicit unsupported-legacy refusal coverage.
- regression-2: **254/254 PASS**.
- Final regression-3 adds bounded early-bootstrap cancellation coverage: **255/255 PASS**.

Earlier interrupted work had an initial sandbox temporary-directory ACL failure and a test revision assuming a single Windows process. Those were not accepted as final passes. Authorized CPU tests were rerun with access to their isolated temporary directories after unsafe old tests were refactored. No test relaxation enabled GPU/Cooking work.

One existing dependency warning remains: Starlette reports deprecated use of httpx in TestClient. No packages were changed to address it.

### Inspector and syntax — PASS, with deployment configuration unestablished

~~~text
.venv\Scripts\python.exe -I -B C:\Users\Admin\AppData\Local\Temp\gateway-standalone-5GOYWz\inspect_cpu.py
~~~

This temporary wrapper imports the same CPU guards, calls scripts/inspect_runtime.py, parses all **40 Gateway/test/script Python files** with ast.parse, and records current-process Python metadata. It writes [cpu-inspection.json](docs/phase4b2/cpu-inspection.json).

Results: no forbidden inference modules loaded; model/CUDA/reservation flags false; inference interpreter absent. configuration_valid=false because this shell has no GATEWAY_SERVICE_TOKEN; no obsolete Gateway environment names were present. Tests use isolated test credentials. No real service environment was configured.

This is syntax/static verification, **not a claim that a dedicated linter ran**. Dedicated lint: NOT RUN. Web npm tests/build: NOT RUN because Web changes are documentation only. Live Clerk/Firestore/UI acceptance: NOT RUN.

The temporary collect_evidence.py command copied exact JSON outputs from the final pytest directory into docs/phase4b2, and diff_evidence.py created the Gateway review diff. Neither runs a model or alters production behavior.

## 7. HTTP compatibility and real screenplay integrity

**PASS for the existing authenticated Gateway contracts on CPU/fake backends.**

The full suite exercises bearer authentication, malformed/bounded requests, queue/job behavior, safe errors, source validators and visual-profile HTTP/result validation. Actual loopback TCP requests for the two original scripts run through the existing FastAPI + JobManager CPU path. Fake visual/model fixtures remain clearly separate from those deterministic real-script tests.

Admission remains asynchronous HTTP 202 and polling retains the existing job envelope. Disabled GPU health remains HTTP 503 while cpu_workflows.ready can be true. CPU endpoints do not require an installed inference environment. Operational defaults intentionally change to GPU disabled / standalone / 4B visual; legacy GPU availability is not claimed as backward-compatible functionality.

Input files verified without rewriting:

| Original file | SHA-256 |
|---|---|
| C:/Users/Admin/Downloads/kịch bản gen video AI.txt | e24725a239b5084dfa4dfd57192cf636e2ebf423ee953ada760bce29d15ca74b |
| C:/Users/Admin/Downloads/kịch bản semi-content.txt | 600431973c83c7c74603fcc1d347a0231c19a310a2a902669d3d8c99f12f9050 |

| Expected result | Actual final CPU result |
|---|---|
| Full AI scene_1–scene_23 | **PASS — 23/23**, every per-scene comparison passed |
| Judge 10, Defendant 8, Plaintiff 5 | **PASS — exact counts and dialogue association** |
| 23 verbatim Dialogue fields | **PASS — canonical Dialogue; no Voiceover duplicate** |
| Dịch translation, no metadata speaker | **PASS — Translate mapped exactly; only 3 declared speakers** |
| No Full AI footage cutting time_origin | **PASS — absent** |
| Semi scene_1–scene_22 | **PASS — 22/22**, every per-scene comparison passed |
| 22 verbatim Voiceover, 22 Time_origin | **PASS — source text and time_origin preserved** |
| Voiceover independent from Footage | **PASS — each matches its own source field** |
| No Semi Character entity | **PASS — characters=[]; missing Character strings remain empty** |
| Missing Translate/Tone_of_Voice | **PASS — empty strings, no invented content** |
| Semi Time differs from Time_origin in this real sample | **NOT RUN — all 22 original values are equal** |

Evidence with actual output, expected values and comparisons for every scene:

- [Full AI HTTP](docs/phase4b2/full-ai.http.json) and [parser/adapter output](docs/phase4b2/full-ai.regression.json).
- [Semi HTTP](docs/phase4b2/semi.http.json) and [parser/adapter output](docs/phase4b2/semi.regression.json).
- [Compact scene summary](docs/phase4b2/scene-summary.json).

Tests elsewhere include authored edge cases, including distinct timing values; those do not establish that case using a real user sample. CPU preservation and schema success are not evidence of Qwen semantic quality, Voice Profiles or visual grounding.

## 8. Remaining runtime limits and environment status

| Item | Status |
|---|---|
| Independent loader/policy/worker source | **PASS — implemented and CPU-tested** |
| Inference direct-pinned manifests | **PASS — prepared only** |
| Fully resolved transitive/hash-verified inference lock | **NOT IMPLEMENTED in this code-only phase** |
| .venv-inference creation / inference package installation | **NOT RUN — interpreter absent** |
| Production bootstrap/production mutex | **NOT RUN** |
| Real checkpoint integrity/loading | **NOT RUN** |
| CUDA / driver / GPU readiness / competing workload inventory | **NOT RUN** |
| Real model reuse, OOM behavior, load time, latency, tokens/s, peak VRAM | **NOT RUN** |
| Real vision JSON quality, ambiguity handling and English descriptor grounding | **NOT RUN** |
| Real Web/Clerk/Firestore acceptance | **NOT RUN** |
| Firestore visual-profile persistence | **NOT IMPLEMENTED; unchanged from earlier scope** |

The inference manifests pin Torch 2.5.1+cu121, torchvision 0.20.1+cu121, Transformers 4.57.1, bitsandbytes 0.50.2, accelerate 1.11.0, lm-format-enforcer 0.11.3, Pydantic 2.11.7 and Pillow 12.3.0. No installation/compatibility claim is made. requirements-inference.lock.txt explicitly labels itself a pre-install direct constraint manifest; resolving transitive dependencies and verifying the installed environment require the next approved setup phase.

The existing CPU environment has no installed Torch, Transformers or bitsandbytes according to package metadata. The checkpoint directory was neither copied nor modified. Fresh runtime measurements must not be inferred from earlier shared-lock audits or fake metrics.

## 9. Migration, rollback and proposed next acceptance

Completed migration is code-only. No machine/service environment, driver, checkpoint or running application was reconfigured. Obsolete configuration is rejected instead of silently retaining unsafe semantics.

Rollback requires stopping only the Gateway normally, restoring its saved code/config revision if needed, and keeping GPU startup false. The removed Cooking dependency must not be reactivated automatically. CPU parsing can remain available while inference stays disabled.

Separate operator authorization is required before:

1. Creating the Gateway inference environment, installing the reviewed pins and resolving/verifying the complete environment lock. Use an independent system Python; do not use Cooking's interpreter.
2. Configuring the real Gateway launch environment and performing fresh GPU readiness/admission review. Review the lack of physical exclusivity, competing workloads, thresholds and OS containment capability.
3. Starting the actual contained worker, acquiring the production Gateway mutex and loading the approved read-only 4B checkpoint.
4. Running representative real vision acceptance: one-person/no-person/ambiguous images, strict result validation and grounding review, two requests reusing one load, load/latency/tokens-per-second/VRAM/OOM measurements, and owned shutdown cleanup.
5. Running live Web/Clerk acceptance in a separately approved scope. No Firestore changes are implied.

**Stop point reached: Phase 4B.2 complete for code + CPU validation. GPU deployment/readiness remains unverified.**
