# Phase 5A — Full AI Seedance single-scene implementation

Ngày hoàn tất: 2026-10-13. Phạm vi: F:\tool-ai-dh\web-ai.

**Đã triển khai luồng một scene và kiểm thử CPU/mock. Toàn bộ Web: 220/220 PASS. Build: PASS. Live Clerk, upload WaveSpeed thật và video tính phí thật: NOT RUN. Chưa kết luận end-to-end hoặc chất lượng lời thoại đạt.**

## 1. Chức năng đã triển khai

Full AI → Storyboard → chọn Gen Video AI của một scene → xem dữ liệu gốc → chọn ảnh local → xem toàn bộ prompt → chọn thời lượng/thông số → lấy báo giá local → xác nhận chuyển ảnh và phí → backend upload/submit → polling → preview/link tải.

Panel mới dùng dữ liệu tạm thời, không gọi setter ghi scene, Firestore, R2, Generate Audio, Gemini hoặc Qwen. Visual Profile đã duyệt là phần bổ sung tùy chọn, không phải điều kiện để tạo video. Luồng tính phí bị tắt mặc định ở backend.

Báo cáo này phân biệt mã đã triển khai, test đã thực thi và nghiệm thu dịch vụ thật.

## 2. Danh sách file nguồn chính xác

Các đường dẫn dưới đây tính từ F:\tool-ai-dh\web-ai.

| Trạng thái | File | Thay đổi |
|---|---|---|
| Mới | src/lib/seedanceContract.js | Prompt, duration, settings, giá tham khảo, URL và giới hạn local |
| Mới | src/lib/seedanceClient.js | Quote, submit một lần, polling, hủy chờ và chống stale result |
| Mới | src/Workspace/SeedanceScenePanel.jsx | Giao diện một scene, hai xác nhận, preview/tải |
| Mới | api/lib/seedance/config.js | Cấu hình development, cờ paid mặc định false, hạn mức |
| Mới | api/lib/seedance/errors.js | Lỗi an toàn, JSON no-store |
| Mới | api/lib/seedance/images.js | Decode/kiểm tra ảnh, giới hạn, SHA-256 |
| Mới | api/lib/seedance/transport.js | HTTPS, DNS pinning, chặn private IP/redirect, timeout/response bounds |
| Mới | api/lib/seedance/provider.js | Ticket, PUT, model submit và result parsing |
| Mới | api/lib/seedance/service.js | Clerk ownership, quote/consent, job handles, chống replay |
| Mới | scripts/local-video-server.mjs | Backend loopback 127.0.0.1:8790 |
| Sửa | api/lib/local-ai/auth.js | Thêm authenticateSession trả subject/session; wrapper authenticate giữ contract cũ và nguyên kiểm tra JWT |
| Sửa | src/Workspace/VisualProfiles.jsx | Chỉ thêm accessor đọc profile đã duyệt |
| Sửa | src/Workspace/StoryboardTab.jsx | Chọn một scene, render panel, truyền projectId; bỏ props/import không sử dụng |
| Sửa | src/Workspace/Workspace.jsx | Truyền projectId; khóa batch Full AI và ngăn Full AI đi vào handler video mẫu cũ |
| Sửa | scripts/local-ai-loopback.mjs | Áp dụng bảo vệ LAN cho namespace local-video |
| Sửa | vite.config.js | Proxy local-video về 8790; import process rõ ràng |
| Sửa | package.json, package-lock.json | Thêm chính xác pngjs 7.0.0 và jpeg-js 0.4.4; package scripts không đổi |

Test mới: tests/seedance-contract.test.mjs, tests/seedance-http.test.mjs, tests/seedance-client.test.mjs, tests/seedance-transport.test.mjs, tests/seedance-ui.test.mjs, tests/support/seedance-fixtures.mjs.

Test cũ được cập nhật: tests/local-ai-real-http.test.mjs, tests/visual-real-http.test.mjs, tests/support/gateway_cpu.py, tests/support/gateway_visual_mock.py chuyển cấu hình test sang standalone hiện hành và bỏ tham chiếu shared lock cũ; tests/spoken-text-contract.test.mjs render Storyboard qua React/jsdom thay vì gọi component có hook như hàm thường.

