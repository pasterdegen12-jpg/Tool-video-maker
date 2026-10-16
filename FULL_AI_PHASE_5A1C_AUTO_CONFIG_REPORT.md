> Trạng thái cuối continuation: operator đã duyệt cảnh 3 và ảnh OpenFrame thật, nhưng yêu cầu dừng tại giới hạn 4 triệu pixel, giữ nguyên kích thước. Bản nén local đã tạo; positive quote vẫn NOT RUN, paid=false. Báo cáo Storyboard được liên kết bên dưới là trạng thái hiện tại.

> Cập nhật 2026-10-13: operator đã cho phép nghiệm thu trên dự án Full AI thực bất kỳ phù hợp, không yêu cầu fixture scene_22. Xem trạng thái mới tại [FULL_AI_PHASE_5A1C_STORYBOARD_ACCEPTANCE_REPORT.md](F:/tool-ai-dh/web-ai/FULL_AI_PHASE_5A1C_STORYBOARD_ACCEPTANCE_REPORT.md). Các yêu cầu tìm fixture bên dưới chỉ là lịch sử phiên trước.

# PHASE 5A.1C — AUTO CONFIGURATION / LIVE ACCEPTANCE

Cập nhật: 2026-10-13. Phạm vi: F:\tool-ai-dh\web-ai.

**Trạng thái: cấu hình hoàn tất; nghiệm thu Storyboard chưa hoàn tất, chờ xác định đúng dự án và ảnh thật do operator chọn.** Không gửi yêu cầu trả phí, không sửa source production, không ghi Firestore.

## 1. Dịch vụ thực sự đã truy cập

- Clerk Dashboard: đã dùng phiên operator đăng nhập để đọc cấu hình công khai cần thiết của ứng dụng hiện có.
- GitHub và Google: chỉ nằm trong luồng đăng nhập Clerk, được operator cho phép riêng; operator tự thực hiện xác minh/MFA.
- Public JWKS của đúng Clerk instance: HTTP 200; đối chiếu khóa công khai với PEM thực hiển thị trên Dashboard.
- Web AI local tại http://localhost:5173 và local-video tại 127.0.0.1:8790.
- Workspace đã đọc các dự án hiện có qua UI. Không truy cập Firebase console hoặc ghi dữ liệu.
- Không truy cập Vercel/WaveSpeed dashboard; không cấu hình dịch vụ ngoài phạm vi.

## 2. Operator login

Operator xác nhận đã vào Clerk Dashboard rồi đăng nhập Web AI. Hai phiên riêng đã được kiểm tra bằng giao diện thực. Trong Web AI thấy nút user menu và mở được lịch sử/Workspace. Không xuất cookie, bearer token hoặc session token. Không dùng JWT giả cho positive acceptance.

## 3. Clerk application/environment match — PASS

Ứng dụng hiện có trên Dashboard: My Application, môi trường Development. Publishable key hiện có thuộc cùng instance với issuer. PEM đọc từ phần public key trên Dashboard được đối chiếu bằng fingerprint SPKI với RSA/RS256 public JWKS của instance đó. Không đọc secret key, tạo ứng dụng/khóa mới hoặc sửa policy/domain/user.

Lần đối chiếu ban đầu từ accessibility text có số dòng bị chặn an toàn vì fingerprint không khớp; chưa ghi cấu hình. Sau đó đọc đúng nội dung CODE chứa PEM, đối chiếu thành công rồi mới tạo file. Bằng chứng: docs/phase5a1c/configuration.json. Báo cáo không chứa giá trị credential.

## 4–7. Cấu hình local và isolation

| Hạng mục | Kết quả |
|---|---|
| CLERK_ISSUER cấu hình thật | YES |
| CLERK_JWT_KEY là PEM public RSA thật | YES |
| .env.video.local Git-ignored / không tracked | PASS — quy tắc .gitignore:27 (.env*) |
| LOCAL_VIDEO_ENABLED | true |
| LOCAL_VIDEO_PAID_ENABLED | false |
| Origin frontend/backend | http://localhost:5173 khớp chính xác |
| WAVESPEED_API_KEY trong tiến trình nghiệm thu | EMPTY |
| VITE_WAVESPEED_API_KEY trong tiến trình nghiệm thu | EMPTY |
| Key provider cũ có trong module frontend thực đang phục vụ | Không tìm thấy |
| VITE_WAVESPEED_API_KEY trong module thực đang phục vụ | Chuỗi rỗng |
| PEM Clerk bị đưa vào module frontend được kiểm tra | Không |
| .env / .env.local cũ | Không sửa |

Node --env-file nạp file acceptance trước khi Vite chạy; giá trị trong process được kiểm tra, đồng thời kiểm tra module Workspace thực do Vite trả về. Không chỉ suy luận từ tên file dotenv. Không chép key frontend cũ sang backend.

