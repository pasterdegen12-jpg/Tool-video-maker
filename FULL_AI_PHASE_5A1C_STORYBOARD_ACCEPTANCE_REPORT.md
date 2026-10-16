# PHASE 5A.1C — REAL SAVED STORYBOARD ACCEPTANCE

Ngày 2026-10-13. **STOPPED — operator yêu cầu giữ nguyên kích thước và dừng tại giới hạn ảnh.** Cấu hình local sẵn sàng; positive Clerk quote và nghiệm thu quote chưa hoàn tất.

## Dự án/cảnh thật và sự chấp thuận

- Project title: **Dự án Full AI - 12:33:38 AM**.
- Dự án đã lưu: proj_1789061618441, mở qua History/Workspace bằng phiên Clerk thực.
- Cảnh: **3**, Character: **Thẩm phán**, Context: **opening**.
- Operator đã duyệt cảnh bằng phản hồi “Có”. Không còn yêu cầu tìm fixture scene_22. Bộ regression parser 23/22 cảnh là bằng chứng riêng.

Lời thoại nguyên văn:

> You relocated it directly under your tires. Ms. Harper, please explain the incident.

Full AI legacy này chỉ có Voiceover chứa lời thoại, không có Dialogue cạnh tranh. Composer dùng fallback hiện có, không migrate hoặc tạo field trùng. Không hardcode nhân vật hoặc scene của fixture.

Action nguyên văn:

> Giữ nguyên góc nhìn của nhân vật, không thay đổi hướng nhìn. Cảm xúc lạnh lùng, dứt khoát lật mở hồ sơ. Cử chỉ tay của nhân vật theo hội thoại và cảm xúc của nhân vật. Không đập búa, không gõ búa, không cầm búa

Camera nguyên văn:

> Camera cố định, không được di chuyển camera, không được thay đổi góc hay độ zoom của camera. Không có nhạc nền

Tone_of_Voice: **Nghiêm nghị (Lạnh lùng)**. Translate giữ riêng. Composer hiện có không báo unsupported field hoặc conflict; temporary prompt khớp chính xác kết quả utility và textarea readonly.

## Ảnh thật đã chọn và blocker chính xác

Operator đã upload ảnh vào **OpenFrame của scene**, khiến startFrameUrl hiển thị đổi. Input riêng của Seedance quote lúc đó chưa có ảnh/preview. Agent không thực hiện thao tác upload OpenFrame hoặc ghi Firestore.

Đã tải lại **chính ảnh OpenFrame mới được quan sát trong DOM** bằng browser downloadMedia để tái sử dụng ảnh operator chọn, không lấy ảnh thay thế. Không tải lại từ một URL phỏng đoán. File local: C:/Users/Admin/Downloads/scene_bg_1791903431294.jpeg. Ảnh xem được là hình nhân vật trong trang phục thẩm phán, ngồi trước hồ sơ; không suy ra danh tính người trong ảnh.

| Thuộc tính | Ảnh OpenFrame ban đầu | Bản nén được operator cho phép |
|---|---:|---:|
| Format | JPEG | JPEG |
| Dung lượng | 1.670.198 byte | 961.827 byte |
| Kích thước | 1536 × 2752 | 1536 × 2752 |
| Số pixel | 4.227.072 | 4.227.072 |
| Vừa giới hạn 1 MiB | FAIL | PASS |
| Vừa giới hạn 4.000.000 pixel | FAIL | FAIL |

Đã chọn ảnh ban đầu qua input thật của panel: frontend từ chối với **“Ảnh không hợp lệ; chọn PNG/JPEG tối đa 1 MiB.”** Đây là negative image-validation thực, không phải kết quả giả lập. Không có preview được chấp nhận và chưa có request quote từ hành động này.

Sau khi operator đồng ý nén local, đã dùng jpeg-js có sẵn, quality 90, tạo bản sao **operator-reference-compressed.jpg**. Giữ nguyên bố cục/kích thước, không cắt ảnh; JPEG re-encode có thể làm thay đổi giá trị pixel và không sao chép metadata. Hash file gốc trước/sau bằng nhau. Không đổi file gốc hoặc ảnh OpenFrame trên cloud.

Backend hiện có thêm giới hạn ở **api/lib/seedance/images.js**, hàm **validateImage/dimensions**: tối đa 4.000.000 pixel; JPEG decoder cũng có maxResolutionInMP=4. Nén dung lượng không xử lý giới hạn này. Đây là blocker được xác lập từ kích thước giải mã thực và source validator hiện có; **chưa gửi bản nén tới endpoint để quan sát lỗi HTTP**.

Đã xin phép thu nhỏ bản sao đúng tỷ lệ xuống 1488×2666, không crop. Operator chọn **“Giữ kích thước, dừng ở blocker này”**. Không resize, không thay giới hạn validator, không gửi bản nén vào UI/quote sau quyết định đó.

## Real Clerk, quote và paid status

| Hạng mục | Kết quả |
|---|---|
| Clerk signed-in UI thực; đọc dự án đã lưu | PASS |
| Cấu hình issuer/public key cùng instance | PASS từ bằng chứng Phase 5A.1C |
| Thiếu/sai session hoặc sai origin | PASS — HTTP local 401/403 theo expected |
| Positive POST /api/local-video/quote bằng phiên Clerk thật | **NOT RUN** |
| Backend validation ảnh thông qua quote thật | **NOT RUN** |
| Giá/settings/paid_enabled trong response quote thật | **NOT RUN** |
| Quote invalidation sau khi đổi settings | **NOT RUN** — chưa có quote thành công |
| LOCAL_VIDEO_PAID_ENABLED | **false**, xác minh lại trước bước ảnh |
| Backend/front-end WaveSpeed keys của acceptance process | **EMPTY** |
| Provider upload, paid endpoint hoặc prediction | **NOT RUN — không khởi tạo** |
| Cross-user job access bằng hai phiên thật | NOT RUN |

