document.addEventListener("DOMContentLoaded", () => {
  const inputUserId = document.getElementById("input-user-id");
  const btnPush = document.getElementById("btn-push");
  const statusDiv = document.getElementById("status");

  // Tự động load lại Mã Kết Nối đã lưu từ lần nhập trước
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["autoflow_user_id"], (result) => {
      if (result.autoflow_user_id) inputUserId.value = result.autoflow_user_id;
    });
  }

  btnPush.addEventListener("click", () => {
    const userId = inputUserId.value.trim();
    if (!userId) {
      alert("Vui lòng nhập Mã kết nối (Lấy trên Web App)!");
      return;
    }
    
    // Lưu lại mã để lần sau mở lên không cần nhập lại
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ autoflow_user_id: userId });
    }
    
    statusDiv.style.display = "block";
    statusDiv.innerText = "⏳ Đang trích xuất Cookie...";
    statusDiv.style.color = "#F59E0B"; // Màu vàng

    // Trích xuất Cookie
    chrome.cookies.getAll({ domain: ".google.com" }, async (cookies) => {
      const neededKeys = ["SID", "HSID", "SSID", "APISID", "SAPISID"];
      const filtered = cookies.filter(c => neededKeys.includes(c.name));
      
      if (filtered.length === 0) {
        statusDiv.style.color = "#ef4444"; // Màu đỏ
        statusDiv.innerText = "❌ Không thấy Cookie. Hãy đăng nhập Google Flow!";
        return;
      }
      
      const cookieString = filtered.map(c => `${c.name}=${c.value}`).join("; ");

      // Dùng Firebase REST API bắn thẳng lên Cloud Database
      try {
        const PROJECT_ID = "semicontent-e195b"; // Lấy từ file .firebaserc của bạn
        const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/autoflow_settings/${userId}?updateMask.fieldPaths=sessionCookie`;
        
        const response = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: { sessionCookie: { stringValue: cookieString } }
          })
        });
        
        if (response.ok) {
          statusDiv.style.color = "#10B981"; // Màu xanh lá
          statusDiv.innerText = "✅ Đã đẩy Cookie lên Web thành công!";
        } else {
          throw new Error("Tài liệu Firebase chưa khởi tạo.");
        }
      } catch (e) {
        statusDiv.style.color = "#ef4444";
        statusDiv.innerText = "❌ Lỗi: Trên Web App, bạn hãy bấm 'Lưu Cài Đặt' ít nhất 1 lần để tạo trạm nhận nhé!";
      }
    });
  });
});