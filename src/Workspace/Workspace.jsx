import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, updateProjectProgress } from "../firebase.js";
import { fetchFile } from '@ffmpeg/util';
import { FileText, AlignLeft, Mic, Merge, LayoutDashboard, Sliders, X, CheckSquare, Square, Download, Upload, Trash2, Loader2, Pencil, Save, Music, Users, Film, Play, Clock, Maximize, Video, Globe, Sun, Moon, User, ImagePlay, RotateCcw, MonitorPlay, Image as ImageIcon } from 'lucide-react';

import SetupTab from './SetupTab.jsx';
import StoryboardTab from './StoryboardTab.jsx';

// ─── Utilities ────────────────────────────────────────────────────────────────
const cn = (...classes) => classes.filter(Boolean).join(' ');

const withTimeout = (promise, ms, errorMessage) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

const proxifyUrl = (url) => {
  if (url && url.includes('cloudfront.net') && !url.includes('/api/proxy-audio')) {
    return `/api/proxy-audio?url=${encodeURIComponent(url)}`;
  }
  return url;
};

// ==========================================
// 🚀 CẤU HÌNH MINIMAX SPEECH-2.8-TURBO (WAVESPEED)
// ==========================================
const MINIMAX_TTS_ENDPOINT = "https://api.wavespeed.ai/api/v3/minimax/speech-2.8-turbo";

// Danh sách Custom Voice có sẵn — user chỉ được tích chọn, không tự nhập ID.
const MINIMAX_PRESET_VOICES = [
  { id: "Semicook", name: "Semicook", desc: "Giọng AI riêng của SemiContent" },
];

// ─── Shared modal overlay style ───────────────────────────────────────────────
const OVERLAY = "fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200";
const modalCard = (darkMode) => cn(
  "border rounded-2xl shadow-2xl relative animate-in zoom-in-95 duration-200",
  darkMode
    ? "bg-slate-900/80 backdrop-blur-xl border-white/[0.08] shadow-[0_0_60px_rgba(0,0,0,0.5)]"
    : "bg-white border-zinc-200"
);
const modalHeader = (darkMode) => cn("border-b", darkMode ? "border-white/[0.07]" : "border-zinc-200");
const modalFooter = (darkMode) => cn("border-t", darkMode ? "border-white/[0.07]" : "border-zinc-200");
const fieldInput = (darkMode) => cn(
  "w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 transition-all",
  darkMode
    ? "bg-slate-950/80 border-white/[0.08] text-slate-200 focus:border-amber-500/50 focus:ring-amber-500/10"
    : "bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-amber-500 focus:ring-amber-500/10"
);