Tài liệu/bằng chứng mới: báo cáo này, docs/seedance-single-scene.md, docs/phase5a/* (baseline, logs, JSON và verify.mjs).

Không sửa production source Gateway. Không sửa/đọc/chạy Cooking. Không tạo/sửa môi trường để bật paid generation.

## 3. Contract WaveSpeed đã đối chiếu

Đã đọc tài liệu trước triển khai ngày 2026-10-12, mở lại ngày 2026-10-13:

- Submit: POST https://api.wavespeed.ai/api/v3/bytedance/seedance-v1.5-pro/image-to-video
- Required: prompt, image; optional last_image không triển khai.
- duration: integer 4–12; ứng dụng giới hạn 4–9.
- resolution: 480p/720p/1080p; ứng dụng chỉ 480p/720p.
- aspect_ratio: 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 theo bảng schema; không dùng auto.
- generate_audio, camera_fixed là boolean; seed=-1 là ngẫu nhiên.
- Giá mẫu 5 giây: 480p off/on = USD 0.06/0.12; 720p off/on = USD 0.13/0.26; giá tỷ lệ theo duration.

Nguồn: [Seedance Standard API](https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-v1.5-pro-image-to-video).

Không đổi sang Fast/Text-to-Video/model khác. Tài liệu không cung cấp số giới hạn prompt cụ thể; 2.000 ký tự là **giới hạn ứng dụng**, không phải khẳng định về giới hạn provider. Seed tối đa 2.147.483.647 cũng là giới hạn ứng dụng.

GET https://api.wavespeed.ai/api/v3/predictions/{id}/result được dùng cho polling; parser kiểm tra model/id/status/outputs, nhận URL khi completed. Nguồn: [Get Result](https://wavespeed.ai/docs/get-result).

## 4. Upload ảnh và bảo vệ outbound

Sau hai consent hợp lệ, backend gửi ticket tới POST /api/v3/media/uploads với filename kỹ thuật, size và content_type. PUT gửi nguyên bytes bằng URL/method/headers ticket; chỉ dùng download_url cho image. URL ký có thể đổi hostname, không được tự xây lại. API key chỉ gửi tới API WaveSpeed, không chuyển sang storage. Nguồn: [Upload Files API](https://wavespeed.ai/docs/upload-files-api).

Các bảo vệ của ứng dụng:

- PNG/JPEG ≤1 MiB, cạnh 32–4096 px, ≤4 triệu pixel; PNG kiểm CRC và chặn APNG; JPEG decode strict. Sai MIME, ảnh hỏng/khổng lồ bị từ chối trước provider.
- Chỉ ticket từ response API cố định; không nhận image_url/upload_url tùy ý từ browser.
- Chặn credential trong URL, private/reserved IPv4, IP literal, non-HTTPS, port lạ, redirect và DNS trả lẫn IP private.
- Resolve public IPv4, pin IP cho TLS connection, giữ SNI hostname, kiểm remote address. IPv6-only host hiện bị từ chối.
- Ticket phải chưa hết hạn, thời hạn không quá 1 giờ; kiểm filename/size/PUT/header whitelist. Header không hỗ trợ làm fail closed.
- DNS tối đa 5 giây; HTTPS 20 giây; response API 64 KiB, PUT 8 KiB. Không ghi log ảnh, secret hoặc presigned URL.
- Chỉ decode để kiểm tra; không re-encode/chỉnh sửa ảnh. Metadata trong file được chuyển cùng bytes và được nêu trong consent.

Giới hạn ticket/headers/DNS là chính sách local, có thể cần điều chỉnh có kiểm thử nếu response thật khác. Chưa thử upload hoặc TLS tới provider thật.

## 5. Scene → prompt và toàn vẹn Dialogue

| Input | Cách dùng trong prompt tạm |
|---|---|
| Context | ORIGINAL CONTEXT, giá trị nguyên văn |
| Character | ORIGINAL CHARACTER, giá trị nguyên văn |
| Action | ORIGINAL ACTION, giá trị nguyên văn |
| Camera | ORIGINAL CAMERA, giá trị nguyên văn |
| Dialogue | ORIGINAL SPOKEN DIALOGUE, canonical |
| Voiceover trong Full AI legacy | Đọc bằng helper hiện có khi hợp lệ; không ghi lại |
| Tone_of_Voice | ORIGINAL TONE nếu có |
| Translate / Dịch đã được adapter chuẩn hóa | Giữ ở dữ liệu gốc; không đưa vào phần lời nói |
| Visual Profile đã duyệt | Supplement riêng, không thay Character |
| time_origin / Time | Không dùng cắt footage hoặc quyết định duration Full AI |

Chỉ thêm nhãn và hướng dẫn kỹ thuật trung tính bên ngoài giá trị authored. Field rỗng không được bịa thêm. Field authored bổ sung chưa hỗ trợ có nội dung sẽ chặn để review, không tự đưa vào hoặc bỏ qua lặng lẽ. Xung đột Dialogue/Voiceover vẫn bị chặn. Không cắt prompt khi overflow, không sửa scene/order/metadata/media.

UI hiển thị mọi field scene ở vùng chỉ đọc và toàn bộ prompt cuối. Kiểm tra prompt nguyên văn **không chứng minh** Seedance phát âm nguyên văn.

## 6. Chọn ảnh và OpenFrame

Đã triển khai local PNG/JPEG fallback. Không dùng URL R2/OpenFrame đang lưu vì quyền sở hữu/khả năng truy cập provider chưa được xác minh. Tích hợp stored asset vào provider: **NOT IMPLEMENTED có chủ đích**.

startFrameUrl, imageUrl, character media và các upload R2 hiện có không bị ghi lại. Profile không có/không duyệt/không map rõ thì không dùng. Profile được dùng có thể bỏ chọn; không chạy Set ID để tạo video.

## 7. Duration và giá

Đếm từ từ spoken-text helper hiện có. Ước tính = số từ × 60 / wordsPerMinute + pause; mặc định 150 từ/phút, pause 0,8 giây. Cho chỉnh 80–220 từ/phút và pause 0–3 giây. Làm tròn lên để dự trù; đề nghị integer 4–9, chặn chọn ngắn hơn ước tính hoặc vượt 9 giây. Không tự chia/cắt/nén Dialogue. Kể cả audio off cũng không dùng setting này để vượt blocker độ dài.

Trên 23 scene thật với giả định mặc định: **20 scene có ước tính ≤9 giây**. Scene 4 ≈9,21 giây, scene 8 và 19 ≈9,61 giây bị chặn ở giả định này. Đây là phép tính CPU, không phải thời lượng giọng đã đo. Bằng chứng: [duration-real-scenes.json](F:/tool-ai-dh/web-ai/docs/phase5a/duration-real-scenes.json).

Cost planner dùng micro-USD, tỷ lệ 0,012 USD/giây (480p audio off) hoặc 0,026 (720p audio off), nhân đôi khi audio on. Đây là phép tính từ bảng tham khảo ở mục 3, không phải live billing quote của tài khoản. Version/verification date lưu là 2026-10-12; kiểm tra lại tài liệu 2026-10-13 không thấy thay đổi. Quá 30 ngày, giá thiếu hoặc combination không hỗ trợ: chặn, không đoán giá.

UI xác nhận model, scene, duration, resolution, ratio, audio, camera_fixed, seed, USD, nguồn/ngày và cảnh báo actual charge có thể khác. camera_fixed mặc định false, hiển thị để người dùng quyết định; không tự thêm chuyển động camera.

## 8. Consent, auth và job ownership

Backend chỉ chạy development, bind loopback; Vite chặn LAN cho namespace mới. Không có public Vercel paid endpoint.

- Tái sử dụng Clerk verifyToken và kiểm issuer, azp/origin, subject, sid, exp/nbf/iat, từ chối pending session. Các kiểm tra cũ không bị bỏ.
- Đây là xác minh session JWT bằng public key, không phải gọi Clerk online để kiểm trạng thái thu hồi từng request. Live browser session chưa nghiệm thu.
- Quote 120 giây, opaque ID, ràng buộc subject+session, exact scene/profile/assumptions/settings, image SHA-256, prompt SHA-256 và giá/version.
- Submit phải có cả confirm=true và transfer_consent=true; tính lại payload/hash, kiểm ownership/expiry/used.
- Tiêu thụ quote và dự trữ job trước provider await. Double click/concurrent/replay và hai quote cùng fingerprint bị chặn trong thời gian job còn được theo dõi.
- Chỉ LOCAL_VIDEO_PAID_ENABLED=true và key hợp lệ mới cho upload/submit. Key đơn lẻ không bật tính phí. Task không bật flag.
- Job ID Web ngẫu nhiên 48 hex, không dùng upstream ID làm credential browser; chỉ đúng subject/session được poll.
- Tối đa 64 record slots toàn server, 4 mỗi subject/session. Quote chưa dùng dự trữ 2 slots cho quote+job. Quote cũ hết hạn được dọn khi admission mới.
- Poll ≥2 giây, tối đa 180 GET/15 phút; Retry-After có giới hạn. Request body ≤1.600.000 bytes/10 giây; browser response ≤32 KiB.
- Hỗ trợ queued/running/completed/failed/cancelled/timeout/deleted; phân biệt admission_unknown, tracking_unknown, expired.
- Không retry upload hoặc paid POST. Mất response sau submit có thể đã tính phí: yêu cầu kiểm tra WaveSpeed, không tự gửi lại.

Map nằm trong một process. Restart mất quote/job tracking; nhiều backend replicas và persistence/distributed idempotency: **NOT IMPLEMENTED**. Production project authorization/Firestore ownership chưa chứng minh nên không mở production.

## 9. Storyboard và bảo vệ tính năng cũ

Chỉ Full AI trên HTTP localhost/127.0.0.1 ở Vite development mở panel mới; một scene tại một thời điểm. Đổi scene/project/session/source/profile làm reset panel; đổi ảnh/settings làm hủy quote/consent. Cancel Waiting chỉ dừng chờ phía browser.

Completed preview dùng URL validated từ provider response; không có sample video trong đường Full AI mới. Link tạm thời có preview/error/link tải; khi CORS/URL hết hạn sẽ báo rõ. Đóng/đổi panel làm mất preview tạm. Không hứa lưu trữ vĩnh viễn.

Full AI không còn vào handler mẫu cũ, Gen All Video bị khóa. Để giữ ranh giới Semi, thân handler Semi legacy giữ nguyên; placeholder video có sẵn trong handler đó không phải kết quả Phase 5A và không được chạy/đánh PASS trong task này. Không tích hợp video Semi.

Đối chiếu byte/hash với bản đầu task xác nhận MainEditor, SetupTab, firebase.js, spokenText.js, api/get-upload-url.js, api/proxy-audio.js, api/proxy-media.js và vercel.json không đổi. Diff Workspace chỉ guard Full AI, khóa batch và truyền projectId; Generate Audio, Gemini, merge/media, Semi logic khác giữ nguyên. Accessor profile không đổi Set ID approval. Không migrate Firestore, không lưu video mới vào scene.

Repo đã có nhiều thay đổi chưa commit từ trước; đối chiếu với snapshot đầu Phase 5A trong docs/phase5a/before, không reset các thay đổi đó.

## 10. Kiểm thử đã thực thi

| Nhóm | Kết quả | Phạm vi bằng chứng |
|---|---|---|
| Phase 5A contract/image/unit | **13 PASS** | Prompt, legacy/conflict, duration, giá, PNG/JPEG, URL/visibility/LAN, scene integrity |
| Browser controller unit | **7 PASS** | Double submit, consent/expiry, 180 GET, Retry-After, unknown outcome, hashes/bounds/URL |
| HTTPS transport policy unit | **6 PASS** | Socket/TLS giả lập: DNS pinning, SNI, remote IP, redirect, response bound, timeout |
| Seedance Web HTTP | **39 PASS** | Server TCP loopback thật + Clerk SDK verify test-signed JWT + provider responses giả lập |
| Seedance React/jsdom | **10 PASS** | Actual Storyboard/panel, quote/consent, stale cancellation, optional profile, settings/image changes |
| Toàn bộ Web regression | **220/220 PASS** | Bao gồm 75 test mới ở trên và 145 test hiện có |
| Web → FastAPI → JobManager → parser CPU | **PASS** | Hai file thật được parse lại; không dùng model |
| Web → Gateway visual | **PASS transport, MOCK VISION** | Không phải real Qwen |
| Production build | **PASS** | Vite 8.0.14; 1845 modules; cảnh báo chunk >500 kB |
| Module mới + các file sửa sạch lint | **PASS** | Không có diagnostic mới |
| Toàn bộ tập file targeted lint | **FAIL do baseline cũ** | 46 errors +1 warning, chi tiết bên dưới |
| Live Clerk browser | **NOT RUN** | Test JWT là ephemeral test credentials, không phải tài khoản thật |
| WaveSpeed upload/paid video | **NOT RUN** | Không có request thật hoặc video thật |
| Real Qwen / GPU inference | **NOT RUN** | Không load model, không đổi gate/config |
| Gateway full pytest | **NOT RUN trong Phase 5A** | Không sửa Gateway nên không chạy lại suite riêng |

Targeted lint dùng ESLint API với config project; bổ sung globals Node và recommended rules cho .mjs trong verifier. Workspace.jsx có 45 errors +1 warning giống baseline; tests/local-ai-real-http.test.mjs có 1 unused import có sẵn. Những file còn lại trong danh sách lint không có lỗi/cảnh báo. So sánh cả nội dung diagnostic, không chỉ tổng số: **0 diagnostic mới**. Không đổi rule hoặc disable lint để che lỗi.

Các lỗi ở lượt đầu được sửa: cấu hình test shared-lock đã lỗi thời; test gọi component có hook trực tiếp; khai báo DOM và điều kiện chờ báo giá bất đồng bộ trong UI test. Không coi lượt lỗi đầu là PASS. Kết quả cuối 220/220 được lưu.

### Lệnh thực tế

Chạy từ F:\tool-ai-dh\web-ai:

    npm.cmd install --save-exact --ignore-scripts --no-audit --no-fund pngjs@7.0.0 jpeg-js@0.4.4 --offline=false
    node --test tests/seedance-contract.test.mjs tests/seedance-http.test.mjs
    node --experimental-vm-modules --test tests/seedance-ui.test.mjs
    node --experimental-vm-modules --test tests/local-ai-real-http.test.mjs tests/visual-real-http.test.mjs tests/spoken-text-contract.test.mjs
    node --experimental-vm-modules --test tests/seedance*.test.mjs
    npm.cmd test
    npm.cmd run build
    node docs/phase5a/verify.mjs
    node docs/phase5a/verify.mjs --tests-only

Verifier cuối gọi npm test, chạy targeted lint, so baseline/hash và lưu JSON; dùng lại build đã thành công vì production source không đổi sau build. CPU helper chạy python -I -B từ Gateway .venv với import/start-worker guard, unique temp data directory và worker disabled; visual test chỉ inject mock worker. Không mở inference environment.

Đã kiểm tra git status và git diff --no-index giữa snapshot đầu task và từng file sửa. Lockfile chỉ đổi root dependency map và thêm hai package image parser.

### Bằng chứng

- [Toàn bộ kết quả Web](F:/tool-ai-dh/web-ai/docs/phase5a/web-tests.log)
- [Build](F:/tool-ai-dh/web-ai/docs/phase5a/build.log)
- [Targeted lint, từng diagnostic](F:/tool-ai-dh/web-ai/docs/phase5a/lint.json)
- [Commands, baseline hashes và giới hạn xác minh](F:/tool-ai-dh/web-ai/docs/phase5a/verification.json)
- [Local HTTP + mock provider](F:/tool-ai-dh/web-ai/docs/phase5a/mock-http.json)
- [CPU/model isolation](F:/tool-ai-dh/web-ai/docs/phase5a/cpu-isolation.json)

HTTP mock có upload bytes/hash/endpoint/thông số thật trong process test nhưng outbound request đã thay bằng mock; URL mock không chứng minh tồn tại video. Unit TLS dùng socket giả, không phải handshake TLS thật. Không đo latency/VRAM/inference quality từ những test này.

## 11. Hai kịch bản thật

| Input đã đọc | Coverage | Kết quả |
|---|---|---|
| C:\Users\Admin\Downloads\kịch bản gen video AI.txt | scene_1…scene_23; Judge 10, Defendant 8, Plaintiff 5 | **PASS 23/23** |
| C:\Users\Admin\Downloads\kịch bản semi-content.txt | scene_1…scene_22; 22 Voiceover, 22 time_origin, không character entity | **PASS 22/22** |

SHA-256 Full: e24725a239b5084dfa4dfd57192cf636e2ebf423ee953ada760bce29d15ca74b

SHA-256 Semi: 600431973c83c7c74603fcc1d347a0231c19a310a2a902669d3d8c99f12f9050

Full: so nguyên văn Dialogue/Character/Context/Action/Camera, Dịch → Translate, Tone → Tone_of_Voice; không tạo Voiceover/time_origin. Semi: Voiceover/Footage/Effect/time_origin độc lập, metadata giữ riêng, Character/Translate/Tone_of_Voice rỗng, characters=[].

Hai nguồn đã chạy lại qua HTTP và parser CPU trong full suite. Bằng chứng expected/actual từng scene: [Full HTTP](F:/tool-ai-dh/web-ai/docs/phase5a/full-ai.web-http.json), [Semi HTTP](F:/tool-ai-dh/web-ai/docs/phase5a/semi.web-http.json). Test prompt còn đối chiếu snapshot parser Phase 4B.2 với chính bytes hai file thật: [Prompt integrity](F:/tool-ai-dh/web-ai/docs/phase5a/script-integrity.json). Không thay bằng kịch bản tự tạo.

Time bằng Time_origin trong mẫu Semi; trường hợp hai giá trị khác nhau với kịch bản thật vẫn **NOT RUN**. Bảo toàn input là PASS; độ chính xác âm thanh/hình ảnh/video thật vẫn **NOT RUN**.

## 12. Giới hạn và bước trước lần tạo video tính phí đầu tiên

Hiện phù hợp để operator review và nghiệm thu local có kiểm soát; chưa đủ bằng chứng để mở production hoặc gọi video thật tự động.

1. Review báo cáo, prompt composer, upload/consent/auth và giới hạn bộ nhớ; giữ paid flag=false.
2. Xác minh chính thức giới hạn prompt số cụ thể cho Standard; không coi cap 2.000 của app là bằng chứng provider chấp nhận. Kiểm tra lại giá/settings tại thời điểm thử.
3. Cấu hình backend bằng Clerk instance thật và backend-only WaveSpeed key; thực hiện live Clerk acceptance khi paid còn tắt. Kiểm tra wrong session/origin, quote, hash, expiry trên trình duyệt thật. Hướng dẫn: [local setup](F:/tool-ai-dh/web-ai/docs/seedance-single-scene.md).
4. Operator chọn và phê duyệt riêng **một scene, đúng file ảnh/hash, Standard model, duration, resolution, audio, ratio/camera/seed, prompt và phí tham khảo**; đồng ý chuyển ảnh và metadata. Phase 5A không phải phê duyệt trả phí đó.
5. Chỉ sau phê duyệt mới bật backend paid flag; lấy quote mới và xác nhận qua UI; gửi tối đa một prediction. Nếu admission/tracking không rõ, kiểm tra provider trước khi thử lại.
6. Kiểm tra ticket/PUT thực, response schema/URL/CORS, preview/download, billing; nghe/xem video và đối chiếu Dialogue, speaker, Action, Camera với source. Ghi PASS/FAIL từ kết quả thật; không dùng clip test.
7. Tắt paid flag sau thử theo quyết định operator. Không mở batch, merge, persistence hoặc Phase 5B trong bước này.

Chưa có blocker CPU/mock chưa giải quyết cho luồng đã triển khai. Còn cần xác minh hợp đồng prompt, live auth, upload thực, chất lượng lời thoại và preview provider. Ownership của ảnh R2, deployment công khai, distributed job store và lưu kết quả là phần chưa triển khai/ngoài phạm vi.

**Dừng ở Phase 5A. Chưa bật paid flag, chưa gửi charged call, chưa chạy Qwen, chưa bắt đầu Phase 5B.**
