import React, { useState, useRef } from 'react';
import { FileText, Video, AlignLeft, Globe, Hash, Mic, Volume2, Music, Merge, LayoutDashboard, Sliders, X, CheckSquare, Square, Download, Upload, Trash2 } from 'lucide-react';

export default function SemiWorkspace({ parsedData }) {
  // --- STATE QUẢN LÝ CÁC MODAL VÀ TÍNH NĂNG ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkedScenes, setCheckedScenes] = useState({});
  
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [checkedExportScenes, setCheckedExportScenes] = useState({});

  const [voiceCloneUrl, setVoiceCloneUrl] = useState(null);
  const [voiceCloneFile, setVoiceCloneFile] = useState(null);
  const fileInputRef = useRef(null);

  const [mergeOptions, setMergeOptions] = useState({});
  const [audioVolumes, setAudioVolumes] = useState({});

  if (!parsedData || parsedData.length === 0) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0E0E10] text-gray-500 text-xs">
        Chưa có dữ liệu cảnh nào. Vui lòng quay lại bước xử lý kịch bản.
      </div>
    );
  }

  // --- THÔNG SỐ BẢNG TỔNG QUAN ---
  const totalScenes = parsedData.length;
  const totalVoice = parsedData.filter(s => s.Voiceover && s.Voiceover.trim() !== '').length;
  const avgDuration = "00:05";
  const estCost = `$${(totalVoice * 0.01).toFixed(2)}`;
  const imageGenStatus = `0 / ${totalScenes}`;
  const audioGenStatus = `0 / ${totalVoice}`;
  const videoGenStatus = `0 / ${totalScenes}`;

  const filteredScenesForAudio = parsedData.filter(scene => 
    !scene.audioUrl && (scene.Voiceover && scene.Voiceover.trim() !== '')
  );

  // --- LOGIC GEN AUDIO ---
  const handleToggleCheck = (sceneNo) => {
    const isCurrentlyChecked = !!checkedScenes[sceneNo];
    if (!isCurrentlyChecked) {
      const currentCheckedCount = Object.values(checkedScenes).filter(Boolean).length;
      if (currentCheckedCount >= 3) {
        alert("⚠️ Batch Audio gen: Chỉ được chọn tối đa 3 audio để gen cùng một lúc!");
        return;
      }
    }
    setCheckedScenes(prev => ({ ...prev, [sceneNo]: !isCurrentlyChecked }));
  };

  const handleSelectAll = () => {
    const newChecked = {};
    filteredScenesForAudio.slice(0, 3).forEach(scene => {
      newChecked[scene.scene_n] = true;
    });
    setCheckedScenes(newChecked);
    if (filteredScenesForAudio.length > 3) {
      alert("💡 Đã tự động chọn 3 scene đầu tiên. Bạn chỉ được gen tối đa 3 audio cùng lúc.");
    }
  };

  const handleDeselectAll = () => setCheckedScenes({});

  // --- LOGIC ÂM THANH TỪNG SCENE ---
  const handleMergeChange = (index, value) => setMergeOptions(prev => ({ ...prev, [index]: value }));
  const handleVolumeChange = (index, value) => setAudioVolumes(prev => ({ ...prev, [index]: value }));

  // --- LOGIC EXPORT ---
  const handleToggleExportCheck = (sceneNo) => {
    setCheckedExportScenes(prev => ({ ...prev, [sceneNo]: !prev[sceneNo] }));
  };
  
  const handleSelectAllExport = () => {
    const newChecked = {};
    parsedData.forEach(scene => { newChecked[scene.scene_n] = true; });
    setCheckedExportScenes(newChecked);
  };
  
  const handleDeselectAllExport = () => setCheckedExportScenes({});

  // --- LOGIC VOICE CLONE ---
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

  return (
    <div className="h-screen w-full bg-[#0E0E10] font-sans text-white p-4 overflow-y-auto relative">
      <div className="flex flex-col gap-4 max-w-7xl mx-auto pb-16 pr-48">
        
        {/* === BẢNG TỔNG QUAN === */}
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
              <div className="text-xs font-bold text-gray-300 mt-0.5">{imageGenStatus}</div>
            </div>
            <div className="bg-[#0E0E10] p-2 rounded-lg border border-[#2A2A30]">
              <div className="text-[10px] text-gray-400 font-medium">Audio Gen:</div>
              <div className="text-xs font-bold text-purple-400 mt-0.5">{audioGenStatus}</div>
            </div>
            <div className="bg-[#0E0E10] p-2 rounded-lg border border-[#2A2A30]">
              <div className="text-[10px] text-gray-400 font-medium">Video Gen:</div>
              <div className="text-xs font-bold text-orange-400 mt-0.5">{videoGenStatus}</div>
            </div>
          </div>
        </div>

        {/* === DANH SÁCH SCENE === */}
        {parsedData.map((scene, index) => {
          const currentMergeOption = mergeOptions[index] || '1';
          const currentVolume = audioVolumes[index] !== undefined ? audioVolumes[index] : 50;

          return (
            <div key={index} className="flex gap-5 bg-[#121216] hover:bg-[#16161B] p-4 rounded-2xl border border-[#2A2A30] hover:border-gray-600 shadow-lg transition-all items-stretch group">
              
              {/* Box Video tinh chỉnh giống Frame của Editor */}
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

              {/* Box Thông tin kịch bản & Nút bấm */}
              <div className="flex-1 flex flex-col min-w-0 justify-between py-0.5">
                
                {/* Text Content */}
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

                {/* Thanh Control Action */}
                <div className="flex items-center gap-3 bg-[#0A0A0C] p-2 rounded-xl border border-[#2A2A30] mt-3 shrink-0 shadow-inner">
                  <button onClick={() => alert(`Chuẩn bị gắn API TTS cho Scene ${scene.scene_n}`)} className="h-7 px-4 bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/30 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all text-purple-400 hover:text-purple-300 cursor-pointer shrink-0">
                    <Mic size={13} /> Gen Audio
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

      {/* === BẢNG ĐIỀU KHIỂN CỐ ĐỊNH BÊN PHẢI === */}
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
            <div className="mt-3 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 p-2 rounded-lg font-medium text-[11px]">⚠️ Batch Audio gen: Chỉ được gen batch 3 audio 1 lúc</div>
            <div className="flex gap-2 mt-3 shrink-0">
              <button onClick={handleSelectAll} className="h-6 px-2.5 bg-[#2A2A30] hover:bg-[#3A3A40] rounded text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer text-gray-300 hover:text-white">Chọn tất cả (Tối đa 3)</button>
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
              <button onClick={() => {
                  const selectedCount = Object.values(checkedScenes).filter(Boolean).length;
                  if(selectedCount === 0) return alert("Vui lòng chọn ít nhất 1 scene để gen!");
                  alert(`Đã kích hoạt xếp hàng tạo Audio cho ${selectedCount} cảnh!`);
                  setIsModalOpen(false);
                }} className="h-8 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-md font-bold shadow-md cursor-pointer">Bắt đầu Gen Audio</button>
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
              <button onClick={() => {
                  const selectedCount = Object.values(checkedExportScenes).filter(Boolean).length;
                  if(selectedCount === 0) return alert("Vui lòng chọn ít nhất 1 scene để Export!");
                  alert(`Đang tiến hành Export ${selectedCount} cảnh!`);
                  setIsExportModalOpen(false);
                }} className="h-8 px-4 bg-green-600 hover:bg-green-500 text-white rounded-md font-bold shadow-md cursor-pointer">Xuất File</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}