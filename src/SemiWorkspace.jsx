import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom'; // 🚀 THÊM ROUTER ĐỂ LẤY ID TỪ URL
import { doc, getDoc } from 'firebase/firestore'; // 🚀 THÊM HÀM ĐỌC FIREBASE
import { db } from './firebase.js'; // 🚀 KẾT NỐI DATABASE
import { FileText, Video, AlignLeft, Globe, Hash, Mic, Volume2, Music, Merge, LayoutDashboard, Sliders, X, CheckSquare, Square, Download, Upload, Trash2, Loader2, Play } from 'lucide-react';

export default function SemiWorkspace({ ffmpeg, isFfmpegReady }) { // 🚀 BỎ parsedData khỏi props
  const { projectId } = useParams(); // Lấy ID dự án từ URL (VD: proj_171... )
  const [parsedData, setParsedData] = useState([]); // 🚀 CHUYỂN DATA THÀNH STATE ĐỂ TỰ QUẢN LÝ
  const [isDataLoading, setIsDataLoading] = useState(true); // Trạng thái đang tải dữ liệu

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkedScenes, setCheckedScenes] = useState({});
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [checkedExportScenes, setCheckedExportScenes] = useState({});
  const [voiceCloneUrl, setVoiceCloneUrl] = useState(null);
  const [voiceCloneFile, setVoiceCloneFile] = useState(null);
  const [voiceCloneBase64, setVoiceCloneBase64] = useState(null);
  const [voiceCloneRefText, setVoiceCloneRefText] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const fileInputRef = useRef(null);

  const [generatedAudios, setGeneratedAudios] = useState({});
  const [isGenerating, setIsGenerating] = useState({});
  const [activeGenModal, setActiveGenModal] = useState(null);

  // 🚀 STATE: Quản lý Modal Merge và Lưu trữ Video Output
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [checkedMergeScenes, setCheckedMergeScenes] = useState({});
  const [globalMixVol, setGlobalMixVol] = useState(35); 
  const [isMerging, setIsMerging] = useState(false); 
  const [mergedVideos, setMergedVideos] = useState({});

  // 🚀 TỰ ĐỘNG TẢI DỮ LIỆU TỪ FIREBASE KHI TRUY CẬP LINK
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
          // Trong firebase.js, bạn lưu mảng dữ liệu dưới key là 'data'
          setParsedData(projectInfo.data || []);
        } else {
          alert("🚨 Dự án không tồn tại hoặc đã bị xóa!");
        }
      } catch (error) {
        console.error("Lỗi tải data dự án:", error);
        alert("Lỗi đường truyền khi tải dự án.");
      } finally {
        setIsDataLoading(false);
      }
    };

    fetchProjectData();
  }, [projectId]);

  // 🚀 NẾU ĐANG TẢI THÌ HIỂN THỊ MÀN HÌNH LOADING
  if (isDataLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0E0E10] text-blue-400 font-bold flex-col gap-3">
        <Loader2 className="animate-spin" size={40}/> 
        <span>Đang tải không gian làm việc...</span>
      </div>
    );
  }

  // 🚀 NẾU KHÔNG CÓ DỮ LIỆU SAU KHI TẢI
  if (!parsedData || parsedData.length === 0) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0E0E10] text-gray-500 text-xs">
        Chưa có dữ liệu cảnh nào hoặc dự án rỗng. Vui lòng quay lại bước xử lý kịch bản.
      </div>
    );
  }

  const totalScenes = parsedData.length;
  const totalVoice = parsedData.filter(s => s.Voiceover && s.Voiceover.trim() !== '').length;
  const avgDuration = "00:05";
  const estCost = `$${(totalVoice * 0.01).toFixed(2)}`;
  const generatedCount = Object.keys(generatedAudios).length;
  const audioGenStatus = `${generatedCount} / ${totalVoice}`;

  // 🚀 HÀM ÉP TẢI VIDEO XUỐNG MÁY 
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
      console.error("Lỗi khi tải video:", error);
      alert("Đường truyền có vấn đề, không thể tải video!");
    }
  };

  // 🚀 HÀM GEN AUDIO
  const handleGenAudio = async (sceneNo, scriptText) => {
    if (!scriptText || scriptText.trim() === '') return;
    setIsGenerating(prev => ({ ...prev, [sceneNo]: true }));

    try {
      let cleanText = scriptText.trim().replace(/\s+/g, ' ').replace(/["'()[\]{}]/g, '');
      if (!cleanText.match(/[.!?]$/)) cleanText += '.';

      let endpoint = "https://queue.fal.run/fal-ai/dia-tts";
      let payload = { text: `[S1] ${cleanText}` }; 

      if (voiceCloneFile && voiceCloneBase64) {
        if (!voiceCloneRefText || voiceCloneRefText.trim() === '') {
          alert("Nội dung file mẫu trống! Hãy đợi AI chép chính tả xong.");
          setIsGenerating(prev => ({ ...prev, [sceneNo]: false }));
          return;
        }
        endpoint = "https://queue.fal.run/fal-ai/dia-tts/voice-clone";
        payload = { text: `[S1] ${cleanText} . `, ref_audio_url: voiceCloneBase64, ref_text: voiceCloneRefText };
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("API Fal lỗi");

      const queueData = await response.json();
      let result = null;

      if (queueData.status_url) {
        while (true) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const statusRes = await fetch(queueData.status_url, {
            method: "GET", headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}` }
          });
          if (!statusRes.ok) throw new Error("Lỗi mạng khi hỏi thăm Queue.");
          const statusJson = await statusRes.json();
          
          if (statusJson.status === "COMPLETED") {
            const finalLink = statusJson.response_url || queueData.response_url;
            const finalRes = await fetch(finalLink, {
              method: "GET", headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}` }
            });
            result = await finalRes.json(); 
            break;
          } else if (statusJson.status === "FAILED") {
            throw new Error("Fal AI xử lý thất bại: " + JSON.stringify(statusJson.error));
          }
        }
      } else {
        result = queueData;
      }

      const audioResultUrl = result?.audio?.url || result?.audio_url || result?.audio_file?.url;
      if (audioResultUrl) {
        setGeneratedAudios(prev => ({ ...prev, [sceneNo]: audioResultUrl }));
      }
    } catch (error) {
      console.error(`Lỗi hệ thống ở Scene ${sceneNo}:`, error);
      alert(`Báo lỗi Scene ${sceneNo}: ${error.message}`);
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
    catch (error) { console.error(error); } 
    finally { setCheckedScenes({}); }
  };

  const handleToggleExportCheck = (sceneNo) => setCheckedExportScenes(prev => ({ ...prev, [sceneNo]: !prev[sceneNo] }));
  const handleSelectAllExport = () => {
    const newChecked = {};
    parsedData.forEach(scene => { newChecked[scene.scene_n] = true; });
    setCheckedExportScenes(newChecked);
  };
  const handleDeselectAllExport = () => setCheckedExportScenes({});

  const handleDownloadVideos = async () => {
    const selectedCount = Object.values(checkedExportScenes).filter(Boolean).length;
    if (selectedCount === 0) return alert("Vui lòng chọn ít nhất 1 scene để Export!");
    const scenesToExport = parsedData.filter(scene => checkedExportScenes[scene.scene_n]);
    alert(`⏳ Đang chuẩn bị tải ${scenesToExport.length} video gốc. Trình duyệt sẽ tự động lưu...`);
    setIsExportModalOpen(false); 
    for (let i = 0; i < scenesToExport.length; i++) {
      const scene = scenesToExport[i];
      if (!scene.videoUrl) continue; 
      await forceDownloadVideo(scene.videoUrl, `Scene_${scene.scene_n}_Original.mp4`);
    }
  };

  const handleToggleMergeCheck = (sceneNo) => setCheckedMergeScenes(prev => ({ ...prev, [sceneNo]: !prev[sceneNo] }));
  const handleSelectAllMerge = () => {
    const newChecked = {};
    parsedData.forEach(scene => { newChecked[scene.scene_n] = true; });
    setCheckedMergeScenes(newChecked);
  };
  const handleDeselectAllMerge = () => setCheckedMergeScenes({});

  const handleStartMerge = async () => {
    const scenesToMerge = parsedData.filter(scene => checkedMergeScenes[scene.scene_n]);
    if (scenesToMerge.length === 0) return alert("Vui lòng chọn ít nhất 1 scene để Merge!");
    if (!ffmpeg || !isFfmpegReady) return alert("Hệ thống FFmpeg chưa sẵn sàng. Vui lòng đợi trang tải xong!");

    setIsMerging(true);

    for (let i = 0; i < scenesToMerge.length; i++) {
      const scene = scenesToMerge[i];
      const videoUrl = scene.videoUrl;
      const aiAudioUrl = generatedAudios[scene.scene_n];

      if (!videoUrl) continue;

      try {
        let finalUrl = null;

        // 1. NẾU CHƯA CÓ AUDIO: Vẫn Merge (pass video gốc thẳng ra Output)
        if (!aiAudioUrl) {
          finalUrl = videoUrl; 
        } 
        // 2. NẾU CÓ AUDIO: Chạy FFmpeg
        else {
          const inVid = `vid_${scene.scene_n}.mp4`;
          const inAud = `aud_${scene.scene_n}.mp3`;
          const outName = `Scene_${scene.scene_n}_Merged.mp4`;

          await ffmpeg.writeFile(inVid, new Uint8Array(await (await fetch(videoUrl)).arrayBuffer()));
          await ffmpeg.writeFile(inAud, new Uint8Array(await (await fetch(aiAudioUrl)).arrayBuffer()));

          let exitCode = -1;

          if (globalMixVol == 0) {
            try {
              exitCode = await ffmpeg.exec([
                '-i', inVid, '-i', inAud, '-map', '0:v', '-map', '1:a', 
                '-c:v', 'copy', '-c:a', 'aac', '-shortest', outName
              ]);
            } catch (err) { exitCode = 1; }
          } else {
            const vol = globalMixVol / 100;
            try {
              exitCode = await ffmpeg.exec([
                '-i', inVid, '-i', inAud,
                '-filter_complex', `[0:a]volume=${vol}[a1];[1:a]volume=1.0[a2];[a1][a2]amix=inputs=2:duration=shortest[aout]`,
                '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', outName
              ]);
            } catch (err) { exitCode = 1; }

            if (exitCode !== 0) {
              try {
                exitCode = await ffmpeg.exec([
                  '-i', inVid, '-i', inAud, '-map', '0:v', '-map', '1:a', 
                  '-c:v', 'copy', '-c:a', 'aac', '-shortest', outName
                ]);
              } catch (err) {}
            }
          }

          if (exitCode === 0) {
             const outData = await ffmpeg.readFile(outName);
             const outBlob = new Blob([outData.buffer], { type: 'video/mp4' });
             finalUrl = URL.createObjectURL(outBlob);
          }

          await ffmpeg.deleteFile(inVid);
          await ffmpeg.deleteFile(inAud);
          try { await ffmpeg.deleteFile(outName); } catch(e) {}
        }

        // 🔥 LƯU VIDEO OUTPUT VÀO STATE ĐỂ HIỂN THỊ TRÊN UI
        if (finalUrl) {
          setMergedVideos(prev => ({ ...prev, [scene.scene_n]: finalUrl }));
        }

      } catch (error) {
        console.error(`Lỗi hệ thống Merge Scene ${scene.scene_n}:`, error);
      }
    }

    setIsMerging(false);
    setIsMergeModalOpen(false);
    alert("✅ Đã xử lý xong! Video Output đã hiển thị ở từng cảnh bên dưới.");
  };

  const handleVoiceUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setVoiceCloneFile(file);
    setVoiceCloneUrl(URL.createObjectURL(file));
    setIsTranscribing(true);
    setVoiceCloneRefText("AI đang nghe..."); 
    try {
      const base64Audio = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
      });
      setVoiceCloneBase64(base64Audio);

      const response = await fetch("https://fal.run/fal-ai/whisper", {
        method: "POST",
        headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ audio_url: base64Audio }),
      });
      
      const result = await response.json();
      setVoiceCloneRefText(result.text ? result.text.trim() : "Không nhận diện được giọng.");
    } catch (error) {
      setVoiceCloneRefText("Lỗi tự động nghe. Hãy tự gõ nhé.");
    } finally { setIsTranscribing(false); }
  };

  const handleRemoveVoice = () => {
    if (voiceCloneUrl) URL.revokeObjectURL(voiceCloneUrl);
    setVoiceCloneFile(null); setVoiceCloneUrl(null); setVoiceCloneBase64(null);
    setVoiceCloneRefText(""); setIsTranscribing(false);
    if (fileInputRef.current) fileInputRef.current.value = null;
  };

  const filteredScenesForAudio = parsedData.filter(scene => 
    !generatedAudios[scene.scene_n] && (scene.Voiceover && scene.Voiceover.trim() !== '')
  );

  return (
    <div className="h-screen w-full bg-[#0E0E10] font-sans text-white p-4 overflow-y-auto relative">
      <div className="flex flex-col gap-4 max-w-7xl mx-auto pb-16 pr-48">
        
        {/* BẢNG TỔNG QUAN */}
        <div className="bg-[#15151A] border border-[#2A2A30] rounded-xl p-3 shadow-md">
          <div className="flex items-center gap-1.5 text-blue-400 font-bold text-[11px] uppercase tracking-wider mb-2.5 border-b border-[#2A2A30] pb-1.5">
            <LayoutDashboard size={13} /> Bảng tổng quan dự án
          </div>
          <div className="grid grid-cols-7 gap-4 text-center">
            <div className="bg-[#0E0E10] p-2 rounded-lg border border-[#2A2A30]">
              <div className="text-[10px] text-gray-400 font-medium">Total Scene:</div>
              <div className="text-xs font-bold text-white mt-0.5">{totalScenes}</div>
            </div>
            <div className="bg-[#0E0E10] p-2 rounded-lg border border-[#2A2A30]">
              <div className="text-[10px] text-gray-400 font-medium">Total Voice:</div>
              <div className="text-xs font-bold text-blue-400 mt-0.5">{totalVoice}</div>
            </div>
            <div className="bg-[#0E0E10] p-2 rounded-lg border border-[#2A2A30]">
              <div className="text-[10px] text-gray-400 font-medium">Avg Duration:</div>
              <div className="text-xs font-bold text-green-400 mt-0.5">{avgDuration}</div>
            </div>
            <div className="bg-[#0E0E10] p-2 rounded-lg border border-[#2A2A30]">
              <div className="text-[10px] text-gray-400 font-medium">Est Cost:</div>
              <div className="text-xs font-bold text-yellow-500 mt-0.5">{estCost}</div>
            </div>
            <div className="bg-[#0E0E10] p-2 rounded-lg border border-[#2A2A30]">
              <div className="text-[10px] text-gray-400 font-medium">Image Gen:</div>
              <div className="text-xs font-bold text-gray-300 mt-0.5">0 / {totalScenes}</div>
            </div>
            <div className="bg-[#0E0E10] p-2 rounded-lg border border-[#2A2A30]">
              <div className="text-[10px] text-gray-400 font-medium">Audio Gen:</div>
              <div className="text-xs font-bold text-purple-400 mt-0.5">{audioGenStatus}</div>
            </div>
            <div className="bg-[#0E0E10] p-2 rounded-lg border border-[#2A2A30]">
              <div className="text-[10px] text-gray-400 font-medium">Video Gen:</div>
              <div className="text-xs font-bold text-orange-400 mt-0.5">0 / {totalScenes}</div>
            </div>
          </div>
        </div>

        {/* DANH SÁCH SCENE */}
        {parsedData.map((scene, index) => {
          const isLoading = isGenerating[scene.scene_n];
          const hasAudio = generatedAudios[scene.scene_n];
          const hasOutput = mergedVideos[scene.scene_n];

          return (
            <div key={index} className="flex gap-5 bg-[#121216] hover:bg-[#16161B] p-4 rounded-2xl border border-[#2A2A30] hover:border-gray-600 shadow-lg transition-all items-stretch group">
              
              {/* 🚀 CỘT VIDEO (HIỂN THỊ CẢ INPUT LẪN OUTPUT THEO CHIỀU DỌC) */}
              <div className="w-[240px] flex flex-col gap-3 shrink-0">
                
                {/* 1. KHUNG INPUT VIDEO */}
                <div className="flex flex-col bg-[#0A0A0C] rounded-xl p-2.5 border border-[#2A2A30] shadow-sm">
                  <div className="flex items-center justify-between border-b border-[#2A2A30] pb-2 mb-2">
                    <div className="flex items-center gap-1.5 text-purple-400">
                      <Video size={13} /> 
                      <span className="text-[10px] font-bold uppercase tracking-widest">Scene {scene.scene_n} (Input)</span>
                    </div>
                    <span className="text-[9px] text-gray-500 bg-[#1A1A21] px-1.5 py-0.5 rounded">{scene.time_origin}</span>
                  </div>
                  
                  <div className="flex-1 bg-black rounded-lg overflow-hidden flex items-center justify-center relative min-h-[135px]">
                    {scene.videoUrl ? (
                      <video src={scene.videoUrl} crossOrigin="anonymous" controls className="w-full h-full object-contain" />
                    ) : (
                      <div className="text-center flex flex-col items-center gap-1.5 opacity-40">
                        <Video size={20} className="text-gray-400" />
                        <span className="text-gray-400 text-[9px] uppercase tracking-wider">No Media</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. KHUNG OUTPUT VIDEO (Chỉ hiện khi đã chạy Merge) */}
                {hasOutput && (
                  <div className="flex flex-col bg-[#0A0A0C] rounded-xl p-2.5 border border-green-500/40 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
                    <div className="flex items-center justify-between border-b border-[#2A2A30] pb-2 mb-2">
                      <div className="flex items-center gap-1.5 text-green-400">
                        <CheckSquare size={13} /> 
                        <span className="text-[10px] font-bold uppercase tracking-widest">Output</span>
                      </div>
                      
                      {/* Nút tải riêng cho Output này */}
                      <button 
                        onClick={() => forceDownloadVideo(hasOutput, `Scene_${scene.scene_n}_Output.mp4`)}
                        className="text-[9px] font-bold text-white bg-green-600 hover:bg-green-500 px-2 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Download size={10} /> Tải
                      </button>
                    </div>
                    
                    <div className="flex-1 bg-black rounded-lg overflow-hidden flex items-center justify-center relative min-h-[135px]">
                      <video src={hasOutput} crossOrigin="anonymous" controls className="w-full h-full object-contain" />
                    </div>
                  </div>
                )}
                
              </div>

              {/* Box Thông tin & Nút bấm (Bên Phải) */}
              <div className="flex-1 flex flex-col min-w-0 py-0.5">
                <div className="space-y-2.5 flex-1">
                  <div className="flex gap-2 items-start text-[11px]">
                    <span className="text-gray-500 font-medium shrink-0 w-16 flex items-center gap-1 mt-0.5"><AlignLeft size={12} /> Voice:</span>
                    <p className="text-gray-200 leading-relaxed bg-[#1A1A21] px-3 py-2 rounded-lg flex-1 border border-transparent group-hover:border-[#2A2A30] transition-colors">{scene.Voiceover || "N/A"}</p>
                  </div>
                  <div className="flex gap-2 items-start text-[11px]">
                    <span className="text-gray-500 font-medium shrink-0 w-16 flex items-center gap-1 mt-0.5"><Globe size={12} /> Trans:</span>
                    <p className="text-gray-400 italic leading-relaxed bg-[#0E0E10] px-3 py-2 rounded-lg flex-1">{scene.Translate || "N/A"}</p>
                  </div>
                  <div className="flex gap-6 text-[10px] pt-1 px-1">
                    <div className="flex items-center gap-1.5"><span className="text-gray-500">Words:</span><span className="text-blue-400 font-bold">{scene.Word_count || 0}</span></div>
                    <div className="flex items-center gap-1.5"><span className="text-gray-500">Tone:</span><span className="text-purple-400 font-bold">{scene.Tone_of_Voice || "Tự nhiên"}</span></div>
                  </div>
                </div>

                {hasAudio && (
                  <div className="mt-2 bg-green-500/10 border border-green-500/30 p-2 rounded-lg flex items-center gap-2">
                    <Play size={14} className="text-green-400" />
                    <audio src={hasAudio} crossOrigin="anonymous" controls className="h-6 w-full [&::-webkit-media-controls-panel]:bg-[#1A1A21]" />
                  </div>
                )}

                {/* Thanh Control Action */}
                <div className="flex items-center gap-3 bg-[#0A0A0C] p-2 rounded-xl border border-[#2A2A30] mt-3 shrink-0 shadow-inner">
                  <button 
                    onClick={() => setActiveGenModal({ scene_n: scene.scene_n, Voiceover: scene.Voiceover, Translate: scene.Translate })} 
                    disabled={isLoading}
                    className={`h-7 px-4 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${isLoading ? 'bg-gray-600/20 text-gray-400 cursor-not-allowed' : 'bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:text-purple-300'}`}
                  >
                    {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />} 
                    {isLoading ? 'Đang tạo...' : (hasAudio ? 'Gen Lại' : 'Gen Audio')}
                  </button>
                  
                  {/* Nút bấm 1 click để Merge nhanh cho đúng 1 Scene này (Bổ sung thêm cho tiện lợi UX) */}
                  {!hasOutput && (
                    <>
                      <div className="w-[1px] h-4 bg-[#2A2A30] shrink-0"></div>
                      <span className="text-[10px] text-gray-500 flex-1 ml-1">Đợi chạy batch Merge All ở bảng điều khiển...</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* BẢNG ĐIỀU KHIỂN CỐ ĐỊNH BÊN PHẢI */}
      <div className="fixed right-4 top-24 bg-[#15151A] border border-[#2A2A30] rounded-xl p-3 shadow-2xl z-20 flex flex-col gap-3 w-[200px]">
        <div className="flex items-center gap-1 text-gray-400 text-[10px] font-bold uppercase tracking-wider border-b border-[#2A2A30] pb-1.5">
          <Sliders size={12} /> Bảng điều khiển
        </div>
        
        <button onClick={() => setIsMergeModalOpen(true)} className="w-full h-8 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer">
          <Merge size={13} /> Merge All Videos
        </button>

        <button onClick={() => setIsExportModalOpen(true)} className="w-full h-8 bg-[#2A2A30] hover:bg-gray-600 text-white rounded-md font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer">
          <Download size={13} /> Export Original
        </button>

        <button onClick={() => setIsModalOpen(true)} className="w-full h-8 bg-purple-600 hover:bg-purple-500 text-white rounded-md font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer mt-1">
          <Music size={13} /> Gen All Audio
        </button>

        <div className="bg-[#0E0E10] border border-[#2A2A30] rounded-lg p-2 flex flex-col gap-2 mt-1">
          <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider flex justify-between items-center">
            Voice Clone
            {voiceCloneFile && (
              <button onClick={handleRemoveVoice} className="text-red-400 hover:text-red-300 cursor-pointer" title="Xóa file">
                <Trash2 size={12} />
              </button>
            )}
          </div>
          
          <input type="file" accept="audio/mp3,audio/wav" ref={fileInputRef} onChange={handleVoiceUpload} className="hidden" />
          
          {!voiceCloneFile ? (
            <button onClick={() => fileInputRef.current.click()} className="w-full h-7 border border-dashed border-gray-600 hover:border-purple-400 text-gray-400 hover:text-purple-400 rounded text-[10px] flex items-center justify-center gap-1 cursor-pointer transition-colors">
              <Upload size={12} /> Tải file MP3
            </button>
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] text-gray-300 truncate" title={voiceCloneFile.name}>{voiceCloneFile.name}</span>
              <audio src={voiceCloneUrl} crossOrigin="anonymous" controls className="w-full h-6 [&::-webkit-media-controls-panel]:bg-[#2A2A30]" />
              
              <div className="relative mt-1">
                <input 
                  type="text" 
                  value={voiceCloneRefText}
                  onChange={(e) => setVoiceCloneRefText(e.target.value)}
                  disabled={isTranscribing}
                  className={`w-full h-7 px-2 pr-6 bg-[#1A1A21] border border-[#2A2A30] rounded text-[10px] text-gray-300 focus:border-purple-500 focus:outline-none placeholder-gray-600 ${isTranscribing ? 'opacity-70 cursor-not-allowed' : ''}`}
                />
                {isTranscribing && (
                  <Loader2 size={12} className="absolute right-2 top-1.5 animate-spin text-purple-400" />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* === MODAL MERGE ALL VIDEOS === */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-[#15151A] border border-[#2A2A30] rounded-2xl p-6 w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl text-xs relative">
            <button onClick={() => !isMerging && setIsMergeModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer"><X size={16} /></button>
            
            <h3 className="text-base font-bold border-b border-[#2A2A30] pb-3 text-blue-400 flex items-center gap-2">
              <Merge size={18} /> Merge input &rarr; output (all scenes)
            </h3>
            <p className="text-gray-400 mt-3 leading-relaxed text-[11px]">
              Tạo Video Output hiển thị trực tiếp bên dưới mỗi Scene. Kể cả Scene không có Audio AI cũng sẽ tự động xuất Output.
            </p>

            <div className="mt-5 bg-[#0E0E10] border border-[#2A2A30] p-4 rounded-xl">
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold text-gray-300">Input video original audio (mix)</span>
                <span className="text-gray-400 font-mono font-medium text-[11px]">{(globalMixVol / 100).toFixed(2)}</span>
              </div>
              <input 
                type="range" min="0" max="100" 
                value={globalMixVol} 
                onChange={(e) => setGlobalMixVol(e.target.value)} 
                disabled={isMerging}
                className="w-full h-1.5 bg-[#2A2A30] rounded-lg appearance-none cursor-pointer accent-blue-500" 
              />
              <div className="text-[9px] text-gray-500 mt-3">
                With dialogue: 0 = dialogue only, 1 = full original mixed in. Without dialogue: 0 = mute input track, 1 = keep input audio.
              </div>
            </div>

            <div className="flex gap-2 mt-5 shrink-0">
              <button onClick={handleSelectAllMerge} disabled={isMerging} className="h-7 px-3 bg-[#2A2A30] border border-gray-600 hover:bg-[#3A3A40] rounded-md text-[11px] font-medium transition-all cursor-pointer text-gray-300 hover:text-white disabled:opacity-50">Select all</button>
              <button onClick={handleDeselectAllMerge} disabled={isMerging} className="h-7 px-3 bg-[#2A2A30] border border-gray-600 hover:bg-[#3A3A40] rounded-md text-[11px] font-medium transition-all cursor-pointer text-gray-300 hover:text-white disabled:opacity-50">Deselect all</button>
            </div>
            
            <div className="text-[11px] text-gray-400 font-bold mt-4 mb-2 flex justify-between">
              <span>Scenes to process</span>
              <span>({Object.values(checkedMergeScenes).filter(Boolean).length} / {parsedData.length} selected)</span>
            </div>

            <div className="flex-1 overflow-y-auto border border-[#2A2A30] rounded-lg p-2 bg-[#0E0E10] space-y-2 min-h-[160px]">
              {parsedData.map((scene) => {
                const isChecked = !!checkedMergeScenes[scene.scene_n];
                const hasAiAudio = !!generatedAudios[scene.scene_n];
                return (
                  <div key={scene.scene_n} onClick={() => !isMerging && handleToggleMergeCheck(scene.scene_n)} className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer select-none ${isChecked ? 'bg-blue-600/10 border-blue-500/50' : 'bg-[#15151A] border-[#2A2A30] hover:border-gray-600'} ${isMerging ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{isChecked ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} className="text-gray-500" />}</div>
                      <div>
                        <div className={`font-bold ${isChecked ? 'text-blue-400' : 'text-gray-300'}`}>scene_{scene.scene_n}</div>
                        <div className="text-[10px] text-gray-500 mt-1">
                          {hasAiAudio ? 'Sẽ Merge Video Gốc + AI Audio' : 'Chưa có Audio (Pass qua Video Gốc)'}
                        </div>
                      </div>
                    </div>
                    {hasAiAudio && <Mic size={14} className="text-purple-400" title="Có Audio AI" />}
                  </div>
                );
              })}
            </div>
            
            <div className="flex justify-end gap-3 border-t border-[#2A2A30] pt-4 mt-4 shrink-0">
              <button onClick={() => setIsMergeModalOpen(false)} disabled={isMerging} className="h-9 px-5 bg-transparent border border-gray-600 hover:bg-[#3A3A40] text-gray-300 rounded-md font-semibold cursor-pointer disabled:opacity-50">Close</button>
              <button onClick={handleStartMerge} disabled={isMerging} className="h-9 px-5 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-bold shadow-md cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:bg-blue-800">
                {isMerging ? <Loader2 size={15} className="animate-spin" /> : <Merge size={15} />}
                {isMerging ? 'Processing...' : `Generate Output UI`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === MODAL GEN AUDIO BATCH === */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-[#15151A] border border-[#2A2A30] rounded-2xl p-5 w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl text-xs relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer"><X size={16} /></button>
            <h3 className="text-sm font-bold border-b border-[#2A2A30] pb-3 text-purple-400 flex items-center gap-2"><Music size={16} /> Cấu hình sinh âm thanh đồng loạt</h3>
            
            <div className="flex gap-2 mt-4 shrink-0">
              <button onClick={handleSelectAll} className="h-6 px-2.5 bg-[#2A2A30] hover:bg-[#3A3A40] rounded text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer text-gray-300 hover:text-white">Chọn tất cả</button>
              <button onClick={handleDeselectAll} className="h-6 px-2.5 bg-[#2A2A30] hover:bg-[#3A3A40] rounded text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer text-gray-300 hover:text-white">Bỏ chọn tất cả</button>
            </div>
            
            <div className="text-[11px] text-gray-400 font-bold uppercase mt-4 mb-2 tracking-wider">Scenes chưa có audio ({filteredScenesForAudio.length})</div>
            <div className="flex-1 overflow-y-auto border border-[#2A2A30] rounded-lg p-2 bg-[#0E0E10] space-y-2 min-h-0">
              {filteredScenesForAudio.length === 0 ? (
                <div className="text-center text-gray-500 py-8 text-[11px]">Không có cảnh nào cần xử lý âm thanh.</div>
              ) : (
                filteredScenesForAudio.map((scene) => {
                  const isChecked = !!checkedScenes[scene.scene_n];
                  return (
                    <div key={scene.scene_n} onClick={() => handleToggleCheck(scene.scene_n)} className={`flex items-start gap-3 p-2.5 rounded-lg border transition-all cursor-pointer select-none ${isChecked ? 'bg-purple-600/10 border-purple-500/50' : 'bg-[#15151A] border-[#2A2A30] hover:border-gray-600'}`}>
                      <div className="mt-0.5 shrink-0 text-purple-400">{isChecked ? <CheckSquare size={15} /> : <Square size={15} className="text-gray-500" />}</div>
                      <div className="space-y-0.5 min-w-0 text-[11px]">
                        <div className="font-bold text-blue-400">Scene_n: {scene.scene_n}</div>
                        <div className="text-gray-200 truncate"><span className="text-gray-400 font-medium">Voiceover:</span> {scene.Voiceover}</div>
                        <div className="text-gray-400 italic truncate"><span className="text-gray-500 font-medium font-normal">Translate:</span> {scene.Translate || "N/A"}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#2A2A30] pt-3 mt-3 shrink-0">
              <button onClick={() => setIsModalOpen(false)} className="h-8 px-4 bg-[#2A2A30] hover:bg-[#3A3A40] text-gray-300 rounded-md font-semibold cursor-pointer">Hủy bỏ</button>
              <button onClick={handleStartBatchGen} className="h-8 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-md font-bold shadow-md cursor-pointer">Bắt đầu Gen Audio</button>
            </div>
          </div>
        </div>
      )}

      {/* === MODAL EXPORT OUTPUT (ORIGINAL) === */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-[#15151A] border border-[#2A2A30] rounded-2xl p-5 w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl text-xs relative">
            <button onClick={() => setIsExportModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer"><X size={16} /></button>
            <h3 className="text-sm font-bold border-b border-[#2A2A30] pb-3 text-gray-300 flex items-center gap-2"><Download size={16} /> Tải Video Gốc (Chưa Merge)</h3>
            <div className="flex gap-2 mt-4 shrink-0">
              <button onClick={handleSelectAllExport} className="h-6 px-2.5 bg-[#2A2A30] hover:bg-[#3A3A40] rounded text-[11px] font-medium transition-all cursor-pointer text-gray-300 hover:text-white">Chọn tất cả</button>
              <button onClick={handleDeselectAllExport} className="h-6 px-2.5 bg-[#2A2A30] hover:bg-[#3A3A40] rounded text-[11px] font-medium transition-all cursor-pointer text-gray-300 hover:text-white">Bỏ chọn tất cả</button>
            </div>
            <div className="text-[11px] text-gray-400 font-bold uppercase mt-4 mb-2 tracking-wider">Chọn Scene để xuất ({parsedData.length})</div>
            <div className="flex-1 overflow-y-auto border border-[#2A2A30] rounded-lg p-2 bg-[#0E0E10] space-y-1 min-h-0">
              {parsedData.map((scene) => {
                const isChecked = !!checkedExportScenes[scene.scene_n];
                return (
                  <div key={scene.scene_n} onClick={() => handleToggleExportCheck(scene.scene_n)} className={`flex items-center gap-3 p-2 rounded-md border transition-all cursor-pointer select-none ${isChecked ? 'bg-gray-600/30 border-gray-500/50 text-white' : 'bg-[#15151A] border-[#2A2A30] text-gray-300 hover:border-gray-600'}`}>
                    {isChecked ? <CheckSquare size={14} /> : <Square size={14} className="text-gray-500" />}
                    <div className="font-bold">Scene_n: {scene.scene_n}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#2A2A30] pt-3 mt-3 shrink-0">
              <button onClick={() => setIsExportModalOpen(false)} className="h-8 px-4 bg-[#2A2A30] hover:bg-[#3A3A40] text-gray-300 rounded-md font-semibold cursor-pointer">Hủy bỏ</button>
              <button onClick={handleDownloadVideos} className="h-8 px-4 bg-gray-600 hover:bg-gray-500 text-white rounded-md font-bold shadow-md cursor-pointer">Tải Video Gốc</button>
            </div>
          </div>
        </div>
      )}

      {/* === MODAL GEN AUDIO TỪNG CẢNH === */}
      {activeGenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-[#15151A] border border-[#2A2A30] rounded-2xl p-5 w-full max-w-md flex flex-col shadow-2xl text-xs relative">
            <button onClick={() => setActiveGenModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer transition-colors"><X size={16} /></button>
            <h3 className="text-sm font-bold border-b border-[#2A2A30] pb-3 text-purple-400 flex items-center gap-2"><Mic size={16} /> Audio - Scene {activeGenModal.scene_n}</h3>
            
            <div className="mt-4 space-y-3">
              <div className="bg-[#0E0E10] border border-[#2A2A30] rounded-lg p-3">
                <div className="text-gray-500 font-medium mb-1.5 flex items-center gap-1"><AlignLeft size={12} /> Voiceover:</div>
                <p className="text-gray-200 leading-relaxed text-[11px] whitespace-pre-wrap">{activeGenModal.Voiceover || "N/A"}</p>
              </div>
              <div className="bg-[#0E0E10] border border-[#2A2A30] rounded-lg p-3">
                <div className="text-gray-500 font-medium mb-1.5 flex items-center gap-1"><Globe size={12} /> Translate:</div>
                <p className="text-gray-400 italic leading-relaxed text-[11px] whitespace-pre-wrap">{activeGenModal.Translate || "N/A"}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-[#2A2A30] pt-3 mt-4 shrink-0">
              <button onClick={() => setActiveGenModal(null)} className="h-8 px-4 bg-[#2A2A30] hover:bg-[#3A3A40] text-gray-300 rounded-md font-semibold cursor-pointer transition-colors">Hủy bỏ</button>
              <button onClick={() => { handleGenAudio(activeGenModal.scene_n, activeGenModal.Voiceover); setActiveGenModal(null); }} className="h-8 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-md font-bold shadow-md cursor-pointer flex items-center gap-1.5 transition-colors">
                <Mic size={13} /> Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}