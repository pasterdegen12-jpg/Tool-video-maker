# Phase 5A.1B — Local browser readiness và credential safety

Ngày: **2026-10-13, Asia/Saigon**. Project: F:\tool-ai-dh\web-ai.
Cấu hình được kiểm tra lúc 06:46:38 UTC, tương đương 13:46:38 giờ Việt Nam.

**Kết quả: cấu hình chưa sẵn sàng; Real Clerk và Full AI Storyboard live đều NOT RUN.**
CLERK_ISSUER và CLERK_JWT_KEY vẫn thiếu trong tất cả file môi trường đã kiểm tra và process hiện tại. Theo chỉ dẫn của operator, đã dừng browser acceptance trước khi chạy backend/Vite. Không tạo session test để thay thế, không tự cấu hình issuer/public key.

Đã hoàn tất kiểm tra chỉ đọc, quét credential có che giá trị, đối chiếu source/prompt và đề xuất audio riêng. Không sửa production source hoặc file môi trường; không rotate key, không commit/deploy. Không WaveSpeed ticket/upload/prediction, không Qwen/GPU/Gateway/Cooking hoặc Firestore write.

## 1. Configuration readiness

| Kiểm tra | Kết quả Phase 5A.1B |
|---|---|
| .env.video.local Git-ignored | **PASS** — .gitignore:27, pattern .env*; không được Git track |
| .env.video.local tồn tại | **FAIL readiness — chưa có file** |
| VITE_CLERK_PUBLISHABLE_KEY | Có trong .env, đúng định dạng; chưa xác minh bằng session thật |
| CLERK_ISSUER | **Thiếu** trong .env, .env.local và process |
| CLERK_JWT_KEY | **Thiếu** trong .env, .env.local và process |
| Public key thuộc đúng Clerk instance | **NOT RUN** — không có key để đối chiếu |
| Frontend instance khớp issuer | **NOT RUN** — issuer thiếu |
| NODE_ENV / LOCAL_VIDEO_ENABLED | Chưa cấu hình trong môi trường kiểm tra |
| LOCAL_AI_WEB_ORIGIN | Chưa đặt; code mặc định http://localhost:5173 |
| Browser origin/azp khớp backend | **NOT RUN** — chưa có browser session |
| WAVESPEED_API_KEY | Không được cấu hình; không cần cho nghiệm thu không trả phí |
| VITE_WAVESPEED_API_KEY | **Không rỗng trong .env** — chưa có process browser nghiệm thu đã cô lập key |
| LOCAL_VIDEO_PAID_ENABLED | **UNSET**, mặc định code=false; chưa có server live để xác minh flag runtime |
| 127.0.0.1:5173 và :8790 | **Không có listener** tại thời điểm TCP check |
| Khởi động dịch vụ | **NOT RUN** |

readVideoConfig với môi trường khởi động backend hiện tại trả INTEGRATION_DISABLED. Thử riêng các cờ development/enabled/paid=false trong bộ nhớ vẫn trả CONFIGURATION_ERROR do thiếu Clerk. Không ghi các giá trị thử xuống file và không khởi động server.

Checker phân biệt môi trường backend đọc .env.video.local với frontend Vite đọc .env/.env.local và env của process; không coi backend tự nhận mọi biến từ .env.

Bằng chứng: [readiness.json](F:/tool-ai-dh/web-ai/docs/phase5a1b/readiness.json).

## 2. Local services, proxy và network exposure

Source hiện có:

- [local-video-server.mjs](F:/tool-ai-dh/web-ai/scripts/local-video-server.mjs) bind 127.0.0.1:8790, kiểm tra Host và peer loopback.
- [vite.config.js](F:/tool-ai-dh/web-ai/vite.config.js) chuyển /api/local-video đến http://127.0.0.1:8790 trước proxy /api tổng quát.
- [local-ai-loopback.mjs](F:/tool-ai-dh/web-ai/scripts/local-ai-loopback.mjs) chặn peer LAN truy cập namespace local-video/local-ai.
- **Vite mặc định host: true.** Guard API không có nghĩa cả giao diện Web chỉ bind loopback. Khi mở lại nghiệm thu phải dùng --host 127.0.0.1 --port 5173 --strictPort như lệnh ở mục 10; không dùng lệnh dev mặc định để kết luận không có LAN exposure.

