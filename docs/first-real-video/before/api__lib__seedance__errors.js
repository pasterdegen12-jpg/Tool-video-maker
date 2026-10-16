const codes={
  INVALID_REQUEST:[422,'Yêu cầu video không hợp lệ.'],
  IMAGE_INVALID:[422,'Dữ liệu ảnh PNG/JPEG bị hỏng hoặc không giải mã được.'],
  IMAGE_TYPE:[422,'Chỉ hỗ trợ ảnh PNG hoặc JPEG.'],
  IMAGE_TOO_LARGE:[422,'Ảnh vượt giới hạn 25 MiB (26.214.400 byte).'],
  IMAGE_DIMENSIONS:[422,'Ảnh vượt giới hạn 24 MP hoặc 32–16.384 px mỗi chiều.'],
  REQUEST_TOO_LARGE:[413,'Dữ liệu upload vượt giới hạn request video local (base64 ảnh 25 MiB cộng 1 MiB dữ liệu kèm theo).'],
  PAID_DISABLED:[403,'Gửi yêu cầu tính phí đang tắt trên backend.'],
  CONFIGURATION_ERROR:[503,'Backend video chưa được cấu hình đầy đủ.'],
  JOURNAL_UNAVAILABLE:[503,'Nhật ký video local không an toàn hoặc không ghi được. Đã chặn gửi; giữ nguyên file để kiểm tra.'],
  UNRESOLVED_ATTEMPT:[409,'Có lần gửi chưa rõ kết quả. Khôi phục/kiểm tra WaveSpeed và yêu cầu phê duyệt mới; không tự gửi lại.'],
  SUBMISSION_REJECTED:[502,'WaveSpeed từ chối yêu cầu tạo video. Không tự gửi lại.'],
  NOT_FOUND:[404,'Không tìm thấy yêu cầu của phiên này.'],
  EXPIRED:[410,'Đã hết thời gian theo dõi/xác nhận. Không tự gửi lại.'],
  ALREADY_USED:[409,'Xác nhận đã dùng hoặc yêu cầu này đã gửi. Không gửi lại.'],
  MISMATCH:[409,'Ảnh, nội dung hoặc thông số đã thay đổi. Hãy lấy báo giá mới.'],
  PRICE_UNAVAILABLE:[422,'Giá tham khảo chưa được xác minh cho lựa chọn này. Chưa thể gửi yêu cầu.'],
  CAPACITY:[429,'Đã đạt giới hạn yêu cầu trong phiên.'],
  TOO_FAST:[429,'Vui lòng chờ trước lần kiểm tra tiếp theo.'],
  UPLOAD_FAILED:[502,'Không thể chuyển ảnh tới WaveSpeed. Chưa gửi yêu cầu tạo video.'],
  UPSTREAM_FAILED:[502,'Không đọc được trạng thái từ WaveSpeed.'],
  INVALID_PROVIDER_RESPONSE:[502,'WaveSpeed trả về dữ liệu không hợp lệ.'],
  FORBIDDEN_ORIGIN:[403,'Chỉ cho phép truy cập từ Web local đã cấu hình.'],
  INTEGRATION_DISABLED:[404,'Video local chưa được bật.'],
  METHOD_NOT_ALLOWED:[405,'Phương thức không được hỗ trợ.'],
  INTERNAL:[500,'Không thể xử lý yêu cầu video.'],
};
export class VideoError extends Error {
  constructor(code, retryAfter=0){super(code);this.code=code;this.retryAfter=retryAfter;}
}
export function send(res,status,body){
  res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.end(JSON.stringify(body));
}
export function sendVideoError(res,error){
  const [status,message]=codes[error?.code]||codes.INTERNAL;
  if(error?.retryAfter)res.setHeader('Retry-After',String(error.retryAfter));
  send(res,status,{error:{code:codes[error?.code]?error.code:'INTERNAL',message:error instanceof VideoError&&error.imageMessage?error.imageMessage:message}});
}