## 8. Local backend readiness — PASS

Các dịch vụ phiên trước đã dừng khi tiếp tục; đã khởi động lại. Vite gặp EBUSY trong fs.watch khi một file bằng chứng được tạo. Xử lý bằng CHOKIDAR_USEPOLLING=true chỉ trong tiến trình acceptance, qua helper tài liệu; không sửa vite.config.js/source ứng dụng.

Kiểm tra cuối tại 2026-10-13T14:37:04Z:

| Kiểm tra thực thi | Actual |
|---|---|
| POST trực tiếp backend, thiếu session | 401 UNAUTHORIZED |
| POST qua proxy Vite, thiếu session | 401 UNAUTHORIZED |
| POST qua proxy, Bearer invalid | 401 UNAUTHORIZED |
| Origin 127.0.0.1 thay localhost | 403 FORBIDDEN_ORIGIN |
| Listener Vite | Chỉ 127.0.0.1:5173 |
| Listener backend | Chỉ 127.0.0.1:8790 |
| Paid config | false; cả hai key provider rỗng |

Requests kiểm tra không có ảnh, token thật hoặc token ký giả và không gọi submit. Kết quả: docs/phase5a1c/local-routes.json. Đây là trạng thái tại thời điểm đo, không bảo đảm dịch vụ tiếp tục sống sau khi phiên công cụ kết thúc.

## 9. Real Clerk browser acceptance — PARTIAL

| Hạng mục | Trạng thái |
|---|---|
| Đăng nhập Dashboard thật | PASS |
| Đăng nhập Web AI thật, UI signed-in, mở Workspace | PASS |
| Positive quote xác thực bằng session Clerk thật | NOT RUN |
| Negative thiếu/sai session, sai origin | PASS qua HTTP local |
| Positive signature/issuer/azp/session được backend chấp nhận | NOT RUN |
| Cross-user job isolation trong hai phiên thật | NOT RUN — chưa có hai tài khoản/job hợp lệ |

Source authenticateSession vẫn kiểm tra chữ ký bằng public key, authorizedParties, issuer/azp, sub/sid, exp/nbf/iat và pending session. Đây là xác minh source, **không phải bằng chứng positive live acceptance**. Không bỏ qua chốt auth để tiếp tục.

## 10. Storyboard quote acceptance — NOT RUN

Đã mở hai dự án hiện có, không chỉnh sửa:

| Dự án | Actual | Đối chiếu với mẫu yêu cầu |
|---|---|---|
| Dự án Full AI - 12:33:38 AM | 23 cảnh; tranh chấp xe sang cán xe giao hàng | Khác mẫu |
| Dự án Full AI - 4:12:39 AM | 23 cảnh; tranh chấp đầu độc chim/thú nuôi | Khác mẫu |

Mẫu cần xác định có scene_22: "Oh, thank God. What about my house?". Không suy ra đúng kịch bản chỉ vì dự án có 23 cảnh. Đã hỏi operator tên dự án hoặc mở đúng dự án trong tab hiện tại. Không tạo/import dự án thay thế vì có thể ghi Firestore, không dùng script khác rồi tuyên bố khớp mẫu.

| Acceptance còn lại | Trạng thái / nguyên nhân |
|---|---|
| Scene_22 fields so với source thật | NOT RUN — chưa tìm đúng dự án |
| Prompt tạm chỉ đọc / faithful trong panel thật | NOT RUN |
| Ảnh PNG/JPEG thật do operator chọn | NOT RUN — chưa chọn ảnh |
| Backend validate ảnh / quote bằng session thật | NOT RUN |
| 5s, 480p, 16:9, audio=true, camera_fixed=true, seed=-1 | NOT RUN trong đúng panel |
| Giá tham khảo USD 0.1200 trong quote thật | NOT RUN; chỉ là giá dự kiến từ baseline |
| Đổi ảnh/settings làm mất quote; cancel/stale | NOT RUN trong phiên thật |
| Paid submit disabled trong panel có quote | NOT RUN; server paid=false đã xác minh riêng |
| Provider upload/prediction | NOT RUN / không được phép |

Không có hành động provider nào được khởi tạo trong task. Không có packet capture; không gán tuyên bố này thành kết quả kiểm tra toàn bộ network. Hai checkbox đồng ý trả phí/chuyển ảnh chưa được chọn. Không nhấn Generate Audio, Set ID, Save/Edit scene hoặc nút generation khác.

Bằng chứng UI: docs/phase5a1c/browser-acceptance.json và project-selection.png.

## 11. Thay đổi file

