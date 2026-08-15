import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ReactFlow, Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CustomNode from './CustomNode';
import { Play, Save, RefreshCw, Settings, X, Server, FolderGit2, Menu, Key, Cpu, Image as ImageIcon, Trash2 } from 'lucide-react';
import { useUser } from "@clerk/clerk-react";
import { db } from './firebase.js'; 
import { doc, setDoc, onSnapshot, getDoc, updateDoc, arrayUnion } from "firebase/firestore"; 
import { useParams, useNavigate } from 'react-router-dom';

const nodeTypes = { custom: CustomNode };

const PRESET_DICTIONARY = {
    'cinematic': 'Cinematic lighting, 8k resolution, photorealistic, highly detailed, masterpiece, epic composition, dramatic shadows',
    'anime': 'Anime style, Studio Ghibli, vibrant colors, beautiful scenery, 2d animation, masterpiece',
    'cyberpunk': 'Cyberpunk style, neon lights, futuristic city, glowing aesthetics, highly detailed, sci-fi concept art'
};

const initialNodes = [
  { id: 'node-input-1', type: 'custom', position: { x: 50, y: 150 }, data: { label: 'Input Prompt & Media', category: 'Input', preset: 'custom', fields: [{ id: 'f1', label: 'Nội dung Prompt', type: 'textarea', placeholder: 'Nhập ý tưởng của bạn...' }, { id: 'ref_img', label: 'Media Tham Chiếu', type: 'image', cloudUrls: [] }], outputs: [{ name: 'Data', type: 'prompts' }] } },
  { id: 'node-engine-1', type: 'custom', position: { x: 450, y: 150 }, data: { label: 'AI Engine', category: 'Generation', config: { mode: 'image', ar: '9:16', model: 'GEM_PIX_2', count: 1, duration: 4 }, progress: 'Đang đợi lệnh...', inputs: [{ name: 'Data', type: 'prompts' }], outputs: [{ name: 'Media', type: 'media' }] } },
  { id: 'node-gallery-1', type: 'custom', position: { x: 850, y: 150 }, data: { label: 'Output Gallery', category: 'Output', preview: { type: 'gallery' }, imageUrls: [], selectedMedia: [], inputs: [{ name: 'Media', type: 'media' }], outputs: [{ name: 'Selected Media', type: 'media' }] } }
];

const initialEdges = [
  { id: 'e-in1-eng1', source: 'node-input-1', sourceHandle: 'Data', target: 'node-engine-1', targetHandle: 'Data', type: 'default', animated: true, style: { stroke: '#3B82F6', strokeWidth: 2.5, strokeDasharray: '6 4' } },
  { id: 'e-eng1-gal1', source: 'node-engine-1', sourceHandle: 'Media', target: 'node-gallery-1', targetHandle: 'Media', type: 'default', animated: true, style: { stroke: '#8B5CF6', strokeWidth: 2.5, strokeDasharray: '6 4' } },
];

