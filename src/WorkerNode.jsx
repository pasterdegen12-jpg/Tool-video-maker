import React, { useState, useEffect } from 'react';
import { db } from './firebase.js';
import { collection, query, where, limit, onSnapshot, doc, runTransaction, updateDoc } from 'firebase/firestore';
import { Loader2, Bot, AlertTriangle } from 'lucide-react';

export default function WorkerNode() {
    const [status, setStatus] = useState('Đang khởi động Worker...');
    const [currentTask, setCurrentTask] = useState(null);
    
    const searchParams = new URLSearchParams(window.location.search);
    const uid = searchParams.get('uid');

    // 🚀 HÀM CẦU NỐI: Tự động nhắn tin với worker-bridge.js (100% không bị chặn)
    const sendMessageToExtension = (type, payload) => {
        return new Promise((resolve) => {
            const messageId = Date.now().toString() + Math.random().toString();
            const listener = (e) => {
                if (e.detail.messageId === messageId) {
                    window.removeEventListener("EXTENSION_TO_WEB", listener);
                    resolve(e.detail.response);
                }
            };
            window.addEventListener("EXTENSION_TO_WEB", listener);
            window.dispatchEvent(new CustomEvent("WEB_TO_EXTENSION", {
                detail: { type, payload, messageId }
            }));
        });
    };

    // Hàm đợi Extension bơm code cầu nối vào web
    const waitForExtension = async () => {
        for (let i = 0; i < 20; i++) { // Đợi tối đa 10 giây
            const res = await new Promise(resolve => {
                const timeout = setTimeout(() => resolve(false), 500);
                sendMessageToExtension("GET_GOOGLE_COOKIES", {}).then((r) => {
                    clearTimeout(timeout); 
                    resolve(true);
                }).catch(() => { 
                    clearTimeout(timeout); 
                    resolve(false); 
                });
            });
            if (res) return true;
            await new Promise(r => setTimeout(r, 500));
        }
        return false;
    };

    useEffect(() => {
        if (!uid) { 
            setStatus('❌ Lỗi: Thiếu thông tin User ID (uid) trên link URL!'); 
            return; 
        }

        const q = query(collection(db, 'autoflow_tasks'), where('userId', '==', uid), where('status', '==', 'pending'), limit(1));
        
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            if (snapshot.empty) { 
                setStatus('👀 Đang hóng lệnh từ Giám Đốc...'); 
                return; 
            }

            const taskDoc = snapshot.docs[0];
            const taskData = taskDoc.data();

            try {
                await runTransaction(db, async (transaction) => {
                    const sfDoc = await transaction.get(taskDoc.ref);
                    if (!sfDoc.exists() || sfDoc.data().status !== 'pending') throw new Error("Task bị giật!");
                    transaction.update(taskDoc.ref, { status: 'processing', workerAgent: navigator.userAgent, startedAt: Date.now() });
                });
                
                setCurrentTask(taskData);
                setStatus(`🚀 Đã nhận Task: ${taskData.engineId}...`);
                await executeGenerationTask(taskDoc.id, taskData);

            } catch (e) { 
                console.log("Tranh task thất bại, hóng task khác..."); 
            }
        });

        return () => unsubscribe();
    }, [uid]);

    const executeGenerationTask = async (taskId, data) => {
        try {
            const { payload, appProjectId } = data;
            
            setStatus('⏳ Đang kết nối với Cầu Nối Extension...');
            const isExtReady = await waitForExtension();
            if (!isExtReady) throw new Error("Không tìm thấy Extension! Hãy check chrome://extensions và F5 lại.");

            setStatus(`⏳ Bắn lệnh sang Extension (Luồng ${payload.mode})...`);
            const response = await sendMessageToExtension("RUN_GOOGLE_API", payload);

            if (!response || !response.success) throw new Error(response?.error || "Extension từ chối kết nối.");

            let apiData = response.data;
            let mediaUrls = [];
            const initStr = JSON.stringify(apiData);
            
            const primaryMatch = initStr.match(/"primaryMediaId"\s*:\s*"([^"]+)"/);
            let mediaId = primaryMatch ? primaryMatch[1] : null;

            if (payload.mode === 'video' && mediaId) {
                let allDone = false;
                for (let i = 0; i < 60; i++) {
                    setStatus(`⏳ Chờ Google Render Video... (${i * 5}s)`);
                    const pollResp = await sendMessageToExtension("POLL_GOOGLE_API", { mode: 'video', mediaId: mediaId });
                    if (pollResp && pollResp.success && pollResp.isDone && pollResp.cdnUrl) { mediaUrls = [pollResp.cdnUrl]; allDone = true; break; }
                    await new Promise(r => setTimeout(r, 5000));
                }
                if (!allDone) throw new Error("Quá thời gian Render");
            } else {
                const regex = /"fifeUrl"\s*:\s*"([^"]+)"/g; let match;
                while ((match = regex.exec(initStr)) !== null) mediaUrls.push(match[1]);
                mediaUrls = [...new Set(mediaUrls)].filter(url => url && url.startsWith('http'));
            }

            if (mediaUrls.length === 0) throw new Error("Không lấy được link từ Google");

            setStatus(`☁️ Đang đẩy ${mediaUrls.length} file lên R2...`);
            const finalOutputs = []; 
            for (let i = 0; i < mediaUrls.length; i++) {
                const ext = payload.mode === 'video' ? 'mp4' : 'jpg'; 
                const mimeType = payload.mode === 'video' ? 'video/mp4' : 'image/jpeg';
                const uniqueCloudName = `autoflow/${appProjectId}/GoogleFlow_${Date.now()}_Worker_${i}.${ext}`;

                const urlRes = await fetch(`${window.location.origin}/api/get-upload-url`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: uniqueCloudName, fileType: mimeType }) });
                const { uploadUrl } = await urlRes.json();

                const extUploadRes = await sendMessageToExtension("UPLOAD_TO_R2", { sourceUrl: mediaUrls[i], uploadUrl: uploadUrl, mimeType: mimeType });
                if (!extUploadRes || !extUploadRes.success) throw new Error("Upload R2 thất bại");

                finalOutputs.push(`${import.meta.env.VITE_R2_PUBLIC_URL}/${uniqueCloudName}`);
            }

            await updateDoc(doc(db, 'autoflow_tasks', taskId), { status: 'completed', results: finalOutputs, completedAt: Date.now() });
            setStatus('✅ Xong việc! Đang thu hồi Tab...');
            
            setTimeout(() => { sendMessageToExtension("CLOSE_TAB", {}); }, 2000);

        } catch (error) {
            await updateDoc(doc(db, 'autoflow_tasks', taskId), { status: 'error', error: error.message });
            setStatus('❌ ' + error.message);
        }
    };

    return (
        <div className="h-screen w-screen bg-[#0E0E10] text-white flex flex-col items-center justify-center font-sans">
            <Bot size={72} className="text-emerald-500 mb-6 animate-pulse drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
            <h1 className="text-2xl font-bold mb-2 tracking-wide">Trạm Trực Chiến AI</h1>
            <p className="text-gray-400 mb-8 max-w-md text-center text-sm">Tab này được quản lý tự động. Nó sẽ tự tắt khi hoàn thành nhiệm vụ.</p>
            
            <div className="bg-[#15151A] border border-[#2A2A30] rounded-xl p-6 w-[400px] shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                    {status.includes('❌') ? <AlertTriangle className="text-red-500" size={24} /> : <Loader2 className="animate-spin text-blue-500" size={24} />}
                    <span className={`font-semibold text-[15px] ${status.includes('❌') ? 'text-red-400' : 'text-blue-400'}`}>{status}</span>
                </div>
                {currentTask && (
                    <div className="text-[11px] text-gray-500 border-t border-[#2A2A30] pt-4 mt-2">
                        <div className="truncate"><strong>Dự án:</strong> {currentTask.appProjectId}</div>
                        <div className="truncate mt-1"><strong>Lệnh:</strong> {currentTask.payload?.prompt || "Không có prompt"}</div>
                    </div>
                )}
            </div>
        </div>
    );
}