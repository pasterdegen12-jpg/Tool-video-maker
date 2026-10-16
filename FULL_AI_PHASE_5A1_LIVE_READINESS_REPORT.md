# Phase 5A.1 — Live local readiness, không gửi request trả phí

Ngày: **2026-10-13 (Asia/Saigon)**. Project: F:\tool-ai-dh\web-ai.

**Real Clerk browser: NOT RUN. Live Storyboard acceptance: NOT RUN.** Đã dừng trước khi khởi động dịch vụ vì thiếu cấu hình xác minh Clerk của backend. Không dùng JWT test thay cho nghiệm thu live.

Đã hoàn tất phần kiểm tra cấu hình, đối chiếu tài liệu hiện hành, sửa một lỗi đọc trạng thái deleted, chạy **221/221 Web tests PASS**, build PASS và targeted lint PASS. Chưa upload ảnh, chưa tạo ticket WaveSpeed, chưa gửi prediction, chưa bật paid generation.

## 1. Cấu hình thực tế và điểm chặn

Đã đọc có kiểm soát .env, .env.local và kiểm tra biến của process. Chỉ lưu trạng thái hiện diện/đúng định dạng, không in giá trị credential.

| Thành phần | Kết quả thực tế | Đánh giá |
|---|---|---|
| VITE_CLERK_PUBLISHABLE_KEY | Có trong .env, định dạng publishable key hợp lệ | Chưa chứng minh đăng nhập hoặc đúng backend instance |
| CLERK_ISSUER | Thiếu ở file môi trường và process | **FAIL readiness** |
| CLERK_JWT_KEY | Thiếu ở file môi trường và process | **FAIL readiness** |
| .env.video.local | Chưa tồn tại | Cần cấu hình local riêng |
| NODE_ENV / LOCAL_VIDEO_ENABLED | Chưa đặt trong cấu hình kiểm tra | Không thể khởi động backend theo cấu hình hiện tại |
| LOCAL_AI_WEB_ORIGIN | Chưa đặt | Code mặc định http://localhost:5173; chưa xác nhận bằng phiên browser thật |
| LOCAL_VIDEO_PAID_ENABLED | **UNSET**, code mặc định false | Không có backend live đang chạy; không khẳng định có runtime live đã được cấu hình false |
| WAVESPEED_API_KEY | Không có biến backend này | Không cần key cho nghiệm thu không trả phí |
| VITE_WAVESPEED_API_KEY | Có, không rỗng, không giống placeholder đơn giản | **Vấn đề cấu hình frontend cần xử lý trước live** |
| 127.0.0.1:5173 | Không có listener lúc kiểm tra | Vite chưa chạy |
| 127.0.0.1:8790 | Không có listener lúc kiểm tra | Backend video chưa chạy |

Chạy readVideoConfig với môi trường hiện tại trả INTEGRATION_DISABLED. Chỉ khi thử cờ development/local-enabled/paid=false **trong bộ nhớ**, vẫn trả CONFIGURATION_ERROR do thiếu Clerk issuer/key. Không tạo issuer, public key hoặc session giả cho live.

Công cụ browser chỉ trả trình duyệt in-app không có tab mở. Không tạo tab đăng nhập sau khi xác định thiếu cấu hình; không suy ra trạng thái đăng nhập của những trình duyệt ngoài inventory đó.

Bằng chứng đã che credential: [readiness.json](F:/tool-ai-dh/web-ai/docs/phase5a1/readiness.json).

### Khóa WaveSpeed trong frontend hiện có

Tên biến VITE_WAVESPEED_API_KEY đã có từ trước và đang được **Generate Audio cũ** dùng tại [Workspace.jsx:671](F:/tool-ai-dh/web-ai/src/Workspace/Workspace.jsx:671) và [Workspace.jsx:693](F:/tool-ai-dh/web-ai/src/Workspace/Workspace.jsx:693). Code client này có thể đưa giá trị vào bundle. Không kiểm tra tính hợp lệ của key bằng API provider và không in key.

Không tự xóa/di chuyển cấu hình này vì sẽ tác động tính năng Generate Audio được yêu cầu giữ nguyên. Cần cô lập key khỏi phiên Web dùng nghiệm thu video; sửa thiết kế credential của audio là việc riêng cần được cho phép. Nếu key từng được phục vụ trong bundle/public deployment, operator cần thu hồi/rotate key đã lộ trước khi dùng tiếp.

