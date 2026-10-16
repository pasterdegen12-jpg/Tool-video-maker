# Phase 3A — Web AI Backend Integration with Local AI Gateway

Ngày kiểm thử: **2026-10-11, Asia/Saigon**.

**Kết quả: PASS cho backend local và deterministic CPU parsing.** Hai kịch bản gốc đã chạy qua Web HTTP → Gateway HTTP → JobManager → CPU parser/validator/adapter → Web HTTP response. Đây không phải kết quả Qwen inference. Tích hợp mặc định tắt, bị chặn trong production/Vercel, chưa nối vào giao diện.

## 1. Trạng thái xác minh

| Hạng mục | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Web backend → gateway thật qua TCP loopback | **PASS** | Gateway thật, FastAPI lifespan thật, JobManager thật; không mock parser/result |
| Full AI kịch bản thật | **PASS 23/23 scene** | Dialogue, Character, Dịch và các trường cảnh đối chiếu nguyên văn từng scene |
| Semi kịch bản thật | **PASS 22/22 scene** | Voiceover, Footage, Effect, Time_origin độc lập, nguyên văn |
| Clerk server-side verification và quyền sở hữu job | **PASS trong automated tests** | SDK Clerk thật xác minh chữ ký với khóa test tạm thời; không có auth bypass trong route |
| Phiên Clerk thật từ ứng dụng đang đăng nhập | **NOT RUN** | Chưa dùng session/token thật của người dùng; không suy diễn từ test token |
| Lỗi upstream, timeout, giới hạn polling | **PASS** | Mock upstream được ghi rõ; kiểm thử redirect dùng HTTP thật |
| Gateway restart mất job | **PASS** | Dừng và khởi động lại gateway test thật, Web trả 404 |
| CPU health trả 503 nhưng CPU ready | **PASS** | `cpu_workflows.ready=true`, `worker_state=disabled`, `model_load_count=0` |
| Toàn bộ Web tests | **PASS 58/58** | 37 test có sẵn + 21 test Phase 3A; không skip |
| Toàn bộ Gateway tests | **PASS 163/163** | Sau sửa hai fixture thời gian; xem mục 10 về lần chạy đầu |
| Web production build | **PASS** | Vite 8.0.14; còn cảnh báo chunk lớn và plugin timing |
| Lint backend mới | **PASS** | Chỉ `api/lib/local-ai` và `api/local-ai`; không tuyên bố lint toàn repository |
| Nút/luồng import deterministic trong UI | **NOT IMPLEMENTED** | Chủ động để giai đoạn sau theo yêu cầu |
| Browser → Vite proxy → bridge với phiên thật | **NOT RUN** | Proxy đã cấu hình; test HTTP hiện gọi trực tiếp backend Web local |
| Kết nối cloud đến máy local | **NOT IMPLEMENTED** | Production bị chặn; không tạo tunnel/deploy |
| Qwen, GPU inference, chất lượng Voice Profile | **NOT RUN** | Không load model, không đo AI tokens/second/VRAM |

## 2. Phạm vi source đã kiểm tra

- `api/` dùng Node ESM handler kiểu Vercel, không có middleware Clerk backend để tái sử dụng. Các route upload/audio/media hiện hữu không được sửa trong Phase 3A.
- `src/main.jsx` cung cấp ClerkProvider; `src/App.jsx` dùng SignedIn/SignedOut. Đây là bảo vệ UI, chưa phải xác thực server.
- `src/MainEditor.jsx` gọi Gemini REST trực tiếp trong trình duyệt. Full AI dùng `Dialogue`; Semi dùng `Voiceover` và tiếp tục cắt footage/lưu project theo luồng cũ. Không có lựa chọn import deterministic độc lập an toàn để nối ngay.
- `vite.config.js` trước đó chuyển `/api/gemini-test` đến backend local và `/api` chung đến `https://www.aivideomaker.live`. Namespace mới `/api/local-ai` được đặt trước proxy chung, chuyển đến `127.0.0.1:8789`.
- Firebase helper làm việc trực tiếp với project/media. Bridge mới không import helper, không nhận `projectId` và không gọi Firestore.
- Vercel không thể dùng `127.0.0.1` để truy cập PC người dùng. Phase này sử dụng một Node server local riêng, không thay runtime deploy đang có.