Không dùng JWT ký giả cho positive acceptance, không xuất session token/cookie. Không suy ra signature/issuer/authorized-party đã được backend chấp nhận chỉ từ UI đăng nhập hay PEM hợp lệ. Không có packet capture toàn mạng; số hành động provider bằng 0 là lịch sử thao tác của task và code path được kiểm tra, không phải phép đo mọi lưu lượng mạng.

## Prompt, thời lượng và integrity

- Utility planDuration chạy trên lời thoại thật: **13 từ × 60 / 150 + 0.8 = 6 giây**, fits=true. Đây là ước lượng, chưa đo audio/video thật. Word_count legacy lưu 16, không dùng làm duration và không sửa.
- Trước bước ảnh đã chọn thông số tạm: **6s, 480p, 16:9, audio=true, camera_fixed=true, seed=-1**. UI hết cảnh báo thiếu thời lượng.
- Giá tham khảo UI/utility cho bộ thông số này: **USD 0.1440**, version seedance-standard-reference-2026-10-12. **Không phải quote backend đã thành công, không phải chi phí thực đã phát sinh**.
- Sau khi OpenFrame đổi, panel được quan sát reset về 5 giây/camera_fixed=false. Chưa có quote để invalidation; không gọi việc reset này là test quote invalidation PASS. Trạng thái cuối vẫn có cảnh báo 5 giây ngắn hơn ước tính 6 giây và lỗi dung lượng từ ảnh gốc. Agent không chạy thêm flow sau yêu cầu dừng.
- So sánh toàn bộ field render trước/sau: chỉ **startFrameUrl** khác; thay đổi này đã xuất hiện khi operator báo upload, trước khi agent chuẩn bị bản nén. Không tuyên bố toàn bộ scene object bất biến.
- **Lời thoại, Character, Context, Action, Camera, Tone_of_Voice, Translate, Word_count, status, scene_n và videoUrl không đổi**. Temporary prompt vẫn khớp snapshot trước.
- Snapshot là field hiển thị dưới dạng string từ DOM, không phải Firestore export hoặc kiểm chứng server-side persistence. Agent không nhấn Save/Edit, không import/create project và không thực hiện Firestore write.
- 79/79 file production/config/test được bảo vệ có hash không đổi so với baseline Phase 5A.1C. Generate Audio, Qwen, Gateway, Cooking và GPU không bị thao tác.

## Kiểm tra thực sự thực thi

~~~text
node --env-file=.env.video.local docs/phase5a1c/check-local-routes.mjs
node docs/phase5a1c/storyboard/prepare-reference.mjs
~~~

- Route check cuối: 2026-10-13T15:16:22Z; missing session trực tiếp backend và qua proxy đều 401; invalid bearer 401; wrong origin 403. Listener chỉ 127.0.0.1:5173 và 127.0.0.1:8790; paid=false, key rỗng.
- Browser thật: đọc scene, mở panel, đổi settings tạm, chọn file OpenFrame ban đầu, nhận lỗi dung lượng.
- CPU: composeScene/planDuration so với DOM, decode JPEG và nén bản sao theo sự chấp thuận, kiểm tra hash gốc và file được bảo vệ.
- Lần import jpeg-js trực tiếp bằng Node REPL lỗi “require is not defined”; không tạo ảnh ở lần đó. Script Node riêng trong thư mục bằng chứng chạy thành công, không sửa production.
- Backend image validator qua HTTP với ảnh nén: NOT RUN; inference/Qwen/GPU: NOT RUN; provider: NOT RUN.
- Web full suite/build/lint không chạy lại vì không sửa production source. 221/221 và build PASS vẫn là baseline trước, không nhận là kết quả test mới.

## File và bằng chứng

- docs/phase5a1c/storyboard/scene-candidate-before.json: scene/prompt/settings trước.
- docs/phase5a1c/storyboard/scene-candidate-prompt.txt: prompt nguyên văn đầy đủ.
- docs/phase5a1c/storyboard/candidate-assessment.json và scene-approved.json: utility và duyệt cảnh.
- docs/phase5a1c/storyboard/prepare-reference.mjs: helper CPU local.
- docs/phase5a1c/storyboard/operator-reference-compressed.jpg: bản nén được duyệt, **chưa gửi quote/provider**.
- docs/phase5a1c/storyboard/reference-preparation.json: kích thước, byte count, hash, quality và originalUnmodified=true.
- docs/phase5a1c/storyboard/stop-blocker-ui.json, image-limit-blocker.png: trạng thái cuối.
- docs/phase5a1c/storyboard/final-blocker-evidence.json: đối chiếu fields, protected files và NOT RUN rõ ràng.
- docs/phase5a1c/local-routes.json: HTTP/config cuối.
- docs/phase5a1c/storyboard/report-before-image.md: báo cáo trước khi nhận ảnh, giữ làm lịch sử.

Không có production source change, schema change, credential rotation/deployment hoặc provider credential mới trong continuation.

## Readiness cho một paid test riêng

**NO-GO; dừng theo operator, không tiếp tục tự động.** Ảnh hiện tại chưa đáp ứng 4 triệu pixel. Một lần tiếp tục sau cần ảnh operator chọn đáp ứng cả hai giới hạn, hoặc sự cho phép riêng để thu nhỏ bản sao; không tự nới validator. Sau đó mới có thể kiểm tra positive Clerk quote, image hash/prompt hash, price/settings, invalidation và source preservation.

Mọi tạo backend-only provider credential, bật paid và một yêu cầu thực vẫn cần ủy quyền riêng. Không thực hiện trong task này.