- Tạo .env.video.local (Git-ignored) chứa issuer/public PEM thật và cờ an toàn.
- Tạo báo cáo này và helper/bằng chứng trong docs/phase5a1c/.
- Chạy checker có sẵn làm cập nhật docs/phase5a1/readiness.json; bản trước giữ trong docs/phase5a1c/prior-phase5a1-readiness.json.
- Helper polling chỉ áp dụng cách Vite theo dõi file ở lần chạy acceptance; không sửa production config.
- Không sửa production source, tests hiện có, Generate Audio, schema Firestore, Gateway/Cooking/GPU.
- Working tree đã có nhiều thay đổi từ trước task; không coi toàn bộ git status là thay đổi của Phase 5A.1C.

## 12. Lệnh và kiểm tra thực sự đã chạy

Không có credential trong các lệnh dưới đây:

~~~text
node docs/phase5a1c/configure-clerk-local.mjs
node docs/phase5a1/check-readiness.mjs
node --env-file=.env.video.local scripts/local-video-server.mjs
node --env-file=.env.video.local node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
node --env-file=.env.video.local docs/phase5a1c/check-local-safety.mjs
node --env-file=.env.video.local --import ./docs/phase5a1c/enable-watch-polling.mjs node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
node --env-file=.env.video.local docs/phase5a1c/check-local-routes.mjs
git status --short
~~~

- Readiness có sẵn: PASS sau khi cấu hình. servicesStarted trong checker là trường cố định, không dùng làm bằng chứng tiến trình đang chạy.
- Check local-safety lúc 14:35Z: cấu hình/scan PASS, hai dịch vụ lúc đó NOT_LISTENING; sau đó mới khởi động lại. Trường browserAcceptance/publicKeyMatchesInstance trong helper này là placeholder NOT RUN, không thay thế bằng chứng Dashboard/browser riêng.
- Check routes lần sau khi Vite EBUSY: FAIL ECONNREFUSED; sau dùng polling: PASS theo bảng mục 8.
- Node filesystem/crypto byte comparison: 79/79 file bảo vệ không đổi; Full source 23 cảnh và Semi source 22 cảnh có SHA256 khớp baseline. docs/phase5a1c/integrity.json.
- Không chạy parser/inference để kiểm tra lại chất lượng; không tuyên bố byte comparison là parser test.
- Web suite trong Phase 5A.1C: NOT RUN. Production build: NOT RUN. Targeted lint: NOT RUN. Task chỉ thay đổi cấu hình/helper tài liệu nên không cần lặp full suite. **221/221, build PASS, lint PASS là baseline Phase 5A.1, không phải kết quả chạy mới.**

## Security assessment và đề xuất audio riêng

Scan hiện tại: 277 file text working tree; 35 index blobs và 35 HEAD blobs. Không thấy known-secret/heuristic candidate trong index hoặc HEAD được quét. Không quét toàn bộ Git history hoặc deployment/CDN.

- .env (untracked/ignored): có giá trị VITE_WAVESPEED_API_KEY không rỗng, không phải placeholder. Chưa thử hiệu lực credential. Không in giá trị.
- src/Workspace/Workspace.jsx: Generate Audio hiện đọc biến VITE_ để gọi provider trực tiếp. Môi trường acceptance đã cách ly bằng chuỗi rỗng; rủi ro build/deploy cũ vẫn tồn tại.
- dist/assets/index-NxQkttCS.js: không khớp known WaveSpeed secret. Heuristic key-shaped tương ứng cấu hình Firebase public trong lần phân loại trước; không kết luận đây là leak WaveSpeed.

Operator cần rà soát bundle/deployment cũ và lên kế hoạch rotation nếu key từng được đưa ra client. Không tự rotate hoặc sửa audio. Đề xuất server-side audio, bảo toàn hành vi/media, tests tương thích và rollout/rotation/rollback riêng đã có tại docs/phase5a1b/AUDIO_CREDENTIAL_REMEDIATION_PROPOSAL.md; **proposal only**.

## 13. Operator action còn lại

1. Xác định/mở dự án đã lưu chứa đúng mẫu scene_22 nêu trên. Đây là dữ liệu cần để kiểm thử, không phải yêu cầu operator sửa cấu hình.
2. Khi đúng panel mở, chọn ảnh thật bằng input ảnh của UI. Codex sẽ tiếp tục quote local và kiểm tra settings/invalidations với paid=false; chưa upload provider.

Không gửi keys, token hoặc MFA vào chat. Nếu mẫu chưa tồn tại trong Firestore, cần operator quyết định phạm vi tiếp theo; task hiện tại không tự tạo/mutate dự án.

## 14. Sẵn sàng cho paid test riêng — NO-GO

Clerk config và local route safety đã sẵn sàng. Positive real-session quote, ảnh thật, đúng source scene, giá/settings và invalidation vẫn chưa nghiệm thu. Chỉ sau khi hoàn tất các bước này mới chuẩn bị đề nghị duyệt một paid scene riêng. Hiện chưa có backend provider credential; không tự dùng lại key audio frontend. Không bật paid flag, deploy, rotate credential hoặc gửi Seedance prediction trong phase này.
