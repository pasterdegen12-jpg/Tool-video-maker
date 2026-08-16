import React, { useState, useEffect } from 'react';
import { db } from './firebase.js';
import { collection, query, where, limit, onSnapshot, doc, runTransaction, updateDoc } from 'firebase/firestore';
import { Loader2, Bot } from 'lucide-react';

export default function WorkerNode() {
    const [status, setStatus] = useState('Đang khởi động Worker...');
    const [currentTask, setCurrentTask] = useState(null);
    
    // Lấy thông tin từ thanh địa chỉ (URL) do Giám đốc Web App gửi gắm
    const searchParams = new URLSearchParams(window.location.search);
    const uid = searchParams.get('uid');
    const extId = searchParams.get('extId');

    useEffect(() => {
        if (!uid || !extId) {
            setStatus('❌ Lỗi: Thiếu thông tin User ID hoặc Extension ID!');
            return;
        }

        // HÓNG VIỆC TỪ FIREBASE: Chỉ tìm task của đúng Giám Đốc (uid) đang chờ xử lý
        const q = query(
            collection(db, 'autoflow_tasks'), 
            where('userId', '==', uid),
            where('status', '==', 'pending'), 
            limit(1)
        );
        
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            if (snapshot.empty) {
                setStatus('👀 Đang hóng lệnh từ Giám Đốc...');
                return;
            }

            const taskDoc = snapshot.docs[0];
            const taskData = taskDoc.data();

            // 🚀 CƠ CHẾ GIẬT TASK: Dùng Transaction để tránh 2 Profile cướp chung 1 file
            try {
                await runTransaction(db, async (transaction) => {
                    const sfDoc = await transaction.get(taskDoc.ref);
                    if (!sfDoc.exists() || sfDoc.data().status !== 'pending') {
                        throw new Error("Task đã bị Worker khác hớt tay trên!");
                    }
                    // Khóa task lại thành của mình
                    transaction.update(taskDoc.ref, { 
                        status: 'processing', 
                        workerAgent: navigator.userAgent,
                        startedAt: Date.now() 
                    });
                });
                
                setCurrentTask(taskData);
                setStatus(`🚀 Đang cày Engine: ${taskData.engineId}...`);
                
                // Thực thi việc Gen ảnh/video qua Extension
                await executeGenerationTask(taskDoc.id, taskData);

            } catch (e) {
                console.log("Tranh task thất bại, quay lại hóng tiếp...");
            }
        });

        return () => unsubscribe();
    }, [uid, extId]);

    const executeGenerationTask = async (taskId, data) => {
        try {
            const { payload, appProjectId } = data;
            
            setStatus(`⏳ Bắn lệnh sang Extension (Luồng ${payload.mode})...`);
            const response = await new Promise(resolve => {
                window.chrome.runtime.sendMessage(extId, { type: "RUN_GOOGLE_API", payload: payload }, resolve);
            });

            if (!response || !response.success) throw new Error(response?.error || "Extension mất kết nối");

            let apiData = response.data;
            let mediaUrls = [];
            const initStr = JSON.stringify(apiData);
            
            const primaryMatch = initStr.match(/"primaryMediaId"\s*:\s*"([^"]+)"/);
            let mediaId = primaryMatch ? primaryMatch[1] : null;

            // Đợi kết quả Render
            if (payload.mode === 'video' && mediaId) {
                let allDone = false;
                for (let i = 0; i < 60; i++) {
                    setStatus(`⏳ Chờ Google Render Video... (${i * 5}s)`);
                    const pollResp = await new Promise(resolve => { 
                        window.chrome.runtime.sendMessage(extId, { type: "POLL_GOOGLE_API", payload: { mode: 'video', mediaId: mediaId } }, resolve); 
                    });
                    if (pollResp && pollResp.success && pollResp.isDone && pollResp.cdnUrl) { 
                        mediaUrls = [pollResp.cdnUrl]; allDone = true; break; 
                    }
                    await new Promise(r => setTimeout(r, 5000));
                }
                if (!allDone) throw new Error("Quá thời gian Render");
            } else {
                const regex = /"fifeUrl"\s*:\s*"([^"]+)"/g; let match;
                while ((match = regex.exec(initStr)) !== null) mediaUrls.push(match[1]);
                mediaUrls = [...new Set(mediaUrls)].filter(url => url && url.startsWith('http'));
            }

            if (mediaUrls.length === 0) throw new Error("Không lấy được link từ Google");

            // Upload lên R2 qua Extension
            setStatus(`☁️ Đang đẩy ${mediaUrls.length} file lên R2...`);
            const finalOutputs = []; 
            for (let i = 0; i < mediaUrls.length; i++) {
                const ext = payload.mode === 'video' ? 'mp4' : 'jpg'; 
                const mimeType = payload.mode === 'video' ? 'video/mp4' : 'image/jpeg';
                const uniqueCloudName = `autoflow/${appProjectId}/GoogleFlow_${Date.now()}_Worker_${i}.${ext}`;

                const urlRes = await fetch(`${window.location.origin}/api/get-upload-url`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: uniqueCloudName, fileType: mimeType }) });
                const { uploadUrl } = await urlRes.json();

                const extUploadRes = await new Promise(resolve => { window.chrome.runtime.sendMessage(extId, { type: "UPLOAD_TO_R2", payload: { sourceUrl: mediaUrls[i], uploadUrl: uploadUrl, mimeType: mimeType } }, resolve); });
                if (!extUploadRes || !extUploadRes.success) throw new Error("Upload R2 thất bại");

                finalOutputs.push(`${import.meta.env.VITE_R2_PUBLIC_URL}/${uniqueCloudName}`);
            }

            // Báo cáo hoàn thành lên Firebase
            await updateDoc(doc(db, 'autoflow_tasks', taskId), {
                status: 'completed',
                results: finalOutputs,
                completedAt: Date.now()
            });

            setStatus('✅ Xong việc! Đang thu hồi Tab...');
            
            // 🚀 Bóp cò lệnh tự sát: Extension sẽ tự động tắt cái tab/profile này đi
            setTimeout(() => {
                window.chrome.runtime.sendMessage(extId, { type: "CLOSE_TAB" });
            }, 2000);

        } catch (error) {
            await updateDoc(doc(db, 'autoflow_tasks', taskId), { status: 'error', error: error.message });
            setStatus('❌ Lỗi: ' + error.message);
        }
    };

    return (
        <div className="h-screen w-screen bg-[#0E0E10] text-white flex flex-col items-center justify-center font-sans">
            <Bot size={72} className="text-emerald-500 mb-6 animate-pulse drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
            <h1 className="text-2xl font-bold mb-2 tracking-wide">Trạm Trực Chiến AI</h1>
            <p className="text-gray-400 mb-8 max-w-md text-center text-sm">Tab này được quản lý tự động. Nó sẽ tự tắt khi hoàn thành nhiệm vụ.</p>
            
            <div className="bg-[#15151A] border border-[#2A2A30] rounded-xl p-6 w-[400px] shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                    <Loader2 className="animate-spin text-blue-500" size={24} />
                    <span className="font-semibold text-[15px] text-blue-400">{status}</span>
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