import React, { useState, useRef } from 'react';
import { FileText, Upload, Scissors, ArrowRight, CheckCircle2, Loader2, Download } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { useNavigate } from 'react-router-dom'; // 🚀 THÊM ROUTER ĐIỀU HƯỚNG

import { autoSaveToFirebase } from './firebase.js'; 

// GỌI NGƯỜI NHÀ
import coreURL from './ffmpeg-core.js?url';
import wasmURL from './ffmpeg-core.wasm?url';

export default function MainEditor() { // 🚀 ĐÃ BỎ onComplete
  const navigate = useNavigate(); // 🚀 KHỞI TẠO ROUTER

  const [script, setScript] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [videoFile, setVideoFile] = useState(null);
  const [isCutting, setIsCutting] = useState(false);
  const [cutComplete, setCutComplete] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // 🚀 THÊM STATE CHỜ LƯU ĐỂ TRÁNH SPAM NÚT CHUYỂN TRANG

  const fileInputRef = useRef(null);
  const ffmpegRef = useRef(new FFmpeg());

  const handleParseScript = async () => {
    if (!script) return alert("Vui lòng nhập kịch bản!");
    
    const geminiKeys = [
      import.meta.env.VITE_GEMINI_KEY_1,
      import.meta.env.VITE_GEMINI_KEY_2,
      import.meta.env.VITE_GEMINI_KEY_3
    ].filter(Boolean);

    if (geminiKeys.length === 0) {
      return alert("Bạn chưa dán API Key Gemini nào trong file .env!");
    }

    const randomKey = geminiKeys[Math.floor(Math.random() * geminiKeys.length)];

    setIsParsing(true);
    try {
      const promptText = `Trích xuất danh sách cảnh từ kịch bản dưới đây và trả về mảng JSON hợp lệ. 
Mỗi object bắt buộc phải có ĐỦ các trường sau:
- scene_n: Số thứ tự cảnh.
- time_origin: BẮT BUỘC định dạng "mm:ss - mm:ss".
- Voiceover: Lời thoại hoặc mô tả giọng đọc trong cảnh đó.
- Translate: Bản dịch của Voiceover (nếu kịch bản không có, hãy tự dịch sang tiếng Anh hoặc để trống).
- Word_count: Đếm số lượng từ của trường Voiceover.
- Tone_of_Voice: Cảm xúc/giọng điệu yêu cầu (VD: Hào hứng, Trầm ấm, Quyết liệt...).
- status: "pending".
Kịch bản cần bóc tách: ${script}`;
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${randomKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }], generationConfig: { response_mime_type: "application/json" } })
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      
      const rawText = data.candidates[0].content.parts[0].text;
      const cleanJsonText = rawText.replace(/```json|```/gi, "").trim();
      
      const parsedJson = JSON.parse(cleanJsonText);
      setParsedData(Array.isArray(parsedJson) ? parsedJson : [parsedJson]);
      
    } catch (error) { 
      alert("Lỗi AI: " + error.message); 
    } finally { 
      setIsParsing(false); 
    }
  };

  const handleFileUpload = (e) => e.target.files[0] && setVideoFile(e.target.files[0]);

  const handleCutVideo = async () => {
    if (!parsedData || !videoFile) return;
    setIsCutting(true);
    const ffmpeg = ffmpegRef.current;

    ffmpeg.on('log', ({ message }) => console.log(">> [FFmpeg]:", message));
    
    try {
      if (!ffmpeg.loaded) {
        await ffmpeg.load({
          coreURL: coreURL,
          wasmURL: wasmURL,
        });
      }

      await ffmpeg.writeFile('input_video.mp4', await fetchFile(videoFile));
      
      const updatedData = [...parsedData];
      for (let i = 0; i < updatedData.length; i++) {
        const scene = updatedData[i];
        const [start, end] = scene.time_origin.split('-').map(s => s.trim());
        const outputName = `scene_${scene.scene_n}.mp4`;
        
        // 🚀 THỦ THUẬT XỬ LÝ THỜI GIAN: Đổi mm:ss ra giây để cắt mượt hơn
        const timeToSeconds = (timeStr) => {
          const parts = timeStr.split(':');
          if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
          if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
          return parseFloat(timeStr);
        };

        const startSec = timeToSeconds(start);
        const duration = timeToSeconds(end) - startSec;

        // 🚀 LỆNH CẮT MỚI: CHÍNH XÁC 100% VÀ TỐI ƯU TỐC ĐỘ
        // 1. -ss trước -i: Tua nhanh đến mốc thời gian
        // 2. Không dùng '-c copy' chung chung nữa
        // 3. Render lại video bằng 'libx264' + 'ultrafast' để chuẩn từng mili-giây mà vẫn nhẹ máy
        // 4. '-c:a copy': Giữ nguyên âm thanh cho nhanh
        
        await ffmpeg.exec([
          '-ss', startSec.toString(), 
          '-i', 'input_video.mp4', 
          '-t', duration.toString(), 
          '-c:v', 'libx264', 
          '-preset', 'ultrafast', 
          '-c:a', 'copy', 
          outputName
        ]);

        const data = await ffmpeg.readFile(outputName);
        scene.videoUrl = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
        scene.status = 'cut';
      }

      setParsedData(updatedData);
      setCutComplete(true);
      
      // Đã gỡ bỏ tính năng auto-redirect rườm rà ở đây để User tự kiểm tra và ấn nút "Hoàn tất"

    } catch (error) {
      console.error("❌ LỖI:", error);
      alert("Lỗi khi cắt video! F12 xem chi tiết.");
    } finally {
      setIsCutting(false);
    }
  };

  return (
    <div className="flex h-screen w-full font-sans bg-[#0E0E10] p-6 gap-6 overflow-hidden text-white">
      
      <div className="flex-1 bg-[#15151A] border border-[#2A2A30] rounded-xl p-6 flex flex-col shadow-lg min-h-0">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2 shrink-0"><FileText className="text-blue-500" /> 1. Xử lý Kịch bản</h2>
        <textarea value={script} onChange={(e) => setScript(e.target.value)} className="w-full h-40 bg-[#0E0E10] border border-[#2A2A30] rounded-lg p-4 text-sm text-gray-300 focus:outline-none focus:border-blue-500 resize-none mb-4 shrink-0" placeholder="Nhập kịch bản..."></textarea>
        <button onClick={handleParseScript} disabled={isParsing} className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white py-2.5 rounded-lg font-semibold flex justify-center items-center gap-2 mb-6 cursor-pointer shrink-0">
          {isParsing ? <><Loader2 size={18} className="animate-spin" /> Đang bóc tách...</> : 'Bóc tách Dữ liệu bằng AI'}
        </button>

        {parsedData && (
          <div className="flex-1 border border-[#2A2A30] rounded-lg overflow-y-auto min-h-0 bg-[#0E0E10]">
            <table className="w-full text-sm text-left text-gray-400">
              <thead className="text-xs text-gray-300 uppercase bg-[#1E1E24] border-b border-[#2A2A30] sticky top-0 z-10">
                <tr><th className="px-4 py-3">Cảnh</th><th className="px-4 py-3">Thời gian</th><th className="px-4 py-3 text-center">Trạng thái</th></tr>
              </thead>
              <tbody>
                {parsedData.map((scene, index) => (
                  <tr key={index} className="border-b border-[#2A2A30] last:border-0 hover:bg-[#1A1A1F]">
                    <td className="px-4 py-3 font-medium text-white">Scene {scene.scene_n}</td>
                    <td className="px-4 py-3 font-mono text-blue-400">{scene.time_origin}</td>
                    <td className="px-4 py-3 text-center">
                      {scene.status === 'cut' ? (
                        <a href={scene.videoUrl} download={`Scene_${scene.scene_n}.mp4`} className="inline-flex items-center gap-1 text-green-500 bg-green-500/10 hover:bg-green-500/20 px-3 py-1.5 rounded text-xs transition-colors font-bold cursor-pointer"><Download size={14} /> Tải về</a>
                      ) : <span className="text-gray-600 text-xs">Chờ cắt...</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="w-[400px] flex flex-col gap-6 shrink-0">
        <div className="bg-[#15151A] border border-[#2A2A30] rounded-xl p-6 flex flex-col shadow-lg shrink-0">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Upload className="text-purple-500" /> 2. Nguồn Video</h2>
          <input type="file" accept="video/mp4" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          <div onClick={() => fileInputRef.current.click()} className={`w-full h-32 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all mb-4 ${videoFile ? 'border-purple-500 bg-purple-500/10' : 'border-[#2A2A30] bg-[#0E0E10] hover:border-gray-500'}`}>
            {videoFile ? <><CheckCircle2 className="text-purple-500 mb-2" size={30} /><span className="text-purple-400 font-medium break-all px-4 text-center">Đã tải: {videoFile.name}</span></> : <><Upload className="text-gray-500 mb-2" size={30} /><span className="text-gray-400 text-sm">Click tải Video</span></>}
          </div>
          <button onClick={handleCutVideo} disabled={!parsedData || !videoFile || isCutting || cutComplete} className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white py-3 rounded-lg font-bold flex justify-center items-center gap-2 shadow-[0_0_15px_rgba(147,51,234,0.3)] disabled:shadow-none cursor-pointer">
            {isCutting ? <><Loader2 size={18} className="animate-spin" /> Đang cắt video...</> : cutComplete ? <><CheckCircle2 size={18} /> Cắt thành công</> : <><Scissors size={18} /> Cắt Video</>}
          </button>
        </div>

        <div className={`flex-1 bg-[#15151A] border rounded-xl p-6 flex flex-col justify-center items-center text-center transition-all duration-500 min-h-0 ${cutComplete ? 'border-green-500 shadow-[0_0_30px_rgba(34,197,94,0.15)]' : 'border-[#2A2A30] opacity-50'}`}>
          <h2 className="text-xl font-bold mb-2">3. Hoàn tất</h2>
          <p className="text-sm text-gray-400 mb-6">Dữ liệu đã sẵn sàng. Hệ thống sẽ tạo một Project Workspace riêng để bạn biên tập chi tiết.</p>
          
          <button 
            onClick={async () => {
              setIsSaving(true);
              try {
                // 🚀 LƯU FIREBASE VÀ ĐỢI ĐẨY VIDEO LÊN CLOUDINARY
                const savedProjectId = await autoSaveToFirebase(parsedData, "Video Project - " + new Date().toLocaleTimeString(), script);
                if (savedProjectId) {
                   navigate(`/project/${savedProjectId}`); // 🚀 ĐỔI LINK TRÌNH DUYỆT
                }
              } catch(err) {
                console.error("Lỗi đồng bộ:", err);
                alert("Lỗi tải lên mây! Bạn hãy thử lại.");
              } finally {
                setIsSaving(false);
              }
            }} 
            disabled={!cutComplete || isSaving} 
            className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white px-6 py-3 rounded-xl font-bold transition-all flex justify-center items-center gap-2 w-full cursor-pointer disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <><Loader2 size={18} className="animate-spin" /> Đang tải video lên mây...</>
            ) : (
              <>Vào Project Workspace <ArrowRight size={18} /></>
            )}
          </button>
          
        </div>
      </div>
    </div>
  );
}