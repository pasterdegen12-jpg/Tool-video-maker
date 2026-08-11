chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    if (request.type === "GET_GOOGLE_COOKIES") {
        chrome.cookies.getAll({ domain: ".google.com" }, (cookies) => {
            const neededKeys = ["SID", "HSID", "SSID", "APISID", "SAPISID", "__Secure-1PSID"];
            const filteredCookies = cookies.filter(c => neededKeys.includes(c.name));
            if (filteredCookies.length > 0) { sendResponse({ success: true, cookies: filteredCookies.map(c => `${c.name}=${c.value}`).join("; ") }); } 
            else { sendResponse({ success: false, error: "Không tìm thấy Cookie." }); }
        });
        return true;
    }
    if (request.type === "RUN_GOOGLE_API") { executeApiInFlowTab(request.payload).then(sendResponse); return true; }
    if (request.type === "POLL_GOOGLE_API") { executePollInFlowTab(request.payload).then(sendResponse); return true; }
    
    // 🚀 TÍNH NĂNG MỚI: TẢI VIDEO TỪ GOOGLE VÀ ĐẨY THẲNG LÊN CLOUDFLARE R2
    if (request.type === "UPLOAD_TO_R2") {
        executeUploadToR2(request.payload).then(sendResponse);
        return true;
    }
});

async function executeUploadToR2(payload) {
    try {
        const { sourceUrl, uploadUrl, mimeType } = payload;
        const res = await fetch(sourceUrl);
        if (!res.ok) throw new Error("Không thể kéo file gốc từ Google CDN");
        const blob = await res.blob();
        
        const putRes = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': mimeType } });
        if (!putRes.ok) throw new Error("Không thể tải lên Cloudflare R2");
        return { success: true };
    } catch (error) { return { success: false, error: error.message }; }
}

async function executePollInFlowTab(payload) {
    try {
        const tabs = await chrome.tabs.query({ url: "*://labs.google/*" });
        if (!tabs || tabs.length === 0) return { success: false, error: "Tab Labs đã đóng!" };
        let flowTab = tabs.find(t => t.url && (t.url.includes('/fx/tools/flow') || t.url.includes('/fx/project')));
        if (!flowTab) flowTab = tabs.find(t => t.active) || tabs[0];
        
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: flowTab.id }, world: "MAIN",
            func: async (req) => {
                try {
                    if (req.mode === 'video' && req.mediaId) {
                        const checkUrl = `https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=${req.mediaId}`;
                        const controller = new AbortController();
                        const res = await fetch(checkUrl, { signal: controller.signal }).catch(() => null);
                        if (res) {
                            const finalUrl = res.url;
                            controller.abort(); 
                            if (finalUrl && finalUrl.includes("Signature=")) return { success: true, isDone: true, cdnUrl: finalUrl };
                        }
                    }
                    return { success: true, isDone: false };
                } catch (e) { return { success: true, isDone: false }; }
            }, args: [payload]
        });
        return result.result;
    } catch (error) { return { success: false, error: "Lỗi check Video: " + error.message }; }
}

