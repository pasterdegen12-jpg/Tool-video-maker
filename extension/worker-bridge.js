// Lắng nghe lệnh từ Web App (React)
window.addEventListener("WEB_TO_EXTENSION", (e) => {
    const { type, payload, messageId } = e.detail;
    
    // Gọi thẳng background.js của Extension (Nội bộ nên luôn luôn gọi được)
    chrome.runtime.sendMessage({ type, payload }, (response) => {
        // Trả kết quả ngược lại cho Web App
        window.dispatchEvent(new CustomEvent("EXTENSION_TO_WEB", {
            detail: { messageId, response }
        }));
    });
});