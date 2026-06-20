import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, updateProjectProgress } from "../firebase.js";
import { fetchFile } from '@ffmpeg/util';
import { FileText, AlignLeft, Mic, Merge, LayoutDashboard, Sliders, X, CheckSquare, Square, Download, Upload, Trash2, Loader2, Pencil, Save, Music, Users, Film, Play, Clock, Maximize, Video, Globe, Sun, Moon } from 'lucide-react';

import SetupTab from './SetupTab.jsx';
import StoryboardTab from './StoryboardTab.jsx';

export default function Workspace({ ffmpeg, isFfmpegReady }) { 
  const { projectId } = useParams(); 
  const location = useLocation();

  const [activeTab, setActiveTab] = useState('storyboard'); 
  const [projectName, setProjectName] = useState("Dự án chưa đặt tên");
  const [projectType, setProjectType] = useState("full-ai"); 
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  
  // 🚀 LƯU TRẠNG THÁI GLOBAL BẰNG LOCALSTORAGE
  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('app-theme');
    return savedTheme ? savedTheme === 'dark' : true;
  });

  useEffect(() => {
    localStorage.setItem('app-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const [parsedData, setParsedData] = useState([]); 
  const [projectCharacters, setProjectCharacters] = useState([]); 
  const [originalScript, setOriginalScript] = useState(""); 
  const [isEditingScript, setIsEditingScript] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);

  const [activeEditSceneModal, setActiveEditSceneModal] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkedScenes, setCheckedScenes] = useState({});
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [checkedExportScenes, setCheckedExportScenes] = useState({});
  const [activeGenModal, setActiveGenModal] = useState(null);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [checkedMergeScenes, setCheckedMergeScenes] = useState({});
  const [activeMergeModal, setActiveMergeModal] = useState(null);

  const [voiceCloneUrl, setVoiceCloneUrl] = useState(null);
  const [voiceCloneFile, setVoiceCloneFile] = useState(null);
  const [voiceCloneBase64, setVoiceCloneBase64] = useState(null);
  const [voiceCloneRefText, setVoiceCloneRefText] = useState("");
  const [qwenEmbeddingUrl, setQwenEmbeddingUrl] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  const [generatedAudios, setGeneratedAudios] = useState({});
  const [isGenerating, setIsGenerating] = useState({});
  const [globalMixVol, setGlobalMixVol] = useState(35);
  const [singleMixVol, setSingleMixVol] = useState(35);
  const [isMerging, setIsMerging] = useState(false); 
  const [mergingScenes, setMergingScenes] = useState({}); 
  const [mergedVideos, setMergedVideos] = useState({});

  const fileInputRef = useRef(null);
  const frameInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  
  const charVoiceInputRef = useRef(null); 
  const activeUploadIdRef = useRef(null); 

  useEffect(() => {
    const fetchProjectData = async () => {
      if (!projectId) return setIsDataLoading(false);
      try {
        const docRef = doc(db, 'projects', projectId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const projectInfo = docSnap.data();
          if (projectInfo.projectName) setProjectName(projectInfo.projectName);
          
          if (projectInfo.projectType) {
            setProjectType(projectInfo.projectType);
          } else if (projectInfo.data && projectInfo.data.length > 0 && projectInfo.data[0].Footage !== undefined) {
            setProjectType('semi');
          }

          setParsedData(projectInfo.data || []);
          if (location.state?.characters && location.state.characters.length > 0) {
            setProjectCharacters(location.state.characters);
          } else {
            setProjectCharacters(projectInfo.characters || []);
          } 
          if (projectInfo.originalScript) setOriginalScript(projectInfo.originalScript);
          if (projectInfo.generatedAudios) setGeneratedAudios(projectInfo.generatedAudios);
          if (projectInfo.mergedVideos) setMergedVideos(projectInfo.mergedVideos);
          if (projectInfo.voiceCloneRefText) setVoiceCloneRefText(projectInfo.voiceCloneRefText);
          if (projectInfo.qwenEmbeddingUrl) setQwenEmbeddingUrl(projectInfo.qwenEmbeddingUrl);
          if (projectInfo.voiceCloneBase64) {
            setVoiceCloneBase64(projectInfo.voiceCloneBase64);
            setVoiceCloneUrl(projectInfo.voiceCloneBase64);
            setVoiceCloneFile({ name: "Voice_Clone_Saved.mp3" });
          }
        }
      } catch (error) { console.error(error); } finally { setIsDataLoading(false); }
    };
    fetchProjectData();
  }, [projectId]);

  const isSemi = projectType === 'semi';

  const handleSaveProjectName = async () => {
    if (!projectName.trim()) return;
    setIsEditingProjectName(false);
    await updateProjectProgress(projectId, { projectName: projectName.trim() });
  };

  const handleStartFrameUpload = (e) => {
    const file = e.target.files[0];
    const scene_n = activeUploadIdRef.current;
    if (!file || !scene_n) return;
    const tempUrl = URL.createObjectURL(file);
    setParsedData(prev => prev.map(s => s.scene_n === scene_n ? { ...s, startFrameUrl: tempUrl } : s));
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    const charId = activeUploadIdRef.current;
    if (!file || !charId) return;
    const tempUrl = URL.createObjectURL(file);
    setProjectCharacters(prev => prev.map(c => c.id === charId ? { ...c, imageUrl: tempUrl } : c));
  };

  const handleCharVoiceUpload = (e) => {
    const file = e.target.files[0];
    const charId = activeUploadIdRef.current;
    if (!file || !charId) return;
    const tempUrl = URL.createObjectURL(file);
    setProjectCharacters(prev => prev.map(c => c.id === charId ? { ...c, voiceUrl: tempUrl, voiceFileName: file.name } : c));
    e.target.value = null; 
  };

  const handleDeleteScene = (scene_n) => {
    if(window.confirm(`Xóa Scene ${scene_n}?`)) {
        setParsedData(prev => prev.filter(s => s.scene_n !== scene_n));
    }
  };

  const handleDeleteCharacter = (charId) => {
    if(window.confirm(`Xóa nhân vật này?`)) {
        setProjectCharacters(prev => prev.filter(c => c.id !== charId));
    }
  };

  const handleSaveSceneEdit = async () => { 
    const updatedData = parsedData.map(s => s.scene_n === activeEditSceneModal.scene_n ? activeEditSceneModal : s);
    setParsedData(updatedData);
    try {
      await updateProjectProgress(projectId, { data: updatedData });
      setActiveEditSceneModal(null); 
    } catch(err) { alert("Lỗi khi lưu: " + err.message); }
  };

  const processMergeSingleScene = async (scene, volValue) => {
    const videoUrl = scene.videoUrl || scene.startFrameUrl;
    const aiAudioUrl = generatedAudios[scene.scene_n];
    if (!videoUrl) return null;
    let finalUrl = null;

    if (!aiAudioUrl) {
      finalUrl = videoUrl;
    } else {
      const inVid = `vid_${scene.scene_n}.mp4`;
      const inAud = `aud_${scene.scene_n}.mp3`;
      const outName = `Scene_${scene.scene_n}_Merged.mp4`;

      try {
        if (scene.startFrameUrl && !scene.videoUrl) {
          await ffmpeg.writeFile('image.jpg', await fetchFile(scene.startFrameUrl));
          await ffmpeg.writeFile(inAud, await fetchFile(aiAudioUrl));
          await ffmpeg.exec(['-loop', '1', '-i', 'image.jpg', '-i', inAud, '-c:v', 'libx264', '-c:a', 'aac', '-shortest', '-pix_fmt', 'yuv420p', outName]);
        } else {
          await ffmpeg.writeFile(inVid, await fetchFile(videoUrl));
          await ffmpeg.writeFile(inAud, await fetchFile(aiAudioUrl));
          let exitCode = -1;
          if (volValue == 0) {
            try { exitCode = await ffmpeg.exec(['-i', inVid, '-i', inAud, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest', outName]); } catch (e) { exitCode = 1; }
          } else {
            const vol = volValue / 100;
            try { exitCode = await ffmpeg.exec(['-i', inVid, '-i', inAud, '-filter_complex', `[0:a]volume=${vol}[a1];[1:a]volume=1.0[a2];[a1][a2]amix=inputs=2:duration=shortest[aout]`, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-shortest', outName]); } catch (e) { exitCode = 1; }
            if (exitCode !== 0) try { exitCode = await ffmpeg.exec(['-i', inVid, '-i', inAud, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest', outName]); } catch (e) {}
          }
        }

        const outData = await ffmpeg.readFile(outName);
        const outBlob = new Blob([outData.buffer], { type: 'video/mp4' });
        
        try {
          const uniqueFileName = `project_${projectId}/merged_scene_${scene.scene_n}_${Date.now()}.mp4`;
          const urlRes = await fetch('/api/get-upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: uniqueFileName, fileType: 'video/mp4' })
          });
          const { uploadUrl } = await urlRes.json();

          if (uploadUrl) {
            const uploadRes = await fetch(uploadUrl, {
              method: 'PUT',
              body: outBlob,
              headers: { 'Content-Type': 'video/mp4' }
            });
            
            if (uploadRes.ok) {
              finalUrl = `${import.meta.env.VITE_R2_PUBLIC_URL}/${uniqueFileName}`;
            } else {
              throw new Error("Lỗi đẩy lên R2");
            }
          }
        } catch(err) { 
          console.error("Lỗi upload R2 (Dùng tạm file Local):", err);
          finalUrl = URL.createObjectURL(outBlob); 
        }
        
        try { await ffmpeg.deleteFile(inVid); } catch(e){}
        try { await ffmpeg.deleteFile('image.jpg'); } catch(e){}
        try { await ffmpeg.deleteFile(inAud); } catch(e){}
        try { await ffmpeg.deleteFile(outName); } catch(e){}
      } catch (e) { console.error(e); }
    }
    return finalUrl;
  };

  const handleGenAudio = async (sceneNo, scriptText) => {
    if (!scriptText || scriptText.trim() === '') return;
    setIsGenerating(prev => ({ ...prev, [sceneNo]: true }));
    try {
      let cleanText = scriptText.trim().replace(/[\r\n]+/g, ' ').replace(/["'”’“‘()[\]{}]/g, '').replace(/\s+/g, ' ');
      if (!cleanText.match(/[.!?]$/)) cleanText += '.';
      
      const isClone = !!qwenEmbeddingUrl;
      const endpoint = "https://queue.fal.run/fal-ai/qwen-3-tts/text-to-speech/1.7b";
      const payload = isClone ? { text: cleanText, speaker_voice_embedding_file_url: qwenEmbeddingUrl, reference_text: voiceCloneRefText.trim() } : { text: cleanText, voice: "Vivian" };

      const response = await fetch(endpoint, {
        method: "POST", headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Lỗi API Fal AI.");
      const queueData = await response.json();
      let result = null;

      if (queueData.status_url) {
        let attempts = 0; let lastStatus = "IN_QUEUE";
        while (attempts < 150) {
          attempts++; await new Promise(resolve => setTimeout(resolve, 2000));
          const statusRes = await fetch(queueData.status_url, { method: "GET", headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}` } });
          const statusJson = await statusRes.json(); lastStatus = statusJson.status;
          if (lastStatus === "COMPLETED") {
            const finalLink = statusJson.response_url || queueData.response_url;
            if (finalLink) { const finalRes = await fetch(finalLink, { method: "GET", headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}` } }); result = await finalRes.json(); } 
            else { result = statusJson.payload || statusJson.data || statusJson; }
            break;
          } else if (lastStatus === "FAILED") { throw new Error(statusJson.error); }
        }
      } else { result = queueData; }

      const audioUrl = result?.audio?.url || result?.audio_file?.url || result?.audio_url || result?.url || (typeof result?.audio === 'string' ? result.audio : null);
      if (audioUrl) {
        const newAudios = { ...generatedAudios, [sceneNo]: audioUrl };
        setGeneratedAudios(newAudios);
        await updateProjectProgress(projectId, { generatedAudios: newAudios });
      }
    } catch (error) { console.error(error); alert(`Lỗi Scene ${sceneNo}: ${error.message}`);
    } finally { setIsGenerating(prev => ({ ...prev, [sceneNo]: false })); }
  };

  const getTextToGen = (scene) => isSemi ? scene.Voiceover : (scene.Dialogue || scene.Voiceover);
  const filteredScenesForAudio = parsedData.filter(scene => {
    const text = getTextToGen(scene);
    return text && text.trim() !== '';
  });

  const handleStartBatchGen = async () => { 
    const scenesToGen = Object.keys(checkedScenes).filter(k => checkedScenes[k]);
    if (scenesToGen.length === 0) return alert("Vui lòng chọn ít nhất 1 scene để gen!");
    setIsModalOpen(false); 
    const promises = scenesToGen.map(sceneNo => {
      const scene = parsedData.find(s => String(s.scene_n) === String(sceneNo));
      const text = getTextToGen(scene);
      if (scene && text) return handleGenAudio(scene.scene_n, text);
      return Promise.resolve();
    });
    try { await Promise.all(promises); } finally { setCheckedScenes({}); }
  };

  const handleStartMerge = async () => { 
    const scenesToMergeList = Object.keys(checkedMergeScenes).filter(k => checkedMergeScenes[k]);
    if (scenesToMergeList.length === 0) return alert("Vui lòng chọn ít nhất 1 scene để Merge!");
    if (!ffmpeg || !isFfmpegReady) return alert("FFmpeg chưa sẵn sàng!");
    setIsMergeModalOpen(false); 
    setIsMerging(true);
    for (const sceneNo of scenesToMergeList) {
      const scene = parsedData.find(s => s.scene_n === parseInt(sceneNo));
      if (scene) {
        setMergingScenes(prev => ({ ...prev, [scene.scene_n]: true }));
        try {
          const finalUrl = await processMergeSingleScene(scene, globalMixVol);
          if (finalUrl) {
            setMergedVideos(prev => {
              const newMergedVideos = { ...prev, [scene.scene_n]: finalUrl };
              updateProjectProgress(projectId, { mergedVideos: newMergedVideos });
              return newMergedVideos;
            });
          }
        } catch (error) { console.error(error); }
        setMergingScenes(prev => ({ ...prev, [scene.scene_n]: false }));
      }
    }
    setIsMerging(false); alert("✅ Đã xử lý xong Batch Merge!");
  };

  const handleSingleSceneMergeConfirm = async () => { 
    const scene = activeMergeModal;
    setActiveMergeModal(null); 
    if (!ffmpeg || !isFfmpegReady) return alert("FFmpeg chưa sẵn sàng!");
    setMergingScenes(prev => ({ ...prev, [scene.scene_n]: true }));
    try {
      const finalUrl = await processMergeSingleScene(scene, singleMixVol);
      if (finalUrl) {
        setMergedVideos(prev => {
            const newMergedVideos = { ...prev, [scene.scene_n]: finalUrl };
            updateProjectProgress(projectId, { mergedVideos: newMergedVideos });
            return newMergedVideos;
        });
      }
    } catch (error) { console.error(error); } finally { setMergingScenes(prev => ({ ...prev, [scene.scene_n]: false })); }
  };

  const handleVoiceUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setVoiceCloneFile(file); setVoiceCloneUrl(URL.createObjectURL(file)); setIsTranscribing(true);
    try {
      setVoiceCloneRefText("Đang tải lên Cloudflare R2..."); 
      
      const fileExt = file.name.split('.').pop() || 'mp3';
      const uniqueFileName = `project_${projectId}/voice_clone_${Date.now()}.${fileExt}`;
      const fileType = file.type || 'audio/mpeg';

      const urlRes = await fetch('/api/get-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: uniqueFileName, fileType: fileType })
      });
      const { uploadUrl } = await urlRes.json();
      if (!uploadUrl) throw new Error("Không lấy được Link kết nối Cloudflare");

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': fileType }
      });
      if (!uploadRes.ok) throw new Error("Upload Voice thất bại");

      const audioCloudUrl = `${import.meta.env.VITE_R2_PUBLIC_URL}/${uniqueFileName}`;
      setVoiceCloneBase64(audioCloudUrl); 

      setVoiceCloneRefText("Đang nhận diện Text (Whisper)...");
      const response = await fetch("https://fal.run/fal-ai/whisper", { method: "POST", headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ audio_url: audioCloudUrl }) });
      const result = await response.json(); const refText = result.text ? result.text.trim() : "Không nhận diện được giọng.";

      setVoiceCloneRefText("Đang trích xuất Voice Clone...");
      const cloneRes = await fetch("https://queue.fal.run/fal-ai/qwen-3-tts/clone-voice/1.7b", { method: "POST", headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ audio_url: audioCloudUrl, reference_text: refText }) });
      const cloneQueueData = await cloneRes.json(); let embeddingUrl = null;
      if (cloneQueueData.status_url) {
        let attempts = 0;
        while (attempts < 60) {
          attempts++; await new Promise(r => setTimeout(r, 2000));
          const statusRes = await fetch(cloneQueueData.status_url, { headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}` }});
          const statusJson = await statusRes.json();
          if (statusJson.status === "COMPLETED") {
            const finalRes = await fetch(statusJson.response_url || cloneQueueData.response_url, { headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}` }});
            const finalData = await finalRes.json(); embeddingUrl = finalData?.speaker_embedding?.url; break;
          }
        }
      } else { embeddingUrl = cloneQueueData?.speaker_embedding?.url; }
      if (!embeddingUrl) throw new Error("Lỗi embedding file.");
      
      setQwenEmbeddingUrl(embeddingUrl); setVoiceCloneRefText(refText || "Clone thành công!");
      await updateProjectProgress(projectId, { voiceCloneBase64: audioCloudUrl, voiceCloneRefText: refText, qwenEmbeddingUrl: embeddingUrl });
    } catch (error) { console.error(error); setVoiceCloneRefText("Lỗi xử lý. Thử lại."); } finally { setIsTranscribing(false); }
  };

  const handleRemoveVoice = async () => {
    if (voiceCloneUrl && voiceCloneUrl.startsWith('blob:')) URL.revokeObjectURL(voiceCloneUrl);
    setVoiceCloneFile(null); setVoiceCloneUrl(null); setVoiceCloneBase64(null); setVoiceCloneRefText(""); setQwenEmbeddingUrl(null); setIsTranscribing(false);
    if (fileInputRef.current) fileInputRef.current.value = null;
    await updateProjectProgress(projectId, { voiceCloneBase64: null, voiceCloneRefText: "", qwenEmbeddingUrl: null });
  };

  const forceDownloadVideo = async (url, filename) => { 
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a'); 
        a.href = blobUrl; 
        a.download = filename; 
        document.body.appendChild(a); 
        a.click(); 
        a.remove(); 
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000); 
      } catch (error) { 
        console.error("Lỗi khi ép tải, mở link trực tiếp:", error); 
        window.open(url, '_blank');
      }
  };

  const handleDownloadVideos = async () => { 
    setIsExportModalOpen(false); 
    const scenesToExport = Object.keys(checkedExportScenes).filter(k => checkedExportScenes[k]);
    if (scenesToExport.length === 0) return alert("Vui lòng chọn ít nhất 1 Output để tải!");
    alert(`⏳ Hệ thống bắt đầu tải xuống ${scenesToExport.length} video (Các file tự động tải lần lượt)...`);

    for (let i = 0; i < scenesToExport.length; i++) {
       const sceneNo = scenesToExport[i];
       const url = mergedVideos[sceneNo];
       if(url) {
         await forceDownloadVideo(url, `Scene_${sceneNo}.mp4`);
         await new Promise(resolve => setTimeout(resolve, 800)); 
       }
    }
  };

  const totalScenes = parsedData.length;
  const totalVoice = filteredScenesForAudio.length;
  const parseToSeconds = (timeStr) => {
    if (!timeStr) return 0;
    const parts = String(timeStr).split(':');
    if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    if (parts.length === 3) return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
    return parseInt(timeStr, 10) || 0;
  };
  const totalSeconds = parsedData.reduce((acc, scene) => acc + parseToSeconds(scene.time_origin || scene.Time), 0);
  const avgSeconds = totalScenes > 0 ? Math.round(totalSeconds / totalScenes) : 0;
  const avgDuration = `${Math.floor(avgSeconds / 60).toString().padStart(2, '0')}:${(avgSeconds % 60).toString().padStart(2, '0')}`;
  const estCost = `$${(totalVoice * 0.09).toFixed(2)}`;

  if (isDataLoading) return <div className="flex h-screen items-center justify-center bg-[#09090B] text-blue-500 font-bold"><Loader2 className="animate-spin mr-2"/> Đang tải Workspace...</div>;

  return (
    <div className={`h-screen w-full font-sans p-4 lg:p-6 overflow-y-auto relative custom-scrollbar transition-colors duration-300 ${darkMode ? 'bg-[#09090B] text-gray-200' : 'bg-zinc-100 text-zinc-900'}`}>
      
      {/* 🚀 CỘT TRÁI: KỊCH BẢN GỐC */}
      <div className={`fixed left-6 top-24 bottom-6 rounded-2xl p-5 shadow-2xl z-20 flex flex-col gap-4 w-[280px] hidden xl:flex transition-all duration-300 border ${darkMode ? 'bg-[#121214] border-white/10' : 'bg-white border-zinc-200'}`}>
        <div className={`flex items-center justify-between border-b pb-3 shrink-0 ${darkMode ? 'border-white/10' : 'border-zinc-200'}`}>
          <div className={`flex items-center gap-2 font-semibold text-sm ${darkMode ? 'text-zinc-100' : 'text-zinc-900'}`}><FileText size={16} className="text-blue-500" /> Kịch bản gốc</div>
          {originalScript && !isEditingScript && <button onClick={() => setIsEditingScript(true)} className="text-zinc-500 hover:text-blue-500 text-xs font-medium cursor-pointer transition-colors">Chỉnh sửa</button>}
        </div>
        {(!originalScript || isEditingScript) ? (
          <div className="flex-1 flex flex-col gap-3 min-h-0 animate-in fade-in zoom-in-95 duration-200">
            <textarea value={originalScript} onChange={(e) => setOriginalScript(e.target.value)} placeholder="Paste kịch bản..." className={`flex-1 rounded-xl p-3.5 text-sm custom-scrollbar focus:outline-none focus:ring-2 focus:ring-blue-500/50 border transition-all resize-none ${darkMode ? 'bg-[#0A0A0C] border-white/10 text-zinc-300' : 'bg-zinc-50 border-zinc-300 text-zinc-800'}`} />
            {/* 🚀 ĐÃ SỬA: Màu xanh dương */}
            <button onClick={() => { updateProjectProgress(projectId, { originalScript: originalScript.trim() }); setIsEditingScript(false); }} className={`w-full h-10 font-bold text-sm rounded-xl cursor-pointer transition-all shadow-md text-white ${darkMode ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-500 hover:bg-blue-600'}`}>Lưu kịch bản</button>
          </div>
        ) : ( <div className={`flex-1 overflow-y-auto pr-2 text-[13px] leading-relaxed whitespace-pre-wrap font-mono custom-scrollbar animate-in fade-in duration-200 ${darkMode ? 'text-zinc-400' : 'text-zinc-700'}`}>{originalScript}</div> )}
      </div>

      <input type="file" accept="image/*" ref={frameInputRef} className="hidden" onChange={handleStartFrameUpload} />
      <input type="file" accept="image/*" ref={avatarInputRef} className="hidden" onChange={handleAvatarUpload} />
      <input type="file" accept="audio/*" ref={charVoiceInputRef} className="hidden" onChange={handleCharVoiceUpload} />

      {/* 🚀 CỘT GIỮA */}
      <div className="flex flex-col gap-6 w-full pb-20 px-0 xl:pl-[310px] xl:pr-[290px]">
        
        {/* Thanh Header & Tabs */}
        <div className={`flex items-center justify-between pb-3 border-b pt-2 ${darkMode ? 'border-white/10' : 'border-zinc-200'}`}>
          {isEditingProjectName ? (
            <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-4">
              <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveProjectName()} className={`border-b-2 border-blue-500 px-1 py-1.5 text-2xl font-bold focus:outline-none min-w-[300px] bg-transparent ${darkMode ? 'text-white' : 'text-black'}`} autoFocus />
              {/* 🚀 ĐÃ SỬA: Màu xanh dương */}
              <button onClick={handleSaveProjectName} className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-bold shadow-md transition-colors cursor-pointer ${darkMode ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-blue-500 text-white hover:bg-blue-600'}`}><Save size={16} /> Lưu</button>
            </div>
          ) : (
            <div className="flex items-center gap-3 group">
              <h1 className={`text-3xl font-bold tracking-tight ${darkMode ? 'text-zinc-100' : 'text-black'}`}>{projectName}</h1>
              <button onClick={() => setIsEditingProjectName(true)} className={`opacity-0 group-hover:opacity-100 p-1.5 rounded-md transition-all cursor-pointer ${darkMode ? 'text-zinc-500 hover:text-zinc-300 hover:bg-white/10' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200'}`}><Pencil size={16} /></button>
            </div>
          )}
          
          <div className={`flex border rounded-lg p-1 shadow-inner ${darkMode ? 'bg-[#121214] border-[#2A2A30]' : 'bg-white border-zinc-200'}`}>
              <button onClick={() => setActiveTab('storyboard')} className={`flex items-center gap-2 px-5 py-2 rounded-md text-sm font-bold transition-all cursor-pointer ${activeTab === 'storyboard' ? 'bg-blue-600 text-white shadow-md' : (darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-zinc-600 hover:text-black')}`}><Film size={16}/> Storyboard</button>
              {!isSemi && (
                <button onClick={() => setActiveTab('setup')} className={`flex items-center gap-2 px-5 py-2 rounded-md text-sm font-bold transition-all cursor-pointer ${activeTab === 'setup' ? 'bg-purple-600 text-white shadow-md' : (darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-zinc-600 hover:text-black')}`}><Users size={16}/> Setup Nhân vật</button>
              )}
          </div>
        </div>

        {/* Bảng Thống kê */}
        <div className={`border rounded-2xl p-6 shadow-lg relative overflow-hidden transition-colors ${darkMode ? 'bg-[#121214] border-[#2A2A30]' : 'bg-white border-zinc-200'}`}>
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-transparent opacity-40"></div>
          <div className={`flex items-center gap-2 font-semibold text-xs uppercase tracking-widest mb-6 ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}><LayoutDashboard size={14} /> Thống kê dự án</div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-6 text-left">
            <div><div className={`text-[11px] font-medium uppercase tracking-wider mb-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Total Scene</div><div className={`text-2xl font-bold ${darkMode ? 'text-zinc-100' : 'text-black'}`}>{totalScenes}</div></div>
            <div><div className={`text-[11px] font-medium uppercase tracking-wider mb-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Total Voice</div><div className="text-2xl font-bold text-blue-500">{totalVoice}</div></div>
            {isSemi && (
              <div><div className={`text-[11px] font-medium uppercase tracking-wider mb-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Avg Duration</div><div className="text-2xl font-bold text-green-500">{avgDuration}</div></div>
            )}
            <div><div className={`text-[11px] font-medium uppercase tracking-wider mb-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Est Cost</div><div className="text-2xl font-bold text-yellow-500">{estCost}</div></div>
            <div><div className={`text-[11px] font-medium uppercase tracking-wider mb-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Audio Gen</div><div className="text-xl font-semibold text-purple-500 mt-1">{Object.keys(generatedAudios).length} <span className={`text-sm ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>/ {totalVoice}</span></div></div>
            <div><div className={`text-[11px] font-medium uppercase tracking-wider mb-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Video Gen</div><div className="text-xl font-semibold text-orange-500 mt-1">{Object.keys(mergedVideos).length} <span className={`text-sm ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>/ {totalScenes}</span></div></div>
          </div>
        </div>

        {/* NỘI DUNG TABS */}
        {activeTab === 'setup' && !isSemi && <SetupTab projectCharacters={projectCharacters} setProjectCharacters={setProjectCharacters} parsedData={parsedData} setParsedData={setParsedData} handleDeleteCharacter={handleDeleteCharacter} avatarInputRef={avatarInputRef} charVoiceInputRef={charVoiceInputRef} activeUploadIdRef={activeUploadIdRef} darkMode={darkMode} />}
        {activeTab === 'storyboard' && <StoryboardTab parsedData={parsedData} generatedAudios={generatedAudios} isGenerating={isGenerating} mergingScenes={mergingScenes} mergedVideos={mergedVideos} setActiveEditSceneModal={setActiveEditSceneModal} frameInputRef={frameInputRef} activeUploadIdRef={activeUploadIdRef} setActiveGenModal={setActiveGenModal} handleDeleteScene={handleDeleteScene} globalMixVol={globalMixVol} setSingleMixVol={setSingleMixVol} setActiveMergeModal={setActiveMergeModal} forceDownloadVideo={forceDownloadVideo} projectType={projectType} darkMode={darkMode} />}
      </div>

      {/* 🚀 CỘT PHẢI: BẢNG ĐIỀU KHIỂN */}
      <div className={`fixed right-6 top-24 bottom-6 border rounded-2xl p-5 shadow-2xl z-20 flex flex-col gap-5 w-[260px] hidden xl:flex transition-colors ${darkMode ? 'bg-[#121214] border-white/10' : 'bg-white border-zinc-200'}`}>
        
        <div className={`flex items-center justify-between border-b pb-3 ${darkMode ? 'border-white/10' : 'border-zinc-200'}`}>
          <div className={`flex items-center gap-2 font-semibold text-sm ${darkMode ? 'text-zinc-100' : 'text-black'}`}>
            <Sliders size={16} className="text-purple-500" /> Bảng điều khiển
          </div>
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className={`p-1.5 rounded-lg border transition-all duration-300 cursor-pointer shadow-sm ${darkMode ? 'bg-[#1A1A1F] border-white/10 text-yellow-400 hover:bg-[#222228]' : 'bg-zinc-50 border-zinc-200 text-purple-600 hover:bg-zinc-100'}`}
            title={darkMode ? "Chuyển sang Chế độ sáng" : "Chuyển sang Chế độ tối"}
          >
            {darkMode ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
        
        <div className="flex flex-col gap-3">
          <button onClick={() => setIsMergeModalOpen(true)} className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg hover:shadow-blue-500/25 transition-all cursor-pointer"><Merge size={16} /> Merge All</button>
        </div>
        
        <div className={`w-full h-[1px] my-1 ${darkMode ? 'bg-white/10' : 'bg-zinc-200'}`}></div>
        
        {/* 🚀 ĐÃ SỬA: Nút Gen Audio đổi sang Gradient Tím hồng */}
        <button onClick={() => setIsModalOpen(true)} className={`w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer ${darkMode ? 'text-white bg-gradient-to-r from-purple-600/80 to-pink-600/80 hover:from-purple-500 hover:to-pink-500' : 'text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400'}`}>
          <Music size={16} /> Gen All Audio
        </button>
        
        {/* Khu vực Upload Voice Clone */}
        <div className={`border rounded-xl p-4 flex flex-col gap-4 shadow-inner ${darkMode ? 'bg-[#0A0A0C] border-[#2A2A30]' : 'bg-zinc-50 border-zinc-200'}`}>
          <div className={`text-[12px] font-bold flex justify-between items-center ${darkMode ? 'text-zinc-300' : 'text-zinc-800'}`}>
            Voice Clone 
            {voiceCloneFile && (<button onClick={handleRemoveVoice} className="text-red-500 hover:text-red-400 bg-red-500/10 p-1.5 rounded cursor-pointer transition-colors"><Trash2 size={14} /></button>)}
          </div>
          <input type="file" accept="audio/mp3,audio/wav" ref={fileInputRef} onChange={handleVoiceUpload} className="hidden" />
          {!voiceCloneFile ? (
            <button onClick={() => fileInputRef.current.click()} className={`w-full h-11 border border-dashed rounded-xl text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer ${darkMode ? 'border-[#2A2A30] hover:border-purple-400 text-zinc-400 hover:text-purple-400' : 'border-zinc-300 hover:border-purple-600 text-zinc-700 hover:text-purple-700 hover:bg-purple-50'}`}><Upload size={16} /> Tải file MP3</button>
          ) : (
            <div className="flex flex-col gap-3 animate-in fade-in duration-300">
              <div className={`text-[11px] truncate font-medium ${darkMode ? 'text-zinc-400' : 'text-zinc-700'}`}>{voiceCloneFile.name}</div>
              <audio src={voiceCloneUrl} crossOrigin="anonymous" controls className="w-full h-8 custom-audio" />
              <div className="relative">
                <input type="text" value={voiceCloneRefText} onChange={(e) => setVoiceCloneRefText(e.target.value)} disabled={isTranscribing} className={`w-full h-10 px-3 border focus:outline-none focus:ring-2 focus:ring-purple-500/50 rounded-xl text-sm transition-all ${isTranscribing ? 'opacity-50' : ''} ${darkMode ? 'bg-[#121214] border-[#2A2A30] text-zinc-200' : 'bg-white border-zinc-300 text-zinc-900'}`} placeholder="Nhập Text mẫu..." />
                {isTranscribing && <Loader2 size={16} className="absolute right-3 top-3 animate-spin text-purple-500" />}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1"></div>
        {/* 🚀 ĐÃ SỬA: Nút Xuất File đổi sang Tone Xanh lá dịu mắt */}
        <button onClick={() => setIsExportModalOpen(true)} className={`w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm border ${darkMode ? 'bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20' : 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100 hover:border-green-300'}`}>
          <Download size={16} /> Xuất File (Export)
        </button>
      </div>

      {/* 🚀 MODAL: SỬA SCENE */}
      {activeEditSceneModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className={`border p-7 rounded-2xl w-full max-w-2xl flex flex-col max-h-[90vh] shadow-2xl relative animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-[#121214] border-white/10' : 'bg-white border-zinc-200'}`}>
            <button onClick={() => setActiveEditSceneModal(null)} className={`absolute top-5 right-5 cursor-pointer transition-colors ${darkMode ? 'text-zinc-500 hover:text-white' : 'text-zinc-500 hover:text-black'}`}><X size={20}/></button>
            <h2 className={`text-xl font-bold mb-6 border-b pb-4 flex items-center gap-2 ${darkMode ? 'text-white border-white/10' : 'text-black border-zinc-200'}`}>Sửa thông tin - Scene {activeEditSceneModal.scene_n}</h2>
            
            <div className="flex flex-col gap-5 overflow-y-auto pr-2 custom-scrollbar">
              {isSemi ? (
                <>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-blue-500">Footage (Cảnh quay)</label>
                    <textarea value={activeEditSceneModal.Footage || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Footage: e.target.value})} className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 h-24 resize-none custom-scrollbar transition-all ${darkMode ? 'bg-[#0A0A0C] border-white/10 text-zinc-200' : 'bg-zinc-50 border-zinc-300 text-zinc-900'}`} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-black'}`}>Voiceover (Lời thoại)</label>
                    <textarea value={activeEditSceneModal.Voiceover || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Voiceover: e.target.value})} className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500/50 h-24 resize-none custom-scrollbar transition-all ${darkMode ? 'bg-[#0A0A0C] border-white/10 text-zinc-200' : 'bg-zinc-50 border-zinc-300 text-zinc-900'}`} />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-2"><label className="text-sm font-bold text-purple-500">Context (Bối cảnh)</label><textarea value={activeEditSceneModal.Context || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Context: e.target.value})} className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 h-20 resize-none custom-scrollbar transition-all ${darkMode ? 'bg-[#0A0A0C] border-white/10 text-zinc-200' : 'bg-zinc-50 border-zinc-300 text-zinc-900'}`} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2"><label className="text-sm font-bold text-green-500">Camera (Góc máy)</label><textarea value={activeEditSceneModal.Camera || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Camera: e.target.value})} className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 h-20 resize-none custom-scrollbar transition-all ${darkMode ? 'bg-[#0A0A0C] border-white/10 text-zinc-200' : 'bg-zinc-50 border-zinc-300 text-zinc-900'}`} /></div>
                    <div className="flex flex-col gap-2"><label className="text-sm font-bold text-orange-500">Action (Hành động)</label><textarea value={activeEditSceneModal.Action || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Action: e.target.value})} className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 h-20 resize-none custom-scrollbar transition-all ${darkMode ? 'bg-[#0A0A0C] border-white/10 text-zinc-200' : 'bg-zinc-50 border-zinc-300 text-zinc-900'}`} /></div>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-blue-500">Character (Nhân vật)</label>
                    <input type="text" value={activeEditSceneModal.Character || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Character: e.target.value})} className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${darkMode ? 'bg-[#0A0A0C] border-white/10 text-zinc-200' : 'bg-zinc-50 border-zinc-300 text-zinc-900'}`} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-black'}`}>Dialogue (Thoại)</label>
                    <textarea value={activeEditSceneModal.Dialogue || activeEditSceneModal.Voiceover || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Dialogue: e.target.value, Voiceover: e.target.value})} className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500/50 h-24 resize-none custom-scrollbar transition-all ${darkMode ? 'bg-[#0A0A0C] border-white/10 text-zinc-200' : 'bg-zinc-50 border-zinc-300 text-zinc-900'}`} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-blue-500">Tone (Giọng điệu)</label>
                    <input type="text" value={activeEditSceneModal.Tone_of_Voice || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Tone_of_Voice: e.target.value})} className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${darkMode ? 'bg-[#0A0A0C] border-white/10 text-zinc-200' : 'bg-zinc-50 border-zinc-300 text-zinc-900'}`} />
                  </div>
                </>
              )}
              <div className="flex flex-col gap-2"><label className={`text-sm font-bold ${darkMode ? 'text-zinc-400' : 'text-zinc-700'}`}>Translate (Bản dịch)</label><textarea value={activeEditSceneModal.Translate || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Translate: e.target.value})} className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500/50 h-16 resize-none custom-scrollbar transition-all ${darkMode ? 'bg-[#0A0A0C] border-white/10 text-zinc-400' : 'bg-zinc-50 border-zinc-300 text-zinc-700'}`} /></div>
            </div>
            <div className={`flex justify-end gap-3 mt-6 pt-5 border-t shrink-0 ${darkMode ? 'border-white/10' : 'border-zinc-200'}`}>
              <button onClick={() => setActiveEditSceneModal(null)} className={`h-10 px-6 rounded-xl font-bold cursor-pointer transition-colors ${darkMode ? 'text-zinc-400 hover:text-white hover:bg-white/5' : 'text-zinc-600 hover:text-black hover:bg-zinc-100'}`}>Hủy</button>
              <button onClick={handleSaveSceneEdit} className="h-10 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold cursor-pointer shadow-md transition-colors">Lưu thay đổi</button>
            </div>
          </div>
        </div>
      )}

      {/* 🚀 MODAL: BATCH GEN AUDIO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className={`border rounded-2xl w-full max-w-2xl flex flex-col max-h-[85vh] shadow-2xl relative animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-[#121214] border-white/10' : 'bg-white border-zinc-200'}`}>
            <button onClick={() => setIsModalOpen(false)} className={`absolute top-4 right-4 cursor-pointer transition-colors ${darkMode ? 'text-zinc-500 hover:text-white' : 'text-zinc-500 hover:text-black'}`}><X size={20}/></button>
            <div className={`p-6 border-b shrink-0 ${darkMode ? 'border-white/10' : 'border-zinc-200'}`}>
              <h2 className={`text-xl font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-black'}`}><Music className="text-purple-500"/> Batch Gen Audio</h2>
            </div>
            <div className={`px-6 py-3 border-b flex gap-3 shrink-0 ${darkMode ? 'bg-[#0A0A0C] border-white/10' : 'bg-zinc-50 border-zinc-200'}`}>
              <button onClick={() => { const all = {}; filteredScenesForAudio.forEach(s => { if(!generatedAudios[s.scene_n]) all[s.scene_n] = true; }); setCheckedScenes(all); }} className="px-4 py-1.5 text-xs font-bold bg-purple-500/10 text-purple-600 hover:bg-purple-600 hover:text-white rounded-lg cursor-pointer transition-colors border border-purple-500/20">Chọn tất cả</button>
              <button onClick={() => setCheckedScenes({})} className={`px-4 py-1.5 text-xs font-bold border rounded-lg cursor-pointer transition-colors ${darkMode ? 'bg-[#121214] border-[#2A2A30] text-gray-400 hover:text-white' : 'bg-white border-zinc-300 text-zinc-700 hover:text-black'}`}>Bỏ chọn</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              <div className="flex flex-col">
                {filteredScenesForAudio.length === 0 ? (
                    <div className={`text-center py-10 text-sm ${darkMode ? 'text-zinc-500' : 'text-zinc-600'}`}>Không có cảnh nào chứa lời thoại.</div>
                ) : (
                    filteredScenesForAudio.map((scene) => (
                      <div key={scene.scene_n} onClick={() => setCheckedScenes(prev => ({ ...prev, [scene.scene_n]: !prev[scene.scene_n] }))} className={`flex items-start gap-4 p-4 border-b cursor-pointer transition-colors select-none ${darkMode ? 'border-white/5' : 'border-zinc-100'} ${checkedScenes[scene.scene_n] ? (darkMode ? 'bg-purple-900/20' : 'bg-purple-50') : (darkMode ? 'hover:bg-white/5' : 'hover:bg-zinc-50')}`}>
                        <div className="mt-1 shrink-0">{checkedScenes[scene.scene_n] ? <CheckSquare className="text-purple-600" size={20} /> : <Square className={darkMode ? 'text-zinc-600' : 'text-zinc-400'} size={20} />}</div>
                        <div className="flex-1 min-w-0 text-sm space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${darkMode ? 'text-zinc-200' : 'text-zinc-900'}`}>Scene {scene.scene_n}</span>
                            {generatedAudios[scene.scene_n] && <span className="text-[10px] font-bold text-green-600 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">Đã có Audio</span>}
                          </div>
                          <div className={`truncate leading-relaxed ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>{isSemi ? 'Voiceover: ' : 'Dialogue: '} {getTextToGen(scene)}</div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
            <div className={`p-6 border-t shrink-0 ${darkMode ? 'border-white/10' : 'border-zinc-200'}`}>
              <button onClick={handleStartBatchGen} className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold cursor-pointer shadow-md transition-colors flex justify-center items-center gap-2"><Mic size={18}/> Bắt đầu Gen Audio</button>
            </div>
          </div>
        </div>
      )}

      {/* 🚀 MODAL: BATCH MERGE VIDEO */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className={`border rounded-2xl w-full max-w-2xl flex flex-col max-h-[85vh] shadow-2xl relative animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-[#121214] border-white/10' : 'bg-white border-zinc-200'}`}>
            <button onClick={() => !isMerging && setIsMergeModalOpen(false)} className={`absolute top-5 right-5 cursor-pointer transition-colors ${darkMode ? 'text-zinc-500 hover:text-white' : 'text-zinc-500 hover:text-black'}`}><X size={20}/></button>
            <div className={`p-6 border-b shrink-0 ${darkMode ? 'border-white/10' : 'border-zinc-200'}`}>
              <h2 className={`text-xl font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-black'}`}><Merge className="text-blue-500"/> Batch Merge Video</h2>
            </div>
            <div className={`px-6 py-5 border-b ${darkMode ? 'bg-[#0A0A0C] border-white/10' : 'bg-zinc-50 border-zinc-200'}`}>
              <div className="flex justify-between items-center mb-3">
                <span className={`font-semibold text-sm ${darkMode ? 'text-zinc-200' : 'text-zinc-900'}`}>Âm lượng video gốc (Mix)</span>
                <span className="text-blue-600 font-mono font-bold bg-blue-500/10 px-2.5 py-1 rounded-md border border-blue-500/20">{(globalMixVol / 100).toFixed(2)}</span>
              </div>
              <input type="range" min="0" max="100" value={globalMixVol} onChange={(e) => setGlobalMixVol(e.target.value)} disabled={isMerging} className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-500 ${darkMode ? 'bg-[#2A2A30]' : 'bg-zinc-300'}`} />
            </div>
            <div className={`px-6 py-3 border-b flex gap-3 shrink-0 ${darkMode ? 'bg-[#0A0A0C] border-white/10' : 'bg-zinc-50 border-zinc-200'}`}>
              <button onClick={() => { const all = {}; parsedData.forEach(s => { if(s.videoUrl || s.startFrameUrl) all[s.scene_n] = true; }); setCheckedMergeScenes(all); }} disabled={isMerging} className="px-4 py-1.5 text-xs font-bold bg-blue-500/10 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg cursor-pointer border border-blue-500/20 transition-colors">Chọn tất cả (có Video/Ảnh)</button>
              <button onClick={() => setCheckedMergeScenes({})} disabled={isMerging} className={`px-4 py-1.5 text-xs font-bold border rounded-lg cursor-pointer transition-colors ${darkMode ? 'bg-[#121214] border-[#2A2A30] text-gray-400 hover:text-white' : 'bg-white border-zinc-300 text-zinc-700 hover:text-black'}`}>Bỏ chọn</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              <div className="flex flex-col">
                {parsedData.map((scene) => {
                  const isEligible = (scene.videoUrl || scene.startFrameUrl);
                  const isChecked = !!checkedMergeScenes[scene.scene_n];
                  return (
                    <div key={scene.scene_n} onClick={() => !isMerging && isEligible && setCheckedMergeScenes(prev => ({ ...prev, [scene.scene_n]: !prev[scene.scene_n] }))} className={`flex items-center gap-4 p-4 border-b transition-colors select-none ${darkMode ? 'border-white/5' : 'border-zinc-100'} ${!isEligible ? (darkMode ? 'opacity-50 cursor-not-allowed bg-black/20' : 'opacity-50 cursor-not-allowed bg-zinc-100') : (isChecked ? (darkMode ? 'bg-blue-500/10' : 'bg-blue-50') : (darkMode ? 'hover:bg-white/5 cursor-pointer' : 'hover:bg-zinc-50 cursor-pointer'))} ${isMerging ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <div className="shrink-0">{isChecked ? <CheckSquare className="text-blue-600" size={20} /> : <Square className={darkMode ? 'text-zinc-600' : 'text-zinc-400'} size={20} />}</div>
                      <div className="flex-1 min-w-0 text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-bold ${isChecked ? 'text-blue-600' : (darkMode ? 'text-zinc-200' : 'text-zinc-900')}`}>Scene {scene.scene_n}</span>
                          {!isEligible && <span className="text-[10px] font-bold text-red-600 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">Thiếu Input</span>}
                        </div>
                        <div className={`text-xs ${darkMode ? 'text-zinc-500' : 'text-zinc-600'}`}>{generatedAudios[scene.scene_n] ? 'Âm thanh: Có AI Audio + Nhạc nền' : 'Âm thanh: Chỉ lấy âm thanh Video gốc'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className={`p-6 border-t shrink-0 ${darkMode ? 'border-white/10' : 'border-zinc-200'}`}>
              <button onClick={handleStartMerge} disabled={isMerging || Object.keys(checkedMergeScenes).filter(k => checkedMergeScenes[k]).length === 0} className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-gray-700 disabled:to-gray-800 disabled:text-gray-400 text-white rounded-xl font-bold cursor-pointer flex items-center justify-center gap-2 shadow-lg transition-all">
                {isMerging ? <Loader2 size={18} className="animate-spin" /> : <Merge size={18} />} {isMerging ? 'Đang xử lý...' : `Bắt đầu Merge Video`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🚀 MODAL: EXPORT BATCH */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className={`border rounded-2xl w-full max-w-2xl flex flex-col max-h-[85vh] shadow-2xl relative animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-[#121214] border-white/10' : 'bg-white border-zinc-200'}`}>
            <button onClick={() => setIsExportModalOpen(false)} className={`absolute top-5 right-5 cursor-pointer transition-colors ${darkMode ? 'text-zinc-500 hover:text-white' : 'text-zinc-500 hover:text-black'}`}><X size={20}/></button>
            <div className={`p-6 border-b shrink-0 ${darkMode ? 'border-white/10' : 'border-zinc-200'}`}>
              <h2 className={`text-xl font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-black'}`}><Download className="text-green-500"/> Export Output</h2>
            </div>
            
            {Object.keys(mergedVideos).length === 0 ? (
               <div className={`flex-1 flex items-center justify-center text-center py-16 text-sm ${darkMode ? 'text-zinc-500' : 'text-zinc-600'}`}>
                 Chưa có video Output nào được tạo.<br/>Bạn hãy chạy "Batch Merge" trước nhé!
               </div>
            ) : (
               <>
                  <div className={`px-6 py-3 border-b flex gap-3 shrink-0 ${darkMode ? 'bg-[#0A0A0C] border-white/10' : 'bg-zinc-50 border-zinc-200'}`}>
                    <button onClick={() => { const all = {}; parsedData.forEach(s => { if(mergedVideos[s.scene_n]) all[s.scene_n] = true; }); setCheckedExportScenes(all); }} className="px-4 py-1.5 text-xs font-bold bg-green-500/10 text-green-600 hover:bg-green-600 hover:text-white rounded-lg cursor-pointer border border-green-500/20 transition-colors">Chọn tất cả</button>
                    <button onClick={() => setCheckedExportScenes({})} className={`px-4 py-1.5 text-xs font-bold border rounded-lg cursor-pointer transition-colors ${darkMode ? 'bg-[#121214] border-[#2A2A30] text-gray-400 hover:text-white' : 'bg-white border-zinc-300 text-zinc-700 hover:text-black'}`}>Bỏ chọn</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                    <div className="flex flex-col">
                      {parsedData.filter(scene => mergedVideos[scene.scene_n]).map((scene) => {
                        const isChecked = !!checkedExportScenes[scene.scene_n];
                        return (
                          <div key={scene.scene_n} onClick={() => setCheckedExportScenes(prev => ({ ...prev, [scene.scene_n]: !prev[scene.scene_n] }))} className={`flex items-center gap-4 p-4 border-b cursor-pointer transition-colors select-none ${darkMode ? 'border-white/5' : 'border-zinc-100'} ${isChecked ? (darkMode ? 'bg-green-900/20' : 'bg-green-50') : (darkMode ? 'hover:bg-white/5' : 'hover:bg-zinc-50')}`}>
                            <div className="shrink-0">{isChecked ? <CheckSquare className="text-green-600" size={20} /> : <Square className={darkMode ? 'text-zinc-600' : 'text-zinc-400'} size={20} />}</div>
                            <div className="flex-1 min-w-0 text-sm space-y-1">
                              <div className={`font-bold ${isChecked ? 'text-green-600' : (darkMode ? 'text-zinc-200' : 'text-zinc-900')}`}>Scene {scene.scene_n} Output.mp4</div>
                              <div className={`text-xs ${darkMode ? 'text-zinc-500' : 'text-zinc-600'}`}>{generatedAudios[scene.scene_n] ? 'Âm thanh: Có AI Audio' : 'Âm thanh: Chỉ Video gốc'}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className={`p-6 border-t shrink-0 ${darkMode ? 'border-white/10' : 'border-zinc-200'}`}>
                    <button onClick={handleDownloadVideos} disabled={Object.keys(checkedExportScenes).filter(k => checkedExportScenes[k]).length === 0} className="w-full py-3.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-400 text-white rounded-xl font-bold cursor-pointer flex items-center justify-center gap-2 shadow-md transition-all"><Download size={18}/> Tải xuống Video</button>
                  </div>
               </>
            )}
          </div>
        </div>
      )}
      
      {/* 🚀 MODAL: SINGLE GEN AUDIO */}
      {activeGenModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className={`border rounded-2xl w-full max-w-md p-7 shadow-2xl relative animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-[#121214] border-white/10' : 'bg-white border-zinc-200'}`}>
            <button onClick={() => setActiveGenModal(null)} className={`absolute top-5 right-5 cursor-pointer transition-colors ${darkMode ? 'text-zinc-500 hover:text-white' : 'text-zinc-500 hover:text-black'}`}><X size={20} /></button>
            <h3 className={`text-lg font-bold border-b pb-4 flex items-center gap-2 ${darkMode ? 'text-zinc-100 border-white/10' : 'text-black border-zinc-200'}`}><Mic size={20} className="text-purple-500" /> Audio - Scene {activeGenModal.scene_n}</h3>
            <div className="mt-6 space-y-5">
              <div className={`border rounded-xl p-5 shadow-inner ${darkMode ? 'bg-[#0A0A0C] border-[#2A2A30]' : 'bg-zinc-50 border-zinc-200'}`}>
                <div className={`font-semibold text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5 ${darkMode ? 'text-zinc-500' : 'text-zinc-600'}`}><AlignLeft size={14} /> {isSemi ? 'Voiceover' : 'Dialogue'}</div>
                <p className={`leading-relaxed text-[14px] whitespace-pre-wrap ${darkMode ? 'text-zinc-200' : 'text-zinc-900'}`}>{activeGenModal.textToGen || "Không có lời thoại (Chỉ lấy Video gốc)"}</p>
              </div>
            </div>
            <div className={`flex justify-end gap-3 pt-5 mt-6 border-t shrink-0 ${darkMode ? 'border-white/10' : 'border-zinc-200'}`}>
              <button onClick={() => setActiveGenModal(null)} className={`h-10 px-6 rounded-xl font-medium cursor-pointer transition-colors ${darkMode ? 'bg-transparent hover:bg-white/5 text-zinc-300' : 'bg-transparent hover:bg-zinc-100 text-zinc-700'}`}>Hủy bỏ</button>
              <button onClick={() => { setActiveGenModal(null); handleGenAudio(activeGenModal.scene_n, activeGenModal.textToGen); }} className="h-10 px-6 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold cursor-pointer shadow-md transition-colors flex items-center gap-2"><Mic size={16}/> Xác nhận Gen</button>
            </div>
          </div>
        </div>
      )}
      
      {/* 🚀 MODAL: SINGLE MERGE */}
      {activeMergeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className={`border rounded-2xl w-full max-w-sm p-7 shadow-2xl flex flex-col items-center relative animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-[#121214] border-white/10' : 'bg-white border-zinc-200'}`}>
            <button onClick={() => setActiveMergeModal(null)} className={`absolute top-5 right-5 cursor-pointer transition-colors ${darkMode ? 'text-zinc-500 hover:text-white' : 'text-zinc-500 hover:text-black'}`}><X size={20} /></button>
            <h3 className={`text-lg font-bold mb-5 flex items-center ${darkMode ? 'text-zinc-100' : 'text-black'}`}><Merge className="mr-2 text-blue-500" /> Merge - Scene {activeMergeModal.scene_n}</h3>
            <div className={`w-full border p-5 rounded-xl mb-6 text-left shadow-inner ${darkMode ? 'bg-[#0A0A0C] border-[#2A2A30]' : 'bg-zinc-50 border-zinc-200'}`}>
              <div className="flex justify-between items-center mb-3">
                <span className={`font-semibold text-sm ${darkMode ? 'text-zinc-300' : 'text-zinc-800'}`}>Âm lượng gốc</span>
                <span className="text-blue-600 font-mono font-bold bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">{(singleMixVol / 100).toFixed(2)}</span>
              </div>
              <input type="range" min="0" max="100" value={singleMixVol} onChange={(e) => setSingleMixVol(e.target.value)} className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-600 ${darkMode ? 'bg-[#2A2A30]' : 'bg-zinc-300'}`} />
            </div>
            <div className="flex w-full gap-3">
              <button onClick={() => setActiveMergeModal(null)} className={`flex-1 py-3 rounded-xl font-bold border transition-colors cursor-pointer ${darkMode ? 'text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border-[#2A2A30]' : 'text-zinc-700 hover:text-black bg-zinc-50 hover:bg-zinc-100 border-zinc-300'}`}>Hủy</button>
              <button onClick={handleSingleSceneMergeConfirm} className="flex-1 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors cursor-pointer shadow-md">Tiến hành</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}