Source inspection: đã thực hiện. Backend thực chạy, proxy HTTP end-to-end và bind của dịch vụ đang chạy: **NOT RUN**. TCP check chỉ xác định không có listener ở hai địa chỉ loopback đã kiểm tra, không phải một phép quét mọi interface của máy.

## 3. Live Clerk: NOT RUN

| Yêu cầu | Trạng thái và giới hạn |
|---|---|
| Đăng nhập bằng tài khoản Clerk operator cho phép | NOT RUN — cấu hình backend thiếu |
| Xác thực chữ ký bằng public key đúng instance | NOT RUN live |
| Issuer và authorized-party/origin | NOT RUN live |
| Session ID, subject, expiry, pending status | NOT RUN live |
| Missing/invalid session trả lỗi đúng | NOT RUN live; không chạy lại fixture JWT |
| Không truy cập job của user khác | NOT RUN live |

[authenticateSession](F:/tool-ai-dh/web-ai/api/lib/local-ai/auth.js:4) hiện kiểm tra origin, Bearer, chữ ký, iss, azp, sub, sid, exp/nbf/iat và pending session. Service gắn owner với cả subject và session trước khi trả job.

Đây là kiểm tra từ source, không chứng minh xác thực thật đã chạy. Việc xác minh JWT bằng public PEM là networkless; không phải truy vấn trạng thái thu hồi session online trên từng request. [Clerk verifyToken](https://clerk.com/docs/reference/backend/verify-token).

Không dùng browser tool trong Phase 5A.1B sau khi xác nhận blocker. Không kết luận operator đã đăng xuất hoặc không có tài khoản.

Ngay cả khi cấu hình được bổ sung, server mới ở paid=false không tạo được job provider mới để làm bằng chứng cross-user trên job thật. Một GET đến handle không tồn tại trả 404 chỉ chứng minh job không tồn tại. Kiểm tra ownership live cần session thứ hai được operator cho phép và job hợp lệ có sẵn trong server, hoặc để lại NOT RUN đến giai đoạn được phép phù hợp; không gửi paid prediction chỉ để tạo dữ liệu kiểm tra.

## 4. Full AI Storyboard live: NOT RUN

| Hạng mục | Kết quả |
|---|---|
| Mở existing Full AI project, Storyboard, scene_22 | NOT RUN |
| Dialogue/Character/Action/Camera/Context hiển thị nguyên văn | NOT RUN trong browser; đối chiếu source ở mục 6 |
| Temporary prompt read-only trong UI | NOT RUN live; textarea có readOnly trong source |
| Chọn file ảnh operator thật | NOT RUN — chưa có file được operator chỉ định |
| Chọn 5s, 480p, 16:9, audio=true, camera_fixed=true, seed=-1 | NOT RUN live; utility settings đã chạy bằng CPU |
| Hiển thị giá tham khảo | NOT RUN live; utility hiện tính USD 0.1200 |
| Đổi ảnh/settings làm mất quote cũ | NOT RUN live |
| Cancel/stale | NOT RUN live |
| Paid submit disabled trên giao diện | NOT RUN live |
| Kiểm tra network browser không có WaveSpeed call | NOT RUN — không mở browser app |

Không có thao tác Save Cloud, Generate Audio, Set ID, Gemini, sửa scene hoặc sửa media. Không có request WaveSpeed nào do task này tạo ra; không có ảnh rời máy.

## 5. Paid backend disabled verification

**Không bật paid flag. Không có server live đang chạy trong task này.**

Source [config.js](F:/tool-ai-dh/web-ai/api/lib/seedance/config.js) chỉ coi paidEnabled=true khi env đúng chuỗi true; hiện biến unset nên mặc định false. [service.js](F:/tool-ai-dh/web-ai/api/lib/seedance/service.js) xác thực session rồi chặn submit bằng PAID_DISABLED trước upload/prediction nếu paid=false hoặc thiếu backend key. Provider có chốt độc lập. Quote chỉ xử lý ảnh và giá local.

- Chốt source: đã đọc, không đổi.
- LOCAL_VIDEO_PAID_ENABLED=false trong **acceptance server thật**: **NOT RUN**.
- 403 PAID_DISABLED bằng real session: **NOT RUN**.
- Evidence hồi quy từ Phase 5A.1 có kiểm tra bằng fixture; không coi là live acceptance mới.

Cờ video không vô hiệu hóa Generate Audio cũ. Vì vậy phải làm rỗng cả hai biến WaveSpeed trong process nghiệm thu và không thao tác audio.

## 6. Ảnh, prompt và source integrity

### Ảnh

**NOT RUN.** Operator chưa chỉ định ảnh thực tế cho scene_22. Không tìm ảnh tùy ý để thay thế và không tạo synthetic image. Filename/hash/single-person OpenFrame vẫn chưa xác minh. Giới hạn hiện tại của panel/server: PNG/JPEG tối đa 1 MiB; kiểm tra kích thước/decode cần chạy trên file thật sau khi operator chọn.

### Đối chiếu đọc trực tiếp nguồn

Đã chạy phép đối chiếu độc lập bằng CPU:

| Nguồn | Kết quả mới |
|---|---|
| C:\Users\Admin\Downloads\kịch bản gen video AI.txt | SHA-256 khớp baseline, 23 scene đúng thứ tự; mọi field nguồn trong capture cũ vẫn khớp dòng nguyên văn |
| C:\Users\Admin\Downloads\kịch bản semi-content.txt | SHA-256 khớp baseline, 22 scene đúng thứ tự; mọi field nguồn trong capture cũ vẫn khớp dòng nguyên văn |
| Production/config được bảo vệ | **79 file không thay đổi** trong task |
| Composer scene_22 | **PASS** — prompt giống bản Phase 5A.1, input không mutate |
| validateSettings / planDuration / estimateCost | **PASS chạy CPU** với thông số đề xuất |
| Project lưu trong tài khoản thật trước/sau UI | **NOT RUN** |

Không chạy lại Gateway/parser/adapter ở Phase 5A.1B. Kết quả adapter được đối chiếu từ capture đã lưu, còn file nguồn thật được đọc/hash mới. Không gọi phép so sánh độc lập này là một lần parser inference mới.

Semi Time_origin ánh xạ time_origin; Time và Scene_Duration nằm ở source_metadata; metadata bổ sung ở source_metadata.metadata. Checker ban đầu nhìn các field này như field phẳng và báo mismatch giả; đã sửa **checker độc lập** theo capture hiện có, không sửa production. Bản đầu được giữ ở integrity-initial-comparison.json, kết quả sau sửa không còn mismatch. Time=Time_origin trong file thật này; trường hợp hai giá trị khác nhau vẫn chưa được kiểm chứng bằng mẫu thật.

Scene_22 từ nguồn gốc:

| Field | Nguyên văn |
|---|---|
| Character | Plaintiff |
| Dialogue | "Oh, thank God. What about my house?" |
| Context | resolution |
| Action | Giữ nguyên góc nhìn của nhân vật, không thay đổi hướng nhìn. Thở phào nhẹ nhõm, rơm rớm nước mắt. Cử chỉ tay của nhân vật theo hội thoại và cảm xúc của nhân vật. |
| Camera | Camera cố định, không được di chuyển camera, không được thay đổi góc hay độ zoom của camera. Không có nhạc nền |
| Dịch → Translate | "Ôi, tạ ơn Chúa. Vậy còn ngôi nhà của tôi thì sao?" |
| Tone → Tone_of_Voice | (relieved, breathless) |

Đã chạy lại composer hiện có: 7 từ, ước tính 3,6 giây; 5 giây hợp lệ theo planner. Settings 480p/16:9/audio=true/camera_fixed=true/seed=-1 được validator chấp nhận. Lưu ý camera_fixed mặc định UI là false, nên lần live phải chọn true theo Camera gốc, không coi nó đã được chọn.

Giá CPU USD 0.1200 lấy từ bảng tham khảo trong code version 2026-10-12; không phải quote/session thật hoặc billing của provider. Không cập nhật giá ở task này.

Prompt giữ nguyên Action/Camera/Dialogue/Context/Character/Tone, không đưa Translate thành lời nói. Bản đầy đủ: [proposed-scene-22-prompt.txt](F:/tool-ai-dh/web-ai/docs/phase5a1/proposed-scene-22-prompt.txt). SHA-256 b20e85b9624c2e38df18aba2314d889a8aac7f5399068c03129792d244fad738.

Bằng chứng mới: [integrity.json](F:/tool-ai-dh/web-ai/docs/phase5a1b/integrity.json). Bộ thông số cũ vẫn là [PROPOSED ONLY](F:/tool-ai-dh/web-ai/docs/phase5a1/proposed-first-paid-test.json), chưa có approval hoặc consent.

## 7. Frontend secret exposure assessment

Đã quét **259 file text** trong working tree, bao gồm dotenv, file chưa track, backup và dist phù hợp; **35 text blob trong index** và **35 text blob tại HEAD**. Cách kiểm tra: so khớp chính xác giá trị secret local có hình dạng không-placeholder và heuristic credential. Không in giá trị, không lưu raw Git blob trong evidence.

| File/phạm vi | Phát hiện và hành động cần thiết |
|---|---|
| .env | Có WaveSpeed key không rỗng, không giống placeholder; file không tracked. Cần cô lập khỏi acceptance process và rà soát các bản build từng dùng key |
| src/Workspace/Workspace.jsx | Dòng 671/693 đọc VITE_WAVESPEED_API_KEY để gọi audio provider từ client. Cần proposal chuyển transport về backend; chưa sửa |
| dist/assets/index-NxQkttCS.js | Không khớp giá trị WaveSpeed local đã biết; key-shaped candidate khớp cấu hình Firebase, không được coi là phát hiện key WaveSpeed |
| Current index và HEAD | Không phát hiện known secret/heuristic candidate trong text blob đã quét |
| Lịch sử Git cũ, remote hosting/CDN/CI log | **NOT RUN** — chưa thể kết luận không có credential từng bị commit/deploy |

Khóa Firebase client có vai trò nhận diện dự án; bảo vệ dữ liệu còn phụ thuộc Rules/App Check và API restrictions. Task không kiểm tra hoặc sửa các cấu hình đó. [Firebase API keys](https://firebase.google.com/docs/projects/api-keys).

**Rủi ro WaveSpeed đã xác nhận là giá trị ở biến frontend có đường sử dụng thực trong source.** Biến VITE_ được Vite cung cấp cho client; gitignore không ngăn bundle chứa key. [Vite env documentation](https://vite.dev/guide/env-and-mode).

Không chứng minh key đang còn hiệu lực, có bị lạm dụng hay deployment hiện tại có chứa nó. Bản dist sạch key hiện có không xóa được rủi ro từ bundle/cache cũ. Operator cần rà soát deployment, credential usage và rotate/revoke nếu key từng được phân phối ra client; không rotate ngầm trong task này.

Phạm vi loại trừ: binary, node_modules, Git internals dưới dạng filesystem, .vercel và thư mục công cụ; Git chỉ đọc HEAD/index bằng plumbing. Quét heuristic không bảo đảm phát hiện mọi kiểu secret hoặc mọi lịch sử commit. Không tạo commit mới, không thay index, không in credential.

Evidence: [credential-audit.json](F:/tool-ai-dh/web-ai/docs/phase5a1b/credential-audit.json), [phân loại sau rà soát](F:/tool-ai-dh/web-ai/docs/phase5a1b/credential-classification.json).

## 8. Đề xuất xử lý audio riêng — chưa thực hiện

Tài liệu riêng: [AUDIO_CREDENTIAL_REMEDIATION_PROPOSAL.md](F:/tool-ai-dh/web-ai/docs/phase5a1b/AUDIO_CREDENTIAL_REMEDIATION_PROPOSAL.md).

Đề xuất chỉ chuyển submit/poll của hai chế độ audio hiện có sang backend có Clerk/origin/owner checks, fixed provider endpoints và key server-side mới. Giữ payload, giao diện, batch, kết quả audio và schema lưu media. Không sao chép key frontend cũ sang backend.

Proposal có test payload tương thích, auth/IDOR/SSRF, UI/persistence/mock-provider, kiểm tra bundle không chứa key và kế hoạch deploy/rotate/rollback. Tab cũ dùng bundle có key phải reload sau revoke; không thể bảo đảm tab cũ tiếp tục tạo audio bằng key đã thu hồi. Không fallback về frontend key khi rollback.

**Không có audio implementation, rotation hoặc deployment nào đã diễn ra.**

## 9. Files changed và actual verification

Chỉ thêm tài liệu/evidence/helper độc lập:

- FULL_AI_PHASE_5A1B_LOCAL_BROWSER_REPORT.md.
- docs/phase5a1b/AUDIO_CREDENTIAL_REMEDIATION_PROPOSAL.md.
- docs/phase5a1b/check-local-safety.mjs.
- docs/phase5a1b/readiness.json, credential-audit.json, credential-classification.json.
- docs/phase5a1b/protected-before.json.
- docs/phase5a1b/verify-readonly.mjs, integrity.json, integrity-initial-comparison.json.

Không sửa .env/.env.local/.gitignore, src, api, scripts production, tests hiện có, package/config, Gateway hoặc Cooking. Không sửa source fix nào nên không chạy lại toàn bộ tests/build chỉ để lặp baseline.

| Thực thi Phase 5A.1B | Kết quả |
|---|---|
| git check-ignore -v --no-index .env.video.local | PASS — Git bỏ qua file, không tracked |
| node docs/phase5a1b/check-local-safety.mjs | PASS thực thi kiểm tra; **FAIL configuration readiness** |
| Quét working/index/HEAD không in secret | Hoàn tất; scope/kết quả mục 7 |
| node docs/phase5a1b/verify-readonly.mjs | PASS sau sửa đường dẫn field metadata của checker; 23/22 nguồn không đổi, 79 file bảo vệ không đổi |
| composeScene / validateSettings / planDuration / estimateCost | Đã thực thi CPU; PASS |
| npm test | **NOT RUN trong 5A.1B** |
| Production build | **NOT RUN trong 5A.1B** |
| Targeted production lint | **NOT RUN trong 5A.1B — không sửa production** |
| Browser/Clerk/local services | **NOT RUN** |
| Gateway parser/inference/GPU | **NOT RUN** |
| WaveSpeed upload/video/audio API | **NOT RUN** |

Baseline từ [Phase 5A.1 verification](F:/tool-ai-dh/web-ai/docs/phase5a1/verification.json): **221/221 tests PASS**, build PASS với hai WaveSpeed key rỗng, targeted lint provider.js và seedance-http.test.mjs 0 errors/0 warnings. Đây là kết quả đã có, không phải lần chạy mới. Build trước có cảnh báo chunk lớn; lint toàn repo không được tuyên bố sạch.

Các lệnh Git nội bộ checker thực chạy: ls-files -z, ls-files --stage -z, ls-tree -r -z HEAD, cat-file blob và check-ignore; nội dung blob chỉ được xử lý trong bộ nhớ. Lần đầu checker bị sandbox EPERM khi Node gọi Git con; retry được phép đã hoàn thành. Không có auto-review rejection hoặc bước kiểm tra còn bị chặn bởi sandbox.

Các bước đọc/đối chiếu artifact được thực hiện qua Node filesystem API; có đọc tài liệu chính thức Clerk, Vite, Node và Firebase. Không dùng browser app hoặc đăng nhập.

## 10. Các bước operator cần làm để mở lại live acceptance

Chỉ cấu hình local; không cần cấp WaveSpeed key cho bước nghiệm thu này.

1. Mở đúng Clerk application/instance đang cấp publishable key cho Web hiện tại. Không tạo instance khác hoặc thay tài khoản/dữ liệu dự án.
2. Trong Clerk Dashboard → API keys → Show JWT public key → PEM Public Key, lấy **public PEM thật** của instance đó. Xác nhận HTTPS issuer/Frontend API origin đúng instance. Không dùng secret key/private key/test-generated key cho CLERK_JWT_KEY. [Hướng dẫn verifyToken](https://clerk.com/docs/reference/backend/verify-token), [public key và kiểm tra JWT](https://clerk.com/docs/guides/sessions/manual-jwt-verification).
3. Tạo F:\tool-ai-dh\web-ai\.env.video.local bằng editor local. Nội dung dưới là template **chưa có Clerk**, không phải cấu hình chạy được:

~~~dotenv
NODE_ENV=development
LOCAL_VIDEO_ENABLED=true
LOCAL_VIDEO_PAID_ENABLED=false
LOCAL_AI_WEB_ORIGIN=http://localhost:5173
WAVESPEED_API_KEY=
VITE_WAVESPEED_API_KEY=
CLERK_ISSUER=
CLERK_JWT_KEY=
~~~

Điền hai field Clerk trực tiếp trong file bằng giá trị thật. Public PEM có thể đặt trong dấu nháy với newline hoặc chuỗi \n được loader hỗ trợ. Giữ publishable key đang có trong .env, không đưa token đăng nhập vào báo cáo/chat. File này được gitignore; không force-add.

4. Dùng terminal cho nghiệm thu, bảo đảm biến inherited không ghi đè file trên. Node ưu tiên biến đã có trong environment hơn --env-file; Vite ưu tiên environment process hơn .env. Đặc biệt hai key WaveSpeed phải là chuỗi rỗng, paid phải false và origin phải http://localhost:5173. [Node --env-file](https://nodejs.org/api/cli.html#--env-filefile), [Vite env priority](https://vite.dev/guide/env-and-mode). Không sửa/xóa key trong cấu hình audio gốc chỉ để thử video.
5. Chạy checker từ project, không in nội dung env:

~~~text
node --env-file=.env.video.local docs/phase5a1b/check-local-safety.mjs
~~~

Chỉ tiếp tục khi file có thật, hai key WaveSpeed đều EMPTY trong frontend/backend process, paidFlag=false, origin đúng, configError=null, issuer/key đúng định dạng và frontendInstanceMatchesIssuer=true. **Exit code 0 chỉ có nghĩa kiểm tra chạy xong, không tự chứng minh ready.** Public key đúng instance còn phải đối chiếu Dashboard và được xác thực với real session; checker syntax không đủ.

6. Sau khi cấu hình thật sẵn sàng, các lệnh dịch vụ được phép cho nghiệm thu không trả phí là:

~~~text
node --env-file=.env.video.local scripts/local-video-server.mjs
node --env-file=.env.video.local node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
~~~

Hai lệnh dịch vụ **chưa chạy trong task này**. Dùng hai terminal; nếu port bận, kiểm tra owner thay vì dừng process không liên quan. CLI --host ở đây khắc phục host:true của cấu hình cho riêng phiên chạy, không sửa production config.

7. Mở đúng http://localhost:5173; không đổi thành http://127.0.0.1:5173 khi origin/azp đã chốt localhost. Đăng nhập tài khoản thật bằng Clerk UI, không đổi auth/origin guard để bỏ lỗi. Không cần Qwen/Gateway.
8. Operator chọn file ảnh thực tế cho Plaintiff scene_22. Sau đó thực hiện bảng nghiệm thu mục 4, lấy quote local bằng real session và xác nhận paid_enabled=false. Chọn camera_fixed=true thủ công. Không tích xác nhận trả phí hoặc upload provider.
9. Chụp/ghi evidence đã che session/credential: field scene trước/sau, prompt/hash, settings, ảnh filename/hash, quote invalidation/cancel, paid-disabled, missing/invalid session và proxy/bind. Giữ cross-user live NOT RUN nếu không đủ tài khoản/job hợp lệ; không giả lập rồi đánh PASS.

Lúc dừng task này, operator chưa bổ sung hai giá trị Clerk, chưa chọn ảnh và chưa có phiên nghiệm thu thật.

## 11. Blockers trước một paid scene thật

1. **P0:** bổ sung issuer/public key đúng Clerk instance, kiểm tra session/origin thật.
2. **P0:** cô lập VITE_WAVESPEED_API_KEY khỏi process nghiệm thu; rà soát exposure production và duyệt kế hoạch audio riêng nếu cần sửa.
3. **P1:** khởi động loopback backend/Vite, xác minh proxy, paid=false trên server thật và hoàn tất Storyboard acceptance.
4. **P1:** ảnh operator chọn, filename/hash, single-person OpenFrame và matching project scene_22 còn thiếu.
5. **P1:** kiểm tra không mutate project/media bằng dữ liệu live; auth negative và cross-user chỉ đánh PASS khi có evidence đúng phạm vi.
6. **Trước bất kỳ trả phí:** cần một phê duyệt mới, rõ scene/prompt/ảnh/settings/chi phí/hạn mức và consent chuyển ảnh. Đề xuất scene_22, 5s/480p/16:9/audio=true/camera_fixed=true/seed=-1, USD 0.1200 vẫn chỉ là đề xuất; phải kiểm tra lại giá/contract ở thời điểm thực hiện.

**Dừng Phase 5A.1B tại báo cáo này. Không bật paid generation, không gửi Seedance prediction, không bắt đầu phase tiếp theo.**
