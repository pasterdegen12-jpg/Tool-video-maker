import React, { useState, useEffect, useRef } from 'react';
import MainEditor from './MainEditor';
import SemiWorkspace from './SemiWorkspace';
import HistoryModel from './HistoryModel';
import { LayoutTemplate, PlaySquare, History, Loader2 } from 'lucide-react';
import { SignedIn, SignedOut, SignIn, UserButton } from "@clerk/clerk-react";

// Import FFmpeg
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

export default function App() {
  const [activeTab, setActiveTab] = useState('main');
  const [projectData, setProjectData] = useState([]);
  
  // 🚀 KHỞI TẠO FFMPEG Ở APP ĐỂ DÙNG CHUNG CHO CẢ CÁC TAB
  const ffmpegRef = useRef(new FFmpeg());
  const [isFfmpegLoaded, setIsFfmpegLoaded] = useState(false);

  useEffect(() => {
    const loadFFmpeg = async () => {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      const ffmpeg = ffmpegRef.current;
      
      ffmpeg.on('log', ({ message }) => console.log('[FFmpeg Log]:', message));
      
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      setIsFfmpegLoaded(true);
    };
    
    loadFFmpeg();
  }, []);

  const handleTransferData = (data) => {
    console.log(">> [Quản gia App]: Đã nhận dữ liệu video. Tiến hành chuyển sang SemiWorkspace!");
    setProjectData(data);
    setActiveTab('workspace');
  };

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
            {/* Hiển thị trạng thái FFmpeg */}
            {!isFfmpegLoaded ? (
              <span className="flex items-center gap-1 text-[10px] text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded-full"><Loader2 size={12} className="animate-spin" /> Đang tải lõi xử lý Video...</span>
            ) : (
              <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-1 rounded-full">Sẵn sàng</span>
            )}
          </div>
          
          <div className="flex gap-2 bg-[#0E0E10] p-1 rounded-lg border border-[#2A2A30]">
            <button 
              onClick={() => setActiveTab('main')}
              className={`px-4 py-2 rounded-md font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer ${activeTab === 'main' ? 'bg-[#2A2A30] text-blue-400' : 'text-gray-400 hover:text-white'}`}
            >
              <PlaySquare size={16} /> Tab Chính (Làm Video)
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-md font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer ${activeTab === 'history' ? 'bg-[#2A2A30] text-yellow-400' : 'text-gray-400 hover:text-white'}`}
            >
              <History size={16} /> Lịch sử Dự án
            </button>
            <button 
              onClick={() => setActiveTab('workspace')}
              className={`px-4 py-2 rounded-md font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer ${activeTab === 'workspace' ? 'bg-[#2A2A30] text-green-400' : 'text-gray-400 hover:text-white'}`}
            >
              <LayoutTemplate size={16} /> Tab Chuyên Gia
            </button>
          </div>
          <div className="flex items-center">
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
          {activeTab === 'main' && (
            <MainEditor onComplete={handleTransferData} />
          )}
          {activeTab === 'history' && (
            <HistoryModel onLoadProject={handleTransferData} />
          )}
          {activeTab === 'workspace' && (
            <SemiWorkspace parsedData={projectData} ffmpeg={ffmpegRef.current} />
          )}
        </div>
      </SignedIn>
    </div>
  );
}