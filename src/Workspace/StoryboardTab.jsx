import React from 'react';
import { Video, CheckSquare, Download, Clock, Hash, Sliders, Play, Mic, Film, Merge, Trash2, Pencil, Image as ImageIcon, Loader2, Maximize, AlignLeft, Globe } from 'lucide-react';

export default function StoryboardTab({
  parsedData, generatedAudios, isGenerating, mergingScenes, mergedVideos,
  setActiveEditSceneModal, frameInputRef, activeUploadIdRef, setActiveGenModal,
  handleDeleteScene, globalMixVol, setSingleMixVol, setActiveMergeModal, forceDownloadVideo,
  projectType 
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
          <div key={index} className="flex flex-col md:flex-row gap-8 bg-[#121214] hover:bg-[#151518] p-6 rounded-2xl border border-[#2A2A30] shadow-xl transition-all duration-300 group">
            
            {/* CỘT MEDIA */}
            <div className="w-full lg:w-[340px] xl:w-[380px] flex flex-col gap-4 shrink-0">
               <div className="flex flex-col bg-[#0A0A0C] rounded-xl p-2 border border-[#2A2A30] shadow-inner video-wrapper">
                  <div className="flex items-center justify-between pb-2 mb-2 px-1 border-b border-[#2A2A30]">
                    <div className="flex items-center gap-1.5 text-zinc-300">
                      <Video size={14} className="text-blue-400" /> <span className="text-[11px] font-bold uppercase tracking-widest">Input</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-500">
                      <button onClick={toggleFullscreen} className="hover:text-white transition-colors cursor-pointer"><Maximize size={12} /></button>
                      <span className="text-[11px] font-medium bg-white/5 px-2 py-0.5 rounded-full">S_{scene.scene_n}</span>
                    </div>
                  </div>
                  <div className="w-full aspect-video bg-black/60 rounded-lg overflow-hidden flex items-center justify-center relative">
                    {scene.videoUrl ? (
                      <video src={scene.videoUrl} crossOrigin="anonymous" controls className="w-full h-full object-contain" />
                    ) : scene.startFrameUrl ? (
                      <img src={scene.startFrameUrl} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center flex flex-col items-center gap-2 opacity-30"><Video size={20} className="text-zinc-500" /></div>
                    )}
                  </div>
                </div>

                {hasOutput && (
                  <div className="flex flex-col bg-[#0A0A0C] rounded-xl p-2 border border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.05)] video-wrapper">
                    <div className="flex items-center justify-between pb-2 mb-2 px-1 border-b border-green-500/10">
                      <div className="flex items-center gap-1.5 text-green-400"><CheckSquare size={14} /> <span className="text-[11px] font-bold uppercase tracking-widest">Output</span></div>
                      <div className="flex items-center gap-2">
                        <button onClick={toggleFullscreen} className="hover:text-white transition-colors cursor-pointer text-zinc-500"><Maximize size={12} /></button>
                        <button onClick={() => forceDownloadVideo(hasOutput, `Scene_${scene.scene_n}.mp4`)} className="text-[10px] font-bold text-green-950 bg-green-500 hover:bg-green-400 px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1"><Download size={12} /> Tải</button>
                      </div>
                    </div>
                    <div className="w-full aspect-video bg-black/60 rounded-lg overflow-hidden flex items-center justify-center relative">
                      <video src={hasOutput} crossOrigin="anonymous" controls className="w-full h-full object-contain" />
                    </div>
                  </div>
                )}
            </div>

            {/* CỘT TEXT & ACTION */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex justify-between items-start mb-5">
                <div className="flex items-center gap-3 text-[12px]">
                  <div className="flex items-center gap-1.5 bg-white/5 border border-white/5 px-3 py-1.5 rounded-lg text-zinc-300 shadow-sm"><Clock size={14} className="text-zinc-500"/> {scene.time_origin || scene.Time || "00:00"}</div>
                  {!isSemi && (
                    <div className="flex items-center gap-1.5 bg-white/5 border border-white/5 px-3 py-1.5 rounded-lg text-purple-300 shadow-sm"><Sliders size={14} className="text-purple-500/70"/> {scene.Tone_of_Voice || "Tự nhiên"}</div>
                  )}
                </div>
                <button onClick={() => setActiveEditSceneModal({...scene})} className="text-[12px] font-semibold text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/5">
                  <Pencil size={14}/> Sửa Scene
                </button>
              </div>

              <div className="space-y-6 flex-1">
                {isSemi ? (
                  // GIAO DIỆN SEMI CONTENT XỊN XÒ
                  <>
                    <div className="bg-[#0A0A0C] border border-[#2A2A30] rounded-xl p-4 flex flex-col gap-3 shadow-inner">
                        <div className="flex items-start gap-4">
                            <span className="text-blue-400 font-bold text-[12px] w-16 shrink-0 mt-0.5 uppercase tracking-wide">Footage</span>
                            <span className="text-zinc-300 text-[14px] leading-relaxed">{scene.Footage || "N/A"}</span>
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <span className="text-zinc-500 font-bold text-[11px] uppercase tracking-widest flex items-center gap-1.5"><AlignLeft size={14} /> Voiceover</span>
                      <div className="bg-[#0A0A0C] border border-[#2A2A30] p-4 rounded-xl shadow-inner relative">
                        <p className="text-zinc-100 leading-relaxed text-[15px]">{scene.Voiceover || "N/A"}</p>
                        {/* 🚀 ĐÃ SỬA: WORD COUNT NẰM NGAY DƯỚI VOICEOVER */}
                        <div className="mt-3 pt-3 border-t border-[#2A2A30] flex items-center gap-1 text-[12px] font-semibold text-zinc-500">
                          <Hash size={12} className="text-zinc-600"/> {voWordCount} từ
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-zinc-500 font-bold text-[11px] uppercase tracking-widest flex items-center gap-1.5"><Globe size={14} /> Translate</span>
                      <p className="text-zinc-400 italic leading-relaxed text-[14px]">{scene.Translate || "N/A"}</p>
                    </div>
                  </>
                ) : (
                  // GIAO DIỆN FULL VIDEO AI
                  <>
                    <div className="bg-[#0A0A0C] border border-[#2A2A30] rounded-xl p-4 flex flex-col gap-4 shadow-inner">
                        <div className="flex items-start gap-4">
                            <span className="text-purple-400 font-bold text-[12px] w-16 shrink-0 mt-0.5 uppercase tracking-wide">Context</span>
                            <span className="text-zinc-300 text-[14px] leading-relaxed">{scene.Context || "N/A"}</span>
                        </div>
                        <div className="w-full h-[1px] bg-[#2A2A30]/50"></div>
                        <div className="flex items-start gap-4">
                            <span className="text-green-400 font-bold text-[12px] w-16 shrink-0 mt-0.5 uppercase tracking-wide">Camera</span>
                            <span className="text-zinc-300 text-[14px] leading-relaxed">{scene.Camera || "N/A"}</span>
                        </div>
                        <div className="w-full h-[1px] bg-[#2A2A30]/50"></div>
                        <div className="flex items-start gap-4">
                            <span className="text-orange-400 font-bold text-[12px] w-16 shrink-0 mt-0.5 uppercase tracking-wide">Action</span>
                            <span className="text-zinc-300 text-[14px] leading-relaxed">{scene.Action || "N/A"}</span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-zinc-500 font-bold text-[11px] uppercase tracking-widest flex items-center gap-1.5"><AlignLeft size={14} /> Dialogue</span>
                      <div className="bg-[#0A0A0C] border border-[#2A2A30] p-4 rounded-xl shadow-inner">
                        <p className="text-zinc-100 leading-relaxed text-[15px]">{scene.Dialogue || scene.Voiceover || "N/A"}</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-zinc-500 font-bold text-[11px] uppercase tracking-widest flex items-center gap-1.5"><Globe size={14} /> Translate</span>
                      <p className="text-zinc-400 italic leading-relaxed text-[14px]">{scene.Translate || "N/A"}</p>
                    </div>
                  </>
                )}
              </div>

              {hasAudio && (
                <div className="mt-6 bg-[#0A0A0C] border border-[#2A2A30] p-3 rounded-xl flex items-center gap-4 shadow-inner">
                  <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                    <Play size={14} className="text-blue-400 ml-0.5" />
                  </div>
                  <audio src={hasAudio} crossOrigin="anonymous" controls className="h-8 w-full opacity-90 custom-audio" />
                </div>
              )}

              {/* DÀN NÚT BẤM (CHUNG STYLE BÓNG BẨY) */}
              <div className="flex flex-wrap items-center gap-3 pt-6 mt-6 border-t border-[#2A2A30] shrink-0">
                
                {!isSemi ? (
                  <>
                    <button onClick={() => { activeUploadIdRef.current = scene.scene_n; frameInputRef.current.click(); }} className="h-9 px-4 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/5 transition-all cursor-pointer shadow-sm">
                        <ImageIcon size={14} /> Tải Nền
                    </button>
                    <button onClick={() => alert("Tính năng Gen Video AI đang phát triển")} className="h-9 px-4 rounded-lg text-[13px] font-bold flex items-center gap-1.5 transition-all cursor-pointer bg-green-600/20 hover:bg-green-600 border border-green-500/30 text-green-400 hover:text-white shadow-sm">
                        <Film size={14} /> Gen Video (AI)
                    </button>
                  </>
                ) : (
                  <button onClick={() => { activeUploadIdRef.current = scene.scene_n; frameInputRef.current.click(); }} className="h-9 px-4 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/5 transition-all cursor-pointer shadow-sm">
                      <ImageIcon size={14} /> Tải Ảnh Nền
                  </button>
                )}

                <button onClick={() => setActiveGenModal({ scene_n: scene.scene_n, textToGen: isSemi ? scene.Voiceover : (scene.Dialogue || scene.Voiceover) })} disabled={isLoadingAudio || (isSemi && !scene.Voiceover) || (!isSemi && !scene.Dialogue && !scene.Voiceover)} className={`h-9 px-5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all cursor-pointer shrink-0 shadow-md ${isLoadingAudio || (isSemi && !scene.Voiceover) || (!isSemi && !scene.Dialogue && !scene.Voiceover) ? 'bg-[#0A0A0C] text-zinc-600 cursor-not-allowed border border-[#2A2A30]' : 'bg-white text-black hover:bg-zinc-200'}`}>
                  {isLoadingAudio ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />} Gen Audio
                </button>

                <button onClick={() => { setSingleMixVol(globalMixVol); setActiveMergeModal(scene); }} disabled={isMergingThisScene || (!scene.videoUrl && !scene.startFrameUrl)} className={`h-9 px-5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all cursor-pointer shrink-0 shadow-lg ${isMergingThisScene || (!scene.videoUrl && !scene.startFrameUrl) ? 'bg-[#0A0A0C] text-zinc-600 cursor-not-allowed border border-[#2A2A30]' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'}`}>
                  {isMergingThisScene ? <Loader2 size={16} className="animate-spin" /> : <Merge size={16} />} Merge Video
                </button>
                
                <div className="flex-1"></div>
                
                <button onClick={() => handleDeleteScene(scene.scene_n)} className="h-9 w-9 flex items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 bg-white/5 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer" title="Xóa Cảnh">
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