Để thực hiện build hồi quy an toàn, chỉ process build/test được đặt VITE_WAVESPEED_API_KEY rỗng, WAVESPEED_API_KEY rỗng và LOCAL_VIDEO_PAID_ENABLED=false. Kiểm tra bundle mới không chứa giá trị WaveSpeed đã phát hiện. .env và .env.local giữ nguyên byte/hash; không triển khai bundle này và không sửa code Generate Audio.

## 2. Kiểm tra source của backend hiện tại

| Kiểm tra | Kết quả từ source |
|---|---|
| Development-only | readVideoConfig từ chối production, VERCEL hoặc thiếu LOCAL_VIDEO_ENABLED=true |
| Bind/host | Backend bind 127.0.0.1:8790; kiểm tra host và peer loopback |
| Vite proxy | /api/local-video về 127.0.0.1:8790; guard từ chối máy LAN |
| Quote | POST /api/local-video/quote; local validation/hash/price, không gọi provider |
| Submit | POST /api/local-video/submit; xác thực trước, rồi chặn PAID_DISABLED trước upload/submit khi flag false hoặc thiếu key |
| Poll | GET /api/local-video/jobs/{48-hex}; opaque handle, đúng subject/session |
| Clerk | verifyToken, issuer, authorized party/origin, sub/sid, exp/nbf/iat và pending-session guard giữ nguyên |
| WaveSpeed key | Module video chỉ đọc WAVESPEED_API_KEY ở backend; không dùng VITE_* |
| Disabled behavior | UI vô hiệu nút submit theo paid_enabled; service và provider đều kiểm tra flag riêng |

Kiểm tra source: **PASS**. Kiểm chứng các bước này bằng tài khoản/browser thật: **NOT RUN**.

Auth dùng kiểm tra JWT bằng public key; không phải kiểm tra thu hồi session online trên từng request. Không thay đổi auth/origin/payment gate trong Phase 5A.1. LOCAL_VIDEO_PAID_ENABLED chỉ điều khiển luồng video mới, không phải cờ vô hiệu hóa các luồng audio cũ.

## 3. Live browser acceptance

Theo yêu cầu “If ... live Clerk setup is missing, stop and report the blocker”, phần live dừng trước khởi động server/Vite.

| Bước | Trạng thái |
|---|---|
| Khởi động backend/Vite với cấu hình Clerk thật | **NOT RUN — thiếu issuer và public key** |
| Đăng nhập qua UI Clerk bằng tài khoản có sẵn | **NOT RUN** |
| Mở existing Full AI project và Storyboard | **NOT RUN** |
| Chọn scene, kiểm tra các field trong UI thật | **NOT RUN** |
| Chọn ảnh local thực tế | **NOT RUN — chưa có ảnh được operator chọn** |
| Lấy quote bằng session thật, xem giá/thông số | **NOT RUN** |
| Đổi ảnh/settings để kiểm tra invalidation trong browser thật | **NOT RUN** |
| Kiểm tra nút paid-disabled trên browser thật | **NOT RUN** |
| Đối chiếu scene live trước/sau thao tác panel | **NOT RUN** |
| Ticket / upload / Seedance thật | **NOT RUN — bị cấm trong task này** |

Không có ảnh nào được chuyển sang WaveSpeed, không có request tới API tạo ticket hoặc model của WaveSpeed. Chỉ đọc trang tài liệu chính thức. Các test hồi quy có HTTP loopback và provider giả lập, được phân loại riêng ở mục 7.

## 4. Prompt, screenplay và ảnh

Full suite đã chạy lại hai file gốc qua Web HTTP → FastAPI/JobManager → parser CPU, với worker/model bị chặn:

- Full AI: **23/23 PASS**, scene_1…scene_23; Judge 10, Defendant 8, Plaintiff 5.
- Semi: **22/22 PASS**, Voiceover và Footage độc lập; 22 time_origin; không character entity.
- Dialogue, Character, Translate, Action, Context, Camera, Tone_of_Voice và ordering được so với giá trị nguồn; không rewrite/split/shorten.
- File gốc trước/sau vẫn giữ nguyên SHA-256.
- Composer được chạy cho đề xuất scene_22, không mutate scene. Không có Qwen hoặc provider output trong phép kiểm tra này.

