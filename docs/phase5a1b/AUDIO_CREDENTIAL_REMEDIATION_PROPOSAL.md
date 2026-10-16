# Đề xuất riêng: đưa credential WaveSpeed của Generate Audio về backend

Ngày 2026-10-13. **PROPOSAL ONLY — chưa triển khai, chưa deploy, chưa rotate credential.**
Phạm vi đề xuất: F:\tool-ai-dh\web-ai. Cần operator cho phép riêng trước khi sửa audio.

## Vấn đề đã xác nhận

[Workspace.jsx](F:/tool-ai-dh/web-ai/src/Workspace/Workspace.jsx:619) hiện tự tạo payload, POST thẳng WaveSpeed và poll từ browser. Hai header Authorization tại dòng 671/693 đọc VITE_WAVESPEED_API_KEY. .env có giá trị không rỗng; không kiểm tra hiệu lực hoặc in giá trị.

Biến có tiền tố VITE_ có thể được đưa vào mã client. Git-ignore không ngăn việc này. [Vite: Env Variables and Modes](https://vite.dev/guide/env-and-mode).

Không kết luận production đã lộ từ bản dist local: bản dist hiện có đã được build với WaveSpeed key rỗng ở Phase 5A.1. Cần operator kiểm tra deployment/bundle/CDN cũ và môi trường hosting để xác định phạm vi thực tế. Không truy cập hosting trong task này.

## Thay đổi nhỏ được đề xuất

Giữ giao diện Generate Audio, lựa chọn voice, xử lý văn bản hiện có, batch, kết quả audio và schema lưu dự án. Thay đường vận chuyển request:

1. Browser gọi API audio cùng origin bằng Clerk session; không gửi key provider.
2. Backend xác thực session, issuer và origin trước mọi request provider. Origin production được cấu hình rõ; localhost chỉ được chấp nhận trong cấu hình dev riêng. Không bỏ chốt development-only của video để tái sử dụng cho audio production.
3. Backend chỉ ánh xạ hai chế độ đang có sang hai endpoint cố định:
   - minimax → minimax/speech-2.8-turbo.
   - clone → wavespeed-ai/qwen3-tts/voice-clone.
4. Key mới do operator tạo được đặt ở secret store backend riêng, chẳng hạn WAVESPEED_AUDIO_API_KEY. Không chép key VITE_ cũ sang backend. Không dùng cờ LOCAL_VIDEO_PAID_ENABLED làm quyền gửi audio.
5. API đề xuất: POST /api/wavespeed-audio/submit và GET /api/wavespeed-audio/jobs/{handle}. Không nhận endpoint/get URL tùy ý từ client. Poll URL được backend dựng từ ID đã kiểm tra, model cố định và host/path allowlist; không chuyển Authorization sang redirect/host khác.
6. Với phản hồi synchronous, trả trạng thái và output an toàn cho browser ngay. Với tác vụ chờ, trả handle có chữ ký, gắn prediction ID/model, subject/session và expiry. Mỗi GET phải xác thực session và chữ ký/owner. Cách này không cần đổi schema Firestore hoặc dựa vào Map mất khi serverless cold-start; khóa ký chỉ ở backend và phải riêng với key provider.
7. Giới hạn body, text, thời gian, số lần poll và tần suất theo user. Chặn thiếu key/config trước provider. Không tự retry POST khi không biết provider đã nhận hay chưa; giữ đủ thông tin để operator đối chiếu mà không ghi token/key/signed URL vào log.
8. Client adapter giữ cách cập nhật loading/error và đưa audioUrl về đường xử lý proxifyUrl → generatedAudiosRef → setGeneratedAudios → updateProjectProgress đang có. Chỉ lưu khi thành công. Không sửa các media đã lưu, không migrate dữ liệu.

Phải giữ nguyên cleanText hiện tại trong task chuyển credential; thay đổi quy tắc đọc/phát âm nếu muốn là một yêu cầu khác. Giữ Full AI Dialogue/legacy Voiceover và Semi Voiceover qua readSpokenText hiện có.

## Payload phải giữ tương thích

| Nhánh | Giá trị hiện có cần giữ |
|---|---|
| Minimax | text sau xử lý hiện tại; voice_id; language_boost=auto; emotion=neutral; format=mp3; sample_rate=32000; bitrate=128000; enable_sync_mode=true |
| Voice clone | text; audio URL mẫu; language=auto; enable_sync_mode=true; reference_text chỉ khi đã có và không trắng |
| Hoàn tất | completed/success và outputs[0] theo nhánh tương thích hiện tại |
| Đang xử lý | created/processing; poll cách 2 giây, tối đa 60 lần như UI hiện tại |
| Lỗi | failed, thiếu output, HTTP lỗi, timeout → hiển thị lỗi; không ghi đè audio đã lưu |

Đây là yêu cầu bảo toàn từ source hiện tại, không phải kết luận model/audio provider đã nghiệm thu thật. Trước triển khai phải kiểm tra lại contract chính thức của hai model audio. Không gọi chúng trong Phase 5A.1B.

api/proxy-audio.js hiện chỉ tải media từ URL; nó không phải API submit/poll có xác thực và không đủ để thay thế hai request có key. Không dùng proxy tùy ý làm đường chuyển tiếp header credential. Việc tăng cường bảo vệ proxy media cũ cần phạm vi riêng nếu vượt phần audio transport này.

## File dự kiến thay đổi — chưa sửa

- src/Workspace/Workspace.jsx: thay hai fetch provider bằng client adapter; giữ phần media/state/persistence.
- src/lib/wavespeedAudioClient.js: client transport mới; không credential provider.
- api/wavespeed-audio/submit.js và api/wavespeed-audio/jobs/[handle].js: route đề xuất.
- api/lib/wavespeed-audio/*: validate/config/auth/provider/handle; dùng helper xác thực phù hợp và chốt origin riêng.
- Backend dev/proxy/config deployment: chỉ nối route audio cùng origin; không đổi local-video.
- Tests audio mới và tài liệu cấu hình. Không đổi Firebase schema, Semi parser, Gateway hay Cooking.

Tên file là đề xuất, chưa phải API đã tồn tại.

## Test tương thích bắt buộc trước khi triển khai

| Nhóm | Expected result |
|---|---|
| Minimax và clone | Payload thực gửi mock provider bằng đúng payload trước sửa; reference_text có/không, tiếng Việt, punctuation/newline |
| Full/Semi/legacy | Dialogue canonical, Full legacy Voiceover và Semi Voiceover dùng đúng nội dung; conflict giữ chặn; scene gốc không mutate |
| Sync / async | completed/success trả audio; created/processing poll đến terminal; không POST lặp |
| UI / batch | Voice selection, loading, lỗi, batch tuần tự và scene được chọn giữ hành vi; refresh vẫn đọc audio đã lưu |
| Persistence | Success cập nhật đúng scene một lần qua helper hiện có; failed/timeout không xóa hoặc ghi đè media cũ; dùng mock/emulator, không ghi Firestore thật |
| Auth / ownership | Thiếu/sai/expired/pending token, sai issuer/azp/origin, handle giả/expired/cross-user/cross-session → từ chối trước provider |
| SSRF / header | Client-supplied endpoint/get URL, host private, redirect, sai ID/model → từ chối; provider key chỉ đến host chính thức |
| Chi phí / lỗi mạng | Thiếu key hoặc audio gate tắt → 0 provider calls; POST timeout/ambiguous không tự gửi lại; rate/body/poll limits có hiệu lực |
| Credential | Build với VITE_WAVESPEED_API_KEY rỗng; exact-value/sentinel scan bundle, sourcemap, response, log không có key; browser không gọi provider bằng Authorization |
| Hồi quy | Toàn bộ Web suite, build, lint file sửa; 23 Full/22 Semi và media trước/sau giữ nguyên |

Mocks không thay thế nghiệm thu audio trả phí. Mọi paid smoke test sau này cần phép riêng với dữ liệu/phí đã chốt.

## Triển khai và rotation do operator kiểm soát

1. Kiểm kê nơi key cũ từng được dùng: hosting env, bundle/sourcemap cũ, preview deployment, cache, CI log, repository history. Không in key trong kết quả. Nếu đã bị phát tán, coi key đó không còn bí mật.
2. Sau khi operator duyệt sửa audio, chuẩn bị backend/client và chạy toàn bộ test không trả phí. Chưa bật audio provider ở môi trường mới.
3. Operator tạo key mới, lưu ở backend secret store; rà soát quyền/hạn mức provider hỗ trợ. Không đưa vào VITE_ hoặc commit. Dùng giá trị kiểm thử vô hại cho kiểm tra bundle, không build secret thật ở client.
4. Deploy backend trước ở trạng thái audio bị chặn; deploy client cùng origin đã bỏ VITE_WAVESPEED_API_KEY. Bỏ biến đó khỏi cấu hình build/hosting khi cutover đã được phê duyệt, rebuild và thay bundle/cache cũ. Không sửa Firebase hoặc media URL.
5. Sau kiểm tra auth/transport, operator quyết định thời điểm bật audio và có cho phép một smoke request có phí hay không. Video vẫn paid=false. Không suy ra quyền này từ Phase 5A.1B.
6. Operator revoke/rotate key cũ và kiểm tra sử dụng bất thường. Cửa sổ tồn tại song song phải ngắn và được operator chốt. Nếu nghi ngờ đang bị lạm dụng, ưu tiên revoke sớm; chấp nhận gián đoạn Generate Audio đến khi bản an toàn sẵn sàng.
7. Client cũ đang mở vẫn có thể giữ bundle chứa key cũ; sau revoke cần reload để tạo audio mới. Không thể vừa thu hồi key đã lộ vừa bảo đảm các tab cũ tiếp tục gọi trực tiếp provider. Media đã tạo và dữ liệu dự án vẫn giữ nguyên.
8. Rollback về bản backend/client an toàn đã kiểm tra; không phục hồi key vào frontend hoặc khôi phục bundle có key. Nếu chưa có bản an toàn để rollback, tạm tắt tạo audio, vẫn cho đọc/phát media cũ.

Không có bước deploy, rotation, revoke hay bật audio nào đã được thực hiện ở task hiện tại.
