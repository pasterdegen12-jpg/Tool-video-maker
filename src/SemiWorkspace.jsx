import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, updateProjectProgress, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from './firebase.js';
// 🚀 Đã thêm Pencil, Save vào import
import { FileText, Video, AlignLeft, Globe, Hash, Mic, Merge, LayoutDashboard, Sliders, X, CheckSquare, Square, Download, Upload, Trash2, Loader2, Play, Clock, Maximize, Pencil, Save, Music } from 'lucide-react';
export default function SemiWorkspace({ ffmpeg, isFfmpegReady }) { 
  const { projectId } = useParams();

  // 🚀 STATE ĐẶT TÊN DỰ ÁN
  const [projectName, setProjectName] = useState("Dự án chưa đặt tên");
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);

  const [parsedData, setParsedData] = useState([]); 
  const [originalScript, setOriginalScript] = useState(""); 
  const [isEditingScript, setIsEditingScript] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);

  // 🚀 STATE SỬA SCENE LẺ
  const [activeEditSceneModal, setActiveEditSceneModal] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkedScenes, setCheckedScenes] = useState({});
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [checkedExportScenes, setCheckedExportScenes] = useState({});

  const [voiceCloneUrl, setVoiceCloneUrl] = useState(null);
  const [voiceCloneFile, setVoiceCloneFile] = useState(null);
  const [voiceCloneBase64, setVoiceCloneBase64] = useState(null);
  const [voiceCloneRefText, setVoiceCloneRefText] = useState("");
  const [qwenEmbeddingUrl, setQwenEmbeddingUrl] = useState(null);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const fileInputRef = useRef(null);

  const [generatedAudios, setGeneratedAudios] = useState({});
  const [isGenerating, setIsGenerating] = useState({});

  const [activeGenModal, setActiveGenModal] = useState(null);

  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [checkedMergeScenes, setCheckedMergeScenes] = useState({});
  const [globalMixVol, setGlobalMixVol] = useState(35);

  const [isMerging, setIsMerging] = useState(false); 
  const [mergingScenes, setMergingScenes] = useState({}); 
  const [mergedVideos, setMergedVideos] = useState({});

  const [activeMergeModal, setActiveMergeModal] = useState(null);
  const [singleMixVol, setSingleMixVol] = useState(35);

  useEffect(() => {
    const fetchProjectData = async () => {
      if (!projectId) {
        setIsDataLoading(false);
        return;
      }
      try {
        const docRef = doc(db, 'projects', projectId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const projectInfo = docSnap.data();
          
          // 🚀 Load Tên Dự Án
          if (projectInfo.projectName) setProjectName(projectInfo.projectName);

          setParsedData(projectInfo.data || []);
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
        } else {
          alert("🚨 Dự án không tồn tại hoặc đã bị xóa!");
        }
      } catch (error) {
        console.error("Lỗi tải data dự án:", error);
      } finally {
        setIsDataLoading(false);
      }
    };
    fetchProjectData();
  }, [projectId]);

  // 🚀 HÀM LƯU TÊN DỰ ÁN
  const handleSaveProjectName = async () => {
    if (!projectName.trim()) return;
    setIsEditingProjectName(false);
    try {
      await updateProjectProgress(projectId, { projectName: projectName.trim() });
    } catch (error) {
      console.error("Lỗi lưu tên dự án:", error);
    }
  };

  // 🚀 HÀM LƯU NỘI DUNG SCENE ĐÃ SỬA
  const handleSaveSceneEdit = async () => {
    try {
      // Cập nhật state local
      const updatedData = parsedData.map(scene =>
          scene.scene_n === activeEditSceneModal.scene_n ? activeEditSceneModal : scene
      );
      setParsedData(updatedData);

      // Cập nhật Firebase
      await updateProjectProgress(projectId, { data: updatedData });

      setActiveEditSceneModal(null);
    } catch (error) {
      console.error("Lỗi khi lưu scene:", error);
      alert("Không thể lưu thay đổi: " + error.message);
    }
  };

  if (isDataLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0E0E10] text-blue-400 font-bold flex-col gap-3">
        <Loader2 className="animate-spin" size={40}/> 
        <span>Đang tải không gian làm việc...</span>
      </div>
    );
  }

  if (!parsedData || parsedData.length === 0) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0E0E10] text-gray-500 text-xs">
        Chưa có dữ liệu cảnh nào hoặc dự án rỗng. Vui lòng quay lại bước xử lý kịch bản.
      </div>
    );
  }

  const totalScenes = parsedData.length;
  const totalVoice = parsedData.filter(s => s.Voiceover && s.Voiceover.trim() !== '').length;
  
  // 🚀 1. SỬA LẠI: TÍNH THỜI GIAN TRUNG BÌNH DỰA TRÊN time_origin
  const parseToSeconds = (timeStr) => {
    if (!timeStr) return 0;
    const parts = String(timeStr).split(':');
    if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    if (parts.length === 3) return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
    return parseInt(timeStr, 10) || 0;
  };
  
  const totalSeconds = parsedData.reduce((acc, scene) => acc + parseToSeconds(scene.time_origin), 0);
  const avgSeconds = totalScenes > 0 ? Math.round(totalSeconds / totalScenes) : 0;
  const avgDuration = `${Math.floor(avgSeconds / 60).toString().padStart(2, '0')}:${(avgSeconds % 60).toString().padStart(2, '0')}`;

  // 🚀 2. SỬA LẠI: TÍNH CHI PHÍ ($0.09 cho mỗi scene có voice)
  const estCost = `$${(totalVoice * 0.09).toFixed(2)}`;

  const generatedCount = Object.keys(generatedAudios).length;
  const audioGenStatus = `${generatedCount} / ${totalVoice}`;


  const forceDownloadVideo = async (url, filename) => {
    try {
      if (url.includes('cloudinary.com')) {
        const downloadUrl = url.replace('/upload/', '/upload/fl_attachment/');
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      console.error("Lỗi khi tải video:", error);
    }
  };

  const toggleFullscreen = (e) => {
    const videoContainer = e.currentTarget.closest('.video-wrapper');
    const videoElement = videoContainer.querySelector('video');
    if (videoElement) {
      if (videoElement.requestFullscreen) videoElement.requestFullscreen();
      else if (videoElement.webkitRequestFullscreen) videoElement.webkitRequestFullscreen();
      else if (videoElement.msRequestFullscreen) videoElement.msRequestFullscreen();
    }
  };

  const handleGenAudio = async (sceneNo, scriptText) => {
    if (!scriptText || scriptText.trim() === '') return;
    setIsGenerating(prev => ({ ...prev, [sceneNo]: true }));

    try {
      let cleanText = scriptText
        .trim()
        .replace(/[\r\n]+/g, ' ')
        .replace(/["'”’“‘()[\]{}]/g, '')
        .replace(/\s+/g, ' ');

      if (!cleanText.match(/[.!?]$/)) cleanText += '.';
      
      const formattedText = cleanText;
      const isVoiceClone = !!qwenEmbeddingUrl;
      const endpoint = "https://queue.fal.run/fal-ai/qwen-3-tts/text-to-speech/1.7b";

      const payload = isVoiceClone 
        ? { text: formattedText, speaker_voice_embedding_file_url: qwenEmbeddingUrl, reference_text: voiceCloneRefText.trim() }
        : { text: formattedText, voice: "Vivian" };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Fal AI từ chối: ${JSON.stringify(errorData.detail || errorData)}`);
      }

      const queueData = await response.json();
      let result = null;

      if (queueData.status_url) {
        let attempts = 0;
        const maxAttempts = 150;
        let lastStatus = "IN_QUEUE";
        
        while (attempts < maxAttempts) {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 2000));
          const statusRes = await fetch(queueData.status_url, { method: "GET", headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}` } });
          const statusJson = await statusRes.json();
          lastStatus = statusJson.status;
          
          if (lastStatus === "COMPLETED") {
            const finalLink = statusJson.response_url || queueData.response_url;
            if (finalLink) {
                const finalRes = await fetch(finalLink, { method: "GET", headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}` } });
                result = await finalRes.json(); 
            } else {
                result = statusJson.payload || statusJson.data || statusJson;
            }
            break;
          } else if (lastStatus === "FAILED") {
            throw new Error(statusJson.error || "Lỗi xử lý AI từ server.");
          }
        }
        if (attempts >= maxAttempts) throw new Error(`Quá thời gian chờ API (Timeout 5 phút). Trạng thái: ${lastStatus}`);
      } else {
        result = queueData;
      }

      const audioUrl = result?.audio?.url || result?.audio_file?.url || result?.audio_url || result?.url ||
        (typeof result?.audio === 'string' ? result.audio : null) || (typeof result?.audio_file === 'string' ? result.audio_file : null);
        
      if (audioUrl) {
        const newAudios = { ...generatedAudios, [sceneNo]: audioUrl };
        setGeneratedAudios(newAudios);
        await updateProjectProgress(projectId, { generatedAudios: newAudios });
      } else {
          throw new Error(`Fal trả về Data lạ không có Audio URL.`);
      }
    } catch (error) {
      console.error(error);
      alert(`Lỗi Scene ${sceneNo}: ${error.message}`);
    } finally {
      setIsGenerating(prev => ({ ...prev, [sceneNo]: false }));
    }
  };

  const handleToggleCheck = (sceneNo) => setCheckedScenes(prev => ({ ...prev, [sceneNo]: !prev[sceneNo] }));
  const handleSelectAll = () => {
    const filtered = parsedData.filter(scene => !generatedAudios[scene.scene_n] && scene.Voiceover);
    const newChecked = {};
    filtered.forEach(scene => { newChecked[scene.scene_n] = true; });
    setCheckedScenes(newChecked);
  };
  const handleDeselectAll = () => setCheckedScenes({});

  const handleStartBatchGen = async () => {
    const selectedSceneNumbers = Object.keys(checkedScenes).filter(key => checkedScenes[key]);
    if (selectedSceneNumbers.length === 0) return alert("Vui lòng chọn ít nhất 1 scene để gen!");
    setIsModalOpen(false);

    const promises = selectedSceneNumbers.map(sceneNo => {
      const scene = parsedData.find(s => String(s.scene_n) === String(sceneNo));
      if (scene && scene.Voiceover) return handleGenAudio(scene.scene_n, scene.Voiceover);
      return Promise.resolve();
    });

    try { await Promise.all(promises); } 
    catch (error) { console.error("Lỗi Gen All:", error); } 
    finally { setCheckedScenes({}); }
  };

  const handleToggleExportCheck = (sceneNo) => setCheckedExportScenes(prev => ({ ...prev, [sceneNo]: !prev[sceneNo] }));
  const handleSelectAllExport = () => {
    const newChecked = {};
    parsedData.forEach(scene => { if (mergedVideos[scene.scene_n]) newChecked[scene.scene_n] = true; });
    setCheckedExportScenes(newChecked);
  };
  const handleDeselectAllExport = () => setCheckedExportScenes({});

  const handleDownloadVideos = async () => {
    const scenesToExport = parsedData.filter(scene => checkedExportScenes[scene.scene_n] && mergedVideos[scene.scene_n]);
    if (scenesToExport.length === 0) return alert("Vui lòng chọn ít nhất 1 Output để tải!");
    alert(`⏳ Đang chuẩn bị tải ${scenesToExport.length} video...`);
    setIsExportModalOpen(false); 
    
    for (let i = 0; i < scenesToExport.length; i++) {
      const scene = scenesToExport[i];
      const outputUrl = mergedVideos[scene.scene_n];
      if (!outputUrl) continue; 
      await forceDownloadVideo(outputUrl, `Scene_${scene.scene_n}_Output.mp4`);
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  };

  const handleToggleMergeCheck = (sceneNo) => setCheckedMergeScenes(prev => ({ ...prev, [sceneNo]: !prev[sceneNo] }));
  const handleSelectAllMerge = () => {
    const newChecked = {};
    parsedData.forEach(scene => { newChecked[scene.scene_n] = true; });
    setCheckedMergeScenes(newChecked);
  };
  const handleDeselectAllMerge = () => setCheckedMergeScenes({});

  const processMergeSingleScene = async (scene, volValue) => {
    const videoUrl = scene.videoUrl;
    const aiAudioUrl = generatedAudios[scene.scene_n];
    if (!videoUrl) return null;
    let finalUrl = null;
    
    if (!aiAudioUrl) {
      finalUrl = videoUrl;
    } else {
      const inVid = `vid_${scene.scene_n}.mp4`;
      const inAud = `aud_${scene.scene_n}.mp3`;
      const outName = `Scene_${scene.scene_n}_Merged.mp4`;
      
      await ffmpeg.writeFile(inVid, new Uint8Array(await (await fetch(videoUrl)).arrayBuffer()));
      await ffmpeg.writeFile(inAud, new Uint8Array(await (await fetch(aiAudioUrl)).arrayBuffer()));
      
      let exitCode = -1;
      if (volValue == 0) {
        try {
          exitCode = await ffmpeg.exec(['-i', inVid, '-i', inAud, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest', outName]);
        } catch (err) { exitCode = 1; }
      } else {
        const vol = volValue / 100;
        try {
          exitCode = await ffmpeg.exec([
            '-i', inVid, '-i', inAud,
            '-filter_complex', `[0:a]volume=${vol}[a1];[1:a]volume=1.0[a2];[a1][a2]amix=inputs=2:duration=shortest[aout]`,
            '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', outName
          ]);
        } catch (err) { exitCode = 1; }

        if (exitCode !== 0) {
          try {
            exitCode = await ffmpeg.exec(['-i', inVid, '-i', inAud, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest', outName]);
          } catch (err) {}
        }
      }

      if (exitCode === 0) {
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
          } catch(err) {
            finalUrl = URL.createObjectURL(outBlob);
          }
      }
      await ffmpeg.deleteFile(inVid);
      await ffmpeg.deleteFile(inAud);
      try { await ffmpeg.deleteFile(outName); } catch(e) {}
    }
    return finalUrl;
  };

  const handleStartMerge = async () => {
    const scenesToMerge = parsedData.filter(scene => checkedMergeScenes[scene.scene_n]);
    if (scenesToMerge.length === 0) return alert("Vui lòng chọn ít nhất 1 scene để Merge!");
    if (!ffmpeg || !isFfmpegReady) return alert("Hệ thống FFmpeg chưa sẵn sàng!");

    setIsMerging(true);
    for (let i = 0; i < scenesToMerge.length; i++) {
      const scene = scenesToMerge[i];
      try {
        const finalUrl = await processMergeSingleScene(scene, globalMixVol);
        if (finalUrl) {
          setMergedVideos(prev => {
             const newMergedVideos = { ...prev, [scene.scene_n]: finalUrl };
             updateProjectProgress(projectId, { mergedVideos: newMergedVideos });
             return newMergedVideos;
          });
        }
      } catch (error) { console.error(`Lỗi Merge Scene ${scene.scene_n}:`, error); }
    }
    setIsMerging(false);
    setIsMergeModalOpen(false);
    alert("✅ Đã xử lý xong Batch Merge!");
  };

  const handleSingleSceneMergeConfirm = async () => {
    const scene = activeMergeModal;
    setActiveMergeModal(null);

    if (!ffmpeg || !isFfmpegReady) return alert("Hệ thống FFmpeg chưa sẵn sàng!");
    if (!scene.videoUrl) return alert("Cảnh này chưa có video gốc!");
    
    setMergingScenes(prev => ({ ...prev, [scene.scene_n]: true }));
    try {
      const finalUrl = await processMergeSingleScene(scene, singleMixVol);
      if (finalUrl) {
        setMergedVideos(prev => {
            const newMergedVideos = { ...prev, [scene.scene_n]: finalUrl };
            updateProjectProgress(projectId, { mergedVideos: newMergedVideos });
            return newMergedVideos;
        });
      } else {
        throw new Error("Không thể tạo được video.");
      }
    } catch (error) {
      console.error(error);
      alert("Lỗi khi Merge cảnh " + scene.scene_n);
    } finally {
      setMergingScenes(prev => ({ ...prev, [scene.scene_n]: false }));
    }
  };

  const handleVoiceUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setVoiceCloneFile(file);
    setVoiceCloneUrl(URL.createObjectURL(file));
    setIsTranscribing(true);
    
    try {
      setVoiceCloneRefText("Đang tải lên server..."); 
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      formData.append('resource_type', 'auto');
      
      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`, { method: 'POST', body: formData });
      const uploadDataRes = await uploadRes.json();
      const audioCloudUrl = uploadDataRes.secure_url;
      setVoiceCloneBase64(audioCloudUrl);

      setVoiceCloneRefText("AI đang nhận diện Text...");
      const response = await fetch("https://fal.run/fal-ai/whisper", {
        method: "POST", headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ audio_url: audioCloudUrl }),
      });
      const result = await response.json();
      const refText = result.text ? result.text.trim() : "Không nhận diện được giọng.";

      setVoiceCloneRefText("Đang trích xuất Voice Clone...");
      const cloneRes = await fetch("https://queue.fal.run/fal-ai/qwen-3-tts/clone-voice/1.7b", {
        method: "POST", headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ audio_url: audioCloudUrl, reference_text: refText })
      });

      if (!cloneRes.ok) throw new Error("Lỗi gọi API Qwen Clone.");
      const cloneQueueData = await cloneRes.json();
      let embeddingUrl = null;

      if (cloneQueueData.status_url) {
        let attempts = 0;
        while (attempts < 60) {
          attempts++;
          await new Promise(r => setTimeout(r, 2000));
          const statusRes = await fetch(cloneQueueData.status_url, { headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}` }});
          const statusJson = await statusRes.json();
          
          if (statusJson.status === "COMPLETED") {
            const finalRes = await fetch(statusJson.response_url || cloneQueueData.response_url, { headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}` }});
            const finalData = await finalRes.json();
            embeddingUrl = finalData?.speaker_embedding?.url;
            break;
          } else if (statusJson.status === "FAILED") {
            throw new Error("Lỗi khi xử lý Qwen Clone Voice.");
          }
        }
      } else {
        embeddingUrl = cloneQueueData?.speaker_embedding?.url;
      }

      if (!embeddingUrl) throw new Error("Không lấy được embedding file.");

      setQwenEmbeddingUrl(embeddingUrl);
      setVoiceCloneRefText(refText || "Clone thành công!");

      await updateProjectProgress(projectId, { 
        voiceCloneBase64: audioCloudUrl, 
        voiceCloneRefText: refText,
        qwenEmbeddingUrl: embeddingUrl 
      });

    } catch (error) {
      console.error(error);
      setVoiceCloneRefText("Lỗi xử lý Clone. Hãy thử lại.");
    } finally { setIsTranscribing(false); }
  };

  const handleRemoveVoice = async () => {
    if (voiceCloneUrl && voiceCloneUrl.startsWith('blob:')) URL.revokeObjectURL(voiceCloneUrl);
    setVoiceCloneFile(null); 
    setVoiceCloneUrl(null); 
    setVoiceCloneBase64(null);
    setVoiceCloneRefText(""); 
    setQwenEmbeddingUrl(null); 
    setIsTranscribing(false);
    if (fileInputRef.current) fileInputRef.current.value = null;
    await updateProjectProgress(projectId, { voiceCloneBase64: null, voiceCloneRefText: "", qwenEmbeddingUrl: null });
  };

  const filteredScenesForAudio = parsedData.filter(scene => !generatedAudios[scene.scene_n] && (scene.Voiceover && scene.Voiceover.trim() !== ''));

  return (
    <div className="h-screen w-full bg-[#09090B] font-sans text-gray-200 p-4 lg:p-6 overflow-y-auto relative selection:bg-blue-500/30 custom-scrollbar">
      
      {/* 🚀 BẢNG KỊCH BẢN GỐC (LEFT PANEL - FLOATING GLASS) */}
      <div className="fixed left-6 top-24 bottom-6 bg-[#121214]/80 backdrop-blur-2xl border border-white/5 rounded-2xl p-5 shadow-2xl z-20 flex flex-col gap-4 w-[280px] hidden xl:flex transition-all">
        <div className="flex items-center justify-between border-b border-white/5 pb-3 shrink-0">
          <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
            <FileText size={16} className="text-blue-400" /> Kịch bản gốc
          </div>
          {originalScript && !isEditingScript && (
            <button onClick={() => setIsEditingScript(true)} className="text-zinc-500 hover:text-blue-400 text-xs font-medium cursor-pointer transition-colors">
              Chỉnh sửa
            </button>
          )}
        </div>
        
        {(!originalScript || isEditingScript) ? (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <textarea
              value={originalScript}
              onChange={(e) => setOriginalScript(e.target.value)}
              placeholder="Dự án cũ chưa có kịch bản gốc, hãy paste vào đây..."
              className="flex-1 bg-black/20 border border-white/10 rounded-xl p-3.5 text-sm text-zinc-300 focus:outline-none focus:border-blue-500/50 resize-none font-mono custom-scrollbar transition-all"
            />
            <button
              onClick={async () => {
                if (!originalScript || originalScript.trim() === '') return alert("Vui lòng nhập nội dung!");
                try {
                  await updateProjectProgress(projectId, { originalScript: originalScript.trim() });
                  setIsEditingScript(false);
                } catch (err) { alert("Lỗi: " + err.message); }
              }}
              className="w-full h-10 bg-white text-black hover:bg-zinc-200 font-bold text-sm rounded-xl cursor-pointer flex items-center justify-center shrink-0 transition-all shadow-md"
            >
              Lưu kịch bản
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 text-zinc-400 text-[13px] leading-relaxed whitespace-pre-wrap font-mono custom-scrollbar">
            {originalScript}
          </div>
        )}
      </div>

      {/* 🚀 KHU VỰC CHÍNH ĐƯỢC NỚI RỘNG */}
      <div className="flex flex-col gap-8 w-full max-w-[1100px] mx-auto pb-20 xl:pl-[310px] xl:pr-[290px]">
        
        {/* HEADER ĐẶT TÊN DỰ ÁN (Minimalist) */}
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div className="flex items-center gap-3">
            {isEditingProjectName ? (
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveProjectName()}
                  className="bg-transparent border-b-2 border-blue-500 px-1 py-1.5 text-2xl font-bold text-white focus:outline-none min-w-[300px]"
                  autoFocus
                />
                <button
                  onClick={handleSaveProjectName}
                  className="flex items-center gap-1.5 text-sm bg-white hover:bg-zinc-200 text-black px-4 py-2 rounded-lg font-bold transition-colors cursor-pointer"
                >
                  <Save size={16} /> Lưu
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 group">
                <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">{projectName}</h1>
                <button
                  onClick={() => setIsEditingProjectName(true)}
                  className="text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all cursor-pointer bg-white/5 p-1.5 rounded-md"
                  title="Đổi tên dự án"
                >
                  <Pencil size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* BẢNG TỔNG QUAN (Modern Stats Banner) */}
        <div className="bg-[#121214] border border-white/5 rounded-2xl p-6 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-transparent opacity-30"></div>
          <div className="flex items-center gap-2 text-zinc-400 font-semibold text-xs uppercase tracking-widest mb-6">
            <LayoutDashboard size={14} /> Thống kê dự án
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-6 text-left">
            <div>
              <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-1">Total Scene</div>
              <div className="text-2xl font-bold text-zinc-100">{totalScenes}</div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-1">Total Voice</div>
              <div className="text-2xl font-bold text-blue-400">{totalVoice}</div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-1">Avg Duration</div>
              <div className="text-2xl font-bold text-green-400">{avgDuration}</div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-1">Est Cost</div>
              <div className="text-2xl font-bold text-yellow-500">{estCost}</div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-1">Image Gen</div>
              <div className="text-xl font-semibold text-zinc-400 mt-1">0 <span className="text-sm text-zinc-600">/ {totalScenes}</span></div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-1">Audio Gen</div>
              <div className="text-xl font-semibold text-purple-400 mt-1">{audioGenStatus}</div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-1">Video Gen</div>
              <div className="text-xl font-semibold text-orange-400 mt-1">0 <span className="text-sm text-zinc-600">/ {totalScenes}</span></div>
            </div>
          </div>
        </div>

        {/* DANH SÁCH SCENE */}
        <div className="flex flex-col gap-6">
          {parsedData.map((scene, index) => {
            const isLoadingAudio = isGenerating[scene.scene_n];
            const isMergingThisScene = mergingScenes[scene.scene_n];
            const hasAudio = generatedAudios[scene.scene_n];
            const hasOutput = mergedVideos[scene.scene_n];

            return (
              <div key={index} className="flex flex-col md:flex-row gap-8 bg-[#121214] hover:bg-[#18181b] p-6 rounded-2xl border border-white/5 hover:border-white/10 shadow-xl transition-all duration-300 group">
                
                {/* CỘT VIDEO */}
                <div className="w-full md:w-[260px] flex flex-col gap-4 shrink-0">
                  <div className="flex flex-col bg-black/40 rounded-xl p-2 border border-white/5 shadow-inner video-wrapper">
                    <div className="flex items-center justify-between pb-2 mb-2 px-1 border-b border-white/5">
                      <div className="flex items-center gap-1.5 text-zinc-300">
                        <Video size={14} className="text-blue-400" /> 
                        <span className="text-[11px] font-bold uppercase tracking-widest">Input</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-500">
                        <button onClick={toggleFullscreen} className="hover:text-white transition-colors cursor-pointer" title="Phóng to video"><Maximize size={12} /></button>
                        <span className="text-[11px] font-medium bg-white/5 px-2 py-0.5 rounded-full">S_{scene.scene_n}</span>
                      </div>
                    </div>
                    <div className="w-full aspect-video bg-black/50 rounded-lg overflow-hidden flex items-center justify-center relative">
                      {scene.videoUrl ? (
                        <video src={scene.videoUrl} crossOrigin="anonymous" controls className="w-full h-full object-contain" />
                      ) : (
                        <div className="text-center flex flex-col items-center gap-2 opacity-30"><Video size={20} className="text-zinc-500" /></div>
                      )}
                    </div>
                  </div>

                  {hasOutput && (
                    <div className="flex flex-col bg-black/40 rounded-xl p-2 border border-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.05)] video-wrapper relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-green-500 to-transparent opacity-50"></div>
                      <div className="flex items-center justify-between pb-2 mb-2 px-1 border-b border-white/5">
                        <div className="flex items-center gap-1.5 text-green-400">
                          <CheckSquare size={14} /> 
                          <span className="text-[11px] font-bold uppercase tracking-widest">Output</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={toggleFullscreen} className="hover:text-white transition-colors cursor-pointer text-zinc-500" title="Phóng to video"><Maximize size={12} /></button>
                          <button onClick={() => forceDownloadVideo(hasOutput, `Scene_${scene.scene_n}_Output.mp4`)} className="text-[10px] font-bold text-green-950 bg-green-500 hover:bg-green-400 px-2 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer shadow-sm"><Download size={12} /> Tải</button>
                        </div>
                      </div>
                      <div className="w-full aspect-video bg-black/50 rounded-lg overflow-hidden flex items-center justify-center relative">
                        <video src={hasOutput} crossOrigin="anonymous" controls className="w-full h-full object-contain" />
                      </div>
                    </div>
                  )}
                </div>

                {/* CỘT THÔNG TIN */}
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-4 text-[12px]">
                      <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-md text-zinc-300"><Clock size={14} className="text-zinc-500"/> {scene.time_origin}</div>
                      <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-md text-zinc-300"><Hash size={14} className="text-zinc-500"/> {scene.Word_count || 0} từ</div>
                      <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-md text-purple-300"><Sliders size={14} className="text-purple-500/70"/> {scene.Tone_of_Voice || "Tự nhiên"}</div>
                    </div>
                    <button 
                      onClick={() => setActiveEditSceneModal({...scene})} 
                      className="text-[12px] font-medium text-zinc-500 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Pencil size={14}/> Sửa
                    </button>
                  </div>

                  <div className="space-y-5 flex-1">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-zinc-500 font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1.5"><AlignLeft size={14} /> Voiceover</span>
                      <p className="text-zinc-100 leading-relaxed text-[15px]">{scene.Voiceover || "N/A"}</p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-zinc-500 font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1.5"><Globe size={14} /> Translate</span>
                      <p className="text-zinc-400 italic leading-relaxed text-[14px]">{scene.Translate || "N/A"}</p>
                    </div>
                  </div>

                  {hasAudio && (
                    <div className="mt-5 bg-white/5 border border-white/5 p-3 rounded-xl flex items-center gap-4 shadow-inner">
                      <div className="h-8 w-8 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                        <Play size={14} className="text-purple-400 ml-1" />
                      </div>
                      <audio src={hasAudio} crossOrigin="anonymous" controls className="h-8 w-full opacity-90 sepia-0 hue-rotate-0 invert-0 grayscale-0" />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-5 mt-5 border-t border-white/5 shrink-0">
                    <button 
                      onClick={() => setActiveGenModal({ scene_n: scene.scene_n, Voiceover: scene.Voiceover, Translate: scene.Translate })} 
                      disabled={isLoadingAudio}
                      className={`h-9 px-5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer shrink-0 ${isLoadingAudio ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-white text-black hover:bg-zinc-200 shadow-md'}`}
                    >
                      {isLoadingAudio ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />} 
                      {isLoadingAudio ? 'Đang tạo...' : (hasAudio ? 'Gen Lại Audio' : 'Gen Audio')}
                    </button>
                    
                    <button 
                      onClick={() => {
                          setSingleMixVol(globalMixVol);
                          setActiveMergeModal(scene);
                      }} 
                      disabled={isMergingThisScene || !scene.videoUrl}
                      className={`h-9 px-5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer shrink-0 ${isMergingThisScene || !scene.videoUrl ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-900/20'}`}
                    >
                      {isMergingThisScene ? <Loader2 size={16} className="animate-spin" /> : <Merge size={16} />} 
                      {isMergingThisScene ? 'Đang Merge...' : (hasOutput ? 'Merge Lại' : 'Merge Video')}
                    </button>

                    {!hasOutput && !isMergingThisScene && (
                      <span className="text-[12px] text-zinc-600 flex-1 ml-2 hidden md:block">Bấm Merge để ghép Audio vào cảnh...</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 🚀 BẢNG ĐIỀU KHIỂN CỐ ĐỊNH BÊN PHẢI (FLOATING GLASS) */}
      <div className="fixed right-6 top-24 bottom-6 bg-[#121214]/80 backdrop-blur-2xl border border-white/5 rounded-2xl p-5 shadow-2xl z-20 flex flex-col gap-5 w-[260px] hidden xl:flex overflow-y-auto custom-scrollbar">
        <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm border-b border-white/5 pb-3">
          <Sliders size={16} className="text-purple-400" /> Bảng điều khiển
        </div>
        
        <div className="flex flex-col gap-2.5">
          <button onClick={() => setIsMergeModalOpen(true)} className="w-full h-10 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-900/20 cursor-pointer">
            <Merge size={16} /> Batch Merge All
          </button>

          <button onClick={() => setIsExportModalOpen(true)} className="w-full h-10 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer">
            <Download size={16} /> Export Output
          </button>
        </div>

        <div className="w-full h-[1px] bg-white/5 my-1"></div>

        <button onClick={() => setIsModalOpen(true)} className="w-full h-10 bg-white text-black hover:bg-zinc-200 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer">
          <Music size={16} /> Batch Gen Audio
        </button>

        <div className="bg-black/20 border border-white/5 rounded-xl p-4 flex flex-col gap-3">
          <div className="text-[12px] font-bold text-zinc-300 flex justify-between items-center">
            Voice Clone (Qwen)
            {voiceCloneFile && (
              <button onClick={handleRemoveVoice} className="text-red-400 hover:text-red-300 bg-red-400/10 p-1.5 rounded-md cursor-pointer transition-colors" title="Xóa file"><Trash2 size={14} /></button>
            )}
          </div>
          
          <input type="file" accept="audio/mp3,audio/wav" ref={fileInputRef} onChange={handleVoiceUpload} className="hidden" />
          
          {!voiceCloneFile ? (
            <button onClick={() => fileInputRef.current.click()} className="w-full h-10 border border-dashed border-zinc-600 hover:border-purple-400 hover:bg-purple-500/5 text-zinc-400 hover:text-purple-400 rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer transition-all">
              <Upload size={16} /> Tải file MP3 mẫu
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="text-[11px] text-zinc-400 bg-white/5 px-2.5 py-1.5 rounded-md truncate border border-white/5" title={voiceCloneFile.name}>{voiceCloneFile.name}</div>
              <audio src={voiceCloneUrl} crossOrigin="anonymous" controls className="w-full h-8 opacity-90" />
              <div className="relative">
                <input 
                  type="text" 
                  value={voiceCloneRefText}
                  onChange={(e) => setVoiceCloneRefText(e.target.value)}
                  disabled={isTranscribing}
                  placeholder="Nhập Text của file mẫu..."
                  className={`w-full h-10 px-3 pr-8 bg-black/40 border border-white/10 rounded-xl text-sm text-zinc-200 focus:border-purple-500 focus:outline-none placeholder-zinc-600 transition-colors ${isTranscribing ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
                {isTranscribing && <Loader2 size={16} className="absolute right-3 top-3 animate-spin text-purple-400" />}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 🚀 === CÁC MODAL ĐƯỢC GIỮ NGUYÊN CSS CŨ (Chỉ chỉnh sửa nhẹ viền) === */}
      
      {/* MODAL SỬA SCENE */}
      {activeEditSceneModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-[#121214] border border-white/10 rounded-2xl p-7 w-full max-w-2xl shadow-2xl relative">
                <button onClick={() => setActiveEditSceneModal(null)} className="absolute top-5 right-5 text-zinc-500 hover:text-white cursor-pointer transition-colors"><X size={20} /></button>
                <h3 className="text-lg font-bold border-b border-white/10 pb-4 text-zinc-100 flex items-center gap-2">
                  <Pencil size={18} className="text-blue-400"/> Sửa thông tin - Scene {activeEditSceneModal.scene_n}
                </h3>

                <div className="mt-5 space-y-5">
                    <div>
                        <label className="text-zinc-400 font-medium text-sm mb-2 block">Voiceover (Kịch bản sẽ được AI đọc):</label>
                        <textarea
                            value={activeEditSceneModal.Voiceover || ''}
                            onChange={(e) => setActiveEditSceneModal(prev => ({...prev, Voiceover: e.target.value}))}
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-zinc-200 min-h-[120px] focus:outline-none focus:border-blue-500 custom-scrollbar text-sm leading-relaxed"
                        />
                    </div>
                    <div>
                        <label className="text-zinc-400 font-medium text-sm mb-2 block">Translate (Bản dịch / Ghi chú):</label>
                        <textarea
                             value={activeEditSceneModal.Translate || ''}
                            onChange={(e) => setActiveEditSceneModal(prev => ({...prev, Translate: e.target.value}))}
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-zinc-400 min-h-[80px] focus:outline-none focus:border-blue-500 custom-scrollbar text-sm leading-relaxed"
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="text-zinc-400 font-medium text-sm mb-2 block">Thời gian:</label>
                            <input type="text" value={activeEditSceneModal.time_origin || ''} onChange={(e) => setActiveEditSceneModal(prev => ({...prev, time_origin: e.target.value}))} className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-zinc-200 text-sm focus:border-blue-500 focus:outline-none" />
                        </div>
                        <div>
                            <label className="text-zinc-400 font-medium text-sm mb-2 block">Số từ:</label>
                            <input type="number" value={activeEditSceneModal.Word_count || 0} onChange={(e) => setActiveEditSceneModal(prev => ({...prev, Word_count: Number(e.target.value)}))} className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-zinc-200 text-sm focus:border-blue-500 focus:outline-none" />
                        </div>
                        <div>
                            <label className="text-zinc-400 font-medium text-sm mb-2 block">Giọng điệu:</label>
                            <input type="text" value={activeEditSceneModal.Tone_of_Voice || ''} onChange={(e) => setActiveEditSceneModal(prev => ({...prev, Tone_of_Voice: e.target.value}))} className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-zinc-200 text-sm focus:border-blue-500 focus:outline-none" />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-white/10 pt-5 mt-6">
                    <button onClick={() => setActiveEditSceneModal(null)} className="h-10 px-6 bg-transparent hover:bg-white/5 text-zinc-300 rounded-xl font-medium cursor-pointer transition-colors">Hủy</button>
                    <button onClick={handleSaveSceneEdit} className="h-10 px-6 bg-white hover:bg-zinc-200 text-black rounded-xl font-bold cursor-pointer flex items-center gap-2 transition-colors">
                      <Save size={16}/> Lưu thay đổi
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* MODAL BATCH MERGE ALL */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#121214] border border-white/10 rounded-2xl p-7 w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl relative">
            <button onClick={() => !isMerging && setIsMergeModalOpen(false)} className="absolute top-5 right-5 text-zinc-500 hover:text-white cursor-pointer"><X size={20} /></button>
            <h3 className="text-lg font-bold border-b border-white/10 pb-4 text-blue-400 flex items-center gap-2"><Merge size={20} /> Batch Merge Videos</h3>
            <p className="text-zinc-400 mt-4 text-sm">Tạo Video Output hàng loạt cho các Scene đã chọn.</p>

            <div className="mt-5 bg-black/40 border border-white/5 p-5 rounded-xl">
              <div className="flex justify-between items-center mb-4">
                <span className="font-semibold text-zinc-200 text-sm">Âm lượng video gốc (mix)</span>
                <span className="text-blue-400 font-mono font-bold bg-blue-500/10 px-2 py-0.5 rounded-md">{(globalMixVol / 100).toFixed(2)}</span>
              </div>
              <input type="range" min="0" max="100" value={globalMixVol} onChange={(e) => setGlobalMixVol(e.target.value)} disabled={isMerging} className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
            </div>

            <div className="flex gap-2 mt-6 shrink-0">
              <button onClick={handleSelectAllMerge} disabled={isMerging} className="h-9 px-4 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium cursor-pointer text-zinc-200 transition-colors disabled:opacity-50">Chọn tất cả</button>
              <button onClick={handleDeselectAllMerge} disabled={isMerging} className="h-9 px-4 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium cursor-pointer text-zinc-200 transition-colors disabled:opacity-50">Bỏ chọn</button>
            </div>
            
            <div className="flex-1 overflow-y-auto border border-white/5 rounded-xl p-3 bg-black/40 space-y-2 min-h-[160px] mt-4 custom-scrollbar">
              {parsedData.map((scene) => {
                const isChecked = !!checkedMergeScenes[scene.scene_n];
                const hasAiAudio = !!generatedAudios[scene.scene_n];
                return (
                  <div key={scene.scene_n} onClick={() => !isMerging && handleToggleMergeCheck(scene.scene_n)} className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer select-none ${isChecked ? 'bg-blue-500/10 border-blue-500/30' : 'bg-transparent border-white/5 hover:border-white/10'} ${isMerging ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <div className="flex items-start gap-4">
                      <div className="mt-0.5">{isChecked ? <CheckSquare size={18} className="text-blue-400" /> : <Square size={18} className="text-zinc-600" />}</div>
                      <div>
                        <div className={`font-bold text-sm ${isChecked ? 'text-blue-400' : 'text-zinc-200'}`}>Scene {scene.scene_n}</div>
                        <div className="text-xs text-zinc-500 mt-1">{hasAiAudio ? 'Có AI Audio' : 'Pass qua Video Gốc'}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="flex justify-end gap-3 border-t border-white/10 pt-5 mt-6 shrink-0">
              <button onClick={() => setIsMergeModalOpen(false)} disabled={isMerging} className="h-10 px-6 bg-transparent hover:bg-white/5 text-zinc-300 rounded-xl font-medium cursor-pointer transition-colors disabled:opacity-50">Hủy</button>
              <button onClick={handleStartMerge} disabled={isMerging} className="h-10 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold cursor-pointer flex items-center gap-2 transition-colors disabled:opacity-50">
                {isMerging ? <Loader2 size={16} className="animate-spin" /> : <Merge size={16} />} {isMerging ? 'Đang xử lý...' : `Bắt đầu Merge`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TÙY CHỈNH MERGE LẺ TỪNG CẢNH */}
      {activeMergeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#121214] border border-white/10 rounded-2xl p-7 w-full max-w-md flex flex-col shadow-2xl relative">
            <button onClick={() => setActiveMergeModal(null)} className="absolute top-5 right-5 text-zinc-500 hover:text-white cursor-pointer transition-colors"><X size={20} /></button>
            <h3 className="text-lg font-bold border-b border-white/10 pb-4 text-blue-400 flex items-center gap-2">
              <Merge size={20} /> Cấu hình Merge - Scene {activeMergeModal.scene_n}
            </h3>
            
            <p className="text-zinc-400 mt-4 text-sm leading-relaxed">Tùy chỉnh độ lớn âm thanh gốc của video trước khi ghép Audio AI vào.</p>

            <div className="mt-5 bg-black/40 border border-white/5 p-5 rounded-xl">
              <div className="flex justify-between items-center mb-4">
                <span className="font-semibold text-zinc-200 text-sm">Âm lượng video gốc (mix)</span>
                <span className="text-blue-400 font-mono font-bold bg-blue-500/10 px-2 py-0.5 rounded-md">{(singleMixVol / 100).toFixed(2)}</span>
              </div>
              <input type="range" min="0" max="100" value={singleMixVol} onChange={(e) => setSingleMixVol(e.target.value)} className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
            </div>

            <div className="flex justify-end gap-3 border-t border-white/10 pt-5 mt-6 shrink-0">
              <button onClick={() => setActiveMergeModal(null)} className="h-10 px-6 bg-transparent hover:bg-white/5 text-zinc-300 rounded-xl font-medium cursor-pointer transition-colors">Hủy bỏ</button>
              <button onClick={handleSingleSceneMergeConfirm} className="h-10 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold cursor-pointer flex items-center gap-2 shadow-lg">
                <Merge size={16} /> Bắt đầu Merge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BATCH GEN AUDIO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#121214] border border-white/10 rounded-2xl p-7 w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-5 right-5 text-zinc-500 hover:text-white cursor-pointer"><X size={20} /></button>
            <h3 className="text-lg font-bold border-b border-white/10 pb-4 text-zinc-100 flex items-center gap-2"><Music size={20} /> Sinh âm thanh đồng loạt</h3>
            <div className="flex gap-2 mt-6 shrink-0">
              <button onClick={handleSelectAll} className="h-9 px-4 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium cursor-pointer text-zinc-200 transition-colors">Chọn tất cả</button>
              <button onClick={handleDeselectAll} className="h-9 px-4 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium cursor-pointer text-zinc-200 transition-colors">Bỏ chọn</button>
            </div>
            <div className="flex-1 overflow-y-auto border border-white/5 rounded-xl p-3 bg-black/40 space-y-2 min-h-[160px] mt-4 custom-scrollbar">
              {filteredScenesForAudio.length === 0 ? (
                <div className="text-center text-zinc-500 py-10 text-sm">Không có cảnh nào cần xử lý.</div>
              ) : (
                filteredScenesForAudio.map((scene) => {
                  const isChecked = !!checkedScenes[scene.scene_n];
                  return (
                    <div key={scene.scene_n} onClick={() => handleToggleCheck(scene.scene_n)} className={`flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer select-none ${isChecked ? 'bg-white/10 border-white/20' : 'bg-transparent border-white/5 hover:border-white/10'}`}>
                      <div className="mt-0.5 shrink-0 text-white">{isChecked ? <CheckSquare size={18} /> : <Square size={18} className="text-zinc-600" />}</div>
                      <div className="space-y-1.5 min-w-0 text-sm">
                        <div className="font-bold text-zinc-200">Scene {scene.scene_n}</div>
                        <div className="text-zinc-400 truncate leading-relaxed">Voiceover: {scene.Voiceover}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-white/10 pt-5 mt-6 shrink-0">
              <button onClick={() => setIsModalOpen(false)} className="h-10 px-6 bg-transparent hover:bg-white/5 text-zinc-300 rounded-xl font-medium cursor-pointer transition-colors">Hủy bỏ</button>
              <button onClick={handleStartBatchGen} className="h-10 px-6 bg-white hover:bg-zinc-200 text-black rounded-xl font-bold cursor-pointer transition-colors">Bắt đầu Gen</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EXPORT OUTPUT */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#121214] border border-white/10 rounded-2xl p-7 w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl relative">
            <button onClick={() => setIsExportModalOpen(false)} className="absolute top-5 right-5 text-zinc-500 hover:text-white cursor-pointer"><X size={20} /></button>
            <h3 className="text-lg font-bold border-b border-white/10 pb-4 text-green-400 flex items-center gap-2"><Download size={20} /> Tải Video Output</h3>
            
            {Object.keys(mergedVideos).length === 0 ? (
              <div className="text-center text-zinc-500 py-10 text-sm">Chưa có video Output nào được tạo.<br/>Bạn hãy chạy "Merge Videos" trước nhé!</div>
            ) : (
              <>
                <div className="flex gap-2 mt-6 shrink-0">
                  <button onClick={handleSelectAllExport} className="h-9 px-4 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium cursor-pointer text-zinc-200 transition-colors">Chọn tất cả</button>
                  <button onClick={handleDeselectAllExport} className="h-9 px-4 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium cursor-pointer text-zinc-200 transition-colors">Bỏ chọn</button>
                </div>
                <div className="flex-1 overflow-y-auto border border-white/5 rounded-xl p-3 bg-black/40 space-y-2 min-h-[160px] mt-4 custom-scrollbar">
                  {parsedData.filter(scene => mergedVideos[scene.scene_n]).map((scene) => {
                    const isChecked = !!checkedExportScenes[scene.scene_n];
                    return (
                      <div key={scene.scene_n} onClick={() => handleToggleExportCheck(scene.scene_n)} className={`flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer select-none ${isChecked ? 'bg-green-500/10 border-green-500/30' : 'bg-transparent border-white/5 hover:border-white/10'}`}>
                        {isChecked ? <CheckSquare size={18} className="text-green-400" /> : <Square size={18} className="text-zinc-600" />}
                        <div className={`font-bold text-sm ${isChecked ? 'text-green-400' : 'text-zinc-200'}`}>Scene {scene.scene_n} Output</div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end gap-3 border-t border-white/10 pt-5 mt-6 shrink-0">
                  <button onClick={() => setIsExportModalOpen(false)} className="h-10 px-6 bg-transparent hover:bg-white/5 text-zinc-300 rounded-xl font-medium cursor-pointer transition-colors">Hủy bỏ</button>
                  <button onClick={handleDownloadVideos} className="h-10 px-6 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold cursor-pointer transition-colors">Tải Output Đã Chọn</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL GEN AUDIO LẺ */}
      {activeGenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#121214] border border-white/10 rounded-2xl p-7 w-full max-w-md flex flex-col shadow-2xl relative">
            <button onClick={() => setActiveGenModal(null)} className="absolute top-5 right-5 text-zinc-500 hover:text-white cursor-pointer transition-colors"><X size={20} /></button>
            <h3 className="text-lg font-bold border-b border-white/10 pb-4 text-zinc-100 flex items-center gap-2"><Mic size={20} /> Audio - Scene {activeGenModal.scene_n}</h3>
            
            <div className="mt-6 space-y-5">
              <div className="bg-black/40 border border-white/5 rounded-xl p-5">
                <div className="text-zinc-500 font-semibold text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5"><AlignLeft size={14} /> Voiceover</div>
                <p className="text-zinc-200 leading-relaxed text-[14px] whitespace-pre-wrap">{activeGenModal.Voiceover || "N/A"}</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-white/10 pt-5 mt-6 shrink-0">
              <button onClick={() => setActiveGenModal(null)} className="h-10 px-6 bg-transparent hover:bg-white/5 text-zinc-300 rounded-xl font-medium cursor-pointer transition-colors">Hủy bỏ</button>
              <button onClick={() => { handleGenAudio(activeGenModal.scene_n, activeGenModal.Voiceover); setActiveGenModal(null); }} className="h-10 px-6 bg-white hover:bg-zinc-200 text-black rounded-xl font-bold cursor-pointer flex items-center gap-2 transition-colors">
                <Mic size={16} /> Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}