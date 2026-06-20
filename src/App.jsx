import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import MainEditor from './MainEditor';
// 🚀 ĐÃ SỬA LẠI ĐƯỜNG DẪN IMPORT CHUẨN XÁC
import Workspace from './Workspace/Workspace';
import HistoryModel from './HistoryModel';
import { LayoutTemplate, PlaySquare, History, Loader2, Sun, Moon } from 'lucide-react';
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

  // 🚀 MANG TRẠNG THÁI DARK MODE LÊN APP.JSX ĐỂ ĐỒNG BỘ TOÀN CỤC
  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('app-theme');
    return savedTheme ? savedTheme === 'dark' : true;
  });

  useEffect(() => {
    localStorage.setItem('app-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

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
    <div className={`h-screen w-screen flex flex-col overflow-hidden font-sans transition-colors duration-300 ${darkMode ? 'bg-[#0E0E10] text-white' : 'bg-zinc-100 text-zinc-900'}`}>
      <SignedOut>
        <div className="flex-1 flex items-center justify-center">
          <SignIn routing="hash" />
        </div>
      </SignedOut>

      <SignedIn>
        {/* 🚀 HEADER ĐÃ HỖ TRỢ DARK/LIGHT MODE */}
        <div className={`h-16 flex items-center justify-between px-6 shrink-0 transition-colors duration-300 border-b ${darkMode ? 'bg-[#15151A] border-[#2A2A30]' : 'bg-white border-zinc-200 shadow-sm'}`}>
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-xl tracking-wide bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">AI Video Maker</h1>
            {!isFfmpegLoaded ? (
              <span className="flex items-center gap-1 text-[10px] text-yellow-600 bg-yellow-500/10 px-2 py-1 rounded-full border border-yellow-500/20"><Loader2 size={12} className="animate-spin" /> Đang nạp lõi Video...</span>
            ) : (
              <span className="text-[10px] text-green-600 bg-green-500/10 px-2 py-1 rounded-full border border-green-500/20">Sẵn sàng</span>
            )}
          </div>
          
          <div className={`flex gap-2 p-1 rounded-lg border transition-colors ${darkMode ? 'bg-[#0E0E10] border-[#2A2A30]' : 'bg-zinc-100 border-zinc-200'}`}>
            <button 
              onClick={() => navigate('/')}
              className={`px-4 py-1.5 rounded-md font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer ${currentPath === '/' ? (darkMode ? 'bg-[#2A2A30] text-blue-400' : 'bg-white text-blue-600 shadow-sm') : (darkMode ? 'text-gray-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900')}`}
            >
              <PlaySquare size={16} /> Import
            </button>
            <button 
              onClick={() => navigate('/history')}
              className={`px-4 py-1.5 rounded-md font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer ${currentPath === '/history' ? (darkMode ? 'bg-[#2A2A30] text-yellow-400' : 'bg-white text-yellow-600 shadow-sm') : (darkMode ? 'text-gray-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900')}`}
            >
              <History size={16} /> Lịch sử Dự án
            </button>
            <button 
              className={`px-4 py-1.5 rounded-md font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer ${currentPath.includes('/project') ? (darkMode ? 'bg-[#2A2A30] text-green-400' : 'bg-white text-green-600 shadow-sm') : (darkMode ? 'text-gray-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900')}`}
            >
              <LayoutTemplate size={16} /> StoryBoard
            </button>
          </div>

          <div className="flex items-center gap-4">
            {/* 🚀 NÚT ĐỔI THEME CHÍNH ĐƯA LÊN HEADER */}
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg border transition-all duration-300 cursor-pointer shadow-sm ${darkMode ? 'bg-[#1A1A1F] border-white/10 text-yellow-400 hover:bg-[#222228]' : 'bg-zinc-50 border-zinc-200 text-purple-600 hover:bg-zinc-100'}`}
              title={darkMode ? "Chuyển sang Chế độ sáng" : "Chuyển sang Chế độ tối"}
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <Routes>
            <Route path="/" element={<MainEditor ffmpeg={ffmpegRef.current} isFfmpegLoaded={isFfmpegLoaded} darkMode={darkMode} setDarkMode={setDarkMode} />} />
            <Route path="/history" element={<HistoryModel darkMode={darkMode} />} />
            <Route path="/project/:projectId" element={<Workspace ffmpeg={ffmpegRef.current} isFfmpegReady={isFfmpegLoaded} darkMode={darkMode} setDarkMode={setDarkMode} />} />
          </Routes>
        </div>
      </SignedIn>
    </div>
  );
}