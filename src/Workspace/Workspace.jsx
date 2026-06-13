import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, updateProjectProgress, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from '../firebase.js';
import { fetchFile } from '@ffmpeg/util';
import { FileText, AlignLeft, Mic, Merge, LayoutDashboard, Sliders, X, CheckSquare, Square, Download, Upload, Trash2, Loader2, Pencil, Save, Music, Users, Film, Play, Clock, Maximize, Video, Globe } from 'lucide-react';

import SetupTab from './SetupTab';
import StoryboardTab from './StoryboardTab';

export default function Workspace({ ffmpeg, isFfmpegReady }) { 
  const { projectId } = useParams(); 
  const location = useLocation();

  const [activeTab, setActiveTab] = useState('storyboard'); 
  const [projectName, setProjectName] = useState("Dự án chưa đặt tên");
  const [projectType, setProjectType] = useState("full-ai"); 
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  
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
  
  // 🚀 Bổ sung Ref để SetupTab có thể bấm tải Voice nhân vật
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

  // 🚀 Hàm hứng sự kiện tải Voice riêng cho nhân vật
  const handleCharVoiceUpload = (e) => {
    const file = e.target.files[0];
    const charId = activeUploadIdRef.current;
    if (!file || !charId) return;
    const tempUrl = URL.createObjectURL(file);
    setProjectCharacters(prev => prev.map(c => c.id === charId ? { ...c, voiceUrl: tempUrl, voiceFileName: file.name } : c));
    e.target.value = null; // reset
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
          await ffmpeg.writeFile(inVid, new Uint8Array(await (await fetch(videoUrl)).arrayBuffer()));
          await ffmpeg.writeFile(inAud, new Uint8Array(await (await fetch(aiAudioUrl)).arrayBuffer()));
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
        const formData = new FormData();
        formData.append('file', outBlob);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        formData.append('resource_type', 'video');

        try {
          const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, { method: 'POST', body: formData });
          const uploadDataRes = await uploadRes.json();
          if (uploadDataRes.secure_url) finalUrl = uploadDataRes.secure_url;
        } catch(err) { finalUrl = URL.createObjectURL(outBlob); }
        
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
      setVoiceCloneRefText("Đang tải lên Cloudinary..."); 
      const formData = new FormData(); formData.append('file', file); formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET); formData.append('resource_type', 'auto');
      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`, { method: 'POST', body: formData });
      const uploadDataRes = await uploadRes.json();
      const audioCloudUrl = uploadDataRes.secure_url; setVoiceCloneBase64(audioCloudUrl);

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
        if (url.includes('cloudinary.com')) {
          const downloadUrl = url.replace('/upload/', `/upload/fl_attachment:${filename.replace(/\.[^/.]+$/, "")}/`);
          const a = document.createElement('a'); a.href = downloadUrl; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); return;
        }
        const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      } catch (error) { console.error(error); }
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

  // 🚀 TÍNH TOÁN DATA STATS BANNER
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

  if (isDataLoading) return <div className="flex h-screen items-center justify-center bg-[#0E0E10] text-blue-400 font-bold"><Loader2 className="animate-spin mr-2"/> Đang tải Workspace...</div>;

  return (
    <div className="h-screen w-full bg-[#09090B] font-sans text-gray-200 p-4 lg:p-6 overflow-y-auto relative custom-scrollbar">
      
      <div className="fixed left-6 top-24 bottom-6 bg-[#121214] border border-[#2A2A30] rounded-2xl p-5 shadow-2xl z-20 flex flex-col gap-4 w-[280px] hidden xl:flex">
        <div className="flex items-center justify-between border-b border-[#2A2A30] pb-3 shrink-0">
          <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm"><FileText size={16} className="text-blue-400" /> Kịch bản gốc</div>
          {originalScript && !isEditingScript && <button onClick={() => setIsEditingScript(true)} className="text-zinc-500 hover:text-blue-400 text-xs font-medium cursor-pointer">Chỉnh sửa</button>}
        </div>
        {(!originalScript || isEditingScript) ? (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <textarea value={originalScript} onChange={(e) => setOriginalScript(e.target.value)} placeholder="Paste kịch bản..." className="flex-1 bg-[#0A0A0C] border border-[#2A2A30] rounded-xl p-3.5 text-sm custom-scrollbar focus:outline-none focus:border-blue-500" />
            <button onClick={() => { updateProjectProgress(projectId, { originalScript: originalScript.trim() }); setIsEditingScript(false); }} className="w-full h-10 bg-white text-black hover:bg-zinc-200 font-bold text-sm rounded-xl cursor-pointer">Lưu kịch bản</button>
          </div>
        ) : ( <div className="flex-1 overflow-y-auto pr-2 text-zinc-400 text-[13px] leading-relaxed whitespace-pre-wrap font-mono custom-scrollbar">{originalScript}</div> )}
      </div>

      <input type="file" accept="image/*" ref={frameInputRef} className="hidden" onChange={handleStartFrameUpload} />
      <input type="file" accept="image/*" ref={avatarInputRef} className="hidden" onChange={handleAvatarUpload} />
      {/* 🚀 Input phụ trách Upload File Voice Nhân Vật riêng */}
      <input type="file" accept="audio/*" ref={charVoiceInputRef} className="hidden" onChange={handleCharVoiceUpload} />

      <div className="flex flex-col gap-6 w-full pb-20 px-4 xl:pl-[310px] xl:pr-[290px]">
        <div className="flex items-center justify-between pb-2 border-b border-[#2A2A30]">
          {isEditingProjectName ? (
            <div className="flex items-center gap-3">
              <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveProjectName()} className="bg-transparent border-b-2 border-blue-500 px-1 py-1.5 text-2xl font-bold text-white focus:outline-none min-w-[300px]" autoFocus />
              <button onClick={handleSaveProjectName} className="flex items-center gap-1.5 text-sm bg-white hover:bg-zinc-200 text-black px-4 py-2 rounded-lg font-bold"><Save size={16} /> Lưu</button>
            </div>
          ) : (
            <div className="flex items-center gap-3 group">
              <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">{projectName}</h1>
              <button onClick={() => setIsEditingProjectName(true)} className="text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 bg-white/5 p-1.5 rounded-md"><Pencil size={16} /></button>
            </div>
          )}
          <div className="flex bg-[#121214] border border-[#2A2A30] rounded-lg p-1 shadow-inner">
              <button onClick={() => setActiveTab('storyboard')} className={`flex items-center gap-2 px-5 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'storyboard' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200'}`}><Film size={16}/> Storyboard</button>
              {!isSemi && (
                <button onClick={() => setActiveTab('setup')} className={`flex items-center gap-2 px-5 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'setup' ? 'bg-purple-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200'}`}><Users size={16}/> Setup Nhân vật</button>
              )}
          </div>
        </div>

        {/* 🚀 BẢNG THỐNG KÊ (Khôi phục toàn bộ Data cũ) */}
        <div className="bg-[#121214] border border-[#2A2A30] rounded-2xl p-6 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-transparent opacity-30"></div>
          <div className="flex items-center gap-2 text-zinc-400 font-semibold text-xs uppercase tracking-widest mb-6"><LayoutDashboard size={14} /> Thống kê dự án</div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-6 text-left">
            <div><div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-1">Total Scene</div><div className="text-2xl font-bold text-zinc-100">{totalScenes}</div></div>
            <div><div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-1">Total Voice</div><div className="text-2xl font-bold text-blue-400">{totalVoice}</div></div>
            {isSemi && (
              <div><div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-1">Avg Duration</div><div className="text-2xl font-bold text-green-400">{avgDuration}</div></div>
            )}
            <div><div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-1">Est Cost</div><div className="text-2xl font-bold text-yellow-500">{estCost}</div></div>
            <div><div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-1">Audio Gen</div><div className="text-xl font-semibold text-purple-400 mt-1">{Object.keys(generatedAudios).length} <span className="text-sm text-zinc-600">/ {totalVoice}</span></div></div>
            <div><div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-1">Video Gen</div><div className="text-xl font-semibold text-orange-400 mt-1">{Object.keys(mergedVideos).length} <span className="text-sm text-zinc-600">/ {totalScenes}</span></div></div>
          </div>
        </div>

        {activeTab === 'setup' && !isSemi && <SetupTab projectCharacters={projectCharacters} setProjectCharacters={setProjectCharacters} parsedData={parsedData} setParsedData={setParsedData} handleDeleteCharacter={handleDeleteCharacter} avatarInputRef={avatarInputRef} charVoiceInputRef={charVoiceInputRef} activeUploadIdRef={activeUploadIdRef} />}
        {activeTab === 'storyboard' && <StoryboardTab parsedData={parsedData} generatedAudios={generatedAudios} isGenerating={isGenerating} mergingScenes={mergingScenes} mergedVideos={mergedVideos} setActiveEditSceneModal={setActiveEditSceneModal} frameInputRef={frameInputRef} activeUploadIdRef={activeUploadIdRef} setActiveGenModal={setActiveGenModal} handleDeleteScene={handleDeleteScene} globalMixVol={globalMixVol} setSingleMixVol={setSingleMixVol} setActiveMergeModal={setActiveMergeModal} forceDownloadVideo={forceDownloadVideo} projectType={projectType} />}
      </div>

      <div className="fixed right-6 top-24 bottom-6 bg-[#121214] border border-[#2A2A30] rounded-2xl p-5 shadow-2xl z-20 flex flex-col gap-5 w-[260px] hidden xl:flex overflow-y-auto custom-scrollbar">
        <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm border-b border-[#2A2A30] pb-3"><Sliders size={16} className="text-purple-400" /> Bảng điều khiển</div>
        <div className="flex flex-col gap-2.5">
          <button onClick={() => setIsMergeModalOpen(true)} className="w-full h-10 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg"><Merge size={16} /> Batch Merge All</button>
          <button onClick={() => setIsExportModalOpen(true)} className="w-full h-10 bg-[#0A0A0C] border border-[#2A2A30] hover:border-white/20 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"><Download size={16} /> Export Output</button>
        </div>
        <div className="w-full h-[1px] bg-[#2A2A30] my-1"></div>
        <button onClick={() => setIsModalOpen(true)} className="w-full h-10 bg-white text-black hover:bg-zinc-200 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg"><Music size={16} /> Batch Gen Audio</button>
        
        <div className="bg-[#0A0A0C] border border-[#2A2A30] rounded-xl p-4 flex flex-col gap-3">
          <div className="text-[12px] font-bold text-zinc-300 flex justify-between items-center">Global Voice Clone {voiceCloneFile && (<button onClick={handleRemoveVoice} className="text-red-400 hover:text-red-300 bg-red-400/10 p-1.5 rounded"><Trash2 size={14} /></button>)}</div>
          <input type="file" accept="audio/mp3,audio/wav" ref={fileInputRef} onChange={handleVoiceUpload} className="hidden" />
          {!voiceCloneFile ? (
            <button onClick={() => fileInputRef.current.click()} className="w-full h-10 border border-dashed border-[#2A2A30] hover:border-purple-400 text-zinc-400 hover:text-purple-400 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"><Upload size={16} /> Tải file MP3</button>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="text-[11px] text-zinc-400 truncate">{voiceCloneFile.name}</div>
              <audio src={voiceCloneUrl} crossOrigin="anonymous" controls className="w-full h-8 custom-audio" />
              <div className="relative">
                <input type="text" value={voiceCloneRefText} onChange={(e) => setVoiceCloneRefText(e.target.value)} disabled={isTranscribing} className={`w-full h-10 px-3 bg-[#121214] border border-[#2A2A30] focus:border-purple-500 focus:outline-none rounded-xl text-sm text-zinc-200 ${isTranscribing ? 'opacity-50' : ''}`} placeholder="Nhập Text mẫu..." />
                {isTranscribing && <Loader2 size={16} className="absolute right-3 top-3 animate-spin text-purple-400" />}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL SỬA SCENE CHÍNH */}
      {activeEditSceneModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#121214] border border-[#2A2A30] p-7 rounded-2xl w-full max-w-2xl flex flex-col max-h-[90vh] shadow-2xl relative">
            <button onClick={() => setActiveEditSceneModal(null)} className="absolute top-5 right-5 text-gray-500 hover:text-white cursor-pointer"><X size={20}/></button>
            <h2 className="text-xl font-bold text-white mb-6 border-b border-[#2A2A30] pb-4 flex items-center gap-2">Sửa thông tin - Scene {activeEditSceneModal.scene_n}</h2>
            <div className="flex flex-col gap-5 overflow-y-auto pr-2 custom-scrollbar">
              {isSemi ? (
                <>
                  <div className="flex flex-col gap-2"><label className="text-sm font-bold text-blue-400">Footage (Cảnh quay)</label><textarea value={activeEditSceneModal.Footage || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Footage: e.target.value})} className="w-full bg-[#0A0A0C] border border-[#2A2A30] rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500 h-24 resize-none custom-scrollbar" /></div>
                  <div className="flex flex-col gap-2"><label className="text-sm font-bold text-white">Voiceover (Lời thoại)</label><textarea value={activeEditSceneModal.Voiceover || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Voiceover: e.target.value})} className="w-full bg-[#0A0A0C] border border-[#2A2A30] rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-gray-500 h-24 resize-none custom-scrollbar" /></div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-2"><label className="text-sm font-bold text-purple-400">Context (Bối cảnh)</label><textarea value={activeEditSceneModal.Context || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Context: e.target.value})} className="w-full bg-[#0A0A0C] border border-[#2A2A30] rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-purple-500 h-20 resize-none custom-scrollbar" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2"><label className="text-sm font-bold text-green-400">Camera (Góc máy)</label><textarea value={activeEditSceneModal.Camera || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Camera: e.target.value})} className="w-full bg-[#0A0A0C] border border-[#2A2A30] rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-green-500 h-20 resize-none custom-scrollbar" /></div>
                    <div className="flex flex-col gap-2"><label className="text-sm font-bold text-orange-400">Action (Hành động)</label><textarea value={activeEditSceneModal.Action || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Action: e.target.value})} className="w-full bg-[#0A0A0C] border border-[#2A2A30] rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-orange-500 h-20 resize-none custom-scrollbar" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2"><label className="text-sm font-bold text-blue-400">Character (Nhân vật)</label><input type="text" value={activeEditSceneModal.Character || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Character: e.target.value})} className="w-full bg-[#0A0A0C] border border-[#2A2A30] rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500" /></div>
                    <div className="flex flex-col gap-2"><label className="text-sm font-bold text-blue-400">Tone (Giọng điệu)</label><input type="text" value={activeEditSceneModal.Tone_of_Voice || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Tone_of_Voice: e.target.value})} className="w-full bg-[#0A0A0C] border border-[#2A2A30] rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500" /></div>
                  </div>
                  <div className="flex flex-col gap-2"><label className="text-sm font-bold text-white">Dialogue (Thoại)</label><textarea value={activeEditSceneModal.Dialogue || activeEditSceneModal.Voiceover || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Dialogue: e.target.value, Voiceover: e.target.value})} className="w-full bg-[#0A0A0C] border border-[#2A2A30] rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-gray-500 h-24 resize-none custom-scrollbar" /></div>
                </>
              )}
              <div className="flex flex-col gap-2"><label className="text-sm font-bold text-gray-400">Translate (Bản dịch)</label><textarea value={activeEditSceneModal.Translate || ''} onChange={(e) => setActiveEditSceneModal({...activeEditSceneModal, Translate: e.target.value})} className="w-full bg-[#0A0A0C] border border-[#2A2A30] rounded-xl p-3 text-sm text-gray-400 focus:outline-none focus:border-gray-500 h-16 resize-none custom-scrollbar" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-[#2A2A30] shrink-0">
              <button onClick={() => setActiveEditSceneModal(null)} className="h-10 px-6 rounded-xl font-bold text-gray-400 hover:text-white bg-transparent hover:bg-white/5 cursor-pointer transition-colors">Hủy</button>
              <button onClick={handleSaveSceneEdit} className="h-10 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold cursor-pointer transition-colors">Lưu thay đổi</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BATCH GEN AUDIO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#121214] border border-[#2A2A30] rounded-2xl w-full max-w-2xl flex flex-col max-h-[85vh] shadow-2xl relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white cursor-pointer"><X size={20}/></button>
            <div className="p-6 border-b border-[#2A2A30] shrink-0">
              <h2 className="text-xl font-bold text-white flex items-center gap-2"><Music className="text-blue-400"/> Batch Gen Audio</h2>
            </div>
            <div className="px-6 py-3 border-b border-[#2A2A30] flex gap-3 shrink-0 bg-[#0A0A0C]">
              <button onClick={() => { const all = {}; filteredScenesForAudio.forEach(s => { if(!generatedAudios[s.scene_n]) all[s.scene_n] = true; }); setCheckedScenes(all); }} className="px-4 py-1.5 text-xs font-bold bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white rounded-lg cursor-pointer transition-colors">Chọn tất cả</button>
              <button onClick={() => setCheckedScenes({})} className="px-4 py-1.5 text-xs font-bold bg-[#121214] border border-[#2A2A30] text-gray-400 hover:text-white rounded-lg cursor-pointer transition-colors">Bỏ chọn</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              <div className="flex flex-col">
                {filteredScenesForAudio.length === 0 ? (
                    <div className="text-center text-zinc-500 py-10 text-sm">Không có cảnh nào chứa lời thoại.</div>
                ) : (
                    filteredScenesForAudio.map((scene) => (
                      <div key={scene.scene_n} onClick={() => setCheckedScenes(prev => ({ ...prev, [scene.scene_n]: !prev[scene.scene_n] }))} className={`flex items-start gap-4 p-4 border-b border-[#2A2A30] cursor-pointer transition-colors ${checkedScenes[scene.scene_n] ? 'bg-blue-900/10' : 'hover:bg-white/5'}`}>
                        <div className="mt-1 shrink-0">{checkedScenes[scene.scene_n] ? <CheckSquare className="text-blue-500" size={20} /> : <Square className="text-gray-600" size={20} />}</div>
                        <div className="flex-1 min-w-0 text-sm space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-200">Scene {scene.scene_n}</span>
                            {generatedAudios[scene.scene_n] && <span className="text-[10px] font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">Đã có Audio</span>}
                          </div>
                          <div className="text-zinc-400 truncate leading-relaxed">{isSemi ? 'Voiceover: ' : 'Dialogue: '} {getTextToGen(scene)}</div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
            <div className="p-6 border-t border-[#2A2A30] shrink-0">
              <button onClick={handleStartBatchGen} className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold cursor-pointer transition-colors"><Mic size={18} className="inline mr-2"/> Bắt đầu Gen</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BATCH MERGE ALL */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#121214] border border-[#2A2A30] rounded-2xl w-full max-w-2xl flex flex-col max-h-[85vh] shadow-2xl relative">
            <button onClick={() => !isMerging && setIsMergeModalOpen(false)} className="absolute top-5 right-5 text-gray-500 hover:text-white cursor-pointer"><X size={20}/></button>
            <div className="p-6 border-b border-[#2A2A30] shrink-0"><h2 className="text-xl font-bold text-white flex items-center gap-2"><Merge className="text-purple-400"/> Batch Merge Video</h2></div>
            <div className="px-6 py-5 bg-[#0A0A0C] border-b border-[#2A2A30]">
              <div className="flex justify-between items-center mb-3"><span className="font-semibold text-zinc-200 text-sm">Âm lượng video gốc (mix)</span><span className="text-purple-400 font-mono font-bold bg-purple-500/10 px-2.5 py-1 rounded-md border border-purple-500/20">{(globalMixVol / 100).toFixed(2)}</span></div>
              <input type="range" min="0" max="100" value={globalMixVol} onChange={(e) => setGlobalMixVol(e.target.value)} disabled={isMerging} className="w-full h-1.5 bg-[#2A2A30] rounded-lg cursor-pointer accent-purple-500" />
            </div>
            <div className="px-6 py-3 border-b border-[#2A2A30] flex gap-3 shrink-0 bg-[#0A0A0C]">
              <button onClick={() => { const all = {}; parsedData.forEach(s => { if(s.videoUrl || s.startFrameUrl) all[s.scene_n] = true; }); setCheckedMergeScenes(all); }} disabled={isMerging} className="px-4 py-1.5 text-xs font-bold bg-purple-600/20 text-purple-400 hover:bg-purple-600 hover:text-white rounded-lg cursor-pointer transition-colors">Chọn tất cả (có Video/Ảnh)</button>
              <button onClick={() => setCheckedMergeScenes({})} disabled={isMerging} className="px-4 py-1.5 text-xs font-bold bg-[#121214] border border-[#2A2A30] text-gray-400 hover:text-white rounded-lg cursor-pointer transition-colors">Bỏ chọn</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              <div className="flex flex-col">
                {parsedData.map((scene) => {
                  const isEligible = (scene.videoUrl || scene.startFrameUrl);
                  const isChecked = !!checkedMergeScenes[scene.scene_n];
                  return (
                    <div key={scene.scene_n} onClick={() => !isMerging && isEligible && setCheckedMergeScenes(prev => ({ ...prev, [scene.scene_n]: !prev[scene.scene_n] }))} className={`flex items-center gap-4 p-4 border-b border-[#2A2A30] transition-colors select-none ${!isEligible ? 'opacity-50 cursor-not-allowed bg-black/20' : (isChecked ? 'bg-purple-500/10' : 'hover:bg-white/5 cursor-pointer')} ${isMerging ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <div className="shrink-0">{isChecked ? <CheckSquare className="text-purple-500" size={20} /> : <Square className="text-gray-600" size={20} />}</div>
                      <div className="flex-1 min-w-0 text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-bold ${isChecked ? 'text-purple-400' : 'text-zinc-200'}`}>Scene {scene.scene_n}</span>
                          {!isEligible && <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">Thiếu Input</span>}
                        </div>
                        <div className="text-xs text-zinc-500">{generatedAudios[scene.scene_n] ? 'Âm thanh: Có AI Audio + Nhạc nền' : 'Âm thanh: Chỉ lấy âm thanh Video gốc'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="p-6 border-t border-[#2A2A30] shrink-0">
              <button onClick={handleStartMerge} disabled={isMerging || Object.keys(checkedMergeScenes).filter(k => checkedMergeScenes[k]).length === 0} className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded-xl font-bold cursor-pointer flex items-center justify-center gap-2 transition-colors">
                {isMerging ? <Loader2 size={16} className="animate-spin" /> : <Merge size={16} />} {isMerging ? 'Đang xử lý...' : `Bắt đầu Merge`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EXPORT OUTPUT */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#121214] border border-[#2A2A30] rounded-2xl w-full max-w-2xl flex flex-col max-h-[85vh] shadow-2xl relative">
            <button onClick={() => setIsExportModalOpen(false)} className="absolute top-5 right-5 text-gray-500 hover:text-white cursor-pointer"><X size={20}/></button>
            <div className="p-6 border-b border-[#2A2A30] shrink-0">
              <h2 className="text-xl font-bold text-white flex items-center gap-2"><Download className="text-green-400"/> Export Batch</h2>
            </div>
            
            {Object.keys(mergedVideos).length === 0 ? (
               <div className="flex-1 flex items-center justify-center text-center text-zinc-500 py-16 text-sm">
                 Chưa có video Output nào được tạo.<br/>Bạn hãy chạy "Batch Merge" trước nhé!
               </div>
            ) : (
               <>
                  <div className="px-6 py-3 border-b border-[#2A2A30] flex gap-3 shrink-0 bg-[#0A0A0C]">
                    <button onClick={() => { const all = {}; parsedData.forEach(s => { if(mergedVideos[s.scene_n]) all[s.scene_n] = true; }); setCheckedExportScenes(all); }} className="px-4 py-1.5 text-xs font-bold bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white rounded-lg cursor-pointer transition-colors">Chọn tất cả</button>
                    <button onClick={() => setCheckedExportScenes({})} className="px-4 py-1.5 text-xs font-bold bg-[#121214] border border-[#2A2A30] text-gray-400 hover:text-white rounded-lg cursor-pointer transition-colors">Bỏ chọn</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                    <div className="flex flex-col">
                      {parsedData.filter(scene => mergedVideos[scene.scene_n]).map((scene) => {
                        const isChecked = !!checkedExportScenes[scene.scene_n];
                        return (
                          <div key={scene.scene_n} onClick={() => setCheckedExportScenes(prev => ({ ...prev, [scene.scene_n]: !prev[scene.scene_n] }))} className={`flex items-center gap-4 p-4 border-b border-[#2A2A30] cursor-pointer transition-colors ${isChecked ? 'bg-green-900/10' : 'hover:bg-white/5'}`}>
                            <div className="shrink-0">{isChecked ? <CheckSquare className="text-green-500" size={20} /> : <Square className="text-gray-600" size={20} />}</div>
                            <div className="flex-1 min-w-0 text-sm space-y-1">
                              <div className={`font-bold ${isChecked ? 'text-green-400' : 'text-zinc-200'}`}>Scene {scene.scene_n} Output.mp4</div>
                              <div className="text-xs text-zinc-500">{generatedAudios[scene.scene_n] ? 'Âm thanh: Có AI Audio' : 'Âm thanh: Chỉ Video gốc'}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="p-6 border-t border-[#2A2A30] shrink-0">
                    <button onClick={handleDownloadVideos} disabled={Object.keys(checkedExportScenes).filter(k => checkedExportScenes[k]).length === 0} className="w-full py-3.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded-xl font-bold cursor-pointer flex items-center justify-center gap-2 transition-colors"><Download size={18}/> Tải xuống Video</button>
                  </div>
               </>
            )}
          </div>
        </div>
      )}
      
      {/* MODAL GEN AUDIO LẺ VÀ ĐÓNG LUÔN */}
      {activeGenModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#121214] border border-[#2A2A30] rounded-2xl w-full max-w-md p-7 shadow-2xl relative">
            <button onClick={() => setActiveGenModal(null)} className="absolute top-5 right-5 text-zinc-500 hover:text-white cursor-pointer transition-colors"><X size={20} /></button>
            <h3 className="text-lg font-bold border-b border-[#2A2A30] pb-4 text-zinc-100 flex items-center gap-2"><Mic size={20} className="text-blue-400" /> Audio - Scene {activeGenModal.scene_n}</h3>
            <div className="mt-6 space-y-5">
              <div className="bg-[#0A0A0C] border border-[#2A2A30] rounded-xl p-5 shadow-inner">
                <div className="text-zinc-500 font-semibold text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5"><AlignLeft size={14} /> {isSemi ? 'Voiceover' : 'Dialogue'}</div>
                <p className="text-zinc-200 leading-relaxed text-[14px] whitespace-pre-wrap">{activeGenModal.textToGen || "Không có lời thoại (Chỉ lấy Video gốc)"}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-5 mt-6 border-t border-[#2A2A30] shrink-0">
              <button onClick={() => setActiveGenModal(null)} className="h-10 px-6 bg-transparent hover:bg-white/5 text-zinc-300 rounded-xl font-medium cursor-pointer transition-colors">Hủy bỏ</button>
              <button onClick={() => { setActiveGenModal(null); handleGenAudio(activeGenModal.scene_n, activeGenModal.textToGen); }} className="h-10 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold cursor-pointer transition-colors flex items-center gap-2"><Mic size={16}/> Xác nhận Gen</button>
            </div>
          </div>
        </div>
      )}
      
      {/* MODAL XÁC NHẬN MERGE LẺ */}
      {activeMergeModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#121214] border border-[#2A2A30] rounded-2xl w-full max-w-sm p-7 shadow-2xl flex flex-col items-center relative">
            <button onClick={() => setActiveMergeModal(null)} className="absolute top-5 right-5 text-zinc-500 hover:text-white cursor-pointer"><X size={20} /></button>
            <h3 className="text-lg font-bold mb-4 text-zinc-100 flex items-center"><Merge className="mr-2 text-blue-500" /> Merge - Scene {activeMergeModal.scene_n}</h3>
            <div className="w-full bg-[#0A0A0C] border border-[#2A2A30] p-5 rounded-xl mb-6 text-left shadow-inner">
              <div className="flex justify-between items-center mb-3"><span className="font-semibold text-zinc-300 text-sm">Âm lượng gốc</span><span className="text-blue-400 font-mono font-bold bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">{(singleMixVol / 100).toFixed(2)}</span></div>
              <input type="range" min="0" max="100" value={singleMixVol} onChange={(e) => setSingleMixVol(e.target.value)} className="w-full h-1.5 bg-[#2A2A30] rounded-lg appearance-none cursor-pointer accent-blue-500" />
            </div>
            <div className="flex w-full gap-3">
              <button onClick={() => setActiveMergeModal(null)} className="flex-1 py-3 rounded-xl font-bold text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer border border-[#2A2A30]">Hủy</button>
              <button onClick={handleSingleSceneMergeConfirm} className="flex-1 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors cursor-pointer shadow-lg">Tiến hành</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}