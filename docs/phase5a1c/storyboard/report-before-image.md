# PHASE 5A.1C — REAL SAVED STORYBOARD ACCEPTANCE

Ngày 2026-10-13. **Operator đã duyệt cảnh 3; đang chờ chọn ảnh thật trong UI.**

Operator đã bỏ yêu cầu phải tìm đúng fixture scene_22. Báo cáo này là trạng thái hiện tại của nghiệm thu dự án đã lưu, tách riêng bộ regression parser Full 23 / Semi 22 cảnh. Những dòng trong báo cáo cấu hình cũ yêu cầu tìm fixture không còn là blocker.

## Dự án và cảnh đề xuất

- Project title thực: **Dự án Full AI - 12:33:38 AM**.
- Dự án đã lưu: proj_1789061618441; mở bằng UI lịch sử với phiên Clerk của operator.
- Cảnh được duyệt: **3**. Operator xác nhận “Có” ngày 2026-10-13.
- Character nguyên văn: **Thẩm phán**.
- Context nguyên văn: **opening**.
- Lời thoại nguyên văn hiển thị dưới DIALOGUE:

> You relocated it directly under your tires. Ms. Harper, please explain the incident.

Đây là dự án Full AI legacy: field gốc chứa lời thoại là **Voiceover**, không có Dialogue cạnh tranh. Panel dùng fallback hiện có, không migrate hoặc ghi trùng field. Character lấy từ scene thực, không hardcode nhân vật của fixture.

Action nguyên văn:

> Giữ nguyên góc nhìn của nhân vật, không thay đổi hướng nhìn. Cảm xúc lạnh lùng, dứt khoát lật mở hồ sơ. Cử chỉ tay của nhân vật theo hội thoại và cảm xúc của nhân vật. Không đập búa, không gõ búa, không cầm búa

Camera nguyên văn:

> Camera cố định, không được di chuyển camera, không được thay đổi góc hay độ zoom của camera. Không có nhạc nền

Tone_of_Voice: **Nghiêm nghị (Lạnh lùng)**. Translate vẫn riêng, không đưa vào spoken dialogue. Không có nonempty field ngoài allowlist, không có conflict Dialogue/Voiceover và không có alert sau khi chọn duration hợp lệ.

Đã đọc các lời thoại của 23 scene hiện có qua DOM chỉ đọc. Chọn cảnh 3 vì lời thoại ngắn, nhân vật đơn nhất, chỉ dẫn Action/Camera đầy đủ và composer hiện có chấp nhận. Không chọn theo số cảnh hoặc nội dung fixture.

## Thời lượng và thông số chuẩn bị

Utility planDuration thực chạy trên text hiển thị: **13 từ × 60 / 150 + 0.8 giây nghỉ = 6 giây**, fits=true. Đây là ước lượng, chưa đo giọng/video provider thật. Word_count legacy lưu 16; không dùng số cũ làm thời lượng và không sửa metadata đó.

| Thông số trên panel | Giá trị |
|---|---|
| Duration | 6 giây |
| Resolution | 480p |
| Aspect | 16:9 |
| Audio | true |
| Camera fixed | true |
| Seed | -1 |
| Ước tính UI hiện có | USD 0.1440 |

Giá trên chỉ là phép tính tham khảo hiện có, version seedance-standard-reference-2026-10-12; **chưa phải quote thành công từ backend với phiên thật**. Không tra lại giá provider trong continuation này và không phát sinh phí.

Scene có startFrameUrl đã lưu, nhưng panel yêu cầu operator chọn bản ảnh local thực của **Thẩm phán**, phù hợp OpenFrame/cảnh 3. Chưa chọn ảnh; chỉ chấp nhận PNG/JPEG tối đa 1 MiB theo UI. Không tự tải ảnh R2 hoặc chọn ảnh bất kỳ. videoUrl đã lưu được giữ nguyên; sự tồn tại của URL không được dùng làm bằng chứng video thật do Seedance tạo.

## Kiểm tra đã thực hiện

