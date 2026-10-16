# Seedance một scene — chạy local

Tính năng nằm trong **Full AI → Storyboard → Gen Video AI**. Chọn ảnh PNG/JPEG từ máy, kiểm tra nguyên văn scene và prompt, chọn thông số, lấy báo giá, sau đó xác nhận riêng việc chuyển ảnh và tính phí.

Không cần khởi động Qwen hoặc Local AI Gateway cho luồng video. Kết quả chỉ nằm trong panel đang mở; đóng/đổi scene hoặc tải lại trang sẽ mất preview tạm thời. Cancel Waiting dừng trình duyệt chờ kết quả, không hủy prediction bên provider.

## Cấu hình backend

Cấu hình bên dưới là hướng dẫn; task không tạo/sửa file môi trường, không khởi động dịch vụ thật và không bật tính phí.

Tạo file môi trường riêng, được gitignore, ví dụ .env.video.local. Dùng đúng Clerk instance của Web đang đăng nhập:

- NODE_ENV=development
- LOCAL_VIDEO_ENABLED=true
- LOCAL_VIDEO_PAID_ENABLED=false
- LOCAL_AI_WEB_ORIGIN=http://localhost:5173
- CLERK_ISSUER: HTTPS origin thực của Clerk instance.
- CLERK_JWT_KEY: public PEM key đúng instance; hỗ trợ ký tự \n.
- WAVESPEED_API_KEY: chỉ đặt trong backend sau phê duyệt; không dùng VITE_*.

Chạy từ F:\tool-ai-dh\web-ai:

    node --env-file=.env.video.local scripts/local-video-server.mjs
    npm.cmd run dev

Backend chỉ bind 127.0.0.1:8790. Vite chuyển /api/local-video về backend đó; máy LAN bị chặn. Cấu hình production/VERCEL bị từ chối. Giữ cùng hostname/port giữa trình duyệt và LOCAL_AI_WEB_ORIGIN.

Khi paid flag=false, có thể kiểm tra ảnh/báo giá local; mọi upload và POST tạo video tới WaveSpeed bị chặn dù API key đã có. Chỉ operator mới bật flag sau khi phê duyệt riêng scene, ảnh, model, duration, resolution, audio và chi phí. Không có lệnh tự bật trong project.

## Giới hạn hiện tại

- Một scene; thời lượng nguyên 4–9 giây; 480p/720p.
- Ảnh PNG/JPEG ≤1 MiB, 32–4096 px mỗi chiều, ≤4 triệu pixel; server decode xác thực. Không lấy ảnh R2/OpenFrame bằng URL.
- Dialogue canonical; Voiceover chỉ được đọc với Full AI legacy. Xung đột hai field bị chặn.
- Prompt đầy đủ tối đa 2.000 ký tự Unicode theo giới hạn ứng dụng; không cắt ngắn. Giới hạn số cụ thể của provider chưa xác minh.
- Giá tham khảo version 2026-10-12; chặn khi quá 30 ngày hoặc thiếu giá, không tự dùng giá mặc định.
- Quote 2 phút, dùng một lần; theo dõi job tối đa 15 phút/180 GET. Mỗi phiên có hạn mức bộ nhớ; quote chưa dùng dự trữ cả chỗ cho job.
- Upload/submit không tự retry. Nếu báo admission_unknown, không gửi lại trước khi operator kiểm tra WaveSpeed.
- Bộ nhớ job không bền vững qua restart. Không tự khôi phục/gửi lại job đã mất theo dõi.
- Link video tạm thời, chưa lưu Firestore/R2. Preview phụ thuộc khả năng CORS của host kết quả; link tải có thể mở tab thay vì tải ngay.
- Lời thoại và chất lượng hình/giọng trong video chỉ xác minh được sau khi nhận video thật và nghe/xem.

## Kiểm tra an toàn

    npm.cmd test
    npm.cmd run build
    node docs/phase5a/verify.mjs

Các test dùng provider giả lập, Clerk session ký bằng khóa test và Gateway CPU có chặn import model. Không dùng lệnh test này để kết luận real inference hoặc real paid generation thành công.

Báo cáo chính: FULL_AI_PHASE_5A_SEEDANCE_SINGLE_SCENE_REPORT.md.
