import React, { useState, useRef, useEffect } from 'react';
import { FileText, Upload, Scissors, Wand2, Film, Loader2, CheckCircle2 } from 'lucide-react';
import { fetchFile } from '@ffmpeg/util';
import { useNavigate } from 'react-router-dom';

import { autoSaveToFirebase } from './firebase.js'; 

export default function MainEditor({ ffmpeg, isFfmpegLoaded, darkMode, setDarkMode }) { 
  const navigate = useNavigate(); 

  const [script, setScript] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  
  const [isLocked, setIsLocked] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [cutProgress, setCutProgress] = useState({ current: 0, total: 0 });
  const [showVideoPopup, setShowVideoPopup] = useState(false);

  const fileInputRef = useRef(null);
  const blobUrlsRef = useRef([]);

  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const handleFileUpload = (e) => e.target.files[0] && setVideoFile(e.target.files[0]);

  const handleFullAIWorkflow = async () => {
    if (!script) return alert("Vui lòng nhập kịch bản!");
    
    setIsLocked(true);
    setLoadingStatus('Đang xử lý kịch bản GEN AI...');
    
    try {
      const parsedData = await callGeminiAPI(`Bạn là chuyên gia bóc tách kịch bản AI. Hãy đọc kịch bản và trả về DUY NHẤT 1 JSON Object.
Quy tắc xử lý kịch bản:
1. Trong kịch bản, phần "Character" thường chứa cả Tên và Mô tả. Hãy tách riêng: Đưa mô tả (VD: 30s Hispanic female...) vào mảng "characters", còn ở mảng "scenes", trường "Character" chỉ ghi ngắn gọn Tên nhân vật (VD: Plaintiff).
2. Dữ liệu từ "Dialogue" phải được chuyển thành "Voiceover". Dữ liệu từ "Tone" chuyển thành "Tone_of_Voice".
3. Tự tính số từ của lời thoại điền vào "Word_count".

Cấu trúc JSON BẮT BUỘC:
{
  "characters": [
    { "id": "char_1", "name": "Plaintiff", "description": "30s Hispanic female, looking devastated and exhausted...", "voiceTone": "emotional, fast-paced" }
  ],
  "scenes": [
    { "scene_n": 1, "Context": "Nguyên đơn uất nghẹn...", "Camera": "tight eye-level close-up", "Action": "serious, keeping head still...", "Character": "Plaintiff", "Voiceover": "We were just walking...", "Translate": "Chúng tôi chỉ đang đi...", "Tone_of_Voice": "emotional, fast-paced", "Word_count": 25, "status": "pending" }
  ]
}

KHÔNG thêm markdown \`\`\`json. CHỈ TRẢ VỀ ĐÚNG CẤU TRÚC JSON ĐÓ.
Kịch bản: ${script}`);

      setLoadingStatus('Đang khởi tạo Workspace (Lưu Database)...');
      
      const savedProjectId = await autoSaveToFirebase(
        parsedData.scenes, 
        "Dự án Full AI - " + new Date().toLocaleTimeString(), 
        script, 
        parsedData.characters,
        "full-ai" 
      );

      if (savedProjectId) {
        navigate(`/project/${savedProjectId}`, { state: { characters: parsedData.characters } });
      } else {
        throw new Error("Không thể lưu Firebase");
      }

    } catch (error) {
      console.error(error);
      setIsLocked(false);
      alert(error.message || "Đã xảy ra lỗi trong quá trình xử lý!");
    }
  };

  const handleSemiWorkflow = async () => {
    if (!script) return alert("Vui lòng nhập kịch bản!");
    if (!videoFile) {
      setShowVideoPopup(true);
      return;
    }

    setIsLocked(true);
    setLoadingStatus('Đang trích xuất mốc thời gian (Semi)...');

    try {
      const parsedData = await callGeminiAPI(`You are an expert data extraction assistant. Read the provided script and return EXACTLY ONE JSON Object.

CRITICAL INSTRUCTIONS:
1. TIME EXTRACTION: The script may contain both 'Time' and 'Time_origin'. You MUST extract the EXACT value of 'Time_origin' (e.g., "03:12 - 03:20") and assign it to the "time_origin" field. Failing this will break the system.

2. VOICEOVER HANDLING (STRICT BAN ON VIETNAMESE):
   - Extract the exact spoken dialogue (which is usually in English) into the "Voiceover" field.
   - KILL-SWITCH FILTER: The "Voiceover" field MUST NEVER contain any Vietnamese words. IF you are about to include any Vietnamese text in the "Voiceover", you MUST consider it INVALID and LEAVE IT COMPLETELY EMPTY: "Voiceover": "" and "Word_count": 0.
   - NEVER mix the Vietnamese translation (the "Translate" line) or author notes into the "Voiceover" field.
   - Calculate the word count of the "Voiceover" text and put it in "Word_count".
   - FALLBACK: IF a scene has NO spoken dialogue (or violates the Vietnamese text ban), you MUST leave it empty: "Voiceover": "" and "Word_count": 0.

3. IGNORE CHARACTERS: Do not analyze characters. Always keep the "characters" array completely empty [].

REQUIRED JSON STRUCTURE (EXAMPLE):
{
  "characters": [], 
  "scenes": [
    { "scene_n": 1, "time_origin": "03:12 - 03:20", "Footage": "Cảnh sát lạnh lùng...", "Effect": "Metal handcuffs clicking", "Character": "", "Voiceover": "You can't play the victim...", "Translate": "Bạn không thể đóng vai...", "Tone_of_Voice": "Tự nhiên", "Word_count": 6, "status": "pending" },
    { "scene_n": 2, "time_origin": "03:20 - 03:25", "Footage": "Đám đông nhốn nháo...", "Effect": "Crowd noise", "Character": "", "Voiceover": "", "Translate": "", "Tone_of_Voice": "", "Word_count": 0, "status": "pending" }
  ]
}

DO NOT wrap the output in markdown \`\`\`json. RETURN ONLY THE RAW JSON OBJECT.
Kịch bản: ${script}`);

      await performCutVideo(parsedData);

    } catch (error) {
      console.error(error);
      setIsLocked(false);
      alert(error.message || "Đã xảy ra lỗi khi xử lý kịch bản!");
    }
  };

  const callGeminiAPI = async (promptText) => {
    const geminiKeys = [import.meta.env.VITE_GEMINI_KEY_1, import.meta.env.VITE_GEMINI_KEY_2, import.meta.env.VITE_GEMINI_KEY_3].filter(Boolean);
    if (geminiKeys.length === 0) throw new Error("Chưa cấu hình API Key");
    
    for (let i = 0; i < geminiKeys.length; i++) {
      try {
        console.log(`Đang thử gọi Gemini API với Key số ${i + 1}...`);
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKeys[i]}`, {
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            contents: [{ parts: [{ text: promptText }] }], 
            generationConfig: { response_mime_type: "application/json", temperature: 0 } 
          })
        });
        
        const data = await response.json();
        
        if (data.error) {
          const errMsg = data.error.message.toLowerCase();
          if (response.status === 429 || response.status === 503 || errMsg.includes('exhausted') || errMsg.includes('overloaded') || errMsg.includes('demand')) {
             console.warn(`Key ${i + 1} đang quá tải, chuyển sang Key tiếp theo...`);
             continue; 
          }
          throw new Error(data.error.message); 
        }
        
        const rawText = data.candidates[0].content.parts[0].text;
        
        const jsonMatch = rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error("Lỗi cấu trúc trả về từ AI.");
        
        let parsedJson = JSON.parse(jsonMatch[0]);
        
        if (Array.isArray(parsedJson)) {
          parsedJson = { characters: [], scenes: parsedJson };
        }
        
        if (!parsedJson.scenes) parsedJson.scenes = [];
        if (!parsedJson.characters) parsedJson.characters = [];
        
        return parsedJson;

      } catch (err) {
        if (i === geminiKeys.length - 1) {
          throw new Error("Máy chủ AI đang quá tải lượt yêu cầu. Vui lòng bấm nút thử lại!");
        }
      }
    }
    throw new Error("Máy chủ AI đang quá tải lượt yêu cầu. Vui lòng bấm nút thử lại!");
  };

  const performCutVideo = async (parsedData) => {
    // 🚀 BỔ SUNG CỜ THEO DÕI ĐỂ BÁO LỖI ĐÚNG GIAI ĐOẠN
    let isVideoProcessingPhase = true; 

    try {
      setLoadingStatus('Đang kiểm tra lõi xử lý Video...');
      if (!isFfmpegLoaded) {
        alert("Hệ thống đang nạp lõi Video ở nền, vui lòng đợi vài giây rồi thử lại!");
        setIsLocked(false);
        return;
      }

      setLoadingStatus('Đang đọc file video gốc...');
      await ffmpeg.writeFile('input_video.mp4', await fetchFile(videoFile));
      
      const updatedScenes = [...parsedData.scenes];
      const validScenes = updatedScenes.filter(s => s.time_origin && s.time_origin.includes('-'));
      
      setCutProgress({ current: 0, total: validScenes.length });

      // Vẫn lấy tối đa luồng để chạy nhanh nhất có thể theo yêu cầu của bạn
      const userCores = navigator.hardwareConcurrency || 4;
      const threadsToUse = Math.max(1, Math.floor(userCores * 0.8));

      for (let i = 0; i < updatedScenes.length; i++) {
        const scene = updatedScenes[i];
        if(!scene.time_origin || !scene.time_origin.includes('-')) continue;

        setCutProgress(prev => ({ ...prev, current: prev.current + 1 }));
        setLoadingStatus(`Đang render Video cảnh ${scene.scene_n}...`);

        const [start, end] = scene.time_origin.split('-').map(s => s.trim());
        const outputName = `scene_${scene.scene_n}.mp4`;
        const timeToSeconds = (timeStr) => {
          const parts = timeStr.split(':');
          if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
          if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
          return parseFloat(timeStr);
        };
        const startSec = timeToSeconds(start);
        const duration = timeToSeconds(end) - startSec;
        
        await ffmpeg.exec([
          '-ss', startSec.toString(), 
          '-i', 'input_video.mp4', 
          '-t', duration.toString(), 
          '-threads', threadsToUse.toString(),
          '-c:v', 'libx264', 
          '-preset', 'ultrafast', 
          '-crf', '25', // Điều chỉnh cực nhẹ để nới RAM
          '-vf', "scale='min(1920,iw)':-2", // 🚀 KHÓA TRẦN ĐỘ PHÂN GIẢI Ở 1080P ĐỂ CHỐNG SỐC RAM
          '-max_muxing_queue_size', '4096', // Tăng vùng đệm
          '-tune', 'fastdecode', 
          '-c:a', 'copy', 
          outputName
        ]);

        const data = await ffmpeg.readFile(outputName);
        
        const blobUrl = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
        blobUrlsRef.current.push(blobUrl);
        
        scene.videoUrl = blobUrl;
        scene.status = 'cut';

        // Xóa rác ngay lập tức
        try {
          await ffmpeg.deleteFile(outputName);
        } catch (e) {
          console.warn(`Không thể dọn dẹp file ${outputName}`, e);
        }

        // Dừng cực ngắn 50ms cho luồng trình duyệt kịp xử lý xóa RAM, không làm chậm quá trình
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      try {
        await ffmpeg.deleteFile('input_video.mp4');
      } catch (e) {
        console.warn("Không thể dọn dẹp input_video.mp4", e);
      }
      
      // 🚀 CHUYỂN CỜ KHI ĐÃ CẮT XONG, BẮT ĐẦU UPLOAD CLOUD
      isVideoProcessingPhase = false;
      setLoadingStatus('Đang đồng bộ Video lên mây (Vui lòng chờ)...');
      
      const savedProjectId = await autoSaveToFirebase(
        updatedScenes, 
        "Dự án Semi - " + new Date().toLocaleTimeString(), 
        script, 
        parsedData.characters || [],
        "semi" 
      );

      if (savedProjectId) {
        navigate(`/project/${savedProjectId}`, { state: { characters: parsedData.characters } });
      } else {
        throw new Error("Không thể lưu Firebase");
      }

    } catch (error) {
      console.error("Chi tiết lỗi:", error); 
      setIsLocked(false);
      
      // 🚀 BẮT BỆNH VÀ HIỂN THỊ POPUP THÔNG MINH
      const errorMsg = error?.message?.toLowerCase() || String(error).toLowerCase();
      
      if (isVideoProcessingPhase) {
         if (errorMsg.includes("out of bounds") || errorMsg.includes("memory") || errorMsg.includes("abort")) {
            alert("❌ Dung lượng RAM trình duyệt không đủ để cắt video (Tràn bộ nhớ WebAssembly). Vui lòng F5 tải lại trang, tắt bớt các tab khác và thử lại!");
         } else {
            alert("❌ Đã xảy ra lỗi trong quá trình cắt video (FFmpeg): " + (error.message || "Lỗi không xác định"));
         }
      } else {
         // Nếu lỗi xảy ra khi isVideoProcessingPhase = false, nghĩa là đang bị lỗi tải Firebase
         alert("❌ Lỗi khi đồng bộ dữ liệu lên Cloud Database (Firebase)!");
      }
    } 
  };

  const buttonBaseClass = `group relative w-full py-4 rounded-xl font-bold flex justify-center items-center gap-3 transition-all duration-300 cursor-pointer shadow-md border ${
    darkMode 
      ? 'bg-[#1A1A1F] hover:bg-[#222228] text-zinc-100 border-white/10' 
      : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-800 border-zinc-200 shadow-sm'
  }`;

  return (
    <div className={`flex h-screen w-full font-sans p-4 sm:p-8 gap-8 overflow-hidden items-center justify-center relative transition-colors duration-300 ${darkMode ? 'bg-[#0E0E10] text-white' : 'bg-zinc-100 text-zinc-900'}`}>
      
      <div className={`w-full max-w-5xl border ring-1 rounded-3xl p-8 sm:p-10 flex flex-col shadow-2xl relative overflow-hidden transition-all duration-300 ${darkMode ? 'bg-[#121214] border-white/5 ring-white/10' : 'bg-white border-zinc-200 ring-zinc-200/20'}`}>
        
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 opacity-60"></div>
        {darkMode && (
          <>
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
          </>
        )}

        <div className="text-center mb-10 relative z-10">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-3 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            Khởi tạo Dự án Video
          </h1>
          <p className={`text-sm sm:text-base font-medium ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>Nhập kịch bản và chọn luồng làm việc phù hợp với nhu cầu của bạn.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 relative z-10">
          <div className="flex flex-col gap-3">
            <label className={`text-sm font-bold flex items-center gap-2 ${darkMode ? 'text-zinc-200' : 'text-zinc-700'}`}>
              <FileText size={18} className="text-blue-400"/> Kịch bản chi tiết
            </label>
            <textarea 
              value={script} 
              onChange={(e) => setScript(e.target.value)} 
              className={`w-full h-[280px] border rounded-xl p-5 text-[15px] placeholder:text-zinc-500 focus:outline-none transition-all resize-none custom-scrollbar shadow-inner ${darkMode ? 'bg-[#09090B] border-white/10 text-zinc-300 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10' : 'bg-zinc-50 border-zinc-300 text-zinc-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'}`} 
              placeholder="Dán kịch bản chi tiết vào đây..."
            ></textarea>
          </div>

          <div className="flex flex-col justify-between gap-6">
            <div className="flex flex-col gap-3">
              <label className={`text-sm font-bold flex items-center gap-2 ${darkMode ? 'text-zinc-200' : 'text-zinc-700'}`}>
                <Film size={18} className="text-purple-400"/> Nguồn Video <span className="text-zinc-500 font-normal ml-1">(Chỉ dành cho Semi-Content)</span>
              </label>
              <input type="file" accept="video/mp4" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <div 
                onClick={() => fileInputRef.current.click()} 
                className={`w-full h-[140px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group ${
                  videoFile 
                    ? (darkMode ? 'border-purple-500/50 bg-purple-500/5 shadow-[0_0_20px_rgba(168,85,247,0.1)]' : 'border-purple-500 bg-purple-50/50 shadow-sm') 
                    : (darkMode ? 'border-[#2A2A30] bg-[#09090B] hover:border-purple-500/40 hover:bg-purple-500/5' : 'border-zinc-300 bg-zinc-50 hover:border-purple-500/50 hover:bg-purple-50/30')
                }`}
              >
                {videoFile ? (
                  <div className="flex flex-col items-center gap-2 px-6 text-center animate-in fade-in zoom-in duration-300">
                    <CheckCircle2 className="text-purple-500" size={32} />
                    <span className={`font-medium text-sm break-all line-clamp-2 ${darkMode ? 'text-purple-300' : 'text-purple-700'}`}>{videoFile.name}</span>
                    <span className="text-xs text-purple-500/70">Nhấn để thay đổi file khác</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-zinc-500 group-hover:text-purple-500 transition-colors">
                    <div className={`p-3 rounded-full transition-colors ${darkMode ? 'bg-white/5 group-hover:bg-purple-500/10' : 'bg-zinc-200/60 group-hover:bg-purple-100'}`}>
                      <Upload size={24} />
                    </div>
                    <span className="text-sm font-medium">Bấm để tải video gốc lên (Max 500Mb)</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-zinc-500/20 to-transparent"></div>
              <span className="text-xs text-zinc-500 font-semibold uppercase tracking-widest">Tùy chọn xử lý</span>
              <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-zinc-500/20 to-transparent"></div>
            </div>

            <div className="flex flex-col gap-4">
              <button 
                onClick={handleSemiWorkflow} 
                className={`${buttonBaseClass} ${darkMode ? 'hover:shadow-purple-500/5 hover:border-purple-500/30' : 'hover:border-purple-500/60 hover:bg-purple-50/10'}`}
              >
                <Scissors size={20} className="relative z-10 text-purple-500 group-hover:-rotate-12 transition-transform duration-300" /> 
                <span className="relative z-10 tracking-wide">CẮT VIDEO (SEMI-CONTENT)</span>
              </button>

              <button 
                onClick={handleFullAIWorkflow} 
                className={`${buttonBaseClass} ${darkMode ? 'hover:shadow-blue-500/5 hover:border-blue-500/30' : 'hover:border-blue-500/60 hover:bg-blue-50/10'}`}
              >
                <Wand2 size={20} className="relative z-10 text-blue-500 group-hover:rotate-12 transition-transform duration-300" /> 
                <span className="relative z-10 tracking-wide">TẠO VIDEO (GEN AI)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {isLocked && (
        <div className="fixed inset-0 bg-black/70 z-[9999] flex flex-col items-center justify-center backdrop-blur-xl transition-all duration-300">
          <div className={`border p-10 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.4)] flex flex-col items-center max-w-md w-full text-center relative overflow-hidden animate-in fade-in zoom-in-95 duration-300 ${darkMode ? 'bg-[#121214] border-white/10' : 'bg-white border-zinc-200'}`}>
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50"></div>
            
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full"></div>
              <Loader2 size={56} className="animate-spin text-blue-500 relative z-10" />
            </div>
            
            <h2 className={`text-xl font-bold mb-3 animate-pulse ${darkMode ? 'text-zinc-100' : 'text-zinc-800'}`}>{loadingStatus}</h2>
            <p className="text-sm text-zinc-500 mb-8 leading-relaxed">Vui lòng giữ nguyên cửa sổ trình duyệt, quá trình xử lý AI và render có thể mất vài phút.</p>
            
            {cutProgress.total > 0 && (
              <div className={`w-full p-4 rounded-xl border ${darkMode ? 'bg-[#0A0A0C] border-white/5' : 'bg-zinc-50 border-zinc-200'}`}>
                <div className="flex justify-between text-xs font-bold text-blue-500 mb-3 uppercase tracking-wider">
                  <span>Tiến trình cắt Video</span>
                  <span className={darkMode ? 'text-zinc-300' : 'text-zinc-700'}>{cutProgress.current} / {cutProgress.total}</span>
                </div>
                <div className={`w-full rounded-full h-2 overflow-hidden ${darkMode ? 'bg-[#2A2A30]' : 'bg-zinc-200'}`}>
                  <div 
                    className="bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 h-full transition-all duration-500 ease-out relative" 
                    style={{ width: `${(cutProgress.current / cutProgress.total) * 100}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showVideoPopup && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center backdrop-blur-md animate-in fade-in duration-200">
          <div className={`border p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center animate-in zoom-in-95 duration-300 relative overflow-hidden ${darkMode ? 'bg-[#121214] border-white/10' : 'bg-white border-zinc-200'}`}>
             <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-yellow-500 to-transparent opacity-50"></div>
             
             <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-5">
               <Film className="w-8 h-8 text-yellow-500" />
             </div>
             
             <h3 className={`text-xl font-bold mb-3 ${darkMode ? 'text-zinc-100' : 'text-zinc-800'}`}>Chưa tải Video gốc</h3>
             <p className="text-zinc-500 mb-8 text-sm leading-relaxed">Vui lòng tải video nguyên bản lên để hệ thống có thể tiến hành cắt (Semi-Mode).</p>
             
             <button 
                onClick={() => setShowVideoPopup(false)} 
                className="bg-yellow-500 hover:bg-yellow-400 text-yellow-950 w-full py-3 rounded-xl font-bold transition-colors cursor-pointer shadow-lg shadow-yellow-500/20"
             >
                Đã hiểu, quay lại
             </button>
          </div>
        </div>
      )}

    </div>
  );
}