export default function Workspace({ ffmpeg, isFfmpegReady, darkMode, setDarkMode }) {
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
  const [activeStartFrameModal, setActiveStartFrameModal] = useState(null);
  const [activeVideoGenModal, setActiveVideoGenModal] = useState(null);
  const [videoGenOptions, setVideoGenOptions] = useState({
    mode: 'start_frame_to_video',
    prompt: '',
    resolution: '480p'
  });

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

  // 🚀 VOICE MODE: "minimax" | "clone"
  const [voiceMode, setVoiceMode] = useState("minimax");
  const [minimaxVoiceId, setMinimaxVoiceId] = useState(MINIMAX_PRESET_VOICES[0].id);
  const [genModalText, setGenModalText] = useState("");
  const [voiceUploadStatus, setVoiceUploadStatus] = useState("");
  const [qwenEmbeddingUrl, setQwenEmbeddingUrl] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const [generatedAudios, setGeneratedAudios] = useState({});
  const [isGenerating, setIsGenerating] = useState({});
  const [isVideoGenerating, setIsVideoGenerating] = useState({});

  const [globalMixVol, setGlobalMixVol] = useState(35);
  const [singleMixVol, setSingleMixVol] = useState(35);
  const [isMerging, setIsMerging] = useState(false);
  const [mergingScenes, setMergingScenes] = useState({});
  const [mergedVideos, setMergedVideos] = useState({});

  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchGenProgress, setBatchGenProgress] = useState({ current: 0, total: 0 });
  const [batchMergeProgress, setBatchMergeProgress] = useState({ current: 0, total: 0 });

  const [isBatchVideoGenerating, setIsBatchVideoGenerating] = useState(false);

  const fileInputRef = useRef(null);
  const frameInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const charVoiceInputRef = useRef(null);
  const activeUploadIdRef = useRef(null);

  // 🚀 ĐỒNG BỘ TEXT VÀO MODAL GEN AUDIO TỪNG SCENE KHI MỞ
  useEffect(() => {
    if (activeGenModal) {
      setGenModalText(activeGenModal.textToGen || "");
    }
  }, [activeGenModal]);

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

          if (projectInfo.generatedAudios) {
            const proxiedAudios = {};
            Object.keys(projectInfo.generatedAudios).forEach(key => {
              proxiedAudios[key] = proxifyUrl(projectInfo.generatedAudios[key]);
            });
            setGeneratedAudios(proxiedAudios);
          }

          if (projectInfo.mergedVideos) setMergedVideos(projectInfo.mergedVideos);

          if (projectInfo.voiceCloneRefText) {
            if (projectInfo.voiceCloneRefText.includes("Tải lên thành công") || projectInfo.voiceCloneRefText.includes("Đang")) {
              setVoiceCloneRefText("");
            } else {
              setVoiceCloneRefText(projectInfo.voiceCloneRefText);
            }
          }

          if (projectInfo.qwenEmbeddingUrl) setQwenEmbeddingUrl(projectInfo.qwenEmbeddingUrl);
          if (projectInfo.voiceCloneBase64) {
            setVoiceCloneBase64(projectInfo.voiceCloneBase64);
            setVoiceCloneUrl(projectInfo.voiceCloneBase64);
            setVoiceCloneFile({ name: "Voice_Clone_Saved.mp3" });
          }

          // 🚀 KHÔI PHỤC VOICE MODE TỪ FIREBASE
          if (projectInfo.minimaxVoiceId && MINIMAX_PRESET_VOICES.some(v => v.id === projectInfo.minimaxVoiceId)) {
            setMinimaxVoiceId(projectInfo.minimaxVoiceId);
          }
          if (projectInfo.voiceMode === "minimax" || projectInfo.voiceMode === "clone") {
            setVoiceMode(projectInfo.voiceMode);
          } else if (projectInfo.voiceCloneBase64) {
            setVoiceMode("clone");
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

  const handleSaveSetupData = async (updatedCharacters, updatedParsedData) => {
    setProjectCharacters(updatedCharacters);
    if (updatedParsedData) setParsedData(updatedParsedData);
    try {
      const updates = { characters: updatedCharacters };
      if (updatedParsedData) updates.data = updatedParsedData;
      await updateProjectProgress(projectId, updates);
    } catch (err) { alert("Lỗi khi lưu SetupTab lên Cloud: " + err.message); }
  };

  const uploadFileToR2 = async (file, folderPrefix) => {
    const fileExt = file.name.split('.').pop() || 'bin';
    const uniqueFileName = `project_${projectId}/${folderPrefix}_${Date.now()}.${fileExt}`;
    const fileType = file.type || 'application/octet-stream';

    const urlRes = await fetch('/api/get-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: uniqueFileName, fileType })
    });
    if (!urlRes.ok) throw new Error("Lỗi xin link upload Vercel");
    const { uploadUrl } = await urlRes.json();

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': fileType }
    });
    if (!uploadRes.ok) throw new Error("Lỗi upload file lên R2");

    return `${import.meta.env.VITE_R2_PUBLIC_URL}/${uniqueFileName}`;
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    const charId = activeUploadIdRef.current;
    if (!file || !charId) return;

    const tempUrl = URL.createObjectURL(file);
    setProjectCharacters(prev => prev.map(c => c.id === charId ? { ...c, imageUrl: tempUrl } : c));

    try {
      const publicUrl = await uploadFileToR2(file, 'avatar');
      setProjectCharacters(prev => {
        const newChars = prev.map(c => c.id === charId ? { ...c, imageUrl: publicUrl } : c);
        updateProjectProgress(projectId, { characters: newChars });
        return newChars;
      });
    } catch (err) { console.error(err); alert("Không thể upload Avatar vĩnh viễn."); }
  };

  const handleCharVoiceUpload = async (e) => {
    const file = e.target.files[0];
    const charId = activeUploadIdRef.current;
    if (!file || !charId) return;
    e.target.value = null;

    const tempUrl = URL.createObjectURL(file);
    setProjectCharacters(prev => prev.map(c => c.id === charId ? { ...c, voiceUrl: tempUrl, voiceFileName: file.name } : c));

    try {
      const publicUrl = await uploadFileToR2(file, 'char_voice');
      setProjectCharacters(prev => {
        const newChars = prev.map(c => c.id === charId ? { ...c, voiceUrl: publicUrl, voiceFileName: file.name } : c);
        updateProjectProgress(projectId, { characters: newChars });
        return newChars;
      });
    } catch (err) { console.error(err); alert("Không thể upload Voice Nhân vật vĩnh viễn."); }
  };

  const handleStartFrameUpload = async (e) => {
    const file = e.target.files[0];
    const scene_n = activeUploadIdRef.current;
    if (!file || !scene_n) return;

    const tempUrl = URL.createObjectURL(file);
    setParsedData(prev => prev.map(s => s.scene_n === scene_n ? { ...s, startFrameUrl: tempUrl } : s));

    try {
      const publicUrl = await uploadFileToR2(file, 'scene_bg');
      setParsedData(prev => {
        const newData = prev.map(s => s.scene_n === scene_n ? { ...s, startFrameUrl: publicUrl } : s);
        updateProjectProgress(projectId, { data: newData });
        return newData;
      });
    } catch (err) { console.error(err); alert("Không thể upload Ảnh Nền vĩnh viễn."); }
  };

  const handleDeleteScene = (scene_n) => {
    if (window.confirm(`Xóa Scene ${scene_n}?`)) {
      setParsedData(prev => prev.filter(s => s.scene_n !== scene_n));
    }
  };

  const handleDeleteCharacter = (charId) => {
    if (window.confirm(`Xóa nhân vật này?`)) {
      setProjectCharacters(prev => prev.filter(c => c.id !== charId));
    }
  };

  const handleSaveSceneEdit = async () => {
    const updatedData = parsedData.map(s => s.scene_n === activeEditSceneModal.scene_n ? activeEditSceneModal : s);
    setParsedData(updatedData);
    try {
      await updateProjectProgress(projectId, { data: updatedData });
      setActiveEditSceneModal(null);
    } catch (err) { alert("Lỗi khi lưu: " + err.message); }
  };

  const handleGenVideoSingle = async (sceneNo, options, isBatch = false) => {
    const scene = parsedData.find(s => s.scene_n === sceneNo);
    if (!scene) return;

    if (options.mode === 'start_frame_to_video' && !scene.startFrameUrl) {
      if (!isBatch) alert("Vui lòng tải Nền (Ảnh đầu vào) trước khi Gen bằng chế độ Start Frame!");
      return;
    }

    let finalPrompt = `${scene.Context || ''}. ${scene.Action || ''}. ${scene.Camera || ''}`;
    if (scene.AdditionalPrompt) finalPrompt += `. ${scene.AdditionalPrompt}`;
    if (options.prompt) finalPrompt += `. ${options.prompt}`;

    if (!finalPrompt.trim()) {
      if (!isBatch) alert("Thiếu dữ liệu Context/Action để làm Prompt cho AI!");
      return;
    }

    setIsVideoGenerating(prev => ({ ...prev, [sceneNo]: true }));

    try {
      console.log(`Đang gửi yêu cầu Gen Video [Mode: ${options.mode}, Res: ${options.resolution}] cho Scene ${sceneNo}...`);

      await new Promise(resolve => setTimeout(resolve, 8000));

      const generatedVideoUrl = "https://www.w3schools.com/html/mov_bbb.mp4";
      const updatedData = parsedData.map(s => s.scene_n === sceneNo ? { ...s, videoUrl: generatedVideoUrl } : s);

      setParsedData(updatedData);
      await updateProjectProgress(projectId, { data: updatedData });

      if (!isBatch) alert(`✅ Gen Video Scene ${sceneNo} thành công!`);
    } catch (error) {
      if (!isBatch) alert("Lỗi Gen Video: " + error.message);
      console.error(`Lỗi Gen Video Scene ${sceneNo}:`, error);
    } finally {
      setIsVideoGenerating(prev => ({ ...prev, [sceneNo]: false }));
    }
  };

  const handleSetAllStartFrames = async () => {
    if (isSemi) return alert("Chế độ Semi không có nhân vật để set ảnh nền tự động.");
    if (!window.confirm("Hệ thống sẽ lấy ảnh Avatar của nhân vật tương ứng đè lên làm Nền (Start Frame) cho TẤT CẢ các Scene. Bạn chắc chắn chứ?")) return;

    const newData = parsedData.map(scene => {
      const charInfo = projectCharacters.find(c => c.name === scene.Character);
      if (charInfo && charInfo.imageUrl) {
        return { ...scene, startFrameUrl: charInfo.imageUrl };
      }
      return scene;
    });
    setParsedData(newData);
    await updateProjectProgress(projectId, { data: newData });
    alert("✅ Đã cập nhật ảnh nền cho toàn bộ Scene!");
  };

  const handleBatchGenVideo = async () => {
    const scenesToGen = parsedData.filter(s => s.startFrameUrl || videoGenOptions.mode !== 'start_frame_to_video');
    if (scenesToGen.length === 0) return alert("Không có scene nào đủ điều kiện gen video (Hãy kiểm tra lại Start Frame).");
    if (!window.confirm(`Bạn chuẩn bị Gen Video bằng AI cho ${scenesToGen.length} Scene. Quá trình xử lý song song 3 video/lần. Tiếp tục?`)) return;

    setIsBatchVideoGenerating(true);

    for (let i = 0; i < scenesToGen.length; i += 3) {
      const chunk = scenesToGen.slice(i, i + 3);
      console.log(`Đang chạy Batch Video Gen chunk:`, chunk.map(c => c.scene_n));
      await Promise.all(chunk.map(s => handleGenVideoSingle(s.scene_n, videoGenOptions, true)));
    }

    setIsBatchVideoGenerating(false);
    alert("✅ Đã hoàn thành quá trình Gen Video cho toàn bộ dự án!");
  };

  const handleResetProject = async () => {
    if (!window.confirm("⚠️ CẢNH BÁO: Hành động này sẽ XÓA TOÀN BỘ Audio, Video, Ảnh Nền đã tạo và đưa kịch bản về trạng thái GỐC. Bạn có chắc chắn?")) return;

    setGeneratedAudios({});
    setMergedVideos({});
    setIsVideoGenerating({});
    setIsGenerating({});

    const resetData = parsedData.map(s => {
      const { startFrameUrl, videoUrl, AdditionalPrompt, ...rest } = s;
      return rest;
    });
    setParsedData(resetData);

    await updateProjectProgress(projectId, {
      data: resetData,
      generatedAudios: {},
      mergedVideos: {}
    });
    alert("🔄 Đã Reset dự án về trạng thái ban đầu thành công!");
  };

  const processMergeSingleScene = async (scene, volValue) => {
    const videoUrl = scene.videoUrl || scene.startFrameUrl;
    const aiAudioUrl = generatedAudios[scene.scene_n];
    if (!videoUrl) return null;

    const origVol = Number(volValue) / 100;
    const aiVol = 1.0 - origVol;

    let finalUrl = null;
    const inVid = `vid_${scene.scene_n}.mp4`;
    const inAud = `aud_${scene.scene_n}.mp3`;
    const outName = `Scene_${scene.scene_n}_Merged.mp4`;

    try {
      let exitCode = -1;

      if (!aiAudioUrl) {
        if (origVol === 1) return videoUrl;
        await ffmpeg.writeFile(inVid, await fetchFile(videoUrl));

        if (origVol === 0) {
          try { exitCode = await ffmpeg.exec(['-i', inVid, '-c:v', 'copy', '-an', outName]); } catch (e) { }
        } else {
          try { exitCode = await ffmpeg.exec(['-i', inVid, '-filter:a', `volume=${origVol}`, '-c:v', 'copy', '-c:a', 'aac', outName]); } catch (e) { }
          if (exitCode !== 0) {
            try { exitCode = await ffmpeg.exec(['-i', inVid, '-c:v', 'copy', '-an', outName]); } catch (e) { }
          }
        }
      }
      else if (scene.startFrameUrl && !scene.videoUrl) {
        await ffmpeg.writeFile('image.jpg', await fetchFile(scene.startFrameUrl));
        await ffmpeg.writeFile(inAud, await fetchFile(aiAudioUrl));

        if (aiVol === 0) {
          try { exitCode = await ffmpeg.exec(['-loop', '1', '-i', 'image.jpg', '-f', 'lavfi', '-i', 'anullsrc', '-c:v', 'libx264', '-c:a', 'aac', '-t', '3', '-pix_fmt', 'yuv420p', outName]); } catch (e) { }
        } else {
          try { exitCode = await ffmpeg.exec(['-loop', '1', '-i', 'image.jpg', '-i', inAud, '-filter:a', `volume=${aiVol}`, '-c:v', 'libx264', '-c:a', 'aac', '-shortest', '-pix_fmt', 'yuv420p', outName]); } catch (e) { }
        }
      }
      else {
        await ffmpeg.writeFile(inVid, await fetchFile(videoUrl));
        await ffmpeg.writeFile(inAud, await fetchFile(aiAudioUrl));

        if (origVol === 0) {
          try { exitCode = await ffmpeg.exec(['-i', inVid, '-i', inAud, '-map', '0:v', '-map', '1:a', '-filter:a', `volume=${aiVol}`, '-c:v', 'copy', '-c:a', 'aac', '-shortest', outName]); } catch (e) { }
        }
        else if (aiVol === 0) {
          try { exitCode = await ffmpeg.exec(['-i', inVid, '-filter:a', `volume=${origVol}`, '-c:v', 'copy', '-c:a', 'aac', outName]); } catch (e) { }
          if (exitCode !== 0) {
            try { exitCode = await ffmpeg.exec(['-i', inVid, '-c:v', 'copy', '-an', outName]); } catch (e) { }
          }
        }
        else {
          try {
            exitCode = await ffmpeg.exec([
              '-i', inVid, '-i', inAud,
              '-filter_complex', `[0:a]volume=${origVol}[a1];[1:a]volume=${aiVol}[a2];[a1][a2]amix=inputs=2:duration=shortest[aout]`,
              '-map', '0:v', '-map', '[aout]',
              '-c:v', 'copy', '-c:a', 'aac', '-shortest', outName
            ]);
          } catch (e) { }

          if (exitCode !== 0) {
            try {
              exitCode = await ffmpeg.exec([
                '-i', inVid, '-i', inAud,
                '-map', '0:v', '-map', '1:a', '-filter:a', `volume=${aiVol}`,
                '-c:v', 'copy', '-c:a', 'aac', '-shortest', outName
              ]);
            } catch (e) { }
          }
        }
      }

      if (exitCode === 0) {
        const outData = await ffmpeg.readFile(outName);
        const outBlob = new Blob([outData.buffer], { type: 'video/mp4' });

        try {
          const uniqueFileName = `project_${projectId}/merged_scene_${scene.scene_n}_${Date.now()}.mp4`;
          let successUpload = false;
          let retries = 3;

          while (retries > 0 && !successUpload) {
            try {
              const urlRes = await withTimeout(
                fetch('/api/get-upload-url', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ fileName: uniqueFileName, fileType: 'video/mp4' })
                }),
                15000, "Timeout lấy link Vercel"
              );

              if (!urlRes.ok) throw new Error("Không thể xin Link upload từ Server");
              const { uploadUrl } = await urlRes.json();

              if (uploadUrl) {
                const uploadRes = await withTimeout(
                  fetch(uploadUrl, { method: 'PUT', body: outBlob, headers: { 'Content-Type': 'video/mp4' } }),
                  600000, "Timeout upload lên R2"
                );

                if (uploadRes.ok) {
                  finalUrl = `${import.meta.env.VITE_R2_PUBLIC_URL}/${uniqueFileName}`;
                  successUpload = true;
                } else {
                  throw new Error("Lỗi đẩy file lên R2");
                }
              }
            } catch (errUpload) {
              retries--;
              if (retries === 0) throw errUpload;
              console.warn(`Lỗi upload Scene ${scene.scene_n}, thử lại... (Còn ${retries} lần)`);
              await new Promise(r => setTimeout(r, 2000));
            }
          }
        } catch (err) {
          console.error("Lỗi upload R2 sau 3 lần (Dùng tạm file Local):", err);
          finalUrl = URL.createObjectURL(outBlob);
        }
      } else {
        console.warn(`Render FFmpeg thất bại cho Scene ${scene.scene_n}, mã lỗi: ${exitCode}`);
      }

      try { await ffmpeg.deleteFile(inVid); } catch (e) { }
      try { await ffmpeg.deleteFile('image.jpg'); } catch (e) { }
      try { await ffmpeg.deleteFile(inAud); } catch (e) { }
      try { await ffmpeg.deleteFile(outName); } catch (e) { }

    } catch (e) {
      console.error("Lỗi Mix Audio nghiêm trọng:", e);
    }

    return finalUrl || videoUrl;
  };

  const handleVoiceUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setVoiceCloneFile(file);
    setVoiceCloneUrl(URL.createObjectURL(file));
    setIsTranscribing(true);
    setVoiceUploadStatus("Đang đồng bộ file lên Cloud...");
    try {
      const fileExt = file.name.split('.').pop() || 'mp3';
      const uniqueFileName = `project_${projectId}/voice_clone_${Date.now()}.${fileExt}`;
      const fileType = file.type || 'audio/mpeg';

      let successUpload = false;
      let retries = 3;
      let audioCloudUrl = "";

      while (retries > 0 && !successUpload) {
        try {
          const urlRes = await withTimeout(
            fetch('/api/get-upload-url', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileName: uniqueFileName, fileType: fileType })
            }),
            15000, "Không phản hồi xin Link R2"
          );

          if (!urlRes.ok) throw new Error("Lỗi Vercel get-upload-url");
          const { uploadUrl } = await urlRes.json();

          const uploadRes = await withTimeout(
            fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': fileType } }),
            300000, "Lỗi kết nối khi đẩy MP3 lên R2"
          );

          if (!uploadRes.ok) throw new Error("Upload Voice thất bại");

          audioCloudUrl = `${import.meta.env.VITE_R2_PUBLIC_URL}/${uniqueFileName}`;
          successUpload = true;

        } catch (errUpload) {
          retries--;
          if (retries === 0) throw errUpload;
          console.warn(`Lỗi up Voice, thử lại... (Còn ${retries} lần)`);
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      setVoiceCloneBase64(audioCloudUrl);
      setVoiceUploadStatus("Tải lên thành công! Đã sẵn sàng Gen Audio.");
      setVoiceMode("clone"); // 🚀 Upload file mẫu = tự kích hoạt chế độ Qwen Voice Clone
      await updateProjectProgress(projectId, { voiceCloneBase64: audioCloudUrl, qwenEmbeddingUrl: null, voiceMode: "clone" });

    } catch (error) {
      console.error(error);
      setVoiceUploadStatus("Lỗi mạng tải lên. Vui lòng F5 thử lại.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleGenAudio = async (sceneNo, scriptText) => {
    if (!scriptText || scriptText.trim() === '') return;

    // 🚀 KIỂM TRA ĐIỀU KIỆN THEO TỪNG CHẾ ĐỘ VOICE
    if (voiceMode === "minimax") {
      if (!minimaxVoiceId) {
        alert("⚠️ Chưa chọn Custom Voice (Minimax)!");
        return;
      }
    } else if (!voiceCloneBase64) {
      alert("⚠️ Bạn chưa tải lên file âm thanh mẫu (Voice Clone) ở Bảng điều khiển!");
      return;
    }

    setIsGenerating(prev => ({ ...prev, [sceneNo]: true }));
    try {
      let cleanText = scriptText.trim().replace(/[\r\n]+/g, ' ').replace(/["'"'"'()[\]{}]/g, '').replace(/\s+/g, ' ');
      if (!cleanText.match(/[.!?]$/)) cleanText += '.';

      let endpoint, payload;

      if (voiceMode === "minimax") {
        // 🚀 NHÁNH 1: MINIMAX SPEECH-2.8-TURBO
        endpoint = MINIMAX_TTS_ENDPOINT;
        payload = {
          text: cleanText,
          voice_id: minimaxVoiceId,
          language_boost: "auto",
          emotion: "neutral",
          format: "mp3",
          sample_rate: 32000,
          bitrate: 128000,
          enable_sync_mode: true
        };
      } else {
        // 🚀 NHÁNH 2: QWEN VOICE-CLONE
        endpoint = "https://api.wavespeed.ai/api/v3/wavespeed-ai/qwen3-tts/voice-clone";
        payload = {
          text: cleanText,
          audio: voiceCloneBase64,
          language: "auto",
          enable_sync_mode: true
        };

        if (voiceCloneRefText && voiceCloneRefText.trim() !== '') {
          payload.reference_text = voiceCloneRefText.trim();
        }
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${import.meta.env.VITE_WAVESPEED_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Lỗi kết nối API Wavespeed.");

      const result = await response.json();
      let audioUrl = null;

      if (result.code === 200 && result.data) {
        if (result.data.status === "completed" || result.data.status === "success") {
          audioUrl = result.data.outputs?.[0];
        }
        else if (result.data.status === "created" || result.data.status === "processing") {
          let attempts = 0;
          const getUrl = result.data.urls.get;
          while (attempts < 60) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 2000));
            const statusRes = await fetch(getUrl, {
              headers: { "Authorization": `Bearer ${import.meta.env.VITE_WAVESPEED_API_KEY}` }
            });
            const statusJson = await statusRes.json();
            if (statusJson.data?.status === "completed" || statusJson.data?.status === "success") {
              audioUrl = statusJson.data.outputs?.[0];
              break;
            } else if (statusJson.data?.status === "failed") {
              throw new Error("Wavespeed báo lỗi (Failed) trong quá trình render Audio.");
            }
          }
        }
      } else {
        throw new Error(result.message || "Định dạng trả về từ Wavespeed không hợp lệ.");
      }

      if (audioUrl) {
        const proxiedUrl = proxifyUrl(audioUrl);
        let latestAudios;
        setGeneratedAudios(prev => {
          latestAudios = { ...prev, [sceneNo]: proxiedUrl };
          return latestAudios;
        });
        await updateProjectProgress(projectId, { generatedAudios: latestAudios });
      } else {
        throw new Error("API xử lý xong nhưng không trích xuất được Link Audio.");
      }
    } catch (error) {
      console.error(error);
      alert(`Lỗi Scene ${sceneNo}: ${error.message}`);
    } finally {
      setIsGenerating(prev => ({ ...prev, [sceneNo]: false }));
    }
  };

  const getTextToGen = (scene) => isSemi ? scene.Voiceover : (scene.Dialogue || scene.Voiceover);
  const filteredScenesForAudio = parsedData.filter(scene => {
    const text = getTextToGen(scene);
    return text && text.trim() !== '';
  });

  const handleStartBatchGen = async () => {
    // 🚀 KIỂM TRA ĐIỀU KIỆN THEO TỪNG CHẾ ĐỘ VOICE
    if (voiceMode === "minimax") {
      if (!minimaxVoiceId) {
        alert("⚠️ Chưa chọn Custom Voice (Minimax)!");
        setIsModalOpen(false);
        return;
      }
    } else if (!voiceCloneBase64) {
      alert("⚠️ Bạn chưa tải lên file âm thanh mẫu (Voice Clone). Vui lòng tải file ở Bảng điều khiển trước khi Gen Audio!");
      setIsModalOpen(false);
      return;
    }

    const scenesToGen = Object.keys(checkedScenes).filter(k => checkedScenes[k]);
    if (scenesToGen.length === 0) return alert("Vui lòng chọn ít nhất 1 scene để gen!");

    setIsBatchGenerating(true);
    setBatchGenProgress({ current: 0, total: scenesToGen.length });
    let completed = 0;

    try {
      for (const sceneNo of scenesToGen) {
        const scene = parsedData.find(s => String(s.scene_n) === String(sceneNo));
        const text = getTextToGen(scene);

        if (scene && text) {
          await handleGenAudio(scene.scene_n, text);
        }

        completed++;
        setBatchGenProgress(prev => ({ ...prev, current: completed }));

        await new Promise(r => setTimeout(r, 1500));
      }
    } finally {
      setIsBatchGenerating(false);
      setTimeout(() => {
        setIsModalOpen(false);
        setCheckedScenes({});
      }, 1000);
    }
  };

  const handleStartMerge = async () => {
    const scenesToMergeList = Object.keys(checkedMergeScenes).filter(k => checkedMergeScenes[k]);
    if (scenesToMergeList.length === 0) return alert("Vui lòng chọn ít nhất 1 scene để Merge!");
    if (!ffmpeg || !isFfmpegReady) return alert("FFmpeg chưa sẵn sàng!");

    setIsMerging(true);
    setBatchMergeProgress({ current: 0, total: scenesToMergeList.length });
    let completed = 0;

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

      completed++;
      setBatchMergeProgress(prev => ({ ...prev, current: completed }));

      await new Promise(r => setTimeout(r, 1500));
    }

    setIsMerging(false);
    setTimeout(() => {
      setIsMergeModalOpen(false);
      setCheckedMergeScenes({});
    }, 1000);
    alert("✅ Đã xử lý xong Batch Merge!");
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

  // 🚀 CHUYỂN CHẾ ĐỘ VOICE (minimax | clone)
  const handleChangeVoiceMode = async (mode) => {
    setVoiceMode(mode);
    await updateProjectProgress(projectId, { voiceMode: mode });
  };

  // 🚀 CHỌN CUSTOM VOICE TRONG DANH SÁCH PRESET (Minimax)
  const handleChangeMinimaxVoice = async (voiceId) => {
    setMinimaxVoiceId(voiceId);
    await updateProjectProgress(projectId, { minimaxVoiceId: voiceId });
  };

  const handleRemoveVoice = async () => {
    if (voiceCloneUrl && voiceCloneUrl.startsWith('blob:')) URL.revokeObjectURL(voiceCloneUrl);
    setVoiceCloneFile(null);
    setVoiceCloneUrl(null);
    setVoiceCloneBase64(null);
    setVoiceCloneRefText("");
    setVoiceUploadStatus("");
    setQwenEmbeddingUrl(null);
    setIsTranscribing(false);
    if (fileInputRef.current) fileInputRef.current.value = null;
    await updateProjectProgress(projectId, { voiceCloneBase64: null, voiceCloneRefText: "", qwenEmbeddingUrl: null });
  };

  const forceDownloadVideo = async (url, filename) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
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
      if (url) {
        await forceDownloadVideo(url, `Scene_${sceneNo}.mp4`);
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }
  };

  // ─── Computed stats ───────────────────────────────────────────────────────
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

  // ─── Loading state ────────────────────────────────────────────────────────
  if (isDataLoading) return (
    <div className="flex h-screen items-center justify-center bg-slate-950 text-amber-400 font-bold gap-3">
      <Loader2 className="animate-spin" size={22} />
      <span>Đang tải Workspace...</span>
    </div>
  );

  // ─── Sidebar panel shared styles ─────────────────────────────────────────
  const sidePanel = cn(
    "fixed top-24 bottom-4 rounded-2xl p-4 shadow-xl z-20 hidden xl:flex flex-col transition-all duration-300 border overflow-y-auto custom-scrollbar",
    darkMode
      ? "bg-slate-900/80 backdrop-blur-xl border-white/[0.07] shadow-[0_0_40px_rgba(0,0,0,0.4)]"
      : "bg-white border-zinc-200"
  );

  return (
    <div
      className={cn(
        "h-screen w-full font-sans p-4 lg:p-6 overflow-y-auto relative custom-scrollbar transition-colors duration-300",
        darkMode ? "bg-slate-950 text-slate-200" : "bg-slate-100 text-zinc-900"
      )}
    >
      {/* ── Left panel: Script ────────────────────────────────────────────── */}
      <div className={cn(sidePanel, "left-4 w-[260px] gap-3")}>
        <div className={cn("flex items-center justify-between border-b pb-2 shrink-0", darkMode ? "border-white/[0.07]" : "border-zinc-200")}>
          <div className={cn("flex items-center gap-2 font-semibold text-sm", darkMode ? "text-slate-200" : "text-zinc-900")}>
            <FileText size={16} className="text-amber-400" />
            Kịch bản gốc
          </div>
          {originalScript && !isEditingScript && (
            <button
              onClick={() => setIsEditingScript(true)}
              className="text-slate-500 hover:text-amber-400 text-xs font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/50"
            >
              Chỉnh sửa
            </button>
          )}
        </div>

        {(!originalScript || isEditingScript) ? (
          <div className="flex-1 flex flex-col gap-3 min-h-0 animate-in fade-in zoom-in-95 duration-200">
            <textarea
              value={originalScript}
              onChange={(e) => setOriginalScript(e.target.value)}
              placeholder="Paste kịch bản..."
              className={cn(
                "flex-1 rounded-xl p-3.5 text-sm custom-scrollbar focus:outline-none focus:ring-2 border transition-all resize-none",
                darkMode
                  ? "bg-slate-950/80 border-white/[0.08] text-slate-300 focus:border-amber-500/50 focus:ring-amber-500/10"
                  : "bg-zinc-50 border-zinc-300 text-zinc-800"
              )}
            />
            <button
              onClick={() => { updateProjectProgress(projectId, { originalScript: originalScript.trim() }); setIsEditingScript(false); }}
              className="w-full h-10 font-bold text-sm rounded-xl cursor-pointer transition-all shadow-md text-white bg-amber-500 hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
            >
              Lưu kịch bản
            </button>
          </div>
        ) : (
          <div className={cn("flex-1 overflow-y-auto pr-2 text-[12px] leading-relaxed whitespace-pre-wrap font-mono custom-scrollbar animate-in fade-in duration-200", darkMode ? "text-slate-400" : "text-zinc-700")}>
            {originalScript}
          </div>
        )}
      </div>

      {/* Hidden file inputs */}
      <input type="file" accept="image/*" ref={frameInputRef} className="hidden" onChange={handleStartFrameUpload} />
      <input type="file" accept="image/*" ref={avatarInputRef} className="hidden" onChange={handleAvatarUpload} />
      <input type="file" accept="audio/*" ref={charVoiceInputRef} className="hidden" onChange={handleCharVoiceUpload} />

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-5 w-full pb-20 px-0 xl:pl-[290px] xl:pr-[260px]">

        {/* Project header */}
        <div className={cn("flex items-center justify-between pb-3 border-b pt-2", darkMode ? "border-white/[0.07]" : "border-zinc-200")}>
          {isEditingProjectName ? (
            <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-4">
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveProjectName()}
                className={cn(
                  "border-b-2 border-amber-500 px-1 py-1.5 text-2xl font-bold focus:outline-none min-w-[300px] bg-transparent",
                  darkMode ? "text-white" : "text-black"
                )}
                autoFocus
              />
              <button
                onClick={handleSaveProjectName}
                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-bold shadow-md transition-colors cursor-pointer bg-amber-500 text-slate-950 hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
              >
                <Save size={16} /> Lưu
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 group">
              <h1 className={cn("text-2xl font-bold tracking-tight", darkMode ? "text-slate-100" : "text-black")}>{projectName}</h1>
              <button
                onClick={() => setIsEditingProjectName(true)}
                className={cn(
                  "opacity-0 group-hover:opacity-100 p-1.5 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/50",
                  darkMode ? "text-slate-500 hover:text-amber-400 hover:bg-amber-500/10" : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200"
                )}
              >
                <Pencil size={16} />
              </button>
            </div>
          )}

          {/* Tab switcher */}
          <div className={cn("flex border rounded-xl p-1 shadow-inner", darkMode ? "bg-slate-950/80 border-white/[0.06]" : "bg-white border-zinc-200")}>
            <button
              onClick={() => setActiveTab('storyboard')}
              className={cn(
                "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50",
                activeTab === 'storyboard'
                  ? "bg-amber-500 text-slate-950 shadow-md"
                  : (darkMode ? "text-slate-400 hover:text-slate-200" : "text-zinc-600 hover:text-black")
              )}
            >
              <Film size={16} /> Storyboard
            </button>
            {!isSemi && (
              <button
                onClick={() => setActiveTab('setup')}
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50",
                  activeTab === 'setup'
                    ? "bg-purple-600 text-white shadow-md"
                    : (darkMode ? "text-slate-400 hover:text-slate-200" : "text-zinc-600 hover:text-black")
                )}
              >
                <Users size={16} /> Setup Nhân vật
              </button>
            )}
          </div>
        </div>

        {/* Stats card */}
        <div className={cn(
          "rounded-2xl p-5 relative overflow-hidden transition-colors border",
          darkMode
            ? "bg-slate-900/60 backdrop-blur-sm border-white/[0.07] shadow-lg"
            : "bg-white border-zinc-200"
        )}>
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-amber-500 via-orange-400 to-transparent opacity-60" />
          <div className={cn("flex items-center gap-2 font-semibold text-xs uppercase tracking-widest mb-4", darkMode ? "text-slate-400" : "text-zinc-600")}>
            <LayoutDashboard size={14} className="text-amber-400" /> Thống kê dự án
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 text-left">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider mb-1 text-slate-500">Total Scene</div>
              <div className={cn("text-xl font-bold", darkMode ? "text-slate-100" : "text-black")}>{totalScenes}</div>
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider mb-1 text-slate-500">Total Voice</div>
              <div className="text-xl font-bold text-amber-400">{totalVoice}</div>
            </div>
            {isSemi && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider mb-1 text-slate-500">Avg Duration</div>
                <div className="text-xl font-bold text-emerald-400">{avgDuration}</div>
              </div>
            )}
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider mb-1 text-slate-500">Est Cost</div>
              <div className="text-xl font-bold text-amber-500">{estCost}</div>
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider mb-1 text-slate-500">Audio Gen</div>
              <div className="text-lg font-semibold text-purple-400 mt-1">
                {Object.keys(generatedAudios).length} <span className="text-xs text-slate-500">/ {totalVoice}</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider mb-1 text-slate-500">Video Gen</div>
              <div className="text-lg font-semibold text-orange-400 mt-1">
                {Object.keys(mergedVideos).length} <span className="text-xs text-slate-500">/ {totalScenes}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'setup' && !isSemi && (
          <SetupTab
            projectCharacters={projectCharacters}
            setProjectCharacters={setProjectCharacters}
            parsedData={parsedData}
            setParsedData={setParsedData}
            handleSaveSetupData={handleSaveSetupData}
            handleDeleteCharacter={handleDeleteCharacter}
            avatarInputRef={avatarInputRef}
            charVoiceInputRef={charVoiceInputRef}
            activeUploadIdRef={activeUploadIdRef}
            darkMode={darkMode}
          />
        )}
        {activeTab === 'storyboard' && (
          <StoryboardTab
            parsedData={parsedData}
            projectCharacters={projectCharacters}
            generatedAudios={generatedAudios}
            isGenerating={isGenerating}
            isVideoGenerating={isVideoGenerating}
            handleGenVideo={handleGenVideoSingle}
            mergingScenes={mergingScenes}
            mergedVideos={mergedVideos}
            setActiveEditSceneModal={setActiveEditSceneModal}
            setActiveStartFrameModal={setActiveStartFrameModal}
            setActiveVideoGenModal={setActiveVideoGenModal}
            frameInputRef={frameInputRef}
            activeUploadIdRef={activeUploadIdRef}
            setActiveGenModal={setActiveGenModal}
            handleDeleteScene={handleDeleteScene}
            globalMixVol={globalMixVol}
            setSingleMixVol={setSingleMixVol}
            setActiveMergeModal={setActiveMergeModal}
            forceDownloadVideo={forceDownloadVideo}
            projectType={projectType}
            darkMode={darkMode}
          />
        )}
      </div>

      {/* ── Right panel: Control panel ────────────────────────────────────── */}
      <div className={cn(sidePanel, "right-4 w-[240px] gap-4")}>
        <div className={cn("flex items-center justify-between border-b pb-2 shrink-0", darkMode ? "border-white/[0.07]" : "border-zinc-200")}>
          <div className={cn("flex items-center gap-2 font-semibold text-sm", darkMode ? "text-slate-200" : "text-black")}>
            <Sliders size={16} className="text-amber-400" /> Bảng điều khiển
          </div>
        </div>

        {/* Primary action */}
        <div className="flex flex-col gap-3 shrink-0">
          <button
            onClick={() => setIsMergeModalOpen(true)}
            className="w-full h-10 bg-gradient-to-r from-slate-700 to-slate-600 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer border border-white/[0.07] hover:border-amber-500/30 hover:shadow-[0_0_16px_rgba(251,191,36,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
          >
            <Merge size={16} /> Merge All
          </button>
        </div>

        <div className={cn("w-full h-px shrink-0", darkMode ? "bg-white/[0.07]" : "bg-zinc-200")} />

        {/* Secondary actions */}
        <div className="flex flex-col gap-3 shrink-0">
          <button
            onClick={handleSetAllStartFrames}
            className={cn(
              "w-full h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50",
              darkMode
                ? "text-white bg-gradient-to-r from-cyan-600/80 to-blue-600/80 hover:from-cyan-500 hover:to-blue-500"
                : "text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400"
            )}
          >
            <ImagePlay size={16} /> Set All Start Frame
          </button>

          <button
            onClick={handleBatchGenVideo}
            disabled={isBatchVideoGenerating}
            className={cn(
              "w-full h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
              isBatchVideoGenerating
                ? "bg-slate-700 cursor-not-allowed opacity-60"
                : darkMode
                  ? "text-white bg-gradient-to-r from-emerald-600/80 to-green-600/80 hover:from-emerald-500 hover:to-green-500"
                  : "text-white bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400"
            )}
          >
            {isBatchVideoGenerating ? <Loader2 size={16} className="animate-spin" /> : <MonitorPlay size={16} />}
            {isBatchVideoGenerating ? 'Đang Gen Batch...' : 'Gen All Video'}
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className={cn(
              "w-full h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50",
              darkMode
                ? "text-white bg-gradient-to-r from-purple-600/80 to-pink-600/80 hover:from-purple-500 hover:to-pink-500"
                : "text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400"
            )}
          >
            <Music size={16} /> Gen All Audio
          </button>
        </div>

        <div className={cn("w-full h-px shrink-0", darkMode ? "bg-white/[0.07]" : "bg-zinc-200")} />

        {/* Voice AI panel */}
        <div className={cn(
          "border rounded-xl p-3 flex flex-col gap-3 shrink-0",
          darkMode ? "bg-slate-950/60 border-white/[0.07]" : "bg-zinc-50 border-zinc-200"
        )}>
          <div className={cn("text-[12px] font-bold flex justify-between items-center", darkMode ? "text-slate-300" : "text-zinc-800")}>
            Voice AI
            {voiceMode === 'clone' && voiceCloneFile && (
              <button
                onClick={handleRemoveVoice}
                className="text-red-400 hover:text-red-300 bg-red-500/10 p-1.5 rounded cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500/50"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {/* Voice mode toggle */}
          <div className={cn("grid grid-cols-2 gap-1 border rounded-lg p-1", darkMode ? "bg-slate-900/80 border-white/[0.06]" : "bg-white border-zinc-200")}>
            <button
              onClick={() => handleChangeVoiceMode('minimax')}
              className={cn(
                "flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-bold transition-all cursor-pointer focus-visible:outline-none",
                voiceMode === 'minimax'
                  ? "bg-purple-600 text-white shadow"
                  : (darkMode ? "text-slate-400 hover:text-slate-200" : "text-zinc-600 hover:text-black")
              )}
            >
              <Mic size={12} /> Custom Voice
            </button>
            <button
              onClick={() => handleChangeVoiceMode('clone')}
              className={cn(
                "flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-bold transition-all cursor-pointer focus-visible:outline-none",
                voiceMode === 'clone'
                  ? "bg-purple-600 text-white shadow"
                  : (darkMode ? "text-slate-400 hover:text-slate-200" : "text-zinc-600 hover:text-black")
              )}
            >
              <Upload size={12} /> Voice Clone
            </button>
          </div>

          {voiceMode === 'minimax' ? (
            <div className="flex flex-col gap-1.5 animate-in fade-in duration-300">
              {MINIMAX_PRESET_VOICES.map(v => (
                <label
                  key={v.id}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all",
                    minimaxVoiceId === v.id
                      ? "border-purple-500/60 bg-purple-500/10"
                      : (darkMode ? "border-white/[0.07] bg-slate-900/60 hover:border-purple-500/40" : "border-zinc-200 bg-white hover:border-purple-400")
                  )}
                >
                  <input type="radio" name="minimaxPresetVoice" checked={minimaxVoiceId === v.id} onChange={() => handleChangeMinimaxVoice(v.id)} className="accent-purple-600 cursor-pointer shrink-0" />
                  <div className="min-w-0">
                    <div className={cn("text-[11px] font-bold truncate", darkMode ? "text-slate-200" : "text-zinc-800")}>{v.name}</div>
                    <div className="text-[9px] text-slate-500 truncate">{v.desc}</div>
                  </div>
                </label>
              ))}
              <div className="text-[9px] text-slate-500 px-1">Giọng được quản trị sẵn — chỉ cần tích chọn.</div>
            </div>
          ) : (
            <>
              <input type="file" accept="audio/mp3,audio/wav,audio/m4a" ref={fileInputRef} onChange={handleVoiceUpload} className="hidden" />
              {!voiceCloneFile ? (
                <button
                  onClick={() => fileInputRef.current.click()}
                  className={cn(
                    "w-full h-10 border border-dashed rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-500/50",
                    darkMode
                      ? "border-white/[0.07] hover:border-purple-400 text-slate-400 hover:text-purple-400"
                      : "border-zinc-300 hover:border-purple-600 text-zinc-700 hover:text-purple-700 hover:bg-purple-50"
                  )}
                >
                  <Upload size={14} /> Tải file MP3
                </button>
              ) : (
                <div className="flex flex-col gap-2 animate-in fade-in duration-300">
                  <div className={cn("text-[10px] truncate font-medium", darkMode ? "text-slate-400" : "text-zinc-700")}>{voiceCloneFile.name}</div>
                  <audio src={voiceCloneUrl} crossOrigin="anonymous" controls className="w-full h-8 custom-audio" />
                  <div className="relative">
                    <input
                      type="text"
                      value={voiceCloneRefText}
                      onChange={(e) => setVoiceCloneRefText(e.target.value)}
                      onBlur={() => updateProjectProgress(projectId, { voiceCloneRefText: voiceCloneRefText })}
                      disabled={isTranscribing}
                      className={cn(
                        "w-full h-8 px-2 border focus:outline-none focus:ring-1 focus:ring-purple-500 rounded-lg text-[11px] transition-all",
                        darkMode ? "bg-slate-900/80 border-white/[0.07] text-slate-200" : "bg-white border-zinc-300 text-zinc-800"
                      )}
                      placeholder="Nhập Transcript của Audio mẫu (Tùy chọn)..."
                    />
                    {isTranscribing && <Loader2 size={12} className="absolute right-2 top-2.5 animate-spin text-purple-500" />}
                  </div>
                  {voiceUploadStatus && <div className="text-[10px] font-semibold text-emerald-400 px-1">{voiceUploadStatus}</div>}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex-1 min-h-[10px]" />

        {/* Bottom actions */}
        <div className="flex flex-col gap-3 shrink-0">
          <button
            onClick={() => setIsExportModalOpen(true)}
            className={cn(
              "w-full h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
              darkMode
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                : "bg-green-50 border-green-200 text-green-600 hover:bg-green-100 hover:border-green-300"
            )}
          >
            <Download size={16} /> Xuất File
          </button>
          <button
            onClick={handleResetProject}
            className={cn(
              "w-full h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50",
              darkMode
                ? "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20"
                : "bg-red-50 border-red-200 text-red-600 hover:bg-red-100 hover:border-red-300"
            )}
          >
            <RotateCcw size={16} /> Reset Project
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── MODALS ─────────────────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}

      {/* Start Frame Modal */}
      {activeStartFrameModal && (() => {
        const sceneInfo = parsedData.find(s => s.scene_n === activeStartFrameModal.scene_n) || activeStartFrameModal;
        const charInfo = projectCharacters.find(c => c.name === sceneInfo.Character);
        const hasAvatar = charInfo && charInfo.imageUrl;

        return (
          <div className={OVERLAY}>
            <div className={cn(modalCard(darkMode), "p-7 w-full max-w-sm flex flex-col")}>
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-60 rounded-t-2xl" />
              <button onClick={() => setActiveStartFrameModal(null)} className={cn("absolute top-5 right-5 cursor-pointer transition-colors focus-visible:outline-none", darkMode ? "text-slate-500 hover:text-white" : "text-zinc-500 hover:text-black")}><X size={20} /></button>

              <div className={cn("text-center border-b pb-5 mb-5", darkMode ? "border-white/[0.07]" : "border-zinc-200")}>
                <h3 className={cn("text-xl font-bold", darkMode ? "text-white" : "text-black")}>Start frame - Scene {sceneInfo.scene_n}</h3>
                <p className={cn("text-xs mt-1.5", darkMode ? "text-slate-400" : "text-zinc-500")}>Xem trước và tạo open frame cho scene_{sceneInfo.scene_n}</p>
              </div>

              <div className="flex flex-col gap-5 overflow-y-auto custom-scrollbar">
                {sceneInfo.startFrameUrl && (
                  <div className={cn("w-full aspect-video rounded-xl overflow-hidden flex items-center justify-center border shadow-inner", darkMode ? "bg-slate-950/80 border-white/[0.07]" : "bg-zinc-100 border-zinc-200")}>
                    <img src={sceneInfo.startFrameUrl} crossOrigin="anonymous" className="w-full h-full object-contain" alt="Start Frame Preview" />
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {!isSemi && hasAvatar && (
                    <button
                      onClick={() => {
                        const newData = parsedData.map(s => s.scene_n === sceneInfo.scene_n ? { ...s, startFrameUrl: charInfo.imageUrl } : s);
                        setParsedData(newData);
                        updateProjectProgress(projectId, { data: newData });
                      }}
                      className={cn(
                        "h-11 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50",
                        darkMode ? "bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/20" : "bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200"
                      )}
                    >
                      <User size={16} /> Dùng ảnh Profile làm Start Frame
                    </button>
                  )}

                  <button
                    onClick={() => { activeUploadIdRef.current = sceneInfo.scene_n; frameInputRef.current.click(); }}
                    className="h-11 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md bg-amber-500 hover:bg-amber-400 text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
                  >
                    <Upload size={16} /> Upload Custom Image
                  </button>
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  <label className={cn("text-sm font-bold", darkMode ? "text-slate-300" : "text-zinc-700")}>Mô tả thêm (lựa chọn)</label>
                  <textarea
                    value={sceneInfo.AdditionalPrompt || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setParsedData(prev => prev.map(s => s.scene_n === sceneInfo.scene_n ? { ...s, AdditionalPrompt: val } : s));
                    }}
                    onBlur={() => updateProjectProgress(projectId, { data: parsedData })}
                    className={cn(fieldInput(darkMode), "h-24 resize-none custom-scrollbar")}
                    placeholder="Nhập text để bổ sung vào prompt tạo video..."
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Video Gen Modal */}
      {activeVideoGenModal && (() => {
        const sceneInfo = parsedData.find(s => s.scene_n === activeVideoGenModal.scene_n) || activeVideoGenModal;
        const isGeneratingThis = isVideoGenerating[sceneInfo.scene_n];

        return (
          <div className={OVERLAY}>
            <div className={cn(modalCard(darkMode), "p-7 w-full max-w-xl flex flex-col")}>
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-60 rounded-t-2xl" />
              <button onClick={() => setActiveVideoGenModal(null)} className={cn("absolute top-5 right-5 cursor-pointer transition-colors focus-visible:outline-none", darkMode ? "text-slate-500 hover:text-white" : "text-zinc-500 hover:text-black")}><X size={20} /></button>

              <div className={cn("border-b pb-5 mb-5 flex items-center gap-3", darkMode ? "border-white/[0.07]" : "border-zinc-200")}>
                <Film className="text-emerald-400" size={24} />
                <h3 className={cn("text-xl font-bold", darkMode ? "text-white" : "text-black")}>Video - Scene {sceneInfo.scene_n}</h3>
              </div>

              {isGeneratingThis ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <Loader2 size={56} className="animate-spin text-emerald-400 mb-6" />
                  <h4 className={cn("text-xl font-bold mb-2", darkMode ? "text-slate-200" : "text-zinc-800")}>Đang Gen Video bằng AI...</h4>
                  <p className={cn("text-sm mb-6", darkMode ? "text-slate-400" : "text-zinc-500")}>Hệ thống đang xử lý và khởi tạo chuyển động.<br />Quá trình này có thể mất vài phút, vui lòng chờ đợi.</p>
                  <button
                    onClick={() => setActiveVideoGenModal(null)}
                    className={cn(
                      "px-6 py-2.5 rounded-xl font-bold text-sm transition-colors border shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50",
                      darkMode ? "bg-slate-800 border-white/[0.07] text-slate-300 hover:text-white" : "bg-zinc-100 border-zinc-300 text-zinc-700 hover:text-black"
                    )}
                  >
                    Đóng & Chạy ngầm
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-6 overflow-y-auto custom-scrollbar max-h-[70vh] pr-2">
                  <div className="flex gap-4">
                    {sceneInfo.videoUrl && (
                      <div className="flex-1 flex flex-col gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1"><CheckSquare size={14} /> Output Video</span>
                        <div className={cn("w-full aspect-video rounded-xl overflow-hidden bg-black border", darkMode ? "border-white/[0.07]" : "border-zinc-200")}>
                          <video src={sceneInfo.videoUrl} controls crossOrigin="anonymous" className="w-full h-full object-contain" />
                        </div>
                      </div>
                    )}
                    {sceneInfo.startFrameUrl && (
                      <div className="flex-1 flex flex-col gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1"><ImageIcon size={14} /> Input Frame / Media</span>
                        <div className={cn("w-full aspect-video rounded-xl overflow-hidden bg-black border flex items-center justify-center", darkMode ? "border-white/[0.07]" : "border-zinc-200")}>
                          <img src={sceneInfo.startFrameUrl} crossOrigin="anonymous" className="w-full h-full object-contain" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={cn("w-full h-px", darkMode ? "bg-white/[0.07]" : "bg-zinc-200")} />

                  <div className="flex flex-col gap-3">
                    <label className={cn("text-sm font-bold", darkMode ? "text-slate-200" : "text-zinc-800")}>Generate Mode</label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: 'start_frame_to_video', label: 'Start Frame ➔ Video' },
                        { id: 'text_to_video', label: 'Text ➔ Video' },
                        { id: 'references_to_video', label: 'References ➔ Video' }
                      ].map(mode => (
                        <label
                          key={mode.id}
                          className={cn(
                            "flex items-center justify-center p-3 border rounded-xl cursor-pointer transition-all text-xs font-bold text-center",
                            videoGenOptions.mode === mode.id
                              ? (darkMode ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "bg-emerald-50 border-emerald-400 text-emerald-700")
                              : (darkMode ? "bg-slate-950/60 border-white/[0.07] text-slate-400 hover:border-emerald-500/30" : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:border-emerald-300")
                          )}
                        >
                          <input type="radio" name="genMode" className="hidden" checked={videoGenOptions.mode === mode.id} onChange={() => setVideoGenOptions({ ...videoGenOptions, mode: mode.id })} />
                          {mode.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className={cn("text-sm font-bold", darkMode ? "text-slate-200" : "text-zinc-800")}>Custom prompt (Optional)</label>
                    <textarea
                      value={videoGenOptions.prompt}
                      onChange={e => setVideoGenOptions({ ...videoGenOptions, prompt: e.target.value })}
                      placeholder="Nhập prompt custom để điều khiển AI tốt hơn..."
                      className={cn(fieldInput(darkMode), "h-20 resize-none custom-scrollbar")}
                    />
                  </div>

                  <div className="flex flex-col gap-3">
                    <label className={cn("text-sm font-bold", darkMode ? "text-slate-200" : "text-zinc-800")}>Resolution (Độ phân giải)</label>
                    <div className="flex gap-4">
                      {[{ id: '480p', label: '480p (Nhanh)' }, { id: '720p', label: '720p (Nét)' }].map(res => (
                        <label key={res.id} className={cn("flex items-center gap-2 cursor-pointer text-sm font-medium", darkMode ? "text-slate-300" : "text-zinc-700")}>
                          <input type="radio" name="resMode" value={res.id} checked={videoGenOptions.resolution === res.id} onChange={() => setVideoGenOptions({ ...videoGenOptions, resolution: res.id })} className="accent-emerald-500 w-4 h-4" />
                          {res.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className={cn("mt-2 pt-5 border-t flex justify-end gap-3", darkMode ? "border-white/[0.07]" : "border-zinc-200")}>
                    <button
                      onClick={() => setActiveVideoGenModal(null)}
                      className={cn("h-10 px-6 rounded-xl font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50", darkMode ? "bg-transparent text-slate-400 hover:bg-white/5 hover:text-white" : "bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-black")}
                    >
                      Hủy
                    </button>
                    <button
                      onClick={() => handleGenVideoSingle(sceneInfo.scene_n, videoGenOptions)}
                      className="h-10 px-8 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-md transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                    >
                      <Film size={16} /> Bắt đầu Gen AI
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Edit Scene Modal */}
      {activeEditSceneModal && (
        <div className={OVERLAY}>
          <div className={cn(modalCard(darkMode), "p-7 w-full max-w-2xl flex flex-col max-h-[90vh]")}>
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-60 rounded-t-2xl" />
            <button onClick={() => setActiveEditSceneModal(null)} className={cn("absolute top-5 right-5 cursor-pointer transition-colors focus-visible:outline-none", darkMode ? "text-slate-500 hover:text-white" : "text-zinc-500 hover:text-black")}><X size={20} /></button>
            <h2 className={cn("text-xl font-bold mb-6 border-b pb-4 flex items-center gap-2", darkMode ? "text-white border-white/[0.07]" : "text-black border-zinc-200")}>
              Sửa thông tin - Scene {activeEditSceneModal.scene_n}
            </h2>

            <div className="flex flex-col gap-5 overflow-y-auto pr-2 custom-scrollbar">
              {isSemi ? (
                <>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-amber-400">Footage (Cảnh quay)</label>
                    <textarea value={activeEditSceneModal.Footage || ''} onChange={(e) => setActiveEditSceneModal({ ...activeEditSceneModal, Footage: e.target.value })} className={cn(fieldInput(darkMode), "h-24 resize-none custom-scrollbar")} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={cn("text-sm font-bold", darkMode ? "text-white" : "text-black")}>Voiceover (Lời thoại)</label>
                    <textarea value={activeEditSceneModal.Voiceover || ''} onChange={(e) => setActiveEditSceneModal({ ...activeEditSceneModal, Voiceover: e.target.value })} className={cn(fieldInput(darkMode), "h-24 resize-none custom-scrollbar")} />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-purple-400">Context (Bối cảnh)</label>
                    <textarea value={activeEditSceneModal.Context || ''} onChange={(e) => setActiveEditSceneModal({ ...activeEditSceneModal, Context: e.target.value })} className={cn(fieldInput(darkMode), "h-20 resize-none custom-scrollbar")} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-bold text-emerald-400">Camera (Góc máy)</label>
                      <textarea value={activeEditSceneModal.Camera || ''} onChange={(e) => setActiveEditSceneModal({ ...activeEditSceneModal, Camera: e.target.value })} className={cn(fieldInput(darkMode), "h-20 resize-none custom-scrollbar")} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-bold text-orange-400">Action (Hành động)</label>
                      <textarea value={activeEditSceneModal.Action || ''} onChange={(e) => setActiveEditSceneModal({ ...activeEditSceneModal, Action: e.target.value })} className={cn(fieldInput(darkMode), "h-20 resize-none custom-scrollbar")} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-amber-400">Character (Nhân vật)</label>
                    <input type="text" value={activeEditSceneModal.Character || ''} onChange={(e) => setActiveEditSceneModal({ ...activeEditSceneModal, Character: e.target.value })} className={fieldInput(darkMode)} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={cn("text-sm font-bold", darkMode ? "text-white" : "text-black")}>Dialogue (Thoại)</label>
                    <textarea value={activeEditSceneModal.Dialogue || activeEditSceneModal.Voiceover || ''} onChange={(e) => setActiveEditSceneModal({ ...activeEditSceneModal, Dialogue: e.target.value, Voiceover: e.target.value })} className={cn(fieldInput(darkMode), "h-24 resize-none custom-scrollbar")} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-amber-400">Tone (Giọng điệu)</label>
                    <input type="text" value={activeEditSceneModal.Tone_of_Voice || ''} onChange={(e) => setActiveEditSceneModal({ ...activeEditSceneModal, Tone_of_Voice: e.target.value })} className={fieldInput(darkMode)} />
                  </div>
                </>
              )}
              <div className="flex flex-col gap-2">
                <label className={cn("text-sm font-bold", darkMode ? "text-slate-400" : "text-zinc-700")}>Translate (Bản dịch)</label>
                <textarea value={activeEditSceneModal.Translate || ''} onChange={(e) => setActiveEditSceneModal({ ...activeEditSceneModal, Translate: e.target.value })} className={cn(fieldInput(darkMode), "h-16 resize-none custom-scrollbar")} />
              </div>
            </div>

            <div className={cn("flex justify-end gap-3 mt-6 pt-5 border-t shrink-0", darkMode ? "border-white/[0.07]" : "border-zinc-200")}>
              <button onClick={() => setActiveEditSceneModal(null)} className={cn("h-10 px-6 rounded-xl font-bold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50", darkMode ? "text-slate-400 hover:text-white hover:bg-white/5" : "text-zinc-600 hover:text-black hover:bg-zinc-100")}>Hủy</button>
              <button onClick={handleSaveSceneEdit} className="h-10 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold cursor-pointer shadow-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50">Lưu thay đổi</button>
            </div>
          </div>
        </div>
      )}

      {/* Gen Audio Single Modal */}
      {activeGenModal && (
        <div className={OVERLAY} onClick={() => !isGenerating[activeGenModal.scene_n] && setActiveGenModal(null)}>
          <div className={cn(modalCard(darkMode), "w-full max-w-lg")} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => !isGenerating[activeGenModal.scene_n] && setActiveGenModal(null)} disabled={isGenerating[activeGenModal.scene_n]} className={cn("absolute top-4 right-4 cursor-pointer transition-colors disabled:opacity-40 focus-visible:outline-none", darkMode ? "text-slate-500 hover:text-white" : "text-zinc-500 hover:text-black")}><X size={20} /></button>

            <div className={cn("p-6 border-b", darkMode ? "border-white/[0.07]" : "border-zinc-200")}>
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-60 rounded-t-2xl" />
              <h2 className={cn("text-lg font-bold flex items-center gap-2", darkMode ? "text-white" : "text-black")}>
                <Music className="text-purple-400" size={20} /> Gen Audio — Scene {activeGenModal.scene_n}
              </h2>
              <p className={cn("text-[11px] mt-1", darkMode ? "text-slate-500" : "text-zinc-400")}>Có thể chỉnh sửa lời thoại bên dưới trước khi gen</p>
            </div>

            <div className="p-6">
              <textarea
                value={genModalText}
                onChange={(e) => setGenModalText(e.target.value)}
                disabled={isGenerating[activeGenModal.scene_n]}
                rows={5}
                className={cn(fieldInput(darkMode), "custom-scrollbar resize-none mb-4")}
                placeholder="Nhập lời thoại cho scene này..."
              />

              <div className="mb-4">
                <div className={cn("text-[11px] font-bold uppercase tracking-wider mb-2", darkMode ? "text-slate-500" : "text-zinc-400")}>Nguồn giọng</div>
                <div className="flex flex-col gap-1.5">
                  <label className={cn("flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all", voiceMode === 'minimax' ? "border-purple-500/60 bg-purple-500/10" : (darkMode ? "border-white/[0.07] hover:border-white/20" : "border-zinc-200 hover:border-zinc-300"))}>
                    <input type="radio" name="genModalVoiceMode" checked={voiceMode === 'minimax'} onChange={() => handleChangeVoiceMode('minimax')} className="accent-purple-600 cursor-pointer" />
                    <div className="flex-1 min-w-0">
                      <div className={cn("text-xs font-bold", darkMode ? "text-slate-200" : "text-zinc-800")}>🎙 Custom Voice (Minimax)</div>
                      <div className={cn("text-[10px] truncate", minimaxVoiceId ? "text-slate-500" : "text-amber-500")}>
                        {minimaxVoiceId ? (MINIMAX_PRESET_VOICES.find(v => v.id === minimaxVoiceId)?.name || minimaxVoiceId) : 'Chưa tải được danh sách giọng'}
                      </div>
                    </div>
                    {voiceMode === 'minimax' && MINIMAX_PRESET_VOICES.length > 1 && (
                      <select
                        value={minimaxVoiceId}
                        onChange={(e) => handleChangeMinimaxVoice(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className={cn("text-[11px] rounded-lg px-2 py-1 border cursor-pointer focus:outline-none max-w-[140px]", darkMode ? "bg-slate-950/80 border-white/[0.08] text-slate-200" : "bg-white border-zinc-300 text-zinc-800")}
                      >
                        {MINIMAX_PRESET_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    )}
                  </label>

                  <label className={cn("flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all", voiceMode === 'clone' ? "border-purple-500/60 bg-purple-500/10" : (darkMode ? "border-white/[0.07] hover:border-white/20" : "border-zinc-200 hover:border-zinc-300"))}>
                    <input type="radio" name="genModalVoiceMode" checked={voiceMode === 'clone'} onChange={() => handleChangeVoiceMode('clone')} className="accent-purple-600 cursor-pointer" />
                    <div className="flex-1 min-w-0">
                      <div className={cn("text-xs font-bold", darkMode ? "text-slate-200" : "text-zinc-800")}>⬆ Voice Clone (Qwen)</div>
                      <div className={cn("text-[10px] truncate", voiceCloneBase64 ? "text-emerald-400" : "text-amber-500")}>
                        {voiceCloneBase64 ? '✓ Đã sẵn sàng (đã upload file mẫu)' : 'Chưa upload file mẫu — tải lên ở thanh bên trái'}
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <button
                onClick={async () => { await handleGenAudio(activeGenModal.scene_n, genModalText); setActiveGenModal(null); }}
                disabled={isGenerating[activeGenModal.scene_n] || !genModalText.trim() || (voiceMode === 'clone' && !voiceCloneBase64)}
                className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-xl font-bold cursor-pointer shadow-md transition-colors flex justify-center items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50"
              >
                {isGenerating[activeGenModal.scene_n] ? <Loader2 size={18} className="animate-spin" /> : <Music size={18} />}
                {isGenerating[activeGenModal.scene_n] ? 'Đang gen audio...' : 'Gen Audio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Gen Audio Modal */}
      {isModalOpen && (
        <div className={OVERLAY}>
          <div className={cn(modalCard(darkMode), "w-full max-w-2xl flex flex-col max-h-[85vh]")}>
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-60 rounded-t-2xl" />
            <button onClick={() => !isBatchGenerating && setIsModalOpen(false)} disabled={isBatchGenerating} className={cn("absolute top-4 right-4 cursor-pointer transition-colors focus-visible:outline-none", darkMode ? "text-slate-500 hover:text-white" : "text-zinc-500 hover:text-black")}><X size={20} /></button>

            <div className={cn("p-6 border-b shrink-0", darkMode ? "border-white/[0.07]" : "border-zinc-200")}>
              <h2 className={cn("text-xl font-bold flex items-center gap-2", darkMode ? "text-white" : "text-black")}>
                <Music className="text-purple-400" /> Batch Gen Audio
              </h2>
            </div>

            <div className={cn("px-6 py-3 border-b flex gap-3 shrink-0", darkMode ? "bg-slate-950/60 border-white/[0.07]" : "bg-zinc-50 border-zinc-200")}>
              <button onClick={() => { const all = {}; filteredScenesForAudio.forEach(s => { if (!generatedAudios[s.scene_n]) all[s.scene_n] = true; }); setCheckedScenes(all); }} disabled={isBatchGenerating} className="px-4 py-1.5 text-xs font-bold bg-purple-500/10 text-purple-400 hover:bg-purple-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-lg cursor-pointer transition-colors border border-purple-500/20">Chọn tất cả</button>
              <button onClick={() => setCheckedScenes({})} disabled={isBatchGenerating} className={cn("px-4 py-1.5 text-xs font-bold border disabled:opacity-50 disabled:cursor-not-allowed rounded-lg cursor-pointer transition-colors", darkMode ? "bg-slate-900/60 border-white/[0.07] text-slate-400 hover:text-white" : "bg-white border-zinc-300 text-zinc-700 hover:text-black")}>Bỏ chọn</button>
            </div>

            {isBatchGenerating && (
              <div className={cn("px-6 py-2.5 border-b text-sm font-semibold flex items-center justify-between shadow-inner", darkMode ? "bg-purple-900/20 border-white/[0.07] text-purple-400" : "bg-purple-50 border-zinc-200 text-purple-600")}>
                <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Đang khởi tạo Audio...</span>
                <span>{batchGenProgress.current} / {batchGenProgress.total}</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              <div className="flex flex-col">
                {filteredScenesForAudio.length === 0 ? (
                  <div className={cn("text-center py-10 text-sm", darkMode ? "text-slate-500" : "text-zinc-600")}>Không có cảnh nào chứa lời thoại.</div>
                ) : (
                  filteredScenesForAudio.map((scene) => {
                    if (isBatchGenerating && !checkedScenes[scene.scene_n]) return null;
                    return (
                      <div
                        key={scene.scene_n}
                        onClick={() => !isBatchGenerating && setCheckedScenes(prev => ({ ...prev, [scene.scene_n]: !prev[scene.scene_n] }))}
                        className={cn(
                          "flex items-start gap-4 p-4 border-b transition-colors select-none",
                          darkMode ? "border-white/[0.05]" : "border-zinc-100",
                          checkedScenes[scene.scene_n] ? (darkMode ? "bg-purple-900/20" : "bg-purple-50") : (darkMode ? "hover:bg-white/5 cursor-pointer" : "hover:bg-zinc-50 cursor-pointer"),
                          isBatchGenerating ? "cursor-not-allowed opacity-60" : ""
                        )}
                      >
                        <div className="mt-1 shrink-0">{checkedScenes[scene.scene_n] ? <CheckSquare className="text-purple-500" size={20} /> : <Square className={darkMode ? "text-slate-600" : "text-zinc-400"} size={20} />}</div>
                        <div className="flex-1 min-w-0 text-sm space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className={cn("font-bold", darkMode ? "text-slate-200" : "text-zinc-900")}>Scene {scene.scene_n}</span>
                            {generatedAudios[scene.scene_n] && <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Đã có Audio</span>}
                          </div>
                          <div className={cn("truncate leading-relaxed", darkMode ? "text-slate-400" : "text-zinc-600")}>{isSemi ? 'Voiceover: ' : 'Dialogue: '} {getTextToGen(scene)}</div>
                          {generatedAudios[scene.scene_n] && (
                            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                              <audio src={generatedAudios[scene.scene_n]} controls className="w-full h-8 custom-audio" controlsList="nodownload noplaybackrate" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <div className={cn("p-6 border-t shrink-0", darkMode ? "border-white/[0.07]" : "border-zinc-200")}>
              <button onClick={handleStartBatchGen} disabled={isBatchGenerating} className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-xl font-bold cursor-pointer shadow-md transition-colors flex justify-center items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50">
                {isBatchGenerating ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}
                {isBatchGenerating ? 'Hệ thống đang xử lý, vui lòng chờ...' : 'Bắt đầu Gen Audio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Merge Modal */}
      {isMergeModalOpen && (
        <div className={OVERLAY}>
          <div className={cn(modalCard(darkMode), "w-full max-w-2xl flex flex-col max-h-[85vh]")}>
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-60 rounded-t-2xl" />
            <button onClick={() => !isMerging && setIsMergeModalOpen(false)} disabled={isMerging} className={cn("absolute top-5 right-5 cursor-pointer transition-colors focus-visible:outline-none", darkMode ? "text-slate-500 hover:text-white" : "text-zinc-500 hover:text-black")}><X size={20} /></button>

            <div className={cn("p-6 border-b shrink-0", darkMode ? "border-white/[0.07]" : "border-zinc-200")}>
              <h2 className={cn("text-xl font-bold flex items-center gap-2", darkMode ? "text-white" : "text-black")}>
                <Merge className="text-amber-400" /> Batch Merge Video
              </h2>
            </div>

            <div className={cn("px-6 py-5 border-b", darkMode ? "bg-slate-950/60 border-white/[0.07]" : "bg-zinc-50 border-zinc-200")}>
              <div className="flex justify-between items-center mb-3">
                <span className={cn("font-semibold text-sm", darkMode ? "text-slate-200" : "text-zinc-900")}>Âm lượng video gốc (Mix)</span>
                <span className="text-amber-500 font-mono font-bold bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">{(globalMixVol / 100).toFixed(2)}</span>
              </div>
              <input type="range" min="0" max="100" value={globalMixVol} onChange={(e) => setGlobalMixVol(e.target.value)} disabled={isMerging} className={cn("w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-amber-500", darkMode ? "bg-slate-800" : "bg-zinc-300")} />
            </div>

            <div className={cn("px-6 py-3 border-b flex gap-3 shrink-0", darkMode ? "bg-slate-950/60 border-white/[0.07]" : "bg-zinc-50 border-zinc-200")}>
              <button onClick={() => { const all = {}; parsedData.forEach(s => { if (s.videoUrl || s.startFrameUrl) all[s.scene_n] = true; }); setCheckedMergeScenes(all); }} disabled={isMerging} className="px-4 py-1.5 text-xs font-bold bg-amber-500/10 text-amber-500 disabled:opacity-50 hover:bg-amber-500 hover:text-slate-950 rounded-lg cursor-pointer border border-amber-500/20 transition-colors">Chọn tất cả (có Video/Ảnh)</button>
              <button onClick={() => setCheckedMergeScenes({})} disabled={isMerging} className={cn("px-4 py-1.5 text-xs font-bold border disabled:opacity-50 rounded-lg cursor-pointer transition-colors", darkMode ? "bg-slate-900/60 border-white/[0.07] text-slate-400 hover:text-white" : "bg-white border-zinc-300 text-zinc-700 hover:text-black")}>Bỏ chọn</button>
            </div>

            {isMerging && (
              <div className={cn("px-6 py-2.5 border-b text-sm font-semibold flex items-center justify-between shadow-inner", darkMode ? "bg-amber-900/20 border-white/[0.07] text-amber-400" : "bg-amber-50 border-zinc-200 text-amber-600")}>
                <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Đang Merge Video...</span>
                <span>{batchMergeProgress.current} / {batchMergeProgress.total}</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              <div className="flex flex-col">
                {parsedData.map((scene) => {
                  const isEligible = (scene.videoUrl || scene.startFrameUrl);
                  const isChecked = !!checkedMergeScenes[scene.scene_n];
                  if (isMerging && !isChecked) return null;
                  return (
                    <div
                      key={scene.scene_n}
                      onClick={() => !isMerging && isEligible && setCheckedMergeScenes(prev => ({ ...prev, [scene.scene_n]: !prev[scene.scene_n] }))}
                      className={cn(
                        "flex items-center gap-4 p-4 border-b transition-colors select-none",
                        darkMode ? "border-white/[0.05]" : "border-zinc-100",
                        !isEligible ? (darkMode ? "opacity-50 cursor-not-allowed bg-black/20" : "opacity-50 cursor-not-allowed bg-zinc-100") : (isChecked ? (darkMode ? "bg-amber-500/10" : "bg-amber-50") : (darkMode ? "hover:bg-white/5 cursor-pointer" : "hover:bg-zinc-50 cursor-pointer")),
                        isMerging ? "opacity-50 cursor-not-allowed" : ""
                      )}
                    >
                      <div className="shrink-0">{isChecked ? <CheckSquare className="text-amber-500" size={20} /> : <Square className={darkMode ? "text-slate-600" : "text-zinc-400"} size={20} />}</div>
                      <div className="flex-1 min-w-0 text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn("font-bold", isChecked ? "text-amber-500" : (darkMode ? "text-slate-200" : "text-zinc-900"))}>Scene {scene.scene_n}</span>
                          {!isEligible && <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">Thiếu Input</span>}
                        </div>
                        <div className={cn("text-xs", darkMode ? "text-slate-500" : "text-zinc-600")}>{generatedAudios[scene.scene_n] ? 'Âm thanh: Có AI Audio + Nhạc nền' : 'Âm thanh: Chỉ lấy âm thanh Video gốc'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className={cn("p-6 border-t shrink-0", darkMode ? "border-white/[0.07]" : "border-zinc-200")}>
              <button onClick={handleStartMerge} disabled={isMerging || Object.keys(checkedMergeScenes).filter(k => checkedMergeScenes[k]).length === 0} className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-400 text-slate-950 rounded-xl font-bold cursor-pointer flex items-center justify-center gap-2 shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50">
                {isMerging ? <Loader2 size={18} className="animate-spin" /> : <Merge size={18} />}
                {isMerging ? 'Hệ thống đang xử lý, vui lòng chờ...' : `Bắt đầu Merge Video`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {isExportModalOpen && (
        <div className={OVERLAY}>
          <div className={cn(modalCard(darkMode), "w-full max-w-2xl flex flex-col max-h-[85vh]")}>
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-60 rounded-t-2xl" />
            <button onClick={() => setIsExportModalOpen(false)} className={cn("absolute top-5 right-5 cursor-pointer transition-colors focus-visible:outline-none", darkMode ? "text-slate-500 hover:text-white" : "text-zinc-500 hover:text-black")}><X size={20} /></button>

            <div className={cn("p-6 border-b shrink-0", darkMode ? "border-white/[0.07]" : "border-zinc-200")}>
              <h2 className={cn("text-xl font-bold flex items-center gap-2", darkMode ? "text-white" : "text-black")}>
                <Download className="text-emerald-400" /> Export Output
              </h2>
            </div>

            {Object.keys(mergedVideos).length === 0 ? (
              <div className={cn("flex-1 flex items-center justify-center text-center py-16 text-sm", darkMode ? "text-slate-500" : "text-zinc-600")}>
                Chưa có video Output nào được tạo.<br />Bạn hãy chạy "Batch Merge" trước nhé!
              </div>
            ) : (
              <>
                <div className={cn("px-6 py-3 border-b flex gap-3 shrink-0", darkMode ? "bg-slate-950/60 border-white/[0.07]" : "bg-zinc-50 border-zinc-200")}>
                  <button onClick={() => { const all = {}; parsedData.forEach(s => { if (mergedVideos[s.scene_n]) all[s.scene_n] = true; }); setCheckedExportScenes(all); }} className="px-4 py-1.5 text-xs font-bold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-lg cursor-pointer border border-emerald-500/20 transition-colors">Chọn tất cả</button>
                  <button onClick={() => setCheckedExportScenes({})} className={cn("px-4 py-1.5 text-xs font-bold border rounded-lg cursor-pointer transition-colors", darkMode ? "bg-slate-900/60 border-white/[0.07] text-slate-400 hover:text-white" : "bg-white border-zinc-300 text-zinc-700 hover:text-black")}>Bỏ chọn</button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                  <div className="flex flex-col">
                    {parsedData.filter(scene => mergedVideos[scene.scene_n]).map((scene) => {
                      const isChecked = !!checkedExportScenes[scene.scene_n];
                      return (
                        <div
                          key={scene.scene_n}
                          onClick={() => setCheckedExportScenes(prev => ({ ...prev, [scene.scene_n]: !prev[scene.scene_n] }))}
                          className={cn(
                            "flex items-center gap-4 p-4 border-b cursor-pointer transition-colors select-none",
                            darkMode ? "border-white/[0.05]" : "border-zinc-100",
                            isChecked ? (darkMode ? "bg-emerald-900/20" : "bg-emerald-50") : (darkMode ? "hover:bg-white/5" : "hover:bg-zinc-50")
                          )}
                        >
                          <div className="shrink-0">{isChecked ? <CheckSquare className="text-emerald-500" size={20} /> : <Square className={darkMode ? "text-slate-600" : "text-zinc-400"} size={20} />}</div>
                          <div className="flex-1 min-w-0 text-sm space-y-1">
                            <div className={cn("font-bold", isChecked ? "text-emerald-400" : (darkMode ? "text-slate-200" : "text-zinc-900"))}>Scene {scene.scene_n} Output.mp4</div>
                            <div className={cn("text-xs", darkMode ? "text-slate-500" : "text-zinc-600")}>{generatedAudios[scene.scene_n] ? 'Âm thanh: Có AI Audio' : 'Âm thanh: Chỉ Video gốc'}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className={cn("p-6 border-t shrink-0", darkMode ? "border-white/[0.07]" : "border-zinc-200")}>
                  <button onClick={handleDownloadVideos} disabled={Object.keys(checkedExportScenes).filter(k => checkedExportScenes[k]).length === 0} className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-xl font-bold cursor-pointer flex items-center justify-center gap-2 shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50">
                    <Download size={18} /> Tải xuống Video
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}