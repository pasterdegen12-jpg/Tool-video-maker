import React, { useState, useCallback, useEffect } from 'react';
import { ReactFlow, Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CustomNode from './CustomNode';
import { Play, Save, RefreshCw, Settings, X, Server, FolderGit2 } from 'lucide-react';
import { useUser } from "@clerk/clerk-react";
import { db } from './firebase.js'; 
import { doc, setDoc, onSnapshot, getDoc, updateDoc, arrayUnion } from "firebase/firestore"; 

const nodeTypes = { custom: CustomNode };
const initialNodes = [
  { id: 'node-account', type: 'custom', position: { x: 50, y: 100 }, data: { label: 'Google Flow Account', category: 'Input', fields: [{ id: 'f1', label: 'Tên gợi nhớ (Profile)', type: 'text', placeholder: 'Account 1...' }, { id: 'f2', label: 'Trạng thái', type: 'text', defaultValue: 'Chưa kết nối Cookie', readOnly: true }], outputs: [{ name: 'Session', type: 'session' }] } },
  { id: 'node-prompts', type: 'custom', position: { x: 50, y: 320 }, data: { label: 'Prompt Manager', category: 'Input', fields: [{ id: 'f1', label: 'Nội dung Prompt (Hỗ trợ xuống dòng)', type: 'textarea', placeholder: 'a beautiful futuristic city...\ncyberpunk neon street...' }, { id: 'ref_img', label: 'Ảnh Tham Chiếu (Image-to-Image)', type: 'image' }], outputs: [{ name: 'Prompts', type: 'prompts' }] } },
  { id: 'node-engine', type: 'custom', position: { x: 450, y: 150 }, data: { label: 'Auto Flow Engine (Local Worker)', category: 'Generation', fields: [{ id: 'f1', label: 'Tiến trình', type: 'text', defaultValue: 'Đang đợi lệnh...', readOnly: true }], inputs: [{ name: 'Session', type: 'session' }, { name: 'Prompts', type: 'prompts' }], outputs: [{ name: 'Media', type: 'media' }, { name: 'Error Log', type: 'error' }] } },
  { id: 'node-gallery', type: 'custom', position: { x: 850, y: 180 }, data: { label: 'Output Gallery', category: 'Output', preview: { type: 'gallery' }, inputs: [{ name: 'Media', type: 'media' }] } }
];
const initialEdges = [
  { id: 'e-acc-eng', source: 'node-account', sourceHandle: 'Session', target: 'node-engine', targetHandle: 'Session', style: { stroke: '#10B981', strokeWidth: 3 } },
  { id: 'e-prm-eng', source: 'node-prompts', sourceHandle: 'Prompts', target: 'node-engine', targetHandle: 'Prompts', style: { stroke: '#3B82F6', strokeWidth: 3 } },
  { id: 'e-eng-gal', source: 'node-engine', sourceHandle: 'Media', target: 'node-gallery', targetHandle: 'Media', style: { stroke: '#8B5CF6', strokeWidth: 3 } },
];

export default function WorkflowEditor() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [isRunning, setIsRunning] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { user } = useUser();
  const [settings, setSettings] = useState({ sessionCookie: '', projectId: '', extensionId: '', outFolder: 'out', chromeProfile: 'chrome-profile', runHidden: true, threads: 2, delayMin: 5, delayMax: 15 });

  const [appProjectId, setAppProjectId] = useState(() => {
    const savedId = localStorage.getItem('current_autoflow_id');
    return savedId || `flow_${Date.now()}`;
  });
  useEffect(() => { localStorage.setItem('current_autoflow_id', appProjectId); }, [appProjectId]);

  useEffect(() => {
    if (!user || !appProjectId) return;
    const timeoutId = setTimeout(async () => {
      try {
        const cleanNodes = nodes.map(node => {
          const cleanNode = { ...node };
          if (cleanNode.id === 'node-prompts') {
             const cleanedFields = cleanNode.data.fields.map(f => f.id === 'ref_img' ? { ...f, tempBase64: [] } : f);
             cleanNode.data = { ...cleanNode.data, fields: cleanedFields };
          } return cleanNode;
        });
        await setDoc(doc(db, "autoflow_projects", appProjectId), { userId: user.id, projectName: "Auto Flow Project", updatedAt: Date.now(), workspace: { nodes: cleanNodes, edges } }, { merge: true });
      } catch (error) { console.error("Lỗi Auto-save:", error); }
    }, 2000); 
    return () => clearTimeout(timeoutId);
  }, [nodes, edges, user, appProjectId]);

  useEffect(() => {
    if (!user || !appProjectId) return;
    const loadWorkspace = async () => {
      try {
        const docRef = doc(db, "autoflow_projects", appProjectId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.workspace) {
            if (data.workspace.nodes && data.workspace.nodes.length > 0) setNodes(data.workspace.nodes);
            if (data.workspace.edges && data.workspace.edges.length > 0) setEdges(data.workspace.edges);
          }
        }
      } catch (error) { console.error("Lỗi khi tải dự án:", error); }
    };
    loadWorkspace();
  }, [user, appProjectId]);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const handleInputChange = (e) => { const { name, value, type, checked } = e.target; setSettings(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value })); };

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, "autoflow_settings", user.id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.sessionCookie && data.sessionCookie !== settings.sessionCookie) {
          setSettings(prev => ({ ...prev, sessionCookie: data.sessionCookie, projectId: data.projectId || '', extensionId: data.extensionId || '' }));
          setNodes(nds => nds.map(node => {
            if (node.id === 'node-account') { node.data = { ...node.data, fields: [ ...node.data.fields.filter(f => f.id !== 'f2'), { id: 'f2', label: 'Trạng thái', type: 'text', defaultValue: '✅ Đã nhận Cookie', readOnly: true } ] }; }
            return node;
          }));
        } else if (data) { setSettings(prev => ({ ...prev, ...data })); }
      }
    });
    return () => unsubscribe(); 
  }, [user, settings.sessionCookie]);

  const handleSaveSettings = async () => {
    if (!user) { alert("❌ Bạn cần đăng nhập để lưu hệ thống!"); return; }
    try { await setDoc(doc(db, "autoflow_settings", user.id), { ...settings, updatedAt: Date.now() }, { merge: true }); alert('✅ Cấu hình đã được lưu lên Cloud!'); setIsSettingsOpen(false); } 
    catch (error) { alert("❌ Có lỗi xảy ra khi lưu: " + error.message); }
  };

  const handleRunWorkflow = async () => {
    if (isRunning) { setIsRunning(false); return; }
    if (!settings.extensionId || settings.extensionId.trim() === '') { alert("❌ Vui lòng vào Cài đặt hệ thống để nhập ID của Extension Chrome!"); return; }
    if (!settings.projectId) { alert("❌ Vui lòng nhập Project ID của tài khoản Google Flow!"); return; }

    const promptTextarea = document.querySelector('.react-flow__node-custom textarea');
    const promptToSend = promptTextarea ? promptTextarea.value.trim() : '';
    if (!promptToSend) { alert("❌ Vui lòng nhập nội dung Prompt!"); return; }

    const mode = document.querySelector('#opt_mode')?.value || 'image';
    const model = document.querySelector('#opt_model')?.value || 'GEM_PIX_2';
    const aspectRatio = document.querySelector('#opt_ar')?.value || '9:16';
    const outputCount = parseInt(document.querySelector('#opt_count')?.value || 1);
    const duration = parseInt(document.querySelector('#opt_duration')?.value || 4);
    
    const base64DataStr = document.querySelector('#base64_ref_img')?.value || "[]";
    let base64Images = [];
    try { base64Images = JSON.parse(base64DataStr); } catch(e) {}

    const EXT_ID = settings.extensionId.trim();
    if (!window.chrome || !window.chrome.runtime) { alert("❌ Lỗi: Không tìm thấy trình duyệt Chrome hoặc chế độ Extension."); return; }
    setIsRunning(true);

    setNodes(nds => nds.map(node => {
      if (node.id === 'node-engine') node.data = { ...node.data, fields: [{ id: 'f1', label: 'Tiến trình', type: 'text', defaultValue: mode === 'video' ? '⏳ Tự động bám đuôi Video...' : '🚀 Đang gửi lệnh Hình Ảnh...', readOnly: true }] };
      return node;
    }));

    try {
        window.chrome.runtime.sendMessage(EXT_ID, { type: "RUN_GOOGLE_API", payload: { prompt: promptToSend, mode, model, aspectRatio, outputCount, duration, base64Images, projectId: settings.projectId } }, async (response) => {
            if (!response || chrome.runtime.lastError) { alert("❌ Lỗi kết nối Extension: " + (chrome.runtime.lastError?.message || "ID Extension bị sai.")); setIsRunning(false); return; }
            if (!response.success) { alert("❌ Lỗi Google API: " + response.error); setIsRunning(false); return; }

            let apiData = response.data;
            let mediaUrls = [];
            let mediaId = null;

            const initStr = JSON.stringify(apiData);
            const primaryMatch = initStr.match(/"primaryMediaId"\s*:\s*"([^"]+)"/);
            if (primaryMatch) { mediaId = primaryMatch[1]; } 
            else {
                const matches = initStr.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g);
                if (matches && matches.length > 0) mediaId = matches[matches.length - 1]; 
            }

            if (mode === 'video' && mediaId) {
                let allDone = false;
                for (let i = 0; i < 60; i++) { 
                    setNodes(nds => nds.map(node => {
                        if (node.id === 'node-engine') node.data = { ...node.data, fields: [{ id: 'f1', label: 'Tiến trình', type: 'text', defaultValue: `⏳ Chờ Google Render... (${i * 5}s)`, readOnly: true }] };
                        return node;
                    }));
                    const pollResp = await new Promise(resolve => { window.chrome.runtime.sendMessage(EXT_ID, { type: "POLL_GOOGLE_API", payload: { mode: 'video', mediaId: mediaId } }, resolve); });
                    if (pollResp && pollResp.success && pollResp.isDone && pollResp.cdnUrl) { 
                        mediaUrls = [pollResp.cdnUrl]; allDone = true; break; 
                    }
                    await new Promise(r => setTimeout(r, 5000));
                }
                if (!allDone) alert("⏳ Đã vượt quá 5 phút. Video có thể vẫn đang được render.");
            } else {
                const regex = /"fifeUrl"\s*:\s*"([^"]+)"/g;
                let match;
                while ((match = regex.exec(initStr)) !== null) { mediaUrls.push(match[1]); }
                mediaUrls = [...new Set(mediaUrls)].filter(url => url && url.startsWith('http'));
            }

            if (mediaUrls.length > 0) {
                try {
                    const finalOutputs = [];
                    const r2UrlsForGallery = [];

                    for (let i = 0; i < mediaUrls.length; i++) {
                        const url = mediaUrls[i];
                        const ext = mode === 'video' ? 'mp4' : 'jpg';
                        const mimeType = mode === 'video' ? 'video/mp4' : 'image/jpeg';
                        const fileName = `GoogleFlow_${Date.now()}_${i + 1}.${ext}`;
                        const uniqueCloudName = `autoflow/${appProjectId}/${fileName}`;

                        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                        if (isLocalhost) {
                            fetch(`http://localhost:48321/api/download`, {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ videoUrl: url, outFolder: settings.outFolder, fileName: fileName })
                            }).catch(() => {});
                        }

                        // Lấy link Upload rỗng từ Vercel
                        const urlRes = await fetch('/api/get-upload-url', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ fileName: uniqueCloudName, fileType: mimeType })
                        });
                        const { uploadUrl } = await urlRes.json();

                        // Cập nhật trạng thái
                        setNodes(nds => nds.map(node => {
                            if (node.id === 'node-engine') node.data = { ...node.data, fields: [{ id: 'f1', label: 'Tiến trình', type: 'text', defaultValue: `☁️ Đang nhờ Extension Upload File ${i+1}...`, readOnly: true }] };
                            return node;
                        }));

                        // 🚀 NHỜ EXTENSION KÉO TỪ GOOGLE RỒI ĐẨY LÊN R2 (Tránh lỗi 500 Vercel)
                        const extUploadRes = await new Promise(resolve => {
                            window.chrome.runtime.sendMessage(EXT_ID, {
                                type: "UPLOAD_TO_R2",
                                payload: { sourceUrl: url, uploadUrl: uploadUrl, mimeType: mimeType }
                            }, resolve);
                        });

                        if (!extUploadRes || !extUploadRes.success) {
                            throw new Error(extUploadRes?.error || "Extension Upload thất bại");
                        }

                        const publicR2Url = `${import.meta.env.VITE_R2_PUBLIC_URL}/${uniqueCloudName}`;
                        r2UrlsForGallery.push(publicR2Url);
                        
                        finalOutputs.push({
                            id: `media_${Date.now()}_${i}`,
                            url: publicR2Url,        
                            googleCdnUrl: url,      
                            type: mode,
                            prompt: promptToSend,
                            createdAt: Date.now()
                        });
                    }

                    await updateDoc(doc(db, "autoflow_projects", appProjectId), {
                        outputs: arrayUnion(...finalOutputs),
                        updatedAt: Date.now()
                    });

                    // 🚀 HIỂN THỊ LINK R2 TRỰC TIẾP LÊN GALLERY THAY VÌ LINK GOOGLE
                    setNodes(nds => nds.map(node => {
                        if (node.id === 'node-engine') node.data = { ...node.data, fields: [{ id: 'f1', label: 'Tiến trình', type: 'text', defaultValue: `✅ Đã lưu Cloud & Database thành công!`, readOnly: true }] };
                        if (node.id === 'node-gallery') node.data = { ...node.data, imageUrls: r2UrlsForGallery, outputType: mode };
                        return node;
                    }));

                } catch (cloudErr) {
                    console.error("Lỗi Upload R2:", cloudErr);
                    alert("⚠️ Lỗi tải file lên Cloudflare R2: " + cloudErr.message);
                }
            } else { alert(`✅ Lỗi logic: Không tìm thấy link tải từ Google.`); }
            setIsRunning(false);
        });
    } catch (error) { alert("❌ Lỗi hệ thống: " + error.message); setIsRunning(false); }
  };

  return (
    <div className="h-full w-full flex flex-col bg-[#0E0E10] text-white overflow-hidden relative">
      <div className="h-[60px] bg-[#15151A] border-b border-[#2A2A30] flex items-center justify-between px-6 shrink-0 shadow-md relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-blue-500 flex items-center justify-center"><RefreshCw size={16} className="text-white" /></div>
          <div><h1 className="text-[15px] font-bold tracking-wide">Google Flow Web Automation</h1><p className="text-[11px] text-gray-500">Node-based Engine (Local Worker)</p></div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-2 bg-[#1E1E24] hover:bg-[#2A2A30] border border-[#2A2A30] px-4 py-2 rounded-lg font-semibold text-sm transition-all text-gray-300 cursor-pointer"><Settings size={16} className="text-gray-400" /> Cài đặt hệ thống</button>
          <button className={`flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-sm transition-all shadow-lg cursor-pointer ${isRunning ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' : 'bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 shadow-emerald-500/20'}`} onClick={handleRunWorkflow}>
            {isRunning ? <><div className="w-2 h-2 bg-white rounded-full animate-ping mr-1"></div> Dừng tiến trình</> : <><Play size={16} fill="currentColor" /> Chạy Workflow</>}
          </button>
        </div>
      </div>

      <div className="flex-1 relative w-full h-full">
        <ReactFlow nodes={nodes} edges={edges.map(e => ({ ...e, animated: isRunning }))} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} nodeTypes={nodeTypes} fitView minZoom={0.5} maxZoom={1.5} defaultEdgeOptions={{ type: 'smoothstep' }}>
          <Background color="#2A2A30" gap={24} size={2} variant="dots" />
          <Controls className="!bg-[#15151A] !border-[#2A2A30] !fill-gray-400 !shadow-xl" />
          <MiniMap className="!bg-[#15151A]/90 !border !border-[#2A2A30] !rounded-xl overflow-hidden shadow-2xl" maskColor="rgba(0, 0, 0, 0.6)" nodeColor="#10B981" />
        </ReactFlow>
      </div>

      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setIsSettingsOpen(false)}></div>
          <div className="relative w-full max-w-md h-full bg-[#121214] border-l border-[#2A2A30] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-5 border-b border-[#2A2A30] bg-[#15151A]">
              <div className="flex items-center gap-3"><Settings className="text-emerald-500" size={20} /><h2 className="text-lg font-bold text-white tracking-wide">Thiết lập Toàn cục</h2></div>
              <button onClick={() => setIsSettingsOpen(false)} className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 transition-colors cursor-pointer"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar text-sm">
              <div className="space-y-3 bg-[#1A1A1F] p-4 rounded-xl border border-[#2A2A30]">
                <h3 className="text-emerald-400 font-bold flex items-center gap-2"><Server size={16}/> 01 - Thông tin Tài khoản Google Labs</h3>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Mã kết nối Web (User ID)</label>
                  <input 
                    type="text" readOnly value={user?.id || ''} 
                    onClick={(e) => { navigator.clipboard.writeText(e.target.value); alert("✅ Đã copy Mã kết nối!"); }}
                    className="w-full bg-[#0E0E10] border border-[#2A2A30] rounded p-2 text-xs text-blue-400 font-mono outline-none cursor-copy hover:border-blue-500 transition-colors" title="Bấm để Copy"
                  />
                  <p className="text-[10px] text-gray-500">Bấm vào ô trên để copy, sau đó dán vào Extension để đồng bộ Cookie.</p>
                </div>

                <div className="flex flex-col gap-1.5 mt-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Extension ID (Bắt buộc)</label>
                  <input 
                    type="text" name="extensionId" value={settings.extensionId} onChange={handleInputChange} 
                    placeholder="VD: abcdefghijklmnop..." className="w-full bg-[#0E0E10] border border-[#2A2A30] rounded p-2 text-xs text-emerald-400 focus:border-emerald-500 outline-none" 
                  />
                  <p className="text-[10px] text-gray-500">Vào chrome://extensions, copy ID của Extension dán vào đây.</p>
                </div>

                <div className="flex flex-col gap-1.5 mt-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Google Project ID (Bắt buộc)</label>
                  <input type="text" name="projectId" value={settings.projectId} onChange={handleInputChange} placeholder="VD: 2ac32c13-..." className="w-full bg-[#0E0E10] border border-[#2A2A30] rounded p-2 text-xs text-white focus:border-emerald-500 outline-none" />
                </div>
              </div>
              <div className="space-y-3 bg-[#1A1A1F] p-4 rounded-xl border border-[#2A2A30]">
                <h3 className="text-emerald-400 font-bold flex items-center gap-2"><FolderGit2 size={16}/> 02 - Storage & Profile (Local)</h3>
                <div><label className="text-xs text-gray-400 font-semibold mb-1 block">Thư mục lưu ảnh/video (Local)</label><input type="text" name="outFolder" value={settings.outFolder} onChange={handleInputChange} className="w-full bg-[#0E0E10] border border-[#2A2A30] rounded p-2 focus:border-emerald-500 outline-none" /></div>
              </div>
            </div>
            <div className="p-5 border-t border-[#2A2A30] bg-[#15151A]">
              <button onClick={handleSaveSettings} className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-emerald-500/20 cursor-pointer">
                <Save size={18} /> Lưu Cài Đặt Lên Cloud Database
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}