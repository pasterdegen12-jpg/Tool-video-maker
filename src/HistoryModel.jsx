import React, { useState, useEffect } from 'react';
import { FolderClock, Play, Trash2, Loader2, Calendar, FileVideo, DollarSign } from 'lucide-react';
import { collection, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from './firebase.js'; // Gọi kết nối database

export default function HistoryModel({ onLoadProject }) {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Hàm tải dữ liệu từ Firebase
  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      // Truy vấn lấy dữ liệu, sắp xếp theo thời gian mới nhất
      const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const projectList = [];
      querySnapshot.forEach((doc) => {
        projectList.push({ ...doc.data(), docId: doc.id });
      });
      setProjects(projectList);
    } catch (error) {
      console.error("Lỗi khi tải lịch sử:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // Hàm xóa dự án
  const handleDelete = async (docId, e) => {
    e.stopPropagation(); // Ngăn không cho click nhầm vào nút Mở dự án
    if (!window.confirm("Bạn có chắc chắn muốn xóa vĩnh viễn dự án này?")) return;
    
    try {
      await deleteDoc(doc(db, "projects", docId));
      // Cập nhật lại giao diện sau khi xóa
      setProjects(projects.filter(p => p.docId !== docId));
    } catch (error) {
      console.error("Lỗi xóa dự án:", error);
      alert("Lỗi khi xóa dự án!");
    }
  };

  // Format ngày tháng cho đẹp
  const formatDate = (timestamp) => {
    if (!timestamp) return "Không rõ thời gian";
    const date = new Date(timestamp);
    return date.toLocaleDateString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="flex flex-col h-screen w-full font-sans bg-[#0E0E10] p-6 text-white overflow-hidden">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <FolderClock className="text-blue-500" size={28} />
          Lịch sử Dự án
        </h1>
        <button onClick={fetchProjects} className="px-4 py-2 bg-[#1A1A1F] hover:bg-[#2A2A30] border border-[#2A2A30] rounded-lg text-sm transition-colors flex items-center gap-2">
          Làm mới
        </button>
      </div>

      <div className="flex-1 bg-[#15151A] border border-[#2A2A30] rounded-xl overflow-hidden flex flex-col shadow-lg min-h-0">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
            <Loader2 className="animate-spin text-blue-500" size={40} />
            <p>Đang tải dữ liệu từ đám mây...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-3">
            <FolderClock size={60} className="opacity-20" />
            <p>Chưa có dự án nào được lưu.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <div 
                  key={project.docId} 
                  className="bg-[#1A1A1F] border border-[#2A2A30] hover:border-blue-500/50 rounded-xl p-5 flex flex-col gap-4 transition-all group relative cursor-pointer"
                  onClick={() => onLoadProject(project.data)}
                >
                  {/* Nút xóa hiện ra khi hover */}
                  <button 
                    onClick={(e) => handleDelete(project.docId, e)}
                    className="absolute top-4 right-4 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-[#15151A] rounded"
                    title="Xóa dự án"
                  >
                    <Trash2 size={18} />
                  </button>

                  <h3 className="text-lg font-bold text-gray-100 pr-8 truncate" title={project.name}>
                    {project.name}
                  </h3>
                  
                  <div className="flex flex-col gap-2 text-sm text-gray-400">
                    <div className="flex items-center gap-2"><Calendar size={14} className="text-blue-400"/> {formatDate(project.createdAt)}</div>
                    <div className="flex items-center gap-2"><FileVideo size={14} className="text-purple-400"/> {project.sceneCount || 0} Cảnh video</div>
                    <div className="flex items-center gap-2"><DollarSign size={14} className="text-green-400"/> Dự kiến: ${project.estCost?.toFixed(2) || '0.00'}</div>
                  </div>

                  <button 
                    className="mt-2 w-full py-2.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Play size={16} /> Mở không gian làm việc
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}