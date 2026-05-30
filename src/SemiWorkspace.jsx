import React, { useState, useRef } from 'react';
import { FileText, Video, AlignLeft, Globe, Hash, Mic, Volume2, Music, Merge, LayoutDashboard, Sliders, X, CheckSquare, Square, Download, Upload, Trash2, Loader2, Play } from 'lucide-react';

export default function SemiWorkspace({ parsedData }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkedScenes, setCheckedScenes] = useState({});
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [checkedExportScenes, setCheckedExportScenes] = useState({});
  const [voiceCloneUrl, setVoiceCloneUrl] = useState(null);
  const [voiceCloneFile, setVoiceCloneFile] = useState(null);
  const fileInputRef = useRef(null);
  const [mergeOptions, setMergeOptions] = useState({});
  const [audioVolumes, setAudioVolumes] = useState({});

  // 🚀 STATE: Quản lý file Audio trả về từ Dia TTS
  const [generatedAudios, setGeneratedAudios] = useState({}); 
  const [isGenerating, setIsGenerating] = useState({}); 

  if (!parsedData || parsedData.length === 0) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0E0E10] text-gray-500 text-xs">
        Chưa có dữ liệu cảnh nào. Vui lòng quay lại bước xử lý kịch bản.
      </div>
    );
  }

  const totalScenes = parsedData.length;
  const totalVoice = parsedData.filter(s => s.Voiceover && s.Voiceover.trim() !== '').length;
  const avgDuration = "00:05";
  const estCost = `$${(totalVoice * 0.01).toFixed(2)}`;
  const generatedCount = Object.keys(generatedAudios).length;
  const audioGenStatus = `${generatedCount} / ${totalVoice}`;

  // 🚀 HÀM GỌI API DIA TTS QUA FAL.AI
  const handleGenAudio = async (sceneNo, text) => {
    if (!text || text.trim() === '') return;
    
    setIsGenerating(prev => ({ ...prev, [sceneNo]: true }));

    try {
      const response = await fetch("https://fal.run/fal-ai/dia-tts", {
        method: "POST",
        headers: {
          "Authorization": `Key ${import.meta.env.VITE_FAL_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Lỗi API: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result && result.audio_url) {
        setGeneratedAudios(prev => ({ ...prev, [sceneNo]: result.audio_url }));
      } else {
        console.error("API không trả về file audio hợp lệ cho scene:", sceneNo);
      }

    } catch (error) {
      console.error(`Lỗi khi gen audio scene ${sceneNo}:`, error);
    } finally {
      setIsGenerating(prev => ({ ...prev, [sceneNo]: false }));
    }
  };

  // --- LOGIC GEN AUDIO BATCH KHÔNG GIỚI HẠN ---
  const handleToggleCheck = (sceneNo) => {
    setCheckedScenes(prev => ({ ...prev, [sceneNo]: !prev[sceneNo] }));
  };

  const handleSelectAll = () => {
    const filtered = parsedData.filter(scene => !generatedAudios[scene.scene_n] && scene.Voiceover);
    const newChecked = {};
    filtered.forEach(scene => {
      newChecked[scene.scene_n] = true;
    });
    setCheckedScenes(newChecked);
  };

  const handleDeselectAll = () => setCheckedScenes({});

  // 🚀 HÀM CHẠY BATCH GEN TỰ ĐỘNG
  const handleStartBatchGen = async () => {
    const selectedSceneNumbers = Object.keys(checkedScenes).filter(key => checkedScenes[key]);
    
    if (selectedSceneNumbers.length === 0) {
      return alert("Vui lòng chọn ít nhất 1 scene để gen!");
    }

    setIsModalOpen(false); // Đóng Modal để xem tiến trình
    
    // Gọi API tuần tự cho từng cảnh đã chọn
    for (const sceneNo of selectedSceneNumbers) {
      const scene = parsedData.find(s => String(s.scene_n) === String(sceneNo));
      if (scene && scene.Voiceover) {
        await handleGenAudio(scene.scene_n, scene.Voiceover);
      }
    }
    
    setCheckedScenes({}); // Chạy xong tự bỏ tick
  };

  // --- LOGIC UI KHÁC ---
  const handleMergeChange = (index, value) => setMergeOptions(prev => ({ ...prev, [index]: value }));
  const handleVolumeChange = (index, value) => setAudioVolumes(prev => ({ ...prev, [index]: value }));
  const handleToggleExportCheck = (sceneNo) => setCheckedExportScenes(prev => ({ ...prev, [sceneNo]: !prev[sceneNo] }));
  
  const handleSelectAllExport = () => {
    const newChecked = {};
    parsedData.forEach(scene => { newChecked[scene.scene_n] = true; });
    setCheckedExportScenes(newChecked);
  };
  const handleDeselectAllExport = () => setCheckedExportScenes({});

  // --- TẢI VIDEO XUỐNG ---
  const handleDownloadVideos = () => {
    const selectedCount = Object.values(checkedExportScenes).filter(Boolean).length;
    if (selectedCount === 0) return alert("Vui lòng chọn ít nhất 1 scene để Export!");

    const scenesToExport = parsedData.filter(scene => checkedExportScenes[scene.scene_n]);
    let validCount = 0;

    scenesToExport.forEach((scene, index) => {
      if (!scene.videoUrl) return; 
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = scene.videoUrl;
        a.download = `Scene_${scene.scene_n}_Output.mp4`; 
        document.body.appendChild(a);
        a.click();
        a.remove(); 
      }, index * 800); 
      validCount++;
    });

    if (validCount > 0) alert(`✅ Đang tiến hành tải ${validCount} video về máy!`);
    setIsExportModalOpen(false); 
  };

  const handleVoiceUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVoiceCloneFile(file);
      setVoiceCloneUrl(URL.createObjectURL(file));
    }
  };
  
  const handleRemoveVoice = () => {
    if (voiceCloneUrl) URL.revokeObjectURL(voiceCloneUrl);
    setVoiceCloneFile(null);
    setVoiceCloneUrl(null);
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
          const currentMergeOption = mergeOptions[index] || '1';
          const currentVolume = audioVolumes[index] !== undefined ? audioVolumes[index] : 50;
          const isLoading = isGenerating[scene.scene_n];
          const hasAudio = generatedAudios[scene.scene_n];

          return (
            <div key={index} className="flex gap-5 bg-[#121216] hover:bg-[#16161B] p-4 rounded-2xl border border-[#2A2A30] hover:border-gray-600 shadow-lg transition-all items-stretch group">
              
              {/* Box Video */}
              <div className="w-[240px] flex flex-col shrink-0 bg-[#0A0A0C] rounded-xl p-2.5 border border-[#2A2A30]">
                <div className="flex items-center justify-between border-b border-[#2A2A30] pb-2 mb-2">
                  <div className="flex items-center gap-1.5 text-purple-400">
                    <Video size={13} /> 
                    <span className="text-[10px] font-bold uppercase tracking-widest">Scene {scene.scene_n}</span>
                  </div>
                  <span className="text-[9px] text-gray-500 bg-[#1A1A21] px-1.5 py-0.5 rounded">{scene.time_origin}</span>
                </div>
                
                <div className="flex-1 bg-black rounded-lg overflow-hidden flex items-center justify-center relative min-h-[135px]">
                  {scene.videoUrl ? (
                    <video src={scene.videoUrl} controls className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-center flex flex-col items-center gap-1.5 opacity-40">
                      <Video size={20} className="text-gray-400" />
                      <span className="text-gray-400 text-[9px] uppercase tracking-wider">No Media</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Box Thông tin & Nút bấm */}
              <div className="flex-1 flex flex-col min-w-0 justify-between py-0.5">
                <div className="space-y-2.5">
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

                {/* Khu vực phát audio khi đã gen xong */}
                {hasAudio && (
                  <div className="mt-2 bg-green-500/10 border border-green-500/30 p-2 rounded-lg flex items-center gap-2">
                    <Play size={14} className="text-green-400" />
                    <audio src={hasAudio} controls className="h-6 w-full [&::-webkit-media-controls-panel]:bg-[#1A1A21]" />
                  </div>
                )}

                {/* Thanh Control Action */}
                <div className="flex items-center gap-3 bg-[#0A0A0C] p-2 rounded-xl border border-[#2A2A30] mt-3 shrink-0 shadow-inner">
                  <button 
                    onClick={() => handleGenAudio(scene.scene_n, scene.Voiceover)} 
                    disabled={isLoading}
                    className={`h-7 px-4 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${isLoading ? 'bg-gray-600/20 text-gray-400 cursor-not-allowed' : 'bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:text-purple-300'}`}
                  >
                    {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />} 
                    {isLoading ? 'Đang tạo...' : (hasAudio ? 'Gen Lại' : 'Gen Audio')}
                  </button>
                  
                  <div className="w-[1px] h-4 bg-[#2A2A30] shrink-0"></div>
                  
                  <div className="flex flex-1 items-center gap-2 min-w-0">
                    <span className="text-[10px] text-gray-500 font-medium shrink-0 ml-1">Merge Mode:</span>
                    <select value={currentMergeOption} onChange={(e) => handleMergeChange(index, e.target.value)} className="h-7 px-2 bg-[#1A1A21] border border-[#2A2A30] rounded-lg text-[10px] text-gray-300 focus:outline-none focus:border-purple-500 cursor-pointer max-w-[180px] shrink-0">
                      <option value="1">Skip (No Audio)</option>
                      <option value="2">Mute Original + Add Audio</option>
                      <option value="3">Keep Original + Add Audio</option>
                    </select>

                    {currentMergeOption === '3' && (
                      <div className="flex items-center gap-2 flex-1 min-w-0 bg-[#1A1A21] border border-[#2A2A30] h-7 px-2.5 rounded-lg animate-fadeIn">
                        <Volume2 size={12} className="text-gray-400 shrink-0" />
                        <input type="range" min="0" max="100" value={currentVolume} onChange={(e) => handleVolumeChange(index, e.target.value)} className="flex-1 h-1 bg-[#2A2A30] rounded-lg appearance-none cursor-pointer accent-purple-500 min-w-[40px]" />
                        <span className="text-[10px] text-purple-400 font-mono font-bold shrink-0 w-7 text-right">{currentVolume}%</span>
                      </div>
                    )}
                  </div>
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
        
        <button onClick={() => setIsExportModalOpen(true)} className="w-full h-8 bg-green-600 hover:bg-green-500 text-white rounded-md font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer">
          <Download size={13} /> Export Output
        </button>

        <button onClick={() => setIsModalOpen(true)} className="w-full h-8 bg-purple-600 hover:bg-purple-500 text-white rounded-md font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer">
          <Music size={13} /> Gen All Audio
        </button>

        <div className="bg-[#0E0E10] border border-[#2A2A30] rounded-lg p-2 flex flex-col gap-2 mt-1">
          <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider flex justify-between items-center">
            Voice Clone
            {voiceCloneFile && (
              <button onClick={handleRemoveVoice} className="text-red-400 hover:text-red-300 cursor-pointer" title="Xóa file">
                <Trash2 size={12} />
              </button>
            )}
          </div>
          
          <input type="file" accept="audio/mp3,audio/wav" ref={fileInputRef} onChange={handleVoiceUpload} className="hidden" />
          
          {!voiceCloneFile ? (
            <button onClick={() => fileInputRef.current.click()} className="w-full h-7 border border-dashed border-gray-600 hover:border-blue-400 text-gray-400 hover:text-blue-400 rounded text-[10px] flex items-center justify-center gap-1 cursor-pointer transition-colors">
              <Upload size={12} /> Tải file MP3
            </button>
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] text-gray-300 truncate" title={voiceCloneFile.name}>{voiceCloneFile.name}</span>
              <audio src={voiceCloneUrl} controls className="w-full h-6 [&::-webkit-media-controls-panel]:bg-[#2A2A30]" />
            </div>
          )}
        </div>
      </div>

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

      {/* === MODAL EXPORT OUTPUT === */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-[#15151A] border border-[#2A2A30] rounded-2xl p-5 w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl text-xs relative">
            <button onClick={() => setIsExportModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer"><X size={16} /></button>
            <h3 className="text-sm font-bold border-b border-[#2A2A30] pb-3 text-green-400 flex items-center gap-2"><Download size={16} /> Export Output</h3>
            <div className="flex gap-2 mt-4 shrink-0">
              <button onClick={handleSelectAllExport} className="h-6 px-2.5 bg-[#2A2A30] hover:bg-[#3A3A40] rounded text-[11px] font-medium transition-all cursor-pointer text-gray-300 hover:text-white">Chọn tất cả</button>
              <button onClick={handleDeselectAllExport} className="h-6 px-2.5 bg-[#2A2A30] hover:bg-[#3A3A40] rounded text-[11px] font-medium transition-all cursor-pointer text-gray-300 hover:text-white">Bỏ chọn tất cả</button>
            </div>
            <div className="text-[11px] text-gray-400 font-bold uppercase mt-4 mb-2 tracking-wider">Chọn Scene để xuất ({parsedData.length})</div>
            <div className="flex-1 overflow-y-auto border border-[#2A2A30] rounded-lg p-2 bg-[#0E0E10] space-y-1 min-h-0">
              {parsedData.map((scene) => {
                const isChecked = !!checkedExportScenes[scene.scene_n];
                return (
                  <div key={scene.scene_n} onClick={() => handleToggleExportCheck(scene.scene_n)} className={`flex items-center gap-3 p-2 rounded-md border transition-all cursor-pointer select-none ${isChecked ? 'bg-green-600/10 border-green-500/50 text-green-400' : 'bg-[#15151A] border-[#2A2A30] text-gray-300 hover:border-gray-600'}`}>
                    {isChecked ? <CheckSquare size={14} /> : <Square size={14} className="text-gray-500" />}
                    <div className="font-bold">Scene_n: {scene.scene_n}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#2A2A30] pt-3 mt-3 shrink-0">
              <button onClick={() => setIsExportModalOpen(false)} className="h-8 px-4 bg-[#2A2A30] hover:bg-[#3A3A40] text-gray-300 rounded-md font-semibold cursor-pointer">Hủy bỏ</button>
              <button onClick={handleDownloadVideos} className="h-8 px-4 bg-green-600 hover:bg-green-500 text-white rounded-md font-bold shadow-md cursor-pointer">Xuất File</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}