import React, { useState } from 'react';
import MainEditor from './MainEditor';
import SemiWorkspace from './SemiWorkspace'; 
import { LayoutTemplate, PlaySquare } from 'lucide-react';

// 1. Nhập khẩu bộ khiên bảo vệ từ Clerk
import { SignedIn, SignedOut, SignIn, UserButton } from "@clerk/clerk-react";

export default function App() {
  // Quản lý tab đang hiển thị ('main' hoặc 'workspace')
  const [activeTab, setActiveTab] = useState('main'); 
  // Nơi lưu trữ tạm thời các đoạn video đã cắt thành công
  const [projectData, setProjectData] = useState([]); 

  // Hàm nhận dữ liệu từ Tab 1 truyền sang
  const handleTransferData = (data) => {
    console.log(">> [Quản gia App]: Đã nhận dữ liệu video. Tiến hành chuyển sang SemiWorkspace!");
    setProjectData(data);
    setActiveTab('workspace'); // Kích hoạt chuyển đổi tab ngay lập tức
  };

  return (
    <div className="h-screen w-screen bg-[#0E0E10] flex flex-col overflow-hidden text-white font-sans">
      
      {/* ========================================= */}
      {/* TRẠM GÁC 1: KHI NGƯỜI DÙNG CHƯA ĐĂNG NHẬP */}
      {/* ========================================= */}
      <SignedOut>
        <div className="flex-1 flex items-center justify-center">
          <SignIn routing="hash" />
        </div>
      </SignedOut>

      {/* ========================================= */}
      {/* TRẠM GÁC 2: KHI NGƯỜI DÙNG ĐÃ ĐĂNG NHẬP   */}
      {/* ========================================= */}
      <SignedIn>
        {/* Thanh Điều Hướng Header */}
        <div className="h-16 bg-[#15151A] border-b border-[#2A2A30] flex items-center justify-between px-6 shrink-0">
          <h1 className="font-bold text-xl tracking-wide bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">AI Video Maker</h1>
          
          {/* Cụm nút bấm chuyển đổi Tab thủ công */}
          <div className="flex gap-2 bg-[#0E0E10] p-1 rounded-lg border border-[#2A2A30]">
            <button 
              onClick={() => setActiveTab('main')}
              className={`px-4 py-2 rounded-md font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer ${activeTab === 'main' ? 'bg-[#2A2A30] text-blue-400' : 'text-gray-400 hover:text-white'}`}
            >
              <PlaySquare size={16} /> Tab Chính (Làm Video)
            </button>
            <button 
              onClick={() => setActiveTab('workspace')}
              className={`px-4 py-2 rounded-md font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer ${activeTab === 'workspace' ? 'bg-[#2A2A30] text-green-400' : 'text-gray-400 hover:text-white'}`}
            >
              <LayoutTemplate size={16} /> Tab Chuyên Gia
            </button>
          </div>

          {/* Nút Avatar đăng xuất của Clerk (Được đặt vừa vặn ở góc phải) */}
          <div className="flex items-center">
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>

        {/* Khu vực hiển thị Nội dung các Tab */}
        <div className="flex-1 overflow-hidden relative">
          {activeTab === 'main' && (
            <MainEditor onComplete={handleTransferData} />
          )}
          
          {activeTab === 'workspace' && (
            <SemiWorkspace parsedData={projectData} />
          )}
        </div>
      </SignedIn>

    </div>
  );
}