export default function WorkflowEditor() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [isRunning, setIsRunning] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [lightBox, setLightBox] = useState({ isOpen: false, url: '', type: 'image', meta: null });

  const { user } = useUser();
  const [settings, setSettings] = useState({ sessionCookie: '', projectId: '', extensionId: '', outFolder: 'out' });

  const { id } = useParams();
  const navigate = useNavigate();
  
  const [appProjectId, setAppProjectId] = useState(() => {
      if (id) return id;
      const savedId = localStorage.getItem('current_autoflow_id');
      return savedId || `flow_${Date.now()}`;
  });

  useEffect(() => {
      if (!id) {
          navigate(`/autoflow/${appProjectId}`, { replace: true });
      }
      localStorage.setItem('current_autoflow_id', appProjectId);
  }, [id, appProjectId, navigate]);

  useEffect(() => {
    const handleOpenLightbox = (e) => setLightBox({ isOpen: true, url: e.detail.url, type: e.detail.type, meta: e.detail.meta });
    const handleRunSingleNode = (e) => handleRunWorkflow(e.detail);
    window.addEventListener('OPEN_LIGHTBOX', handleOpenLightbox);
    window.addEventListener('RUN_SINGLE_NODE', handleRunSingleNode);
    return () => { window.removeEventListener('OPEN_LIGHTBOX', handleOpenLightbox); window.removeEventListener('RUN_SINGLE_NODE', handleRunSingleNode); };
  }); 

  useEffect(() => {
    if (!user || !appProjectId) return;
    const timeoutId = setTimeout(async () => {
      try { await setDoc(doc(db, "autoflow_projects", appProjectId), { userId: user.id, projectName: "Auto Flow Project", updatedAt: Date.now(), workspace: { nodes, edges } }, { merge: true }); } catch (error) {}
    }, 2000); 
    return () => clearTimeout(timeoutId);
  }, [nodes, edges, user, appProjectId]);

  useEffect(() => {
    if (!user || !appProjectId) return;
    const loadWorkspace = async () => {
      const docSnap = await getDoc(doc(db, "autoflow_projects", appProjectId));
      if (docSnap.exists() && docSnap.data().workspace) {
        if (docSnap.data().workspace.nodes?.length > 0) setNodes(docSnap.data().workspace.nodes);
        if (docSnap.data().workspace.edges?.length > 0) setEdges(docSnap.data().workspace.edges);
      }
    };
    loadWorkspace();
  }, [user, appProjectId]);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  
  const onConnect = useCallback((params) => {
    let strokeColor = '#8B5CF6'; 
    if (params.sourceHandle === 'Data') strokeColor = '#3B82F6'; 
    else if (params.sourceHandle === 'Selected Media') strokeColor = '#10B981'; 

    setEdges((eds) => addEdge({ 
        ...params, 
        type: 'default', 
        animated: true, 
        style: { stroke: strokeColor, strokeWidth: 2.5, strokeDasharray: '6 4' } 
    }, eds));
  }, []);

  const handleInputChange = (e) => { const { name, value } = e.target; setSettings(prev => ({ ...prev, [name]: value })); };

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, "autoflow_settings", user.id), (docSnap) => {
      if (docSnap.exists()) setSettings(prev => ({ ...prev, ...docSnap.data() }));
    });
    return () => unsubscribe(); 
  }, [user]);

  const handleSaveSettings = async () => {
    if (!user) return alert("❌ Cần đăng nhập để lưu!");
    await setDoc(doc(db, "autoflow_settings", user.id), { ...settings, updatedAt: Date.now() }, { merge: true }); 
    alert('✅ Đã lưu Cài đặt!'); setIsSettingsOpen(false);
  };

  const handleClearGraph = () => {
      if(window.confirm("Xóa toàn bộ bản vẽ hiện tại để tạo mới?")) {
          setNodes(initialNodes);
          setEdges(initialEdges);
      }
  };

  const addNode = (type) => {
    const newNodeId = `node-${type}-${Date.now()}`;
    let newNodeData = {};
    if (type === 'input') newNodeData = { label: 'Input Prompt & Media', category: 'Input', preset: 'custom', fields: [{ id: 'f1', label: 'Nội dung Prompt', type: 'textarea' }, { id: 'ref_img', label: 'Media Tham Chiếu', type: 'image', cloudUrls: [] }], outputs: [{ name: 'Data', type: 'prompts' }] };
    if (type === 'engine') newNodeData = { label: 'AI Engine', category: 'Generation', config: { mode: 'image', ar: '9:16', model: 'GEM_PIX_2', count: 1, duration: 4 }, progress: 'Đang đợi...', inputs: [{ name: 'Data', type: 'prompts' }], outputs: [{ name: 'Media', type: 'media' }] };
    if (type === 'gallery') newNodeData = { label: 'Output Gallery', category: 'Output', preview: { type: 'gallery' }, imageUrls: [], selectedMedia: [], inputs: [{ name: 'Media', type: 'media' }], outputs: [{ name: 'Selected Media', type: 'media' }] };
    setNodes(nds => [...nds, { id: newNodeId, type: 'custom', position: { x: window.innerWidth/2 - 150, y: window.innerHeight/2 - 100 }, data: newNodeData }]);
  };

  const handleRunWorkflow = async (targetEngineId = null) => {
    if (isRunning) return setIsRunning(false);
    if (!settings.extensionId) return alert("❌ Thiếu Extension ID!");
    if (!settings.projectId) return alert("❌ Thiếu Project ID!");

    let engineNodes = nodes.filter(n => n.data.category === 'Generation');
    if (typeof targetEngineId === 'string') {
        engineNodes = engineNodes.filter(n => n.id === targetEngineId);
    }
    if (engineNodes.length === 0) return alert("❌ Không tìm thấy AI Engine nào để chạy!");

    const getDependencyLevel = (nodeId, visited = new Set()) => {
        if (visited.has(nodeId)) return 0;
        visited.add(nodeId);
        const inputEdge = edges.find(e => e.target === nodeId);
        if (!inputEdge) return 0;
        const parentNode = nodes.find(n => n.id === inputEdge.source);
        if (!parentNode) return 0;
        if (parentNode.data.category === 'Generation') return 1 + getDependencyLevel(parentNode.id, visited);
        
        const parentInputEdge = edges.find(e => e.target === parentNode.id);
        if (parentInputEdge) return 1 + getDependencyLevel(parentInputEdge.source, visited);
        return 0;
    };

    engineNodes.sort((a, b) => getDependencyLevel(a.id) - getDependencyLevel(b.id));

    setIsRunning(true);
    const EXT_ID = settings.extensionId.trim();
    const runtimeGalleryData = {};

    const updateNodeProgress = (nodeId, text) => {
      setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, progress: text } } : n));
    };

    const updateGalleryNode = (engineId, urls, outputType, metaDict, targetGalleryId) => {
      setNodes(nds => nds.map(n => n.id === targetGalleryId ? { ...n, data: { ...n.data, imageUrls: urls, outputType, mediaMetadata: metaDict } } : n));
    };

    for (const engineNode of engineNodes) {
        try {
            const inputEdges = edges.filter(e => e.target === engineNode.id && e.targetHandle === 'Data');
            if (inputEdges.length === 0) throw new Error("⚠️ Chưa cắm dây Input!");
            
            let combinedPrompt = '';
            let combinedInputUrls = [];
            let presetId = 'custom';

            for (const edge of inputEdges) {
                const parentNode = nodes.find(n => n.id === edge.source);
                if (!parentNode) continue;

                if (parentNode.data.category === 'Input') {
                    presetId = parentNode.data.preset || 'custom';
                    const promptText = presetId === 'custom' ? (parentNode.data.fields?.find(f => f.id === 'f1')?.defaultValue || '') : (PRESET_DICTIONARY[presetId] || '');
                    
                    if (promptText && !combinedPrompt) combinedPrompt = promptText;
                    else if (promptText) combinedPrompt += ` and ${promptText}`;

                    const urls = parentNode.data.fields?.find(f => f.id === 'ref_img')?.cloudUrls || [];
                    combinedInputUrls.push(...urls);
                } 
                else if (parentNode.data.category === 'Output') {
                    let urls = [];
                    if (runtimeGalleryData[parentNode.id]) {
                        urls = runtimeGalleryData[parentNode.id].urls;
                    } else {
                        urls = parentNode.data.selectedMedia || [];
                        if (urls.length === 0 && parentNode.data.imageUrls?.length > 0) {
                            urls = [parentNode.data.imageUrls[0]];
                        }
                    }
                    combinedInputUrls.push(...urls);
                }
            }

            if (!combinedPrompt && combinedInputUrls.length > 0) {
                combinedPrompt = "Combine these references to generate a detailed output"; 
            }

            if (!combinedPrompt && combinedInputUrls.length === 0) throw new Error("⚠️ Input trống không!");

            const config = engineNode.data.config || { mode: 'image', model: 'GEM_PIX_2', ar: '9:16', count: 1, duration: 4 };

            updateNodeProgress(engineNode.id, `🚀 Đang gửi lệnh (Luồng ${config.mode})...`);
            const response = await new Promise(resolve => {
                window.chrome.runtime.sendMessage(EXT_ID, {
                    type: "RUN_GOOGLE_API",
                    payload: { 
                        prompt: combinedPrompt, 
                        mode: config.mode, 
                        model: config.model, 
                        aspectRatio: config.ar, 
                        outputCount: config.count, 
                        duration: config.duration, 
                        inputUrls: combinedInputUrls, 
                        base64Images: [], 
                        projectId: settings.projectId 
                    }
                }, resolve);
            });

            if (!response || !response.success) throw new Error(response?.error || "Extension mất kết nối");

            let apiData = response.data;
            let mediaUrls = [];
            let mediaId = null;
            const initStr = JSON.stringify(apiData);

            const primaryMatch = initStr.match(/"primaryMediaId"\s*:\s*"([^"]+)"/);
            if (primaryMatch) mediaId = primaryMatch[1];
            else { const matches = initStr.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g); if (matches && matches.length > 0) mediaId = matches[matches.length - 1]; }

            if (config.mode === 'video' && mediaId) {
                let allDone = false;
                for (let i = 0; i < 60; i++) {
                    updateNodeProgress(engineNode.id, `⏳ Render Video... (${i * 5}s)`);
                    const pollResp = await new Promise(resolve => { window.chrome.runtime.sendMessage(EXT_ID, { type: "POLL_GOOGLE_API", payload: { mode: 'video', mediaId: mediaId } }, resolve); });
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

            updateNodeProgress(engineNode.id, `☁️ Đang đẩy file lên R2...`);
            const finalOutputs = []; 
            const r2UrlsForGallery = [];
            const metaDict = {}; 

            for (let i = 0; i < mediaUrls.length; i++) {
                const url = mediaUrls[i];
                const ext = config.mode === 'video' ? 'mp4' : 'jpg'; const mimeType = config.mode === 'video' ? 'video/mp4' : 'image/jpeg';
                const fileName = `GoogleFlow_${Date.now()}_${engineNode.id}_${i + 1}.${ext}`;
                const uniqueCloudName = `autoflow/${appProjectId}/${fileName}`;

                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    fetch(`http://localhost:48321/api/download`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoUrl: url, outFolder: settings.outFolder, fileName: fileName }) }).catch(() => {});
                }

                const urlRes = await fetch('/api/get-upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: uniqueCloudName, fileType: mimeType }) });
                const { uploadUrl } = await urlRes.json();

                const extUploadRes = await new Promise(resolve => { window.chrome.runtime.sendMessage(EXT_ID, { type: "UPLOAD_TO_R2", payload: { sourceUrl: url, uploadUrl: uploadUrl, mimeType: mimeType } }, resolve); });
                if (!extUploadRes || !extUploadRes.success) throw new Error("Upload R2 thất bại");

                const publicR2Url = `${import.meta.env.VITE_R2_PUBLIC_URL}/${uniqueCloudName}`;
                r2UrlsForGallery.push(publicR2Url);
                
                metaDict[publicR2Url] = { presetId, prompt: combinedPrompt, referenceImages: combinedInputUrls };
                finalOutputs.push({ id: `media_${Date.now()}_${i}`, url: publicR2Url, googleCdnUrl: url, type: config.mode, prompt: combinedPrompt, referenceImages: combinedInputUrls, createdAt: Date.now() });
            }

            await updateDoc(doc(db, "autoflow_projects", appProjectId), { outputs: arrayUnion(...finalOutputs), updatedAt: Date.now() });
            
            updateNodeProgress(engineNode.id, `✅ Hoàn tất!`);

            const outEdge = edges.find(e => e.source === engineNode.id && e.sourceHandle === 'Media');
            if (outEdge) {
                updateGalleryNode(engineNode.id, r2UrlsForGallery, config.mode, metaDict, outEdge.target);
                runtimeGalleryData[outEdge.target] = { urls: r2UrlsForGallery };
            }

        } catch (err) {
            updateNodeProgress(engineNode.id, `❌ ${err.message}`);
        }
    } 

    setIsRunning(false);
  };

  return (
    <div className="h-full w-full flex flex-col bg-[#0E0E10] text-white overflow-hidden relative">
      
      {/* 🎬 RẠP CHIẾU PHIM ĐÃ ĐƯỢC TỐI GIẢN (Chỉ hiển thị Ảnh/Video) */}
      {lightBox.isOpen && (
        <div 
            className="fixed inset-0 z-[100] bg-black/95 flex justify-center items-center backdrop-blur-sm p-4 animate-in fade-in duration-200 cursor-pointer"
            onClick={() => setLightBox({isOpen: false, url: '', type: '', meta: null})}
        >
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    setLightBox({isOpen: false, url: '', type: '', meta: null});
                }} 
                className="absolute top-6 right-6 text-white/50 hover:text-white bg-[#15151A] hover:bg-red-500 p-2 rounded-full z-50 transition-all cursor-pointer"
            >
                <X size={24} />
            </button>
            
            <div 
                className="relative max-w-6xl max-h-[90vh] flex justify-center items-center"
                onClick={(e) => e.stopPropagation()} 
            >
                {/* 🚀 BỔ SUNG crossOrigin="anonymous" VÀO ĐÂY */}
                {lightBox.type === 'video' ? (
                    <video crossOrigin="anonymous" src={lightBox.url} controls autoPlay className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
                ) : (
                    <img crossOrigin="anonymous" src={lightBox.url} className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" alt="Full Preview" />
                )}
            </div>
        </div>
      )}

      <div className="h-[60px] bg-[#15151A] border-b border-[#2A2A30] flex items-center justify-between px-6 shrink-0 shadow-md relative z-20">
        <div className="flex items-center gap-4">
          <button onMouseEnter={() => setIsSidebarOpen(true)} className="p-2 bg-[#1E1E24] hover:bg-[#2A2A30] rounded-md transition-colors cursor-pointer"><Menu size={20} className="text-gray-400" /></button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-blue-500 flex items-center justify-center"><RefreshCw size={16} className="text-white" /></div>
          <div><h1 className="text-[15px] font-bold tracking-wide">Flow Workspace</h1><p className="text-[11px] text-gray-500">Multi-task Graph Engine</p></div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleClearGraph} className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all cursor-pointer"><Trash2 size={16}/> Dọn Dẹp</button>
          <button className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-all shadow-lg cursor-pointer ${isRunning ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' : 'bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 shadow-emerald-500/20'}`} onClick={() => handleRunWorkflow()}>
            {isRunning ? <><div className="w-2 h-2 bg-white rounded-full animate-ping mr-1"></div> Đang xử lý Đa luồng...</> : <><Play size={16} fill="currentColor" /> Chạy Tất Cả Engine</>}
          </button>
        </div>
      </div>

      <div className="flex-1 relative w-full h-full flex">
        
        <div className={`absolute top-0 left-0 h-full bg-[#15151A] border-r border-[#2A2A30] z-30 transition-transform duration-300 w-[300px] flex flex-col shadow-2xl ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} onMouseLeave={() => setIsSidebarOpen(false)}>
            <div className="p-4 border-b border-[#2A2A30] bg-[#1A1A1F]">
                <h2 className="font-bold text-emerald-400 flex items-center gap-2 mb-3"><Server size={16}/> Trạng Thái Kết Nối</h2>
                <div className="bg-[#0E0E10] border border-[#2A2A30] rounded p-3 flex flex-col gap-2">
                    <div className="flex justify-between items-center text-xs"><span className="text-gray-400">Cookie Status:</span><span className={settings.sessionCookie ? "text-emerald-500 font-bold" : "text-red-500 font-bold"}>{settings.sessionCookie ? '✅ Đã Kết Nối' : '❌ Chưa Có'}</span></div>
                    <div className="flex justify-between items-center text-xs"><span className="text-gray-400">Extension ID:</span><span className="text-blue-400 font-mono truncate max-w-[120px]">{settings.extensionId || 'Chưa nhập'}</span></div>
                </div>
                <button onClick={() => setIsSettingsOpen(true)} className="mt-3 w-full py-2 text-xs font-bold bg-[#1E1E24] hover:bg-[#2A2A30] border border-[#2A2A30] rounded transition-colors text-gray-300 flex items-center justify-center gap-2 cursor-pointer"><Settings size={14}/> Thiết Lập API</button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto">
                <h2 className="font-bold text-gray-300 text-sm mb-4">Thư viện Node</h2>
                <div className="flex flex-col gap-3">
                    <button onClick={() => addNode('input')} className="flex items-center gap-3 bg-[#0E0E10] border border-blue-500/30 hover:border-blue-500 p-3 rounded-lg transition-all text-left group cursor-pointer">
                        <div className="p-2 bg-blue-500/20 rounded text-blue-400"><Key size={16}/></div>
                        <div><h3 className="text-xs font-bold text-gray-200">Input Data</h3><p className="text-[10px] text-gray-500">Prompt & Media tham chiếu</p></div>
                    </button>
                    <button onClick={() => addNode('engine')} className="flex items-center gap-3 bg-[#0E0E10] border border-purple-500/30 hover:border-purple-500 p-3 rounded-lg transition-all text-left group cursor-pointer">
                        <div className="p-2 bg-purple-500/20 rounded text-purple-400"><Cpu size={16}/></div>
                        <div><h3 className="text-xs font-bold text-gray-200">AI Engine</h3><p className="text-[10px] text-gray-500">Khởi tạo tiến trình Gen</p></div>
                    </button>
                    <button onClick={() => addNode('gallery')} className="flex items-center gap-3 bg-[#0E0E10] border border-emerald-500/30 hover:border-emerald-500 p-3 rounded-lg transition-all text-left group cursor-pointer">
                        <div className="p-2 bg-emerald-500/20 rounded text-emerald-400"><ImageIcon size={16}/></div>
                        <div><h3 className="text-xs font-bold text-gray-200">Output Gallery</h3><p className="text-[10px] text-gray-500">Lưu và trích xuất kết quả</p></div>
                    </button>
                </div>
            </div>
        </div>

        <div className="flex-1 w-full h-full relative z-0">
            <ReactFlow 
                nodes={nodes} 
                edges={edges.map(e => ({ ...e, animated: isRunning || e.animated }))} 
                onNodesChange={onNodesChange} 
                onEdgesChange={onEdgesChange} 
                onConnect={onConnect} 
                nodeTypes={nodeTypes} 
                fitView minZoom={0.2} maxZoom={1.5}
            >
            <Background color="#2A2A30" gap={24} size={2} variant="dots" />
            <Controls className="!bg-[#15151A] !border-[#2A2A30] !fill-gray-400 !shadow-xl" />
            <MiniMap className="!bg-[#15151A]/90 !border !border-[#2A2A30] !rounded-xl overflow-hidden shadow-2xl" maskColor="rgba(0, 0, 0, 0.6)" nodeColor="#3B82F6" />
            </ReactFlow>
        </div>

      </div>

      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setIsSettingsOpen(false)}></div>
          <div className="relative w-full max-w-md h-full bg-[#121214] border-l border-[#2A2A30] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-5 border-b border-[#2A2A30] bg-[#15151A]">
              <div className="flex items-center gap-3"><Settings className="text-emerald-500" size={20} /><h2 className="text-lg font-bold text-white tracking-wide">Thiết lập Hệ thống</h2></div>
              <button onClick={() => setIsSettingsOpen(false)} className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 transition-colors cursor-pointer"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar text-sm">
              <div className="space-y-3 bg-[#1A1A1F] p-4 rounded-xl border border-[#2A2A30]">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Mã kết nối Web (User ID)</label>
                  <input type="text" readOnly value={user?.id || ''} onClick={(e) => { navigator.clipboard.writeText(e.target.value); alert("✅ Đã copy!"); }} className="w-full bg-[#0E0E10] border border-[#2A2A30] rounded p-2 text-xs text-blue-400 font-mono outline-none cursor-copy hover:border-blue-500 transition-colors" />
                </div>
                <div className="flex flex-col gap-1.5 mt-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Extension ID</label>
                  <input type="text" name="extensionId" value={settings.extensionId} onChange={handleInputChange} placeholder="VD: abcdefghijklmnop..." className="w-full bg-[#0E0E10] border border-[#2A2A30] rounded p-2 text-xs text-emerald-400 focus:border-emerald-500 outline-none" />
                </div>
                <div className="flex flex-col gap-1.5 mt-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Google Project ID</label>
                  <input type="text" name="projectId" value={settings.projectId} onChange={handleInputChange} placeholder="VD: 2ac32c13-..." className="w-full bg-[#0E0E10] border border-[#2A2A30] rounded p-2 text-xs text-white focus:border-emerald-500 outline-none" />
                </div>
              </div>
              <div className="space-y-3 bg-[#1A1A1F] p-4 rounded-xl border border-[#2A2A30]">
                <h3 className="text-emerald-400 font-bold flex items-center gap-2"><FolderGit2 size={16}/> Local Storage</h3>
                <div><label className="text-xs text-gray-400 font-semibold mb-1 block">Thư mục lưu Local</label><input type="text" name="outFolder" value={settings.outFolder} onChange={handleInputChange} className="w-full bg-[#0E0E10] border border-[#2A2A30] rounded p-2 focus:border-emerald-500 outline-none" /></div>
              </div>
            </div>
            <div className="p-5 border-t border-[#2A2A30] bg-[#15151A]">
              <button onClick={handleSaveSettings} className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-emerald-500/20 cursor-pointer">
                <Save size={18} /> Lưu Cài Đặt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}