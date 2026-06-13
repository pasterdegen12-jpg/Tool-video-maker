import React, { useState, useRef, useEffect } from 'react';
import { FileText, Upload, Scissors, Wand2, Film, Loader2, CheckCircle2 } from 'lucide-react';
import { fetchFile } from '@ffmpeg/util';
import { useNavigate } from 'react-router-dom';

import { autoSaveToFirebase } from './firebase.js'; 

export default function MainEditor({ ffmpeg, isFfmpegLoaded }) { 
  const navigate = useNavigate(); 

  const [script, setScript] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  
  const [isLocked, setIsLocked] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [cutProgress, setCutProgress] = useState({ current: 0, total: 0 });
  const [showVideoPopup, setShowVideoPopup] = useState(false);

  const fileInputRef = useRef(null);
  const blobUrlsRef = useRef([]);

  // Dọn dẹp RAM (Memory Leak) khi chuyển trang
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const handleFileUpload = (e) => e.target.files[0] && setVideoFile(e.target.files[0]);

  // ==========================================
  // 🚀 LUỒNG 1: FULL AI
  // ==========================================
  const handleFullAIWorkflow = async () => {
    if (!script) return alert("Vui lòng nhập kịch bản!");
    
    setIsLocked(true);
    setLoadingStatus('Đang bóc tách kịch bản Full AI...');
    
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
        "full-ai" // 🚀 ĐÃ BỔ SUNG: Báo cho Firebase biết đây là luồng Full AI
      );

      if (savedProjectId) {
        navigate(`/project/${savedProjectId}`, { state: { characters: parsedData.characters } });
      } else {
        throw new Error("Không thể lưu Firebase");
      }

    } catch (error) {
      console.error(error);
      setIsLocked(false);
      alert("Đã xảy ra lỗi trong quá trình xử lý!");
    }
  };

  // ==========================================
  // 🚀 LUỒNG 2: SEMI CONTENT
  // ==========================================
  const handleSemiWorkflow = async () => {
    if (!script) return alert("Vui lòng nhập kịch bản!");
    if (!videoFile) {
      setShowVideoPopup(true);
      return;
    }

    setIsLocked(true);
    setLoadingStatus('Đang trích xuất mốc thời gian (Semi)...');

    try {
      const parsedData = await callGeminiAPI(`Bạn là chuyên gia trích xuất dữ liệu. Hãy đọc kịch bản và trả về DUY NHẤT 1 JSON Object.
LƯU Ý TỐI QUAN TRỌNG: 
1. Kịch bản có thể có "Time" và "Time_origin". Bạn BẮT BUỘC phải lấy CHÍNH XÁC giá trị của "Time_origin" (VD: "03:12 - 03:20") đưa vào trường "time_origin" của JSON. Nếu lấy sai, hệ thống sẽ bị lỗi.
2. Tự tính số từ của "Voiceover" điền vào "Word_count".
3. Không cần phân tích nhân vật, mảng "characters" để rỗng [].

Cấu trúc JSON BẮT BUỘC:
{
  "characters": [], 
  "scenes": [
    { "scene_n": 1, "time_origin": "03:12 - 03:20", "Footage": "Cảnh sát lạnh lùng...", "Effect": "Metal handcuffs clicking", "Character": "", "Voiceover": "You can't play the victim...", "Translate": "Bạn không thể đóng vai...", "Tone_of_Voice": "Tự nhiên", "Word_count": 15, "status": "pending" }
  ]
}

KHÔNG thêm markdown \`\`\`json. CHỈ TRẢ VỀ ĐÚNG CẤU TRÚC JSON ĐÓ.
Kịch bản: ${script}`);

      await performCutVideo(parsedData);

    } catch (error) {
      console.error(error);
      setIsLocked(false);
      alert("Đã xảy ra lỗi khi bóc tách kịch bản!");
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
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Lỗi cấu trúc trả về từ AI.");
        
        const parsedJson = JSON.parse(jsonMatch[0]);
        if (!parsedJson.scenes) parsedJson.scenes = [];
        if (!parsedJson.characters) parsedJson.characters = [];
        
        return parsedJson;

      } catch (err) {
        if (i === geminiKeys.length - 1) {
          throw new Error("Tất cả API Key hiện đều đang bị quá tải. Vui lòng chờ 1 phút rồi thử lại!");
        }
      }
    }
  };

  const performCutVideo = async (parsedData) => {
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
          '-c:v', 'libx264', 
          '-preset', 'ultrafast', 
          '-crf', '23',
          '-tune', 'fastdecode', 
          '-c:a', 'copy', 
          outputName
        ]);

        const data = await ffmpeg.readFile(outputName);
        
        const blobUrl = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
        blobUrlsRef.current.push(blobUrl);
        
        scene.videoUrl = blobUrl;
        scene.status = 'cut';
      }
      
      setLoadingStatus('Đang đồng bộ Video lên mây (Vui lòng chờ)...');
      
      const savedProjectId = await autoSaveToFirebase(
        updatedScenes, 
        "Dự án Semi - " + new Date().toLocaleTimeString(), 
        script, 
        parsedData.characters || [],
        "semi" // 🚀 ĐÃ BỔ SUNG: Báo cho Firebase biết đây là luồng Semi
      );

      if (savedProjectId) {
        navigate(`/project/${savedProjectId}`, { state: { characters: parsedData.characters } });
      } else {
        throw new Error("Không thể lưu Firebase");
      }

    } catch (error) {
      console.error(error); 
      setIsLocked(false);
      alert("Lỗi khi xử lý video hoặc tải lên Cloud!");
    } 
  };

  return (
    <div className="flex h-screen w-full font-sans bg-[#0E0E10] p-8 gap-8 overflow-hidden text-white items-center justify-center relative">
      
      <div className="w-full max-w-4xl bg-[#15151A] border border-[#2A2A30] rounded-2xl p-8 flex flex-col shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-2">Khởi tạo Dự án Video</h1>
          <p className="text-gray-400 text-sm">Nhập kịch bản và chọn luồng làm việc phù hợp với nhu cầu của bạn.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="flex flex-col gap-3">
            <label className="text-sm font-bold text-gray-300 flex items-center gap-2"><FileText size={16} className="text-blue-500"/> Kịch bản chi tiết</label>
            <textarea 
              value={script} 
              onChange={(e) => setScript(e.target.value)} 
              className="w-full h-[250px] bg-[#0E0E10] border border-[#2A2A30] rounded-xl p-4 text-sm text-gray-300 focus:outline-none focus:border-blue-500 resize-none custom-scrollbar" 
              placeholder="Paste kịch bản của bạn vào đây..."
            ></textarea>
          </div>

          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <label className="text-sm font-bold text-gray-300 flex items-center gap-2"><Film size={16} className="text-purple-500"/> Nguồn Video (Chỉ dành cho Semi-Mode)</label>
              <input type="file" accept="video/mp4" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <div 
                onClick={() => fileInputRef.current.click()} 
                className={`w-full h-[100px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all ${videoFile ? 'border-purple-500 bg-purple-500/10' : 'border-[#2A2A30] bg-[#0E0E10] hover:border-gray-500'}`}
              >
                {videoFile ? (
                  <><CheckCircle2 className="text-purple-500 mb-2" size={24} /><span className="text-purple-400 font-medium break-all px-4 text-center text-sm">Đã tải: {videoFile.name}</span></>
                ) : (
                  <><Upload className="text-gray-500 mb-2" size={24} /><span className="text-gray-400 text-sm">Bấm để tải video gốc</span></>
                )}
              </div>
            </div>

            <div className="w-full h-[1px] bg-[#2A2A30]"></div>

            <div className="flex flex-col gap-4">
              <button 
                onClick={handleFullAIWorkflow} 
                className="w-full bg-white hover:bg-gray-200 text-black py-3.5 rounded-xl font-black flex justify-center items-center gap-2 transition-all cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] uppercase tracking-wide"
              >
                <Wand2 size={20} className="text-blue-600" /> TẠO VIDEO (FULL AI)
              </button>
              
              <button 
                onClick={handleSemiWorkflow} 
                className="w-full bg-white hover:bg-gray-200 text-black py-3.5 rounded-xl font-black flex justify-center items-center gap-2 transition-all cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] uppercase tracking-wide"
              >
                <Scissors size={20} className="text-purple-600" /> CẮT VIDEO (SEMI-CONTENT)
              </button>
            </div>
          </div>
        </div>
      </div>

      {isLocked && (
        <div className="fixed inset-0 bg-[#0E0E10]/90 z-[9999] flex flex-col items-center justify-center backdrop-blur-md">
          <div className="bg-[#15151A] border border-[#2A2A30] p-8 rounded-2xl shadow-2xl flex flex-col items-center max-w-md w-full text-center">
            <Loader2 size={50} className="animate-spin text-blue-500 mb-6" />
            <h2 className="text-xl font-bold text-white mb-2">{loadingStatus}</h2>
            <p className="text-sm text-gray-400 mb-6">Vui lòng giữ nguyên màn hình, quá trình này có thể mất vài phút.</p>
            
            {cutProgress.total > 0 && (
              <div className="w-full">
                <div className="flex justify-between text-xs font-bold text-blue-400 mb-2">
                  <span>Tiến độ cắt Video</span>
                  <span>{cutProgress.current} / {cutProgress.total}</span>
                </div>
                <div className="w-full bg-[#2A2A30] rounded-full h-2.5 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-full transition-all duration-300 ease-out" 
                    style={{ width: `${(cutProgress.current / cutProgress.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showVideoPopup && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#15151A] border border-[#2A2A30] p-6 rounded-xl shadow-2xl max-w-sm w-full text-center transform transition-all scale-100">
             <Film className="w-14 h-14 text-yellow-500 mx-auto mb-4" />
             <h3 className="text-xl font-bold text-white mb-2">Chưa tải Video gốc</h3>
             <p className="text-gray-400 mb-6 text-sm leading-relaxed">Tải video lên để cắt!.</p>
             <button 
                onClick={() => setShowVideoPopup(false)} 
                className="bg-yellow-600 hover:bg-yellow-500 text-white w-full py-2.5 rounded-lg font-bold transition-colors cursor-pointer"
             >
                Đã hiểu
             </button>
          </div>
        </div>
      )}

    </div>
  );
}