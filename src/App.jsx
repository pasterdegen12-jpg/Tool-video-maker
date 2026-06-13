import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import MainEditor from './MainEditor';
import Workspace from './Workspace/Workspace';
import HistoryModel from './HistoryModel';
import { LayoutTemplate, PlaySquare, History, Loader2 } from 'lucide-react';
import { SignedIn, SignedOut, SignIn, UserButton } from "@clerk/clerk-react";

// Import FFmpeg
import { FFmpeg } from '@ffmpeg/ffmpeg';
import coreURL from './ffmpeg-core.js?url';
import wasmURL from './ffmpeg-core.wasm?url';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation(); 
  
  const ffmpegRef = useRef(new FFmpeg());
  const [isFfmpegLoaded, setIsFfmpegLoaded] = useState(false);

  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        const ffmpeg = ffmpegRef.current;
        if (ffmpeg.loaded) { setIsFfmpegLoaded(true); return; }
        ffmpeg.on('log', ({ message }) => console.log('[FFmpeg App Log]:', message));
        await ffmpeg.load({ coreURL, wasmURL });
        setIsFfmpegLoaded(true);
      } catch (error) {
        console.error("❌ Lỗi tải FFmpeg:", error);
      }
    };
    loadFFmpeg();
  }, []);

  const currentPath = location.pathname;

  return (
    <div className="h-screen w-screen bg-[#0E0E10] flex flex-col overflow-hidden text-white font-sans">
      <SignedOut>
        <div className="flex-1 flex items-center justify-center">
          <SignIn routing="hash" />
        </div>
      </SignedOut>

      <SignedIn>
        <div className="h-16 bg-[#15151A] border-b border-[#2A2A30] flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-xl tracking-wide bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">AI Video Maker</h1>
            {!isFfmpegLoaded ? (
              <span className="flex items-center gap-1 text-[10px] text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded-full"><Loader2 size={12} className="animate-spin" /> Đang tải lõi xử lý Video...</span>
            ) : (
              <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-1 rounded-full">Sẵn sàng</span>
            )}
          </div>
          
          <div className="flex gap-2 bg-[#0E0E10] p-1 rounded-lg border border-[#2A2A30]">
            <button 
              onClick={() => navigate('/')}
              className={`px-4 py-2 rounded-md font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer ${currentPath === '/' ? 'bg-[#2A2A30] text-blue-400' : 'text-gray-400 hover:text-white'}`}
            >
              <PlaySquare size={16} /> Import
            </button>
            <button 
              onClick={() => navigate('/history')}
              className={`px-4 py-2 rounded-md font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer ${currentPath === '/history' ? 'bg-[#2A2A30] text-yellow-400' : 'text-gray-400 hover:text-white'}`}
            >
              <History size={16} /> Lịch sử Dự án
            </button>
            <button 
              className={`px-4 py-2 rounded-md font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer ${currentPath.includes('/project') ? 'bg-[#2A2A30] text-green-400' : 'text-gray-400 hover:text-white'}`}
            >
              <LayoutTemplate size={16} /> StoryBoard
            </button>
          </div>
          <div className="flex items-center">
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <Routes>
            <Route path="/" element={<MainEditor ffmpeg={ffmpegRef.current} isFfmpegLoaded={isFfmpegLoaded} />} />
            <Route path="/history" element={<HistoryModel />} />
            {/* 🚀 ĐÃ SỬA SemiWorkspace THÀNH Workspace Ở ĐÂY */}
            <Route path="/project/:projectId" element={
              <Workspace ffmpeg={ffmpegRef.current} isFfmpegReady={isFfmpegLoaded} />
            } />
          </Routes>
        </div>
      </SignedIn>
    </div>
  );
}