| Kiểm tra | Kết quả |
|---|---|
| Phiên Clerk thực signed-in trên UI, mở History/Workspace | PASS |
| Đọc scene đã lưu từ panel Original scene | PASS |
| Prompt tạm readonly | PASS — thuộc tính readOnly thực |
| composeScene trên field text đọc từ DOM khớp hoàn toàn textarea | PASS |
| 5 giây ngắn hơn ước tính | UI có alert; không quote |
| Chọn 6 giây / camera_fixed=true bằng UI | PASS — alert biến mất |
| Nội dung source có snapshot nguyên văn trước bước quote | PASS |
| Operator duyệt cảnh | PASS — operator xác nhận “Có” |
| Ảnh matching do operator chọn / backend validation | NOT RUN |
| POST /api/local-video/quote với session Clerk thật | NOT RUN |
| Giá/settings/paid_enabled trong response quote thật | NOT RUN |
| Quote invalidation khi đổi settings sau quote | NOT RUN |
| Original scene so sánh trước/sau toàn bộ quote flow | NOT RUN — chờ quote; đã lưu baseline DOM |
| Provider upload/prediction | NOT RUN — bị cấm trong task |

Không thay đổi screenplay/Firestore, không thực hiện bất kỳ thao tác Save/Edit/generation. Chỉ mở panel, đổi thông số tạm và đóng/mở phần hiển thị readonly. Snapshot chứa **giá trị field render dưới dạng string**, không phải export Firestore hoặc bằng chứng kiểu dữ liệu server.

## Readiness local được kiểm tra lại

Lệnh thực thi:

~~~text
node --env-file=.env.video.local docs/phase5a1c/check-local-routes.mjs
~~~

Kết quả lúc 2026-10-13T14:48:27Z:

- LOCAL_VIDEO_PAID_ENABLED=false; backend và frontend WaveSpeed keys EMPTY.
- Backend missing session 401; proxy missing session 401; proxy invalid bearer 401; wrong origin 403.
- Chỉ loopback 127.0.0.1:5173 và 127.0.0.1:8790.
- Module frontend thực không chứa known WaveSpeed secret và có VITE_WAVESPEED_API_KEY rỗng.

Negative HTTP requests không dùng token ký giả; không được tính là positive live Clerk quote. Tại thời điểm này chưa lấy/xuất session token và không có image upload hoặc submit.

## Bằng chứng và source integrity

- docs/phase5a1c/storyboard/scene-candidate-before.json: field scene/prompt/settings lấy trực tiếp từ DOM.
- docs/phase5a1c/storyboard/scene-candidate-prompt.txt: prompt nguyên văn toàn bộ.
- docs/phase5a1c/storyboard/candidate-assessment.json: kết quả utility thực trên dữ liệu cảnh đọc được.
- docs/phase5a1c/storyboard/scene-candidate.png: panel đúng dự án/cảnh, input ảnh chưa chọn.
- docs/phase5a1c/local-routes.json: kết quả HTTP/config local hiện tại.

Continuation chỉ ghi báo cáo/bằng chứng, không sửa code production hoặc cấu hình an toàn. Không chạy lại suite/build vì không có source fix. Baseline 221/221 tests và fixture integrity 23/22 vẫn là bằng chứng riêng, không thay cho nghiệm thu dự án này.

## Bước tiếp theo và paid-test readiness

Operator đã duyệt cảnh 3; còn cần chọn ảnh PNG/JPEG thật phù hợp trong input **Ảnh tham chiếu** của panel đang mở. Sau đó Codex sẽ gửi quote chỉ tới backend local bằng phiên Clerk bình thường, đối chiếu prompt/giá/settings, thử invalidation và so sánh scene trước/sau. Không upload WaveSpeed.

**Paid test: NO-GO trong phase này.** Positive live quote, ảnh phù hợp và invalidation chưa hoàn tất. Mọi backend provider credential, bật paid flag và một yêu cầu thực đều cần task/ủy quyền riêng. Chưa có provider submission nào được khởi tạo. Không có packet capture toàn mạng; không tuyên bố đã chứng minh mọi lưu lượng bên ngoài bằng một phép đo network.

## Cập nhật sau khi duyệt cảnh

Lúc 2026-10-13T14:56:16Z, UI đang mở nhầm panel scene 1, chưa có ảnh. Đã mở lại scene 3 được duyệt, chọn lại 6 giây/camera_fixed=true bằng UI. So sánh toàn bộ field original hiển thị với snapshot trước: không đổi; prompt cũng khớp nguyên văn. Ảnh vẫn chưa chọn, nút quote disabled. Không suy diễn câu “Có” thành xác nhận đã chọn ảnh. Positive live quote vẫn NOT RUN. Bằng chứng: docs/phase5a1c/storyboard/scene-approved.json và scene-approved-awaiting-image.png.