| File thật | SHA-256 |
|---|---|
| C:\Users\Admin\Downloads\kịch bản gen video AI.txt | e24725a239b5084dfa4dfd57192cf636e2ebf423ee953ada760bce29d15ca74b |
| C:\Users\Admin\Downloads\kịch bản semi-content.txt | 600431973c83c7c74603fcc1d347a0231c19a310a2a902669d3d8c99f12f9050 |

Bằng chứng expected/actual từng scene: [Full](F:/tool-ai-dh/web-ai/docs/phase5a1/full-ai.web-http.json), [Semi](F:/tool-ai-dh/web-ai/docs/phase5a1/semi.web-http.json), [integrity summary](F:/tool-ai-dh/web-ai/docs/phase5a1/integrity.json).

Đây là **regression CPU trên nguồn thật**, không phải bằng chứng dự án đang lưu trong tài khoản thật chưa đổi sau tương tác browser. Phần live đó vẫn NOT RUN.

Ảnh: validator PNG/JPEG được kiểm tra bằng fixture trong regression, gồm MIME/size/decode. **Ảnh thực tế của operator: NOT RUN**. Không dùng ảnh test làm OpenFrame thật. Chưa xác minh một ảnh single-person phù hợp; filename/hash để trống.

Mẫu Semi có Time=Time_origin; không khẳng định đã kiểm chứng trường hợp hai giá trị khác nhau bằng dữ liệu thật.

## 5. Contract và giá chính thức — đối chiếu ngày 2026-10-13

### Model/settings

Model cố định: bytedance/seedance-v1.5-pro/image-to-video; POST /api/v3/bytedance/seedance-v1.5-pro/image-to-video.

Tài liệu liệt kê prompt/image, optional last_image; duration integer 4–12; resolution 480p/720p/1080p; aspect_ratio 21:9, 16:9, 4:3, 1:1, 3:4, 9:16; generate_audio/camera_fixed boolean; seed=-1 ngẫu nhiên. Bảng giá 5s: 480p off/on USD 0.06/0.12; 720p off/on USD 0.13/0.26; giá tỷ lệ duration.

Nguồn: [Seedance Standard](https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-v1.5-pro-image-to-video). Ứng dụng giữ tập con 4–9s, 480p/720p; last_image và auto aspect không mở.