async function executeApiInFlowTab(payload) {
    try {
        const tabs = await chrome.tabs.query({ url: "*://labs.google/*" });
        if (!tabs || tabs.length === 0) return { success: false, error: "Vui lòng mở một tab labs.google và đăng nhập!" };
        let flowTab = tabs.find(t => t.url && (t.url.includes('/fx/tools/flow') || t.url.includes('/fx/project')));
        if (!flowTab) flowTab = tabs.find(t => t.active) || tabs[0];

        const [result] = await chrome.scripting.executeScript({
            target: { tabId: flowTab.id }, world: "MAIN",
            func: async (requestData) => {
                try {
                    const PROJECT_ID = requestData.projectId;
                    if (!PROJECT_ID) throw new Error("Chưa cấu hình Project ID trong Cài đặt hệ thống!");
                    const sessionRes = await fetch("/fx/api/auth/session", { credentials: "include" });
                    const sessionData = await sessionRes.json();
                    if (!sessionData || !sessionData.access_token) throw new Error("Thiếu Access Token. Đảm bảo đã đăng nhập Google trên tab Labs!");
                    const bearerToken = sessionData.access_token;

                    const waitGre = async () => {
                        if (!window.grecaptcha || !window.grecaptcha.enterprise) {
                            const script = document.createElement('script');
                            script.src = "https://www.google.com/recaptcha/enterprise.js?render=6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV";
                            script.async = true; document.head.appendChild(script);
                        }
                        const t0 = Date.now();
                        while (!(window.grecaptcha && window.grecaptcha.enterprise)) {
                            if (Date.now() - t0 > 20000) throw new Error("Hệ thống chống Bot bị chặn. Vui lòng tắt Adblock trên labs.google!");
                            await new Promise(r => setTimeout(r, 200));
                        }
                        await new Promise(r => setTimeout(r, 1000));
                    };
                    await waitGre();

                    const actionType = requestData.mode === 'video' ? "VIDEO_GENERATION" : "IMAGE_GENERATION";
                    const captchaToken = await window.grecaptcha.enterprise.execute("6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV", { action: actionType });

                    const clientContext = { recaptchaContext: { token: captchaToken, applicationType: "RECAPTCHA_APPLICATION_TYPE_WEB" }, projectId: PROJECT_ID, tool: "PINHOLE", sessionId: ";" + Date.now() };

                    let referenceMediaIds = [];
                    if (requestData.base64Images && requestData.base64Images.length > 0) {
                        const uploadPromises = requestData.base64Images.map(async (b64, index) => {
                            const base64Data = b64.split(',')[1]; const mimeType = b64.split(';')[0].split(':')[1];
                            const uploadPayload = { clientContext: { projectId: PROJECT_ID, tool: "PINHOLE" }, fileName: `upload_${Date.now()}_${index}.${mimeType.split('/')[1]}`, imageBytes: base64Data, isHidden: false, isUserUploaded: true, mimeType: mimeType };
                            const uploadRes = await fetch(`https://aisandbox-pa.googleapis.com/v1/flow/uploadImage`, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8", "Authorization": `Bearer ${bearerToken}` }, credentials: "include", body: JSON.stringify(uploadPayload) });
                            if (!uploadRes.ok) throw new Error(`API Upload ảnh thất bại!`);
                            const uploadData = await uploadRes.json(); return uploadData.media?.name; 
                        });
                        referenceMediaIds = await Promise.all(uploadPromises);
                    }

                    const isVideo = requestData.mode === 'video';
                    const requestArray = [];
                    for(let i = 0; i < requestData.outputCount; i++) {
                        if (isVideo) {
                            const arMapVideo = { "16:9": "VIDEO_ASPECT_RATIO_LANDSCAPE", "9:16": "VIDEO_ASPECT_RATIO_PORTRAIT", "1:1": "VIDEO_ASPECT_RATIO_SQUARE" };
                            let vModel = requestData.model;
                            if (vModel === "OMNI_FLASH") { vModel = referenceMediaIds.length > 0 ? `abra_r2v_${requestData.duration}s` : `abra_${requestData.duration}s`; }
                            const reqItem = { aspectRatio: arMapVideo[requestData.aspectRatio] || "VIDEO_ASPECT_RATIO_PORTRAIT", textInput: { structuredPrompt: { parts: [{ text: requestData.prompt }] } }, videoModelKey: vModel, seed: Math.floor(Math.random() * 1000000), metadata: {} };
                            if (referenceMediaIds.length > 0) { reqItem.referenceImages = referenceMediaIds.map(id => ({ mediaId: id, imageUsageType: "IMAGE_USAGE_TYPE_ASSET" })); }
                            requestArray.push(reqItem);
                        } else {
                            const arMapImage = { "16:9": "IMAGE_ASPECT_RATIO_LANDSCAPE", "9:16": "IMAGE_ASPECT_RATIO_PORTRAIT", "1:1": "IMAGE_ASPECT_RATIO_SQUARE" };
                            const imageInputsArray = referenceMediaIds.map(id => ({ imageInputType: "IMAGE_INPUT_TYPE_REFERENCE", name: id }));
                            requestArray.push({ clientContext: clientContext, imageModelName: requestData.model, imageAspectRatio: arMapImage[requestData.aspectRatio] || "IMAGE_ASPECT_RATIO_PORTRAIT", structuredPrompt: { parts: [{ text: requestData.prompt }] }, seed: Math.floor(Math.random() * 1000000), imageInputs: imageInputsArray });
                        }
                    }

                    let apiPayload, API_URL;
                    if (isVideo) {
                        apiPayload = { mediaGenerationContext: { batchId: crypto.randomUUID(), audioFailurePreference: "BLOCK_SILENCED_VIDEOS" }, clientContext: clientContext, useV2ModelConfig: true, requests: requestArray };
                        API_URL = referenceMediaIds.length > 0 ? `https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoReferenceImages` : `https://aisandbox-pa.googleapis.com/v1/video:batchGenerateAsync`;
                    } else {
                        apiPayload = { clientContext: clientContext, mediaGenerationContext: { batchId: crypto.randomUUID() }, useNewMedia: true, requests: requestArray };
                        API_URL = `https://aisandbox-pa.googleapis.com/v1/projects/${PROJECT_ID}/flowMedia:batchGenerateImages`;
                    }

                    const apiRes = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8", "Authorization": `Bearer ${bearerToken}` }, credentials: "include", body: JSON.stringify(apiPayload) });
                    const apiText = await apiRes.text();
                    if (apiRes.status >= 400) return { success: false, error: `HTTP ${apiRes.status}: ${apiText}` };
                    return { success: true, data: JSON.parse(apiText), projectId: PROJECT_ID };
                } catch (e) { return { success: false, error: e.message || String(e) }; }
            }, args: [payload]
        });
        return result.result;
    } catch (error) { return { success: false, error: "Lỗi tiêm script: " + error.message }; }
}