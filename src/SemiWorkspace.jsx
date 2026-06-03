import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, updateProjectProgress, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from './firebase.js';
import { FileText, Video, AlignLeft, Globe, Hash, Mic, Volume2, Music, Merge, LayoutDashboard, Sliders, X, CheckSquare, Square, Download, Upload, Trash2, Loader2, Play, Clock } from 'lucide-react';

export default function SemiWorkspace({ ffmpeg, isFfmpegReady }) { 
  const { projectId } = useParams(); 
  const [parsedData, setParsedData] = useState([]); 
  const [isDataLoading, setIsDataLoading] = useState(true); 

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

  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [checkedMergeScenes, setCheckedMergeScenes] = useState({});
  const [globalMixVol, setGlobalMixVol] = useState(35); 
  const [isMerging, setIsMerging] = useState(false); 
  const [mergedVideos, setMergedVideos] = useState({});

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
          setParsedData(projectInfo.data || []);
          
          // 🚀 KHÔI PHỤC TOÀN BỘ TIẾN ĐỘ TỪ FIREBASE (Chống mất dữ liệu khi F5)
          if (projectInfo.generatedAudios) setGeneratedAudios(projectInfo.generatedAudios);
          if (projectInfo.mergedVideos) setMergedVideos(projectInfo.mergedVideos);
          if (projectInfo.voiceCloneRefText) setVoiceCloneRefText(projectInfo.voiceCloneRefText);
          
          if (projectInfo.voiceCloneBase64) {
            setVoiceCloneBase64(projectInfo.voiceCloneBase64);
            setVoiceCloneUrl(projectInfo.voiceCloneBase64); // Dùng Base64 làm URL phát
            setVoiceCloneFile({ name: "Voice_Clone_Saved.mp3" }); // Fake file name
          }
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
  const avgDuration = "00:05";
  const estCost = `$${(totalVoice * 0.01).toFixed(2)}`;
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
      alert("Đường truyền có vấn đề, không thể tải video!");
    }
  };

  const handleGenAudio = async (sceneNo, scriptText) => {
    if (!scriptText || scriptText.trim() === '') return;
    setIsGenerating(prev => ({ ...prev, [sceneNo]: true }));

    try {
      let cleanText = scriptText.trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
      if (!cleanText.match(/[.!?]$/)) cleanText += '.';

      const isVoiceClone = !!(voiceCloneFile && voiceCloneBase64);
      const endpoint = isVoiceClone 
        ? "https://queue.fal.run/fal-ai/dia-tts/voice-clone" 
        : "https://queue.fal.run/fal-ai/dia-tts";

      // 🚀 VÁ LỖI 1: TUYỆT ĐỐI BỎ [S1] KHỎI CHẾ ĐỘ VOICE CLONE
      const payload = isVoiceClone 
        ? { 
            text: cleanText, // Văn bản tinh khiết, không có [S1]
            ref_audio_url: voiceCloneBase64, 
            ref_text: voiceCloneRefText.trim() 
          }
        : { text: `[S1] ${cleanText}` };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { 
            "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}`, 
            "Content-Type": "application/json" 
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`API Fal AI từ chối yêu cầu. ${errorData.detail || response.statusText}`);
      }

      const queueData = await response.json();
      let result = null;

      if (queueData.status_url) {
        // 🚀 VÁ LỖI 2: KHÔI PHỤC BIẾN ATTEMPTS ĐỂ CHỐNG TREO TRÌNH DUYỆT VĨNH VIỄN
        let attempts = 0;
        const maxAttempts = 60; // Chờ tối đa 2 phút (60 x 2s)
        
        while (attempts < maxAttempts) {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const statusRes = await fetch(queueData.status_url, {
            method: "GET", headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}` }
          });
          const statusJson = await statusRes.json();
          
          if (statusJson.status === "COMPLETED") {
            const finalLink = statusJson.response_url || queueData.response_url;
            if (finalLink) {
                const finalRes = await fetch(finalLink, {
                    method: "GET", 
                    headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}` }
                });
                result = await finalRes.json(); 
            } else {
                result = statusJson.payload || statusJson.data || statusJson;
            }
            break;
          } else if (statusJson.status === "FAILED") {
            throw new Error(statusJson.error || "Lỗi xử lý AI từ server.");
          }
        }
        
        if (attempts >= maxAttempts) throw new Error("Quá thời gian chờ API từ hệ thống (Timeout).");
      } else {
        result = queueData;
      }

      // 🚀 IN RA CONSOLE ĐỂ THEO DÕI TOÀN BỘ KẾT QUẢ CỦA FAL
      console.log(`>> Kết quả Fal AI Scene ${sceneNo}:`, result);

      // 🚀 VÁ LỖI 3: QUÉT MỌI NGÓC NGÁCH CHỨA LINK AUDIO CỦA FAL AI
      const audioUrl = 
        result?.audio_file?.url || 
        result?.audio?.url || 
        result?.audio_url || 
        result?.url || 
        (typeof result?.audio_file === 'string' ? result.audio_file : null) ||
        (typeof result?.audio === 'string' ? result.audio : null);
      
      if (audioUrl) {
        const newAudios = { ...generatedAudios, [sceneNo]: audioUrl };
        setGeneratedAudios(newAudios);
        await updateProjectProgress(projectId, { generatedAudios: newAudios });
      } else {
          // Văng data lỗi ra màn hình để bắt bệnh nếu Fal AI đổi cấu trúc
          throw new Error(`Fal trả về Data lạ không có Audio URL: ${JSON.stringify(result).substring(0, 150)}... Bấm F12 xem chi tiết.`);
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
    
    setIsModalOpen(false); // Đóng modal ngay lập tức để thấy giao diện loading
    
    // 🚀 Bắn TẤT CẢ các request lên Fal AI cùng một lúc
    const promises = selectedSceneNumbers.map(sceneNo => {
      const scene = parsedData.find(s => String(s.scene_n) === String(sceneNo));
      if (scene && scene.Voiceover) {
        return handleGenAudio(scene.scene_n, scene.Voiceover);
      }
      return Promise.resolve();
    });

    try {
      // Đợi cho đến khi TẤT CẢ các audio đều xử lý xong
      await Promise.all(promises); 
    } catch (error) {
      console.error("Lỗi khi chạy Gen All:", error);
    } finally {
      setCheckedScenes({});
    }
  };

  const handleToggleExportCheck = (sceneNo) => setCheckedExportScenes(prev => ({ ...prev, [sceneNo]: !prev[sceneNo] }));
  const handleSelectAllExport = () => {
    const newChecked = {};
    parsedData.forEach(scene => { 
      if (mergedVideos[scene.scene_n]) {
        newChecked[scene.scene_n] = true; 
      }
    });
    setCheckedExportScenes(newChecked);
  };
  const handleDeselectAllExport = () => setCheckedExportScenes({});

  const handleDownloadVideos = async () => {
    const scenesToExport = parsedData.filter(scene => checkedExportScenes[scene.scene_n] && mergedVideos[scene.scene_n]);
    if (scenesToExport.length === 0) return alert("Vui lòng chọn ít nhất 1 Output để tải!");
    
    alert(`⏳ Đang chuẩn bị tải ${scenesToExport.length} video Output. \n\nLƯU Ý: Nếu trình duyệt hỏi "Allow downloading multiple files", hãy bấm Allow (Cho phép) nhé!`);
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

        if (!aiAudioUrl) {
          finalUrl = videoUrl; 
        } 
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
             
             // 🚀 TẢI LÊN CLOUDINARY ĐỂ BẢO TOÀN VIDEO KHI F5
             const formData = new FormData();
             formData.append('file', outBlob);
             formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
             formData.append('resource_type', 'video');
             
             try {
               const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, {
                 method: 'POST', body: formData
               });
               const uploadDataRes = await uploadRes.json();
               if (uploadDataRes.secure_url) {
                 finalUrl = uploadDataRes.secure_url; 
               }
             } catch(err) {
               console.error("Lỗi upload video output:", err);
               finalUrl = URL.createObjectURL(outBlob); // Fallback: Dùng link tạm nếu mất mạng
             }
          }

          await ffmpeg.deleteFile(inVid);
          await ffmpeg.deleteFile(inAud);
          try { await ffmpeg.deleteFile(outName); } catch(e) {}
        }

        if (finalUrl) {
          setMergedVideos(prev => {
             const newMergedVideos = { ...prev, [scene.scene_n]: finalUrl };
             // 🚀 LƯU LÊN FIREBASE
             updateProjectProgress(projectId, { mergedVideos: newMergedVideos });
             return newMergedVideos;
          });
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
      // 1. Chuyển sang Base64 để gửi cho AI Whisper (Vì API này cần file thô)
      const base64Audio = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
      });

      // 2. Upload file audio lên Cloudinary để lấy link URL gọn nhẹ
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      formData.append('resource_type', 'auto'); // Auto để nhận diện audio

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`, {
         method: 'POST', body: formData
      });
      const uploadDataRes = await uploadRes.json();
      const audioCloudUrl = uploadDataRes.secure_url;

      // Lưu link URL vào State thay vì chuỗi Base64
      setVoiceCloneBase64(audioCloudUrl);

      // 3. Gọi AI Whisper lấy text
      const response = await fetch("https://fal.run/fal-ai/whisper", {
        method: "POST",
        headers: { "Authorization": `Key ${import.meta.env.VITE_FAL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ audio_url: base64Audio }),
      });
      
      const result = await response.json();
      const refText = result.text ? result.text.trim() : "Không nhận diện được giọng.";
      setVoiceCloneRefText(refText);

      // 4. 🚀 LƯU FIREBASE: Chỉ lưu link URL ngắn của Cloudinary, không sợ vượt quá 1MB
      await updateProjectProgress(projectId, {
          voiceCloneBase64: audioCloudUrl, 
          voiceCloneRefText: refText
      });
      
    } catch (error) {
      console.error(error);
      setVoiceCloneRefText("Lỗi upload hoặc nhận diện. Hãy thử lại.");
    } finally { setIsTranscribing(false); }
  };

  const handleRemoveVoice = async () => {
    if (voiceCloneUrl && voiceCloneUrl.startsWith('blob:')) URL.revokeObjectURL(voiceCloneUrl);
    setVoiceCloneFile(null); setVoiceCloneUrl(null); setVoiceCloneBase64(null);
    setVoiceCloneRefText(""); setIsTranscribing(false);
    if (fileInputRef.current) fileInputRef.current.value = null;

    // 🚀 XÓA VOICE CLONE KHỎI FIREBASE
    await updateProjectProgress(projectId, {
        voiceCloneBase64: null,
        voiceCloneRefText: ""
    });
  };

  const filteredScenesForAudio = parsedData.filter(scene => 
    !generatedAudios[scene.scene_n] && (scene.Voiceover && scene.Voiceover.trim() !== '')
  );

  return (
    <div className="h-screen w-full bg-[#0E0E10] font-sans text-white p-4 overflow-y-auto relative">
      <div className="flex flex-col gap-5 max-w-7xl mx-auto pb-16 pr-52">
        
        {/* BẢNG TỔNG QUAN */}
        <div className="bg-[#15151A] border border-[#2A2A30] rounded-xl p-4 shadow-md">
          <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wider mb-3 border-b border-[#2A2A30] pb-2">
            <LayoutDashboard size={14} /> Bảng tổng quan dự án
          </div>
          <div className="grid grid-cols-7 gap-4 text-center">
            <div className="bg-[#0E0E10] p-2.5 rounded-lg border border-[#2A2A30]">
              <div className="text-[11px] text-gray-400 font-medium">Total Scene</div>
              <div className="text-sm font-bold text-white mt-1">{totalScenes}</div>
            </div>
            <div className="bg-[#0E0E10] p-2.5 rounded-lg border border-[#2A2A30]">
              <div className="text-[11px] text-gray-400 font-medium">Total Voice</div>
              <div className="text-sm font-bold text-blue-400 mt-1">{totalVoice}</div>
            </div>
            <div className="bg-[#0E0E10] p-2.5 rounded-lg border border-[#2A2A30]">
              <div className="text-[11px] text-gray-400 font-medium">Avg Duration</div>
              <div className="text-sm font-bold text-green-400 mt-1">{avgDuration}</div>
            </div>
            <div className="bg-[#0E0E10] p-2.5 rounded-lg border border-[#2A2A30]">
              <div className="text-[11px] text-gray-400 font-medium">Est Cost</div>
              <div className="text-sm font-bold text-yellow-500 mt-1">{estCost}</div>
            </div>
            <div className="bg-[#0E0E10] p-2.5 rounded-lg border border-[#2A2A30]">
              <div className="text-[11px] text-gray-400 font-medium">Image Gen</div>
              <div className="text-sm font-bold text-gray-300 mt-1">0 / {totalScenes}</div>
            </div>
            <div className="bg-[#0E0E10] p-2.5 rounded-lg border border-[#2A2A30]">
              <div className="text-[11px] text-gray-400 font-medium">Audio Gen</div>
              <div className="text-sm font-bold text-purple-400 mt-1">{audioGenStatus}</div>
            </div>
            <div className="bg-[#0E0E10] p-2.5 rounded-lg border border-[#2A2A30]">
              <div className="text-[11px] text-gray-400 font-medium">Video Gen</div>
              <div className="text-sm font-bold text-orange-400 mt-1">0 / {totalScenes}</div>
            </div>
          </div>
        </div>

        {/* DANH SÁCH SCENE */}
        {parsedData.map((scene, index) => {
          const isLoading = isGenerating[scene.scene_n];
          const hasAudio = generatedAudios[scene.scene_n];
          const hasOutput = mergedVideos[scene.scene_n];

          return (
            <div key={index} className="flex gap-6 bg-[#121216] hover:bg-[#16161B] p-5 rounded-2xl border border-[#2A2A30] hover:border-gray-600 shadow-lg transition-all items-stretch group">
              
              {/* CỘT VIDEO */}
              <div className="w-[180px] flex flex-col gap-4 shrink-0">
                <div className="flex flex-col bg-[#0A0A0C] rounded-xl p-2 border border-[#2A2A30] shadow-sm">
                  <div className="flex items-center justify-between border-b border-[#2A2A30] pb-1.5 mb-1.5 px-1">
                    <div className="flex items-center gap-1.5 text-purple-400">
                      <Video size={13} /> 
                      <span className="text-[10px] font-bold uppercase tracking-widest">Input</span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-medium">S_{scene.scene_n}</span>
                  </div>
                  
                  <div className="w-full aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center relative">
                    {scene.videoUrl ? (
                      <video src={scene.videoUrl} crossOrigin="anonymous" controls className="w-full h-full object-contain" />
                    ) : (
                      <div className="text-center flex flex-col items-center gap-1.5 opacity-40">
                        <Video size={18} className="text-gray-400" />
                      </div>
                    )}
                  </div>
                </div>

                {hasOutput && (
                  <div className="flex flex-col bg-[#0A0A0C] rounded-xl p-2 border border-green-500/40 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
                    <div className="flex items-center justify-between border-b border-[#2A2A30] pb-1.5 mb-1.5 px-1">
                      <div className="flex items-center gap-1.5 text-green-400">
                        <CheckSquare size={13} /> 
                        <span className="text-[10px] font-bold uppercase tracking-widest">Output</span>
                      </div>
                      
                      <button 
                        onClick={() => forceDownloadVideo(hasOutput, `Scene_${scene.scene_n}_Output.mp4`)}
                        className="text-[9px] font-bold text-white bg-green-600 hover:bg-green-500 px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Download size={10} /> Tải
                      </button>
                    </div>
                    
                    <div className="w-full aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center relative">
                      <video src={hasOutput} crossOrigin="anonymous" controls className="w-full h-full object-contain" />
                    </div>
                  </div>
                )}
              </div>

              {/* CỘT THÔNG TIN */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="space-y-3.5 flex-1">
                  
                  <div className="flex gap-3 items-start text-sm">
                    <span className="text-gray-400 font-medium shrink-0 w-16 flex items-center gap-1.5 mt-1">
                      <AlignLeft size={14} /> Voice:
                    </span>
                    <p className="text-gray-200 leading-relaxed bg-[#1A1A21] px-4 py-2.5 rounded-lg flex-1 border border-[#2A2A30] shadow-inner">
                      {scene.Voiceover || "N/A"}
                    </p>
                  </div>

                  <div className="flex gap-3 items-start text-sm">
                    <span className="text-gray-500 font-medium shrink-0 w-16 flex items-center gap-1.5 mt-1">
                      <Globe size={14} /> Trans:
                    </span>
                    <p className="text-gray-400 italic leading-relaxed bg-[#0E0E10] px-4 py-2.5 rounded-lg flex-1 border border-[#1A1A21]">
                      {scene.Translate || "N/A"}
                    </p>
                  </div>
                  
                  <div className="flex gap-6 text-[11px] pt-1 px-1 border-t border-[#2A2A30]/50 pt-3 mt-2">
                    <div className="flex items-center gap-1.5"><Clock size={13} className="text-gray-500"/> <span className="text-gray-500">Thời gian:</span><span className="text-green-400 font-bold bg-green-500/10 px-1.5 py-0.5 rounded">{scene.time_origin}</span></div>
                    <div className="flex items-center gap-1.5"><span className="text-gray-500">Số từ:</span><span className="text-blue-400 font-bold">{scene.Word_count || 0}</span></div>
                    <div className="flex items-center gap-1.5"><span className="text-gray-500">Giọng điệu:</span><span className="text-purple-400 font-bold">{scene.Tone_of_Voice || "Tự nhiên"}</span></div>
                  </div>
                </div>

                {hasAudio && (
                  <div className="mt-3 bg-green-500/10 border border-green-500/30 p-2.5 rounded-xl flex items-center gap-3">
                    <Play size={16} className="text-green-400 shrink-0" />
                    <audio src={hasAudio} crossOrigin="anonymous" controls className="h-7 w-full [&::-webkit-media-controls-panel]:bg-[#1A1A21]" />
                  </div>
                )}

                <div className="flex items-center gap-3 bg-[#0A0A0C] p-2.5 rounded-xl border border-[#2A2A30] mt-4 shrink-0 shadow-inner">
                  <button 
                    onClick={() => setActiveGenModal({ scene_n: scene.scene_n, Voiceover: scene.Voiceover, Translate: scene.Translate })} 
                    disabled={isLoading}
                    className={`h-8 px-5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shrink-0 ${isLoading ? 'bg-gray-600/20 text-gray-400 cursor-not-allowed' : 'bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:text-purple-300'}`}
                  >
                    {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />} 
                    {isLoading ? 'Đang tạo Audio...' : (hasAudio ? 'Gen Lại Audio' : 'Gen Audio')}
                  </button>
                  
                  {!hasOutput && (
                    <>
                      <div className="w-[1px] h-5 bg-[#2A2A30] shrink-0"></div>
                      <span className="text-[11px] text-gray-500 flex-1 ml-1 italic">Đợi chạy batch Merge All ở bảng điều khiển...</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* BẢNG ĐIỀU KHIỂN CỐ ĐỊNH BÊN PHẢI */}
      <div className="fixed right-5 top-24 bg-[#15151A] border border-[#2A2A30] rounded-xl p-4 shadow-2xl z-20 flex flex-col gap-3 w-[220px]">
        <div className="flex items-center gap-1.5 text-gray-400 text-[11px] font-bold uppercase tracking-wider border-b border-[#2A2A30] pb-2">
          <Sliders size={14} /> Bảng điều khiển
        </div>
        
        <button onClick={() => setIsMergeModalOpen(true)} className="w-full h-9 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer mt-1">
          <Merge size={14} /> Merge All Videos
        </button>

        <button onClick={() => setIsExportModalOpen(true)} className="w-full h-9 bg-[#2A2A30] hover:bg-gray-600 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer">
          <Download size={14} /> Export Output
        </button>

        <button onClick={() => setIsModalOpen(true)} className="w-full h-9 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer mt-2">
          <Music size={14} /> Gen All Audio
        </button>

        <div className="bg-[#0E0E10] border border-[#2A2A30] rounded-lg p-3 flex flex-col gap-2 mt-2">
          <div className="text-[11px] font-bold text-purple-400 uppercase tracking-wider flex justify-between items-center mb-1">
            Voice Clone
            {voiceCloneFile && (
              <button onClick={handleRemoveVoice} className="text-red-400 hover:text-red-300 cursor-pointer" title="Xóa file">
                <Trash2 size={13} />
              </button>
            )}
          </div>
          
          <input type="file" accept="audio/mp3,audio/wav" ref={fileInputRef} onChange={handleVoiceUpload} className="hidden" />
          
          {!voiceCloneFile ? (
            <button onClick={() => fileInputRef.current.click()} className="w-full h-8 border border-dashed border-gray-600 hover:border-purple-400 text-gray-400 hover:text-purple-400 rounded-md text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
              <Upload size={13} /> Tải file MP3
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] text-gray-300 truncate" title={voiceCloneFile.name}>{voiceCloneFile.name}</span>
              <audio src={voiceCloneUrl} crossOrigin="anonymous" controls className="w-full h-7 [&::-webkit-media-controls-panel]:bg-[#2A2A30]" />
              
              <div className="relative mt-1">
                <input 
                  type="text" 
                  value={voiceCloneRefText}
                  onChange={(e) => setVoiceCloneRefText(e.target.value)}
                  disabled={isTranscribing}
                  className={`w-full h-8 px-2 pr-7 bg-[#1A1A21] border border-[#2A2A30] rounded-md text-[11px] text-gray-300 focus:border-purple-500 focus:outline-none placeholder-gray-600 ${isTranscribing ? 'opacity-70 cursor-not-allowed' : ''}`}
                />
                {isTranscribing && (
                  <Loader2 size={13} className="absolute right-2 top-2 animate-spin text-purple-400" />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* === MODAL MERGE ALL VIDEOS === */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#15151A] border border-[#2A2A30] rounded-2xl p-6 w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl text-xs relative">
            <button onClick={() => !isMerging && setIsMergeModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer"><X size={18} /></button>
            
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
              <div className="text-[10px] text-gray-500 mt-3 leading-relaxed">
                With dialogue: 0 = dialogue only, 1 = full original mixed in. Without dialogue: 0 = mute input track, 1 = keep input audio.
              </div>
            </div>

            <div className="flex gap-2 mt-5 shrink-0">
              <button onClick={handleSelectAllMerge} disabled={isMerging} className="h-8 px-4 bg-[#2A2A30] border border-gray-600 hover:bg-[#3A3A40] rounded-lg text-xs font-medium transition-all cursor-pointer text-gray-300 hover:text-white disabled:opacity-50">Select all</button>
              <button onClick={handleDeselectAllMerge} disabled={isMerging} className="h-8 px-4 bg-[#2A2A30] border border-gray-600 hover:bg-[#3A3A40] rounded-lg text-xs font-medium transition-all cursor-pointer text-gray-300 hover:text-white disabled:opacity-50">Deselect all</button>
            </div>
            
            <div className="text-xs text-gray-400 font-bold mt-5 mb-2 flex justify-between">
              <span>Scenes to process</span>
              <span>({Object.values(checkedMergeScenes).filter(Boolean).length} / {parsedData.length} selected)</span>
            </div>

            <div className="flex-1 overflow-y-auto border border-[#2A2A30] rounded-xl p-2.5 bg-[#0E0E10] space-y-2 min-h-[160px]">
              {parsedData.map((scene) => {
                const isChecked = !!checkedMergeScenes[scene.scene_n];
                const hasAiAudio = !!generatedAudios[scene.scene_n];
                return (
                  <div key={scene.scene_n} onClick={() => !isMerging && handleToggleMergeCheck(scene.scene_n)} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${isChecked ? 'bg-blue-600/10 border-blue-500/50' : 'bg-[#15151A] border-[#2A2A30] hover:border-gray-600'} ${isMerging ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{isChecked ? <CheckSquare size={16} className="text-blue-400" /> : <Square size={16} className="text-gray-500" />}</div>
                      <div>
                        <div className={`font-bold text-[13px] ${isChecked ? 'text-blue-400' : 'text-gray-300'}`}>Scene {scene.scene_n}</div>
                        <div className="text-[11px] text-gray-500 mt-1">
                          {hasAiAudio ? 'Sẽ Merge Video Gốc + AI Audio' : 'Chưa có Audio (Pass qua Video Gốc)'}
                        </div>
                      </div>
                    </div>
                    {hasAiAudio && <Mic size={16} className="text-purple-400" title="Có Audio AI" />}
                  </div>
                );
              })}
            </div>
            
            <div className="flex justify-end gap-3 border-t border-[#2A2A30] pt-4 mt-5 shrink-0">
              <button onClick={() => setIsMergeModalOpen(false)} disabled={isMerging} className="h-10 px-6 bg-transparent border border-gray-600 hover:bg-[#3A3A40] text-gray-300 rounded-lg font-semibold cursor-pointer disabled:opacity-50">Close</button>
              <button onClick={handleStartMerge} disabled={isMerging} className="h-10 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-md cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:bg-blue-800">
                {isMerging ? <Loader2 size={16} className="animate-spin" /> : <Merge size={16} />}
                {isMerging ? 'Processing...' : `Generate Output UI`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === MODAL GEN AUDIO BATCH === */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#15151A] border border-[#2A2A30] rounded-2xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl text-xs relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer"><X size={18} /></button>
            <h3 className="text-base font-bold border-b border-[#2A2A30] pb-3 text-purple-400 flex items-center gap-2"><Music size={18} /> Cấu hình sinh âm thanh đồng loạt</h3>
            
            <div className="flex gap-2 mt-5 shrink-0">
              <button onClick={handleSelectAll} className="h-8 px-4 bg-[#2A2A30] hover:bg-[#3A3A40] rounded-lg text-xs font-medium flex items-center gap-1 transition-all cursor-pointer text-gray-300 hover:text-white">Chọn tất cả</button>
              <button onClick={handleDeselectAll} className="h-8 px-4 bg-[#2A2A30] hover:bg-[#3A3A40] rounded-lg text-xs font-medium flex items-center gap-1 transition-all cursor-pointer text-gray-300 hover:text-white">Bỏ chọn tất cả</button>
            </div>
            
            <div className="text-xs text-gray-400 font-bold uppercase mt-5 mb-2 tracking-wider">Scenes chưa có audio ({filteredScenesForAudio.length})</div>
            <div className="flex-1 overflow-y-auto border border-[#2A2A30] rounded-xl p-2.5 bg-[#0E0E10] space-y-2 min-h-0">
              {filteredScenesForAudio.length === 0 ? (
                <div className="text-center text-gray-500 py-10 text-xs">Không có cảnh nào cần xử lý âm thanh.</div>
              ) : (
                filteredScenesForAudio.map((scene) => {
                  const isChecked = !!checkedScenes[scene.scene_n];
                  return (
                    <div key={scene.scene_n} onClick={() => handleToggleCheck(scene.scene_n)} className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${isChecked ? 'bg-purple-600/10 border-purple-500/50' : 'bg-[#15151A] border-[#2A2A30] hover:border-gray-600'}`}>
                      <div className="mt-0.5 shrink-0 text-purple-400">{isChecked ? <CheckSquare size={16} /> : <Square size={16} className="text-gray-500" />}</div>
                      <div className="space-y-1 min-w-0 text-xs">
                        <div className="font-bold text-[13px] text-blue-400">Scene {scene.scene_n}</div>
                        <div className="text-gray-200 truncate leading-relaxed"><span className="text-gray-400 font-medium">Voiceover:</span> {scene.Voiceover}</div>
                        <div className="text-gray-400 italic truncate"><span className="text-gray-500 font-medium font-normal">Dịch:</span> {scene.Translate || "N/A"}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-[#2A2A30] pt-4 mt-4 shrink-0">
              <button onClick={() => setIsModalOpen(false)} className="h-10 px-6 bg-[#2A2A30] hover:bg-[#3A3A40] text-gray-300 rounded-lg font-semibold cursor-pointer">Hủy bỏ</button>
              <button onClick={handleStartBatchGen} className="h-10 px-6 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold shadow-md cursor-pointer">Bắt đầu Gen Audio</button>
            </div>
          </div>
        </div>
      )}

      {/* === MODAL EXPORT OUTPUT === */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#15151A] border border-[#2A2A30] rounded-2xl p-6 w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl text-xs relative">
            <button onClick={() => setIsExportModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer"><X size={18} /></button>
            <h3 className="text-base font-bold border-b border-[#2A2A30] pb-3 text-green-400 flex items-center gap-2"><Download size={18} /> Tải Video Output (Đã Merge)</h3>
            
            {Object.keys(mergedVideos).length === 0 ? (
              <div className="text-center text-gray-500 py-10 text-xs">
                Chưa có video Output nào được tạo.<br/>Bạn hãy chạy "Merge All Videos" ở bảng điều khiển trước nhé!
              </div>
            ) : (
              <>
                <div className="flex gap-2 mt-5 shrink-0">
                  <button onClick={handleSelectAllExport} className="h-8 px-4 bg-[#2A2A30] hover:bg-[#3A3A40] rounded-lg text-xs font-medium transition-all cursor-pointer text-gray-300 hover:text-white">Chọn tất cả</button>
                  <button onClick={handleDeselectAllExport} className="h-8 px-4 bg-[#2A2A30] hover:bg-[#3A3A40] rounded-lg text-xs font-medium transition-all cursor-pointer text-gray-300 hover:text-white">Bỏ chọn tất cả</button>
                </div>
                <div className="text-xs text-gray-400 font-bold uppercase mt-5 mb-2 tracking-wider">Chọn Output để xuất ({Object.keys(mergedVideos).length})</div>
                <div className="flex-1 overflow-y-auto border border-[#2A2A30] rounded-xl p-2.5 bg-[#0E0E10] space-y-1.5 min-h-0">
                  {parsedData.filter(scene => mergedVideos[scene.scene_n]).map((scene) => {
                    const isChecked = !!checkedExportScenes[scene.scene_n];
                    return (
                      <div key={scene.scene_n} onClick={() => handleToggleExportCheck(scene.scene_n)} className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer select-none ${isChecked ? 'bg-green-600/20 border-green-500/50 text-white' : 'bg-[#15151A] border-[#2A2A30] text-gray-300 hover:border-gray-600'}`}>
                        {isChecked ? <CheckSquare size={16} className="text-green-400" /> : <Square size={16} className="text-gray-500" />}
                        <div className="font-bold text-[13px]">Scene {scene.scene_n} Output</div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end gap-3 border-t border-[#2A2A30] pt-4 mt-4 shrink-0">
                  <button onClick={() => setIsExportModalOpen(false)} className="h-10 px-6 bg-[#2A2A30] hover:bg-[#3A3A40] text-gray-300 rounded-lg font-semibold cursor-pointer">Hủy bỏ</button>
                  <button onClick={handleDownloadVideos} className="h-10 px-6 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold shadow-md cursor-pointer">Tải Output Đã Chọn</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* === MODAL GEN AUDIO LẺ === */}
      {activeGenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#15151A] border border-[#2A2A30] rounded-2xl p-6 w-full max-w-md flex flex-col shadow-2xl text-xs relative">
            <button onClick={() => setActiveGenModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer transition-colors"><X size={18} /></button>
            <h3 className="text-base font-bold border-b border-[#2A2A30] pb-3 text-purple-400 flex items-center gap-2"><Mic size={18} /> Audio - Scene {activeGenModal.scene_n}</h3>
            
            <div className="mt-5 space-y-4">
              <div className="bg-[#0E0E10] border border-[#2A2A30] rounded-xl p-4">
                <div className="text-gray-500 font-medium mb-2 flex items-center gap-1.5"><AlignLeft size={14} /> Voiceover:</div>
                <p className="text-gray-200 leading-relaxed text-[13px] whitespace-pre-wrap">{activeGenModal.Voiceover || "N/A"}</p>
              </div>
              <div className="bg-[#0E0E10] border border-[#2A2A30] rounded-xl p-4">
                <div className="text-gray-500 font-medium mb-2 flex items-center gap-1.5"><Globe size={14} /> Translate:</div>
                <p className="text-gray-400 italic leading-relaxed text-[13px] whitespace-pre-wrap">{activeGenModal.Translate || "N/A"}</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#2A2A30] pt-4 mt-5 shrink-0">
              <button onClick={() => setActiveGenModal(null)} className="h-10 px-6 bg-[#2A2A30] hover:bg-[#3A3A40] text-gray-300 rounded-lg font-semibold cursor-pointer transition-colors">Hủy bỏ</button>
              <button onClick={() => { handleGenAudio(activeGenModal.scene_n, activeGenModal.Voiceover); setActiveGenModal(null); }} className="h-10 px-6 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold shadow-md cursor-pointer flex items-center gap-2 transition-colors">
                <Mic size={14} /> Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}