Không thực hiện lại audit các component lớn ngoài phạm vi cần thiết.

## 3. File thay đổi

Trong `F:/tool-ai-dh/web-ai`:

| File | Nội dung |
|---|---|
| `api/lib/local-ai/config.js` | Opt-in, chặn production/Vercel, cấu hình server và giới hạn |
| `api/lib/local-ai/auth.js` | Xác minh Clerk session bằng SDK chính thức |
| `api/lib/local-ai/client.js` | Client POST/GET gateway, timeout, kiểm tra response, lọc lỗi |
| `api/lib/local-ai/bridge.js` | Request validation, ownership, bounded polling, route handler |
| `api/lib/local-ai/errors.js` | Mã lỗi và thông điệp công khai cố định |
| `api/local-ai/analyze.js` | Entry point submit |
| `api/local-ai/jobs/[jobId].js` | Entry point polling |
| `scripts/local-ai-server.mjs` | Listener loopback riêng, Host guard, shutdown |
| `vite.config.js` | Proxy riêng cho namespace mới; Gemini/generic target giữ nguyên |
| `package.json`, `package-lock.json` | `@clerk/backend` 3.23.2, script chạy backend và Web tests |
| `tests/local-ai-bridge.test.mjs` | 20 test nhóm auth/ownership/error/timeout/limits; response mẫu là synthetic |
| `tests/local-ai-real-http.test.mjs` | 1 integration test với hai file thật, validation âm và gateway restart |
| `tests/support/local-ai-fixtures.mjs` | Khóa/session test tạm thời và mock upstream được ghi nhãn |
| `tests/support/gateway_cpu.py` | Chạy gateway test thật, cấm model import/GPU worker startup |
| `docs/local-ai-bridge.md` | Hướng dẫn cấu hình local, API, polling, hạn chế |
| `docs/phase3a/*` | Actual output, đối chiếu từng scene, test/build logs, manifest và bằng chứng |
| `WEB_GATEWAY_INTEGRATION_REPORT.md` | Báo cáo này |

Ngoài Web, chỉ sửa fixture trong **hai file test** của gateway:

- `F:/tool-ai-dh/local-ai-gateway/tests/test_jobs.py`
- `F:/tool-ai-dh/local-ai-gateway/tests/test_http_workflows.py`

Hai fixture đặt thời điểm cập nhật về quá khứ tương đối với TTL thay vì giá trị `0`. **Không sửa production source gateway.** Chi tiết ở mục 10 và `docs/phase3a/gateway-test-fixture-fix.patch`.

Repository đã có nhiều thay đổi trước Phase 3A. Báo cáo này chỉ nhận các thay đổi nêu trên. Hash trước/sau và phạm vi được giữ nguyên nằm trong `docs/phase3a/change-manifest.json` và `unchanged-boundaries.json`.

## 4. Kiến trúc backend và xác thực

```text
Future API caller (current Clerk session bearer + allowed Origin)
  → /api/local-ai/analyze hoặc /api/local-ai/jobs/{Web handle}
  → Clerk signature / time / authorized party / issuer / session checks
  → strict request contract + verified user ownership
  → server-only gateway client (service bearer, configured loopback URL)
  → gateway FastAPI → CPU JobManager → existing parser/validator/adapter
  → canonical result + complete source_metadata
```

