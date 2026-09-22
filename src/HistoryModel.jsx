import React, { useState, useEffect } from 'react';
import { FolderClock, Play, Trash2, Loader2, Calendar, FileVideo, DollarSign, Clapperboard, RefreshCw } from 'lucide-react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from './firebase.js';
import { useNavigate } from 'react-router-dom';

export default function HistoryModel({ darkMode }) {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const editToolSnap = await getDocs(collection(db, "projects"));
      const editToolProjects = [];
      editToolSnap.forEach((doc) => {
        editToolProjects.push({ ...doc.data(), docId: doc.id, type: 'edit-tool' });
      });

      const sorted = editToolProjects.sort((a, b) => {
        const timeA = a.createdAt || a.updatedAt || 0;
        const timeB = b.createdAt || b.updatedAt || 0;
        return timeB - timeA;
      });

      setProjects(sorted);
    } catch (error) {
      console.error("Lỗi khi tải lịch sử:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  const handleDelete = async (project, e) => {
    e.stopPropagation();
    if (!window.confirm("Bạn có chắc chắn muốn xóa vĩnh viễn dự án này?")) return;
    try {
      await deleteDoc(doc(db, "projects", project.docId));
      setProjects(projects.filter(p => p.docId !== project.docId));
    } catch (error) { alert("Lỗi khi xóa dự án!"); }
  };

  const handleOpenProject = (project) => {
    navigate(`/project/${project.docId}`);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "Không rõ thời gian";
    const date = new Date(timestamp);
    return date.toLocaleDateString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className={`flex flex-col h-screen w-full font-sans p-6 overflow-hidden transition-colors duration-300 ${darkMode ? 'bg-slate-950 text-white' : 'bg-zinc-100 text-zinc-900'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <FolderClock className="text-amber-400" size={28} />
          Lịch sử Dự án
        </h1>
        <button
          onClick={fetchProjects}
          className={`px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 cursor-pointer border shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 ${darkMode ? 'bg-slate-900/80 hover:bg-slate-800 border-white/[0.07] text-white' : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-800'}`}
        >
          <RefreshCw size={16} /> Làm mới
        </button>
      </div>

      {/* Project grid */}
      <div className={`flex-1 rounded-xl overflow-hidden flex flex-col shadow-lg min-h-0 border transition-colors duration-300 ${darkMode ? 'bg-slate-900/60 backdrop-blur-sm border-white/[0.07]' : 'bg-white border-zinc-200'}`}>
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-amber-400">
            <Loader2 className="animate-spin" size={40} />
            <p className={`font-medium ${darkMode ? 'text-slate-400' : 'text-zinc-500'}`}>Đang tải dữ liệu từ đám mây...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className={`flex-1 flex flex-col items-center justify-center gap-3 ${darkMode ? 'text-slate-500' : 'text-zinc-400'}`}>
            <FolderClock size={60} className="opacity-20" />
            <p>Chưa có dự án nào. Hãy tạo dự án đầu tiên!</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.map((project) => (
                <div
                  key={project.docId}
                  className={`border rounded-xl p-5 flex flex-col gap-3 transition-all group relative cursor-pointer shadow-sm ${darkMode ? 'bg-slate-900/70 backdrop-blur-sm border-white/[0.07] hover:border-amber-500/30 hover:bg-slate-900/90' : 'bg-zinc-50 border-zinc-200 hover:border-amber-400 hover:shadow-md'}`}
                  onClick={() => handleOpenProject(project)}
                >
                  <button
                    onClick={(e) => handleDelete(project, e)}
                    className={`absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded cursor-pointer z-10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500/50 ${darkMode ? 'text-slate-500 hover:text-red-400 bg-slate-800' : 'text-zinc-400 hover:text-red-600 bg-white shadow-sm border border-zinc-200'}`}
                    title="Xóa dự án"
                  >
                    <Trash2 size={16} />
                  </button>

                  <div className="flex items-start justify-between pr-8">
                    <span className="text-[10px] px-2 py-1 rounded-md font-bold flex items-center gap-1.5 w-fit bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <Clapperboard size={12} /> Edit Tool
                    </span>
                  </div>

                  <h3
                    className={`text-lg font-bold truncate mt-1 ${darkMode ? 'text-slate-100' : 'text-zinc-800'}`}
                    title={project.projectName || project.name}
                  >
                    {project.projectName || project.name || "Dự án chưa đặt tên"}
                  </h3>

                  <div className={`flex flex-col gap-1.5 text-sm ${darkMode ? 'text-slate-400' : 'text-zinc-600'}`}>
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-amber-400" />
                      {formatDate(project.createdAt || project.updatedAt)}
                    </div>
                    <div className="flex items-center gap-2">
                      <FileVideo size={14} className="text-purple-400" />
                      {project.sceneCount || 0} Cảnh video
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign size={14} className="text-emerald-400" />
                      Dự kiến: ${project.estCost?.toFixed(2) || '0.00'}
                    </div>
                  </div>

                  <button className={`mt-2 w-full py-2.5 border rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 ${darkMode ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20' : 'bg-amber-50 hover:bg-amber-100 text-amber-600 border-amber-200'}`}>
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