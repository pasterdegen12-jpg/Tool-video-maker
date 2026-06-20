import React from 'react';
import { Video, CheckSquare, Download, Clock, Hash, Play, Mic, Film, Merge, Trash2, Pencil, Image as ImageIcon, Loader2, Maximize, AlignLeft, Globe } from 'lucide-react';

export default function StoryboardTab({
  parsedData, generatedAudios, isGenerating, mergingScenes, mergedVideos,
  setActiveEditSceneModal, frameInputRef, activeUploadIdRef, setActiveGenModal,
  handleDeleteScene, globalMixVol, setSingleMixVol, setActiveMergeModal, forceDownloadVideo,
  projectType, darkMode 
}) {
  
  const toggleFullscreen = (e) => {
    const videoContainer = e.currentTarget.closest('.video-wrapper');
    const videoElement = videoContainer.querySelector('video');
    if (videoElement) {
      if (videoElement.requestFullscreen) videoElement.requestFullscreen();
      else if (videoElement.webkitRequestFullscreen) videoElement.webkitRequestFullscreen();
      else if (videoElement.msRequestFullscreen) videoElement.msRequestFullscreen();
    }
  };

  const isSemi = projectType === 'semi';

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      {parsedData.map((scene, index) => {
        const isLoadingAudio = isGenerating[scene.scene_n];
        const isMergingThisScene = mergingScenes[scene.scene_n];
        const hasAudio = generatedAudios[scene.scene_n];
        const hasOutput = mergedVideos[scene.scene_n];

        const voWordCount = scene.Word_count || (scene.Voiceover ? scene.Voiceover.trim().split(/\s+/).length : 0);

        return (
          <div key={index} className={`flex flex-col md:flex-row gap-8 p-6 rounded-2xl border shadow-xl transition-all duration-300 group ${darkMode ? 'bg-[#121214] hover:bg-[#151518] border-[#2A2A30]' : 'bg-white hover:bg-zinc-50 border-zinc-200'}`}>
            
            {/* CỘT MEDIA */}
            <div className="w-full lg:w-[340px] xl:w-[380px] flex flex-col gap-4 shrink-0">
               <div className={`flex flex-col rounded-xl p-2 border shadow-inner video-wrapper ${darkMode ? 'bg-[#0A0A0C] border-[#2A2A30]' : 'bg-zinc-100 border-zinc-200'}`}>
                  <div className={`flex items-center justify-between pb-2 mb-2 px-1 border-b ${darkMode ? 'border-[#2A2A30]' : 'border-zinc-300'}`}>
                    <div className={`flex items-center gap-1.5 ${darkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                      <Video size={14} className="text-blue-500" /> <span className="text-[11px] font-bold uppercase tracking-widest">Input</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-500">
                      <button onClick={toggleFullscreen} className={`transition-colors cursor-pointer ${darkMode ? 'hover:text-white' : 'hover:text-black'}`}><Maximize size={12} /></button>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${darkMode ? 'bg-white/10 text-white' : 'bg-zinc-200 text-zinc-800'}`}>S_{scene.scene_n}</span>
                    </div>
                  </div>
                  <div className="w-full aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center relative shadow-sm">
                    {scene.videoUrl ? (
                      <video src={scene.videoUrl} crossOrigin="anonymous" controls className="w-full h-full object-contain" />
                    ) : scene.startFrameUrl ? (
                      <img src={scene.startFrameUrl} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center flex flex-col items-center gap-2 opacity-50"><Video size={20} className="text-zinc-400" /></div>
                    )}
                  </div>
                </div>

                {hasOutput && (
                  <div className={`flex flex-col rounded-xl p-2 border shadow-md video-wrapper ${darkMode ? 'bg-[#0A0A0C] border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.05)]' : 'bg-green-50 border-green-300'}`}>
                    <div className={`flex items-center justify-between pb-2 mb-2 px-1 border-b ${darkMode ? 'border-green-500/20' : 'border-green-300/50'}`}>
                      <div className={`flex items-center gap-1.5 ${darkMode ? 'text-green-400' : 'text-green-700'}`}><CheckSquare size={14} /> <span className="text-[11px] font-bold uppercase tracking-widest">Output</span></div>
                      <div className="flex items-center gap-2">
                        <button onClick={toggleFullscreen} className={`transition-colors cursor-pointer ${darkMode ? 'text-zinc-500 hover:text-white' : 'text-green-600 hover:text-green-900'}`}><Maximize size={12} /></button>
                        <button onClick={() => forceDownloadVideo(hasOutput, `Scene_${scene.scene_n}.mp4`)} className="text-[10px] font-bold text-white bg-green-600 hover:bg-green-500 px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 shadow-sm"><Download size={12} /> Tải</button>
                      </div>
                    </div>
                    <div className="w-full aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center relative shadow-sm">
                      <video src={hasOutput} crossOrigin="anonymous" controls className="w-full h-full object-contain" />
                    </div>
                  </div>
                )}
            </div>

            {/* CỘT TEXT & ACTION */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex justify-between items-start mb-5">
                <div className="flex items-center gap-3 text-[12px]">
                  {/* 🚀 BỎ TONE KHỎI TRÊN CÙNG */}
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg shadow-sm font-medium border ${darkMode ? 'bg-white/5 border-white/5 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-700'}`}>
                    <Clock size={14} className="text-zinc-500"/> {scene.time_origin || scene.Time || "00:00"}
                  </div>
                </div>
                <button onClick={() => setActiveEditSceneModal({...scene})} className={`text-[12px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer px-3 py-1.5 rounded-lg border shadow-sm ${darkMode ? 'text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border-white/5' : 'text-zinc-600 hover:text-zinc-900 bg-white hover:bg-zinc-100 border-zinc-200'}`}>
                  <Pencil size={14}/> Sửa Scene
                </button>
              </div>

              <div className="space-y-6 flex-1">
                {isSemi ? (
                  <>
                    <div className={`border rounded-xl p-4 flex flex-col gap-3 shadow-inner ${darkMode ? 'bg-[#0A0A0C] border-[#2A2A30]' : 'bg-zinc-50 border-zinc-200'}`}>
                        <div className="flex items-start gap-4">
                            <span className="text-blue-500 font-bold text-[12px] w-16 shrink-0 mt-0.5 uppercase tracking-wide">Footage</span>
                            <span className={`text-[14px] leading-relaxed ${darkMode ? 'text-zinc-300' : 'text-zinc-800'}`}>{scene.Footage || "N/A"}</span>
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <span className={`font-bold text-[11px] uppercase tracking-widest flex items-center gap-1.5 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}><AlignLeft size={14} /> Voiceover</span>
                      <div className={`border p-4 rounded-xl shadow-inner relative ${darkMode ? 'bg-[#0A0A0C] border-[#2A2A30]' : 'bg-zinc-50 border-zinc-200'}`}>
                        <p className={`leading-relaxed text-[15px] font-medium ${darkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>{scene.Voiceover || "N/A"}</p>
                        <div className={`mt-3 pt-3 border-t flex items-center gap-1 text-[12px] font-semibold ${darkMode ? 'border-[#2A2A30] text-zinc-500' : 'border-zinc-200 text-zinc-500'}`}>
                          <Hash size={12} className={darkMode ? 'text-zinc-600' : 'text-zinc-400'}/> {voWordCount} từ
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className={`font-bold text-[11px] uppercase tracking-widest flex items-center gap-1.5 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}><Globe size={14} /> Translate</span>
                      <p className={`italic leading-relaxed text-[14px] ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>{scene.Translate || "N/A"}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`border rounded-xl p-4 flex flex-col gap-4 shadow-inner ${darkMode ? 'bg-[#0A0A0C] border-[#2A2A30]' : 'bg-zinc-50 border-zinc-200'}`}>
                        <div className="flex items-start gap-4">
                            <span className="text-purple-500 font-bold text-[12px] w-16 shrink-0 mt-0.5 uppercase tracking-wide">Context</span>
                            <span className={`text-[14px] leading-relaxed ${darkMode ? 'text-zinc-300' : 'text-zinc-800'}`}>{scene.Context || "N/A"}</span>
                        </div>
                        <div className={`w-full h-[1px] ${darkMode ? 'bg-[#2A2A30]/50' : 'bg-zinc-200'}`}></div>
                        <div className="flex items-start gap-4">
                            <span className="text-green-500 font-bold text-[12px] w-16 shrink-0 mt-0.5 uppercase tracking-wide">Camera</span>
                            <span className={`text-[14px] leading-relaxed ${darkMode ? 'text-zinc-300' : 'text-zinc-800'}`}>{scene.Camera || "N/A"}</span>
                        </div>
                        <div className={`w-full h-[1px] ${darkMode ? 'bg-[#2A2A30]/50' : 'bg-zinc-200'}`}></div>
                        <div className="flex items-start gap-4">
                            <span className="text-orange-500 font-bold text-[12px] w-16 shrink-0 mt-0.5 uppercase tracking-wide">Action</span>
                            <span className={`text-[14px] leading-relaxed ${darkMode ? 'text-zinc-300' : 'text-zinc-800'}`}>{scene.Action || "N/A"}</span>
                        </div>
                    </div>

                    {/* 🚀 ĐÃ ĐƯA TONE XUỐNG DƯỚI DIALOGUE */}
                    <div className="flex flex-col gap-2">
                      <span className={`font-bold text-[11px] uppercase tracking-widest flex items-center gap-1.5 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}><AlignLeft size={14} /> Dialogue</span>
                      <div className={`border p-4 rounded-xl shadow-inner ${darkMode ? 'bg-[#0A0A0C] border-[#2A2A30]' : 'bg-zinc-50 border-zinc-200'}`}>
                        <p className={`leading-relaxed text-[15px] font-medium ${darkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>{scene.Dialogue || scene.Voiceover || "N/A"}</p>
                      </div>
                      
                      {/* TONE HIỂN THỊ Ở ĐÂY */}
                      <div className={`mt-1 flex items-center gap-1.5 text-[13px] font-semibold ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                        <Mic size={14} /> Tone giọng: <span className={darkMode ? 'text-zinc-300 font-normal' : 'text-zinc-700 font-normal'}>{scene.Tone_of_Voice || "Tự nhiên"}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className={`font-bold text-[11px] uppercase tracking-widest flex items-center gap-1.5 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}><Globe size={14} /> Translate</span>
                      <p className={`italic leading-relaxed text-[14px] ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>{scene.Translate || "N/A"}</p>
                    </div>
                  </>
                )}
              </div>

              {hasAudio && (
                <div className={`mt-6 border p-3 rounded-xl flex items-center gap-4 shadow-inner ${darkMode ? 'bg-[#0A0A0C] border-[#2A2A30]' : 'bg-zinc-50 border-zinc-200'}`}>
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${darkMode ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                    <Play size={14} className="text-blue-500 ml-0.5" />
                  </div>
                  <audio src={hasAudio} crossOrigin="anonymous" controls className={`h-8 w-full ${darkMode ? 'opacity-90' : 'opacity-100'} custom-audio`} />
                </div>
              )}

              {/* DÀN NÚT BẤM */}
              <div className={`flex flex-wrap items-center gap-3 pt-6 mt-6 border-t shrink-0 ${darkMode ? 'border-[#2A2A30]' : 'border-zinc-200'}`}>
                
                {!isSemi ? (
                  <>
                    <button onClick={() => { activeUploadIdRef.current = scene.scene_n; frameInputRef.current.click(); }} className={`h-9 px-4 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 border transition-all cursor-pointer shadow-sm ${darkMode ? 'bg-white/5 hover:bg-white/10 text-zinc-300 border-white/5' : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-300'}`}>
                        <ImageIcon size={14} /> Tải Nền
                    </button>
                    <button onClick={() => alert("Tính năng Gen Video AI đang phát triển")} className={`h-9 px-4 rounded-lg text-[13px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border shadow-sm ${darkMode ? 'bg-green-600/20 hover:bg-green-600 border-green-500/30 text-green-400 hover:text-white' : 'bg-green-50 hover:bg-green-100 border-green-200 text-green-700'}`}>
                        <Film size={14} /> Gen Video (AI)
                    </button>
                  </>
                ) : (
                  <button onClick={() => { activeUploadIdRef.current = scene.scene_n; frameInputRef.current.click(); }} className={`h-9 px-4 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 border transition-all cursor-pointer shadow-sm ${darkMode ? 'bg-white/5 hover:bg-white/10 text-zinc-300 border-white/5' : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-300'}`}>
                      <ImageIcon size={14} /> Tải Ảnh Nền
                  </button>
                )}

                <button onClick={() => setActiveGenModal({ scene_n: scene.scene_n, textToGen: isSemi ? scene.Voiceover : (scene.Dialogue || scene.Voiceover) })} disabled={isLoadingAudio || (isSemi && !scene.Voiceover) || (!isSemi && !scene.Dialogue && !scene.Voiceover)} className={`h-9 px-5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all cursor-pointer shrink-0 shadow-sm border ${isLoadingAudio || (isSemi && !scene.Voiceover) || (!isSemi && !scene.Dialogue && !scene.Voiceover) ? (darkMode ? 'bg-[#0A0A0C] text-zinc-600 border-[#2A2A30] cursor-not-allowed' : 'bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed') : (darkMode ? 'bg-white text-black hover:bg-zinc-200 border-transparent' : 'bg-zinc-900 text-white hover:bg-zinc-800 border-transparent')}`}>
                  {isLoadingAudio ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />} Gen Audio
                </button>

                <button onClick={() => { setSingleMixVol(globalMixVol); setActiveMergeModal(scene); }} disabled={isMergingThisScene || (!scene.videoUrl && !scene.startFrameUrl)} className={`h-9 px-5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all cursor-pointer shrink-0 shadow-md border ${isMergingThisScene || (!scene.videoUrl && !scene.startFrameUrl) ? (darkMode ? 'bg-[#0A0A0C] text-zinc-600 border-[#2A2A30] cursor-not-allowed' : 'bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed') : 'bg-blue-600 hover:bg-blue-500 text-white border-transparent'}`}>
                  {isMergingThisScene ? <Loader2 size={16} className="animate-spin" /> : <Merge size={16} />} Merge Video
                </button>
                
                <div className="flex-1"></div>
                
                <button onClick={() => handleDeleteScene(scene.scene_n)} className={`h-9 w-9 flex items-center justify-center rounded-lg border transition-all cursor-pointer ${darkMode ? 'text-zinc-500 hover:text-red-400 bg-white/5 hover:bg-red-500/10 border-transparent hover:border-red-500/20' : 'text-zinc-500 hover:text-red-600 bg-white hover:bg-red-50 border-zinc-200 hover:border-red-200 shadow-sm'}`} title="Xóa Cảnh">
                  <Trash2 size={16} />
                </button>
              </div>

            </div>
          </div>
        );
      })}
    </div>
  );
}