Clerk SDK xác minh chữ ký và thời hạn bằng JWT public key, không cần network lookup trong mỗi request. Bridge yêu cầu issuer đúng instance, `azp` đúng local Web origin, `sub`/`sid` đúng kiểu session và không chấp nhận pending session. Không dùng userId do browser gửi, không decode JWT rồi tin claim chưa xác minh. Cách dùng networkless verifier tham chiếu [Clerk verifyToken](https://clerk.com/docs/reference/backend/verify-token).

Mỗi lần polling đều xác thực lại. Bridge sinh handle ngẫu nhiên 48 ký tự hex, lưu mapping đến gateway job ID với `owner = verified Clerk sub`. Người khác nhận 404 giống job không tồn tại, trước khi có request upstream. Không trả gateway job ID hay token về browser.

Store chỉ nằm trong bộ nhớ của một Node process local: owner, workflow, source hash, gateway ID, thời hạn và bộ đếm. Không giữ script, kết quả hay token trong ownership store. Giới hạn 64 record tổng / 8 record mỗi user, TTL 5 phút. Restart Web mất mapping và trả 404. Không có database/schema migration.

API không thao tác project lưu sẵn; `projectId` là field không hợp lệ. Vì vậy authorization project resource **chưa áp dụng** trong phase này. Bất kỳ bước lưu/ghi project sau này cần kiểm tra quyền đối với project thật trước khi bổ sung chức năng đó.

## 5. Environment và feature isolation

| Biến server | Vai trò |
|---|---|
| `NODE_ENV=development` | Điều kiện bắt buộc |
| `LOCAL_AI_BRIDGE_ENABLED=true` | Opt-in; mặc định không bật |
| `LOCAL_AI_GATEWAY_URL` | HTTP origin dạng `http://127.0.0.1:<port>` |
| `LOCAL_AI_GATEWAY_TOKEN` | Gateway service bearer, tối thiểu 32 ký tự |
| `LOCAL_AI_WEB_ORIGIN` | Mặc định `http://localhost:5173`; phải là local HTTP origin |
| `CLERK_JWT_KEY` | JWT public key PEM của Clerk instance hiện hữu |
| `CLERK_ISSUER` | HTTPS issuer chính xác của cùng Clerk instance |
| `VERCEL` | Nếu hiện diện thì integration bị chặn |
| `GATEWAY_START_GPU_WORKER=false` | Chỉ đặt trong process gateway CPU; bridge không thay GPU config |

Không thêm biến `VITE_` chứa secret, không tạo credential thật hoặc sửa env đang dùng. Backend bind `127.0.0.1:8789`. Hướng dẫn cấu hình/chạy chi tiết: [docs/local-ai-bridge.md](docs/local-ai-bridge.md).

Các entry point deploy vẫn trả 404 khi feature off hoặc ở production/Vercel, dù ai đó đặt opt-in flag. Namespace Vite luôn dành riêng cho bridge local để tránh vô tình gửi request sang cloud khi backend local đang tắt. Chưa thay UI, Gemini hay fallback provider.

## 6. Hợp đồng API và polling

Submit: `POST /api/local-ai/analyze`, JSON chỉ gồm `projectType`, `script`, `language?`. `projectType` bắt buộc `full-ai` hoặc `semi`; không thể rơi vào legacy GPU path do thiếu projectType. `language` mặc định `en`, không làm dịch nội dung. Giới hạn 262144 byte body và 40000 Unicode code point; không trim hoặc viết lại source.

HTTP 202 trả `job_id`, `state=queued`, `status_url` tương đối của Web, `expires_at`, `max_polls=120`; header Location trùng status_url, Retry-After là 1 giây. Gateway status_url chỉ được kiểm tra cấu trúc, không được dùng để fetch tùy ý.

Polling: `GET /api/local-ai/jobs/{handle}`, trả `job_id, state, result, error, metrics, expires_at, polls_remaining`. Bốn state queued/running/completed/failed được xử lý riêng. Completed giữ nguyên envelope:

```text
result = { projectType, execution: "deterministic_cpu",
           web_data: { characters, scenes }, source_metadata }
```

Bridge không viết lại Dialogue/Voiceover, không bịa mô tả/Voice Profile/bản dịch, không bỏ sidecar. Kiểm tra ID job, workflow, source SHA-256, scene fields canonical và sidecar trước khi trả kết quả. Các metrics được giữ theo allowlist CPU, không gắn nhãn Qwen performance.

Mỗi Web request chỉ gọi upstream một lần, deadline 10 giây kể cả đọc response, body response tối đa 2 MiB. Không giữ request mở đến khi job hoàn tất, không có vòng auto-retry POST.

Server giới hạn polling tối thiểu 1 giây/lần, không cho hai request đồng thời trên một job, tối đa 120 upstream attempts và deadline 5 phút. GET retry cũng tiêu thụ budget. 429/503 áp dụng Retry-After được giới hạn 1–60 giây; gateway 404 làm mất mapping. 410 yêu cầu dừng khi hết hạn hoặc hết số lần. Khi lỗi POST có thể đã tạo job, `submission=unknown`, `retryable=false`; caller không được tự submit lại.

Web auth lỗi trả 401. Gateway service-token lỗi được chuyển thành 503 `GATEWAY_AUTH_FAILED` để phân biệt với phiên Clerk. Network/timeout GET có thể retry trong budget; malformed response trả 502. Raw message/body/stack/token/URL từ upstream không được chuyển nguyên văn về client. Lỗi parser giữ mã allowlist và vị trí scene/field/line an toàn.

## 7. Input thật và expected vs actual

Hai file được đọc trực tiếp từ Downloads, hash-verify trước khi chạy và so sánh bytes sau khi chạy. Không tạo bản thay thế. Oracle độc lập chỉ tách scene và field một dòng của chính hai file này; không dùng output parser làm expected.

| Input | SHA-256 | Scene coverage |
|---|---|---|
| `C:/Users/Admin/Downloads/kịch bản gen video AI.txt` | `e24725a239b5084dfa4dfd57192cf636e2ebf423ee953ada760bce29d15ca74b` | scene_1…scene_23, **23/23 PASS** |
| `C:/Users/Admin/Downloads/kịch bản semi-content.txt` | `600431973c83c7c74603fcc1d347a0231c19a310a2a902669d3d8c99f12f9050` | scene_1…scene_22, **22/22 PASS** |

| Full AI expected | Actual |
|---|---|
| 23 Dialogue nguyên văn, kể cả dấu ngoặc kép/nội dung gốc | **23/23 PASS** |
| 23 mapping Character đúng với Dialogue | **23/23 PASS** |
| Judge 10, Defendant 8, Plaintiff 5 | **Đúng cả ba số lượng** |
| 23 bản dịch từ `Dịch` sang `Translate` | **23/23 PASS**, không tự dịch |
| Context, Camera, Action, Tone | **23/23 đúng field nguồn** |
| Không Voiceover alias, không cutting time_origin | **PASS** |
| Chỉ ba character entities; không metadata thành speaker | **PASS** |
| Không suy diễn character description/Voice Profile | description và voiceTone rỗng; **PASS theo hợp đồng deterministic** |

Actual response, admission và expected/actual cho **từng scene**: [full-ai.web-http.json](docs/phase3a/full-ai.web-http.json). Lần chạy lưu bằng chứng quan sát `completed` ngay ở poll đầu; không suy diễn rằng đã quan sát đủ queued/running qua GET.

| Semi expected | Actual |
|---|---|
| 22 Voiceover nguyên văn | **22/22 PASS** |
| 22 Footage độc lập với Voiceover | **22/22 PASS** |
| 22 Time_origin → time_origin | **22/22 PASS** |
| 22 Effect nguyên văn | **22/22 PASS** |
| characters=[]; không Dialogue alias | **PASS** |
| Character, Translate, Tone_of_Voice không có trong source | Cả ba rỗng ở mọi scene; **PASS** |
| Header và metadata riêng được giữ | 13 header fields, Time/Scene_Duration và các scene metadata; **PASS** |

Actual response và đối chiếu **từng scene**: [semi.web-http.json](docs/phase3a/semi.web-http.json). Lần chạy lưu bằng chứng quan sát `running → completed`.

**Time và Time_origin bằng nhau trong cả 22 scene mẫu Semi. Trường hợp hai giá trị khác nhau trên kịch bản thực tế: NOT RUN.** Không dùng kết quả này để kết luận đã kiểm chứng trường hợp khác nhau.

## 8. CPU isolation, lỗi và restart

Gateway test là process Python thật, dùng virtualenv gateway, `GATEWAY_START_GPU_WORKER=false`, runtime tạm, loopback port tự chọn. Có guard chặn import torch/transformers/bitsandbytes/inference/worker và chặn `ProcessBackend.start`. Guard không thay parser, validator, adapter hay JobManager.

Health thực tế là HTTP 503, CPU ready=true, model_ready=false, model_load_count=0. Không lấy HTTP health 503 làm lý do chặn CPU parsing. Khi shutdown cả gateway đầu tiên và instance sau restart, bằng chứng ghi nhận không có model import và không gọi GPU worker startup. Các process do test tạo đều được đóng.

| Kiểm thử | Loại bằng chứng | Kết quả |
|---|---|---|
| Full/Semi real scripts, exact strings và owner isolation | Web + gateway TCP thật, signed test sessions | **PASS** |
| Duplicate Dialogue → failed + safe scene/field/line | Source âm **synthetic**, parser/gateway HTTP thật | **PASS** |
| Gateway restart → job mất, 404 | Gateway process thật restart cùng port | **PASS** |
| queued/running/failed/completed, malformed/mismatched result | Mock upstream có nhãn synthetic | **PASS** |
| Web 401; token sai chữ ký/hết hạn/sai issuer/azp/pending | SDK Clerk thật, synthetic RSA tokens | **PASS** |
| User khác, upstream ID, supplied userId/projectId/URL | Backend HTTP và auth thật, mock upstream | **PASS**, không gọi gateway khi chưa được phép |
| Upstream 401/429/503/404/500; Retry-After | Mock upstream | **PASS**, lỗi được lọc |
| GET/POST network timeout, stalled body, bad JSON/status URL | Mock transport | **PASS**, không auto-retry POST |
| Deadline/attempt limit/backoff/concurrent polls | Backend thật, đồng hồ test có kiểm soát | **PASS** |
| Global/per-user capacity và reservation khi POST đồng thời | Backend thật, mock upstream | **PASS** |
| Body chunked quá lớn, body đến chậm, invalid JSON, Host giả | HTTP thật | **PASS** |
| Upstream 307 redirect | Hai HTTP server loopback thật | **PASS**, đích redirect không nhận request/token |
| Bridge restart mất ownership | Hai instance store độc lập | **PASS**, 404 |

Xem [cpu-isolation.json](docs/phase3a/cpu-isolation.json), [synthetic-validation-error.json](docs/phase3a/synthetic-validation-error.json) và [web-tests.txt](docs/phase3a/web-tests.txt). Các response synthetic không được gọi là inference.

## 9. Security review

- **PASS:** Gateway bearer chỉ nằm trong server configuration/outbound Authorization. Browser nhận handle Web riêng; tests xác nhận response không chứa service token, gateway URL hoặc gateway ID.
- **PASS:** Không có arbitrary upstream/poll URL. Server chỉ cho literal loopback origin, fixed route và validated ID; redirect không được follow.
- **PASS:** Mỗi request xác minh session và owner. Không có test-auth mode/env bypass trong production code. Test key chỉ nằm trong helper test và được sinh tạm trong RAM.
- **PASS:** Allowed Origin, Host guard, bearer-only auth, không wildcard CORS. Origin không thay thế kiểm tra chữ ký JWT.
- **PASS:** Body, response, timeout, job capacity, lifetime và polling đều có giới hạn. Ownership store không chứa raw script/result/token.
- **PASS:** Lỗi dùng thông điệp cố định, không echo nội dung upstream hoặc thông tin nội bộ. Responses `Cache-Control: no-store`.
- **PASS:** Không có marker backend mới/token env trong các JavaScript bundle build; `unchanged-boundaries.json` ghi kết quả scan. Không tuyên bố đã audit mọi secret có sẵn từ trước Phase 3A.
- **PASS:** Hash MainEditor, App, main, Firebase, Workspace, StoryboardTab, spokenText, API upload/audio/media và vercel.json giữ nguyên so với đầu phase. Hash production Python gateway giữ nguyên.
- **NOT RUN:** Live Clerk browser acceptance, UI/manual media regression và runtime Vite proxy acceptance. Existing UI contract tests vẫn pass.
- **NOT IMPLEMENTED:** Distributed/persistent ownership, cloud private transport, project read/write authorization và UI import. Production guard giữ nguyên cho đến khi có thiết kế và kiểm chứng các phần này.

## 10. Commands thực thi, test/build và lỗi fixture đã sửa

Các command chính đã thực thi trong Web root:

```text
npm view @clerk/backend version engines --json --offline=false
npm install --save-exact @clerk/backend@3.23.2 --ignore-scripts --no-audit --no-fund --offline=false
node --test --test-reporter=tap tests/local-ai-bridge.test.mjs
node --test --test-reporter=tap tests/local-ai-bridge.test.mjs tests/local-ai-real-http.test.mjs
node C:\Users\Admin\AppData\Local\Temp\web-phase3a-jRe4Yt\verify.mjs web-tests
node C:\Users\Admin\AppData\Local\Temp\web-phase3a-jRe4Yt\verify.mjs build
node C:\Users\Admin\AppData\Local\Temp\web-phase3a-jRe4Yt\verify.mjs lint
F:\tool-ai-dh\local-ai-gateway\.venv\Scripts\python.exe -I -B C:\Users\Admin\AppData\Local\Temp\web-phase3a-jRe4Yt\verify_gateway.py
git diff --check
```

Runner tạm `verify.mjs` thực sự chạy Node test runner với `--experimental-vm-modules --test --test-reporter=tap` và danh sách tất cả năm file `tests/*.test.mjs`; nó đặt `PHASE3A_EVIDENCE_DIR=F:/tool-ai-dh/web-ai/docs/phase3a`. Build chạy `node node_modules/vite/bin/vite.js build`. Lint chạy `node node_modules/eslint/bin/eslint.js api/lib/local-ai api/local-ai`.

Python runner gọi `pytest.main` cho toàn bộ `tests`, tắt cache provider, dùng basetemp riêng và ghi JUnit ra Web evidence. Integration runner thực sự spawn Python với `-I -B tests/support/gateway_cpu.py`; không chạy smoke_real.py.

Lần chạy đầy đủ gateway đầu tiên: **161 PASS / 2 FAIL**. Hai test retention đã đặt `updated=0`, giả định đồng hồ monotonic luôn lớn hơn TTL 1800 giây. Trên lần chạy này `created≈1265` giây, nên thời điểm 0 chưa hết TTL; runtime trả job là đúng. Đã giữ lại `gateway-initial.junit.xml` và `gateway-initial-verification.json`.

Sửa fixture tối thiểu:

```text
test_jobs.py: job.updated = job.created - settings.job_ttl_seconds - 1
test_http_workflows.py: updated = time.monotonic() - cpu_settings.job_ttl_seconds - 1
```

Lần chạy lại: **163/163 PASS**, không skip, không đổi số test hay logic retention. [gateway.junit.xml](docs/phase3a/gateway.junit.xml) lưu kết quả; [gateway-test-fixture-fix.patch](docs/phase3a/gateway-test-fixture-fix.patch) lưu diff. Cảnh báo Starlette/httpx deprecated vẫn tồn tại, không ảnh hưởng kết quả.

Web: **58/58 PASS**; [web-tests.txt](docs/phase3a/web-tests.txt). Build: **PASS**, 1837 modules, còn cảnh báo chunk >500 kB và plugin timing; [build.txt](docs/phase3a/build.txt). Lint backend mới: **PASS**; [lint.txt](docs/phase3a/lint.txt). `git diff --check`: **PASS** (chỉ thông báo chuyển LF/CRLF).

Lần chạy test ban đầu trong sandbox bị `spawn EPERM`; các lần có kết quả nêu trên đã chạy với quyền thực thi phù hợp, không được tính lỗi sandbox thành lỗi sản phẩm.

## 11. Phần còn lại và điểm dừng

1. **Live Clerk acceptance — NOT RUN:** cấu hình public key/issuer đúng instance, dùng session thật từ Web AI, kiểm tra submit và poll qua Vite. Không cần gateway token ở browser.
2. **UI deterministic import — NOT IMPLEMENTED:** cần lựa chọn riêng, hiển thị đây là source extraction, review `web_data` và `source_metadata`, rồi mới thiết kế thao tác lưu project có authorization. Gemini hiện tại giữ nguyên.
3. **Cloud connectivity — NOT IMPLEMENTED:** cần transport private được phê duyệt, hosting truy cập được gateway, job ownership bền vững và chính sách vận hành phù hợp. Không mở gateway public hay bỏ deployment guard để thử.
4. **Qwen GPU — NOT RUN:** cần bước readiness và smoke test riêng theo safety gate hiện hữu. Deterministic PASS không chứng minh chất lượng model, Voice Profile, tốc độ inference hay GPU capacity.
5. **Kịch bản thực tế ngoài hai mẫu — NOT RUN:** đặc biệt Semi có Time khác Time_origin. Kết quả chỉ chứng minh hai input gốc và các trường hợp synthetic được ghi nhãn.

**Dừng tại Phase 3A.** Không triển khai frontend replacement, Qwen, WaveSpeed, thay đổi audio/media generation, Firebase schema/migration hay public deployment.