Không thấy giới hạn prompt số cụ thể trong trang model. Cap 2.000 ký tự Unicode là **giới hạn ứng dụng**, không phải giới hạn provider đã xác minh. Không tự cắt prompt. [List Models](https://wavespeed.ai/docs/list-models) mô tả API schema nhưng task không gọi API bằng key để lấy schema tài khoản.

### Upload

POST /api/v3/media/uploads nhận filename, size, optional content_type. Ticket có download_url và upload.method/url/headers/expires_at. PUT gửi bytes đúng ticket, không thêm bearer API key cho host storage; 2xx là thành công. URL ký là credential tạm, hostname có thể thay đổi.

Nguồn: [Upload Files API](https://wavespeed.ai/docs/upload-files-api). Giới hạn 1 MiB và các chốt SSRF/header/redirect hiện có là chính sách ứng dụng chặt hơn; không nới lỏng. Upload thật chưa chạy.

### Một sai khác đã xác nhận và sửa

[Get Result](https://wavespeed.ai/docs/get-result) nói deleted prediction có thể chỉ trả id, model, status, **không có outputs**. Code cũ của parsePrediction bắt buộc Array.isArray(outputs) ở mọi trạng thái; response deleted tối giản sẽ bị coi là malformed và tiếp tục lỗi polling.

Sửa nhỏ: chỉ cho phép **thiếu hẳn outputs khi status=deleted**; trả terminal deleted với video_url=null và dừng polling. outputs=null/object/string vẫn bị từ chối; trạng thái khác thiếu outputs vẫn bị từ chối. ID/model matching, URL validation, auth và payment guard giữ nguyên.

### So sánh cost planner

Đã đối chiếu bốn tổ hợp giá mẫu trong source/tests. Công thức hiện có: duration × 0,012 USD (480p) hoặc ×0,026 USD (720p), nhân 2 khi audio on; dùng micro-USD. Kết quả khớp các ví dụ 5s.

**PASS — khớp giá tham khảo trong tài liệu**, không phải live billing quote hay bảo đảm phí cuối. Không sửa giá hoặc ngày/version 2026-10-12 trong code. Chính sách quá 30 ngày thì chặn vẫn giữ nguyên.

## 6. File thay đổi

Production chỉ sửa:

- [api/lib/seedance/provider.js](F:/tool-ai-dh/web-ai/api/lib/seedance/provider.js): nhận deleted tombstone thiếu outputs.

Test sửa:

- [tests/seedance-http.test.mjs](F:/tool-ai-dh/web-ai/tests/seedance-http.test.mjs): thêm regression qua HTTP cho deleted thiếu outputs, dừng GET tiếp theo và giữ từ chối missing/malformed outputs khác.

Tài liệu và evidence mới:

- FULL_AI_PHASE_5A1_LIVE_READINESS_REPORT.md.
- docs/phase5a1/check-readiness.mjs, readiness.json.
- docs/phase5a1/verify.mjs, verification.json, lint.json, web-tests.log, build.log.
- docs/phase5a1/full-ai.web-http.json, semi.web-http.json, cpu-isolation.json, visual-mock-http.json, synthetic-validation-error.json, integrity.json.
- docs/phase5a1/proposed-first-paid-test.json, proposed-scene-22-prompt.txt.
- docs/phase5a1/before/provider.js: bản trước sửa để đối chiếu.

Tests hiện có cũng ghi lại artifacts mock-http/script-integrity trong docs/phase5a. dist được tạo lại để kiểm tra build với WaveSpeed key trống, không deploy.

Không sửa .env/.env.local, Clerk/auth source, prices, upload/SSRF, MainEditor, Firebase, Generate Audio, Gemini, Semi hoặc Gateway. Không đọc/chạy/sửa Cooking; không load Qwen/GPU. Các thay đổi chưa commit có sẵn được giữ nguyên.

## 7. Kiểm tra thực sự đã chạy

| Kiểm tra | Kết quả |
|---|---|
| Configuration checker bằng file/process thật, không tạo session | **PASS kiểm tra / FAIL readiness** |
| TCP port check 5173/8790 | **PASS kiểm tra — không có listener** |
| HTTP contract regression sau sửa | **40/40 PASS**, provider giả lập |
| Toàn bộ Web suite | **221/221 PASS**, 0 fail, 0 skip |
| Real source CPU parser regression | **23 Full +22 Semi PASS** |
| Production build | **PASS**, Vite 8.0.14; vẫn có cảnh báo chunk >500 kB |
| Targeted lint 2 file thay đổi | **PASS — 0 errors, 0 warnings** |
| Kiểm tra key đã biết trong bundle mới đã loại key | **PASS — không chứa giá trị đó** |
| .env/.env.local và các file được bảo vệ so baseline | **PASS — không đổi** |
| Clerk/browser thật, local quote với session thật | **NOT RUN** |
| Provider acceptance/upload/video thật | **NOT RUN** |

Lệnh thực tế từ F:\tool-ai-dh\web-ai:

    node docs/phase5a1/check-readiness.mjs
    rg -n VITE_WAVESPEED_API_KEY src api scripts vite.config.js
    node --test tests/seedance-http.test.mjs
    node docs/phase5a1/verify.mjs

Verifier gọi:

    npm.cmd test
    npm.cmd run build

Verifier chạy ESLint API với config project và Node globals/recommended rules cho file test .mjs. Đã đối chiếu diff:

    git diff --no-index docs/phase5a1/before/provider.js api/lib/seedance/provider.js

Browser tool chỉ chạy inventory cua.getState(); không mở app, sign-in, chọn ảnh hoặc gửi quote. Có đọc tài liệu chính thức bằng web tool.

Fixture JWT ký bằng khóa test chỉ xuất hiện trong **automated regression** có sẵn; không dùng chúng để khởi động live acceptance hoặc thay cho tài khoản thật. Mock vision test không phải Qwen inference. Bằng chứng: [verification.json](F:/tool-ai-dh/web-ai/docs/phase5a1/verification.json), [Web tests](F:/tool-ai-dh/web-ai/docs/phase5a1/web-tests.log), [build](F:/tool-ai-dh/web-ai/docs/phase5a1/build.log), [lint](F:/tool-ai-dh/web-ai/docs/phase5a1/lint.json).

Lỗi lint nền của Workspace đã nêu ở Phase 5A không được refactor ở task này. PASS lint ở đây chỉ áp dụng đúng hai file thay đổi.

## 8. Các bước cấu hình để mở lại nghiệm thu KHÔNG trả phí

1. Dùng đúng Clerk instance đang cấp VITE_CLERK_PUBLISHABLE_KEY. Trong Clerk Dashboard → API keys → Show JWT public key → PEM Public Key, lấy public key thật cho CLERK_JWT_KEY; không tạo key test. Xác nhận CLERK_ISSUER là HTTPS issuer/Frontend API origin của cùng instance. [Clerk verifyToken](https://clerk.com/docs/reference/backend/verify-token), [Manual JWT verification](https://clerk.com/docs/guides/sessions/manual-jwt-verification).
2. Tạo .env.video.local được gitignore, đặt NODE_ENV=development, LOCAL_VIDEO_ENABLED=true, LOCAL_VIDEO_PAID_ENABLED=false và LOCAL_AI_WEB_ORIGIN=http://localhost:5173. Điền issuer/public PEM thật; app hỗ trợ PEM với ký tự \n. Không gửi session token hoặc secret vào báo cáo/chat.
3. Phiên nghiệm thu không cần WaveSpeed key. Để WAVESPEED_API_KEY và VITE_WAVESPEED_API_KEY rỗng **trong môi trường process nghiệm thu**, bảo đảm không có biến inherited ghi đè. Điều này cô lập phiên thử video; không sửa logic hay cấu hình audio đang lưu. Không chạy Generate Audio trong phiên này.
4. Sau khi cấu hình đầy đủ, chạy checker để xác nhận issuer/key, origin và không có WaveSpeed key phía client. Sau đó mới chạy local services. Các lệnh dưới đây là hướng dẫn, **chưa được chạy trong task**:

       node --env-file=.env.video.local scripts/local-video-server.mjs
       node --env-file=.env.video.local node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort

   File .env.video.local cần chứa hai biến WaveSpeed rỗng để override giá trị .env trong phiên Vite; không dùng lệnh dev thông thường trước khi đã cô lập key.
5. Mở đúng http://localhost:5173, đăng nhập tài khoản thật qua Clerk UI. Mở dự án có sẵn và chỉ thao tác panel video; không bấm Save Cloud, Generate Audio, Gemini, Set ID hoặc sửa scene.
6. Operator chọn ảnh thực tế. Kiểm tra field/prompt, quote local, đổi ảnh/settings, quote/consent invalidation và trạng thái paid-disabled. Không tạo ticket/upload/prediction kể cả có thể bấm nút bằng cách khác.
7. Lưu so sánh dữ liệu project live trước/sau ở chế độ đọc; ghi kết quả mới sau khi thật sự thực hiện.

Mục này là khắc phục cấu hình và kế hoạch nghiệm thu, không phải chỉ dẫn bật paid flag. Việc chuyển credential của Generate Audio sang backend, nếu cần, phải được xử lý riêng theo phạm vi được operator cho phép.

## 9. Đề xuất lần thử trả phí đầu tiên — CHƯA PHÊ DUYỆT

**Ứng viên: scene_22, Plaintiff.** Lý do: Dialogue chỉ 7 từ, không bị ngắt dở câu; Action mô tả thở phào/xúc động; Camera yêu cầu cố định rõ ràng. Ước tính theo 150 từ/phút +0,8 giây nghỉ =3,6 giây, planner đề nghị 4 giây. Đề xuất 5 giây để có dư thời gian, vẫn trong 4–9.

Chỉ đủ điều kiện về **text**. Chưa có file OpenFrame do operator chọn; không khẳng định đã có ảnh single-person hợp lệ. Cần ảnh rõ một Plaintiff, đúng hướng nhìn/bố cục; điều kiện này phải xác minh trực tiếp từ file thật. Không tự tạo ảnh hoặc thay bằng fixture.

| Checklist | Đề xuất / trạng thái |
|---|---|
| Scene | scene_22 |
| Character | Plaintiff, nguyên văn |
| Dialogue | "Oh, thank God. What about my house?" |
| Ảnh filename | **CHƯA CÓ — operator chọn** |
| Ảnh SHA-256 | **CHƯA CÓ** |
| Single-person/OpenFrame đúng scene | **NOT RUN** |
| Model | bytedance/seedance-v1.5-pro/image-to-video — Standard |
| Duration | 5 giây, đề xuất |
| Resolution | 480p |
| Aspect ratio | 16:9, tạm đề xuất; xác nhận lại theo ảnh thật |
| Native audio | true |
| camera_fixed | true, khớp Camera gốc; chờ operator xác nhận |
| Seed | -1, ngẫu nhiên |
| Visual Profile | Không dùng; không cần Qwen |
| Giá tham khảo | USD 0.1200, không phải phí bảo đảm |
| Image transfer consent | **PENDING** |
| Browser auth readiness | **NOT RUN — thiếu backend Clerk config** |
| Paid approval | **PENDING — chưa được cấp** |
| So dữ liệu project live với scene gốc | **NOT RUN** |

Prompt đầy đủ dưới đây được tạo bằng composer hiện có, không qua model, không có Translate hoặc mô tả sáng tạo thêm:

~~~text
Use the original authored values below. Do not add or paraphrase spoken dialogue, actions or camera instructions. Only ORIGINAL SPOKEN DIALOGUE is spoken text.

ORIGINAL CONTEXT:
resolution

ORIGINAL CHARACTER:
Plaintiff

ORIGINAL ACTION:
Giữ nguyên góc nhìn của nhân vật, không thay đổi hướng nhìn. Thở phào nhẹ nhõm, rơm rớm nước mắt. Cử chỉ tay của nhân vật theo hội thoại và cảm xúc của nhân vật.

ORIGINAL CAMERA:
Camera cố định, không được di chuyển camera, không được thay đổi góc hay độ zoom của camera. Không có nhạc nền

ORIGINAL SPOKEN DIALOGUE:
"Oh, thank God. What about my house?"

ORIGINAL TONE:
(relieved, breathless)
~~~

Bản prompt chính xác: [proposed-scene-22-prompt.txt](F:/tool-ai-dh/web-ai/docs/phase5a1/proposed-scene-22-prompt.txt), 633 Unicode code points, SHA-256 b20e85b9624c2e38df18aba2314d889a8aac7f5399068c03129792d244fad738.

Kế hoạch có cấu trúc: [proposed-first-paid-test.json](F:/tool-ai-dh/web-ai/docs/phase5a1/proposed-first-paid-test.json). Các trường filename/hash/consent vẫn null hoặc PENDING có chủ đích; đây không phải một quote đã được backend chấp nhận.

## 10. Blocker và phê duyệt còn cần

Thứ tự ưu tiên:

1. **P0 — thiếu CLERK_ISSUER và CLERK_JWT_KEY thật.** Cần cấu hình đúng instance, origin và session trước nghiệm thu live.
2. **P0 — WaveSpeed credential hiện có ở VITE_* và audio client cũ.** Cần cô lập khỏi phiên browser nghiệm thu; không tự sửa audio trong task này.
3. **P1 — chưa có ảnh thực tế do operator chọn**, chưa xác minh single-person/filename/hash.
4. **P1 — chưa chạy UI/auth/quote live hoặc so project live trước/sau.** Regression/mock không thay thế các bước này.
5. **Trước trả phí — giới hạn prompt số cụ thể của provider chưa được công bố/xác minh trong tài liệu đã đọc.** Cap ứng dụng 2.000 không phải bằng chứng provider acceptance. Kiểm tra lại contract và giá tại thời điểm operator quyết định thử.

Cần **một yêu cầu phê duyệt mới, rõ ràng** trước bất kỳ upload hoặc prediction thật nào. Phê duyệt phải chốt: scene_22 và Dialogue/prompt đúng bản, file ảnh thực tế +hash, Standard model, 5s/480p/ratio đã xác nhận, audio=true, camera_fixed=true, seed=-1, phí tham khảo USD 0.12 cùng giới hạn chi tiêu operator chấp thuận, đồng ý chuyển ảnh/metadata sang WaveSpeed và xác nhận auth live đã sẵn sàng. Nếu đổi file/prompt/settings/giá, lấy quote và xác nhận lại.

**Chưa có phê duyệt đó. Paid generation chưa bật. Phase 5A.1 dừng tại báo cáo readiness; không bắt đầu Phase 5B.**
