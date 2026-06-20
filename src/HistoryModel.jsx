import React, { useState, useEffect } from 'react';
import { FolderClock, Play, Trash2, Loader2, Calendar, FileVideo, DollarSign } from 'lucide-react';
import { collection, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from './firebase.js'; 
import { useNavigate } from 'react-router-dom';

export default function HistoryModel({ darkMode }) { // 🚀 NHẬN PROP TỪ APP
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
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

  const handleDelete = async (docId, e) => {
    e.stopPropagation(); 
    if (!window.confirm("Bạn có chắc chắn muốn xóa vĩnh viễn dự án này?")) return;
    try {
      await deleteDoc(doc(db, "projects", docId));
      setProjects(projects.filter(p => p.docId !== docId));
    } catch (error) {
      alert("Lỗi khi xóa dự án!");
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "Không rõ thời gian";
    const date = new Date(timestamp);
    return date.toLocaleDateString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className={`flex flex-col h-screen w-full font-sans p-6 overflow-hidden transition-colors duration-300 ${darkMode ? 'bg-[#0E0E10] text-white' : 'bg-zinc-100 text-zinc-900'}`}>
      <div className="flex items-center justify-between mb-6 shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <FolderClock className="text-blue-500" size={28} />
          Lịch sử Dự án
        </h1>
        <button onClick={fetchProjects} className={`px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 cursor-pointer border shadow-sm ${darkMode ? 'bg-[#1A1A1F] hover:bg-[#2A2A30] border-[#2A2A30] text-white' : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-800'}`}>
          Làm mới
        </button>
      </div>

      <div className={`flex-1 rounded-xl overflow-hidden flex flex-col shadow-lg min-h-0 border transition-colors duration-300 ${darkMode ? 'bg-[#15151A] border-[#2A2A30]' : 'bg-white border-zinc-200'}`}>
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-blue-500">
            <Loader2 className="animate-spin" size={40} />
            <p className={`font-medium ${darkMode ? 'text-gray-400' : 'text-zinc-500'}`}>Đang tải dữ liệu từ đám mây...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className={`flex-1 flex flex-col items-center justify-center gap-3 ${darkMode ? 'text-gray-500' : 'text-zinc-400'}`}>
            <FolderClock size={60} className="opacity-20" />
            <p>Chưa có dự án nào được lưu.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.map((project) => (
                <div 
                  key={project.docId} 
                  className={`border rounded-xl p-5 flex flex-col gap-4 transition-all group relative cursor-pointer shadow-sm ${darkMode ? 'bg-[#1A1A1F] border-[#2A2A30] hover:border-blue-500/50' : 'bg-zinc-50 border-zinc-200 hover:border-blue-400 hover:shadow-md'}`}
                  onClick={() => navigate(`/project/${project.docId}`)}
                >
                  <button 
                    onClick={(e) => handleDelete(project.docId, e)}
                    className={`absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded cursor-pointer ${darkMode ? 'text-gray-500 hover:text-red-500 bg-[#15151A]' : 'text-zinc-400 hover:text-red-600 bg-white shadow-sm border border-zinc-200'}`}
                    title="Xóa dự án"
                  >
                    <Trash2 size={16} />
                  </button>

                  <h3 className={`text-lg font-bold pr-8 truncate ${darkMode ? 'text-gray-100' : 'text-zinc-800'}`} title={project.projectName || project.name}>
                    {project.projectName || project.name || "Dự án chưa đặt tên"}
                  </h3>
                  
                  <div className={`flex flex-col gap-2 text-sm ${darkMode ? 'text-gray-400' : 'text-zinc-600'}`}>
                    <div className="flex items-center gap-2"><Calendar size={14} className="text-blue-500"/> {formatDate(project.createdAt)}</div>
                    <div className="flex items-center gap-2"><FileVideo size={14} className="text-purple-500"/> {project.sceneCount || 0} Cảnh video</div>
                    <div className="flex items-center gap-2"><DollarSign size={14} className="text-green-500"/> Dự kiến: ${project.estCost?.toFixed(2) || '0.00'}</div>
                  </div>

                  <button 
                    className={`mt-2 w-full py-2.5 border rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${darkMode ? 'bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border-blue-500/20' : 'bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200'}`}
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