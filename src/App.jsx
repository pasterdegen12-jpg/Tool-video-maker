import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import MainEditor from './MainEditor';
import Workspace from './Workspace/Workspace';
import HistoryModel from './HistoryModel';
import WorkflowEditor from './WorkflowEditor';
import WorkerNode from './WorkerNode'; // 🚀 IMPORT TRẠM TRỰC CHIẾN

import { LayoutTemplate, PlaySquare, History, Loader2, Sun, Moon, Workflow } from 'lucide-react';
import { SignedIn, SignedOut, SignIn, UserButton } from "@clerk/clerk-react";

import { FFmpeg } from '@ffmpeg/ffmpeg';
import coreURL from './ffmpeg-core.js?url';
import wasmURL from './ffmpeg-core.wasm?url';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const ffmpegRef = useRef(new FFmpeg());
  const [isFfmpegLoaded, setIsFfmpegLoaded] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('app-theme'); return savedTheme ? savedTheme === 'dark' : true;
  });

  useEffect(() => { localStorage.setItem('app-theme', darkMode ? 'dark' : 'light'); }, [darkMode]);

  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        const ffmpeg = ffmpegRef.current; if (ffmpeg.loaded) { setIsFfmpegLoaded(true); return; }
        await ffmpeg.load({ coreURL, wasmURL }); setIsFfmpegLoaded(true);
      } catch (error) { console.error("❌ Lỗi tải FFmpeg:", error); }
    };
    loadFFmpeg();
  }, []);

  // 🚀 NẾU LÀ TAB WORKER MỞ ẨN THÌ TRẢ VỀ LUÔN, KHÔNG CẦN CLERK ĐĂNG NHẬP
  if (currentPath === '/worker') {
    return <WorkerNode />;
  }

  // ─── Nav tab helper ───────────────────────────────────────────────────────
  const navTab = (isActive, colorClass) =>
    isActive
      ? darkMode
        ? `bg-slate-800 ${colorClass} shadow-sm`
        : `bg-white ${colorClass.replace('400', '600').replace('text-amber', 'text-amber')} shadow-sm`
      : darkMode
        ? 'text-slate-400 hover:text-slate-200'
        : 'text-zinc-500 hover:text-zinc-700';

  return (
    <div
      className={`h-screen w-screen flex flex-col overflow-hidden font-sans transition-colors duration-300 ${
        darkMode ? 'bg-slate-950 text-white' : 'bg-slate-100 text-zinc-900'
      }`}
    >
      {/* ── Signed-Out Gate ─────────────────────────────────────────── */}
      <SignedOut>
        <div
          className={`flex-1 flex items-center justify-center ${
            darkMode ? 'bg-slate-950' : 'bg-slate-100'
          }`}
        >
          <SignIn routing="hash" />
        </div>
      </SignedOut>

      {/* ── Signed-In App Shell ─────────────────────────────────────── */}
      <SignedIn>
        {/* ── Header ────────────────────────────────────────────────── */}
        <header
          className={`h-[60px] flex items-center justify-between px-4 sm:px-6 shrink-0 transition-colors duration-300 border-b z-50 ${
            darkMode
              ? 'bg-slate-900/80 backdrop-blur-xl border-white/[0.06]'
              : 'bg-white/90 backdrop-blur-xl border-zinc-200 shadow-sm'
          }`}
        >
          {/* Logo + FFmpeg badge */}
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="font-black text-lg sm:text-xl tracking-tight bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent whitespace-nowrap">
              AI Video Maker
            </h1>
            {!isFfmpegLoaded ? (
              <span className="hidden sm:flex items-center gap-1 text-[10px] text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full border border-amber-500/20 whitespace-nowrap">
                <Loader2 size={11} className="animate-spin" />
                Nạp lõi...
              </span>
            ) : (
              <span className="hidden sm:flex text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20 whitespace-nowrap">
                Sẵn sàng
              </span>
            )}
          </div>

          {/* Nav tabs */}
          <nav
            className={`flex gap-0.5 p-1 rounded-xl border transition-colors ${
              darkMode
                ? 'bg-slate-950/80 border-white/[0.06]'
                : 'bg-slate-100 border-zinc-200'
            }`}
          >
            <button
              onClick={() => navigate('/')}
              className={`px-3 sm:px-4 py-1.5 rounded-lg font-semibold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 ${navTab(
                currentPath === '/',
                'text-amber-400'
              )}`}
            >
              <PlaySquare size={15} />
              <span className="hidden sm:inline">Edit Tool</span>
            </button>

            <button
              onClick={() => navigate('/autoflow')}
              className={`px-3 sm:px-4 py-1.5 rounded-lg font-semibold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${navTab(
                currentPath.includes('/autoflow'),
                'text-emerald-400'
              )}`}
            >
              <Workflow size={15} />
              <span className="hidden sm:inline">Auto Flow</span>
            </button>

            <button
              onClick={() => navigate('/history')}
              className={`px-3 sm:px-4 py-1.5 rounded-lg font-semibold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 ${navTab(
                currentPath === '/history',
                'text-amber-400'
              )}`}
            >
              <History size={15} />
              <span className="hidden sm:inline">Lịch sử</span>
            </button>

            <button
              className={`px-3 sm:px-4 py-1.5 rounded-lg font-semibold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${navTab(
                currentPath.includes('/project'),
                'text-emerald-400'
              )}`}
            >
              <LayoutTemplate size={15} />
              <span className="hidden sm:inline">StoryBoard</span>
            </button>
          </nav>

          {/* Right: theme toggle + user */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg border cursor-pointer transition-all duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 ${
                darkMode
                  ? 'bg-slate-800 border-white/10 text-amber-400 hover:bg-slate-700'
                  : 'bg-zinc-50 border-zinc-200 text-purple-600 hover:bg-zinc-100'
              }`}
              aria-label="Toggle theme"
            >
              {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        {/* ── Page Content ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative z-0">
          <Routes>
            <Route
              path="/"
              element={
                <MainEditor
                  ffmpeg={ffmpegRef.current}
                  isFfmpegLoaded={isFfmpegLoaded}
                  darkMode={darkMode}
                  setDarkMode={setDarkMode}
                />
              }
            />
            <Route path="/autoflow/:id?" element={<WorkflowEditor />} />
            <Route path="/history" element={<HistoryModel darkMode={darkMode} />} />
            <Route
              path="/project/:projectId"
              element={
                <Workspace
                  ffmpeg={ffmpegRef.current}
                  isFfmpegReady={isFfmpegLoaded}
                  darkMode={darkMode}
                  setDarkMode={setDarkMode}
                />
              }
            />
          </Routes>
        </div>
      </SignedIn>
    </div>
  );
}