import React, { useState } from 'react';
import { Camera, Mic, Trash2, Upload, Pencil, Check, X, Sparkles, Image as ImageIcon, Music } from 'lucide-react';

export default function SetupTab({ 
  projectCharacters, setProjectCharacters, 
  parsedData, setParsedData, 
  handleDeleteCharacter, avatarInputRef, charVoiceInputRef, activeUploadIdRef 
}) {
  const [isEditing, setIsEditing] = useState({});
  const [tempData, setTempData] = useState({});

  const toggleEdit = (char) => {
    setIsEditing(prev => ({ ...prev, [char.id]: true }));
    setTempData(prev => ({ ...prev, [char.id]: { ...char } }));
  };

  const cancelEdit = (id) => {
    setIsEditing(prev => ({ ...prev, [id]: false }));
  };

  const saveEdit = (id) => {
    const updatedChar = tempData[id];
    setProjectCharacters(prev => prev.map(c => c.id === id ? updatedChar : c));
    if (setParsedData && updatedChar.name) {
      setParsedData(prev => prev.map(s => {
        const oldChar = projectCharacters.find(c => c.id === id);
        if (oldChar && s.Character === oldChar.name) {
          return { ...s, Character: updatedChar.name, Tone_of_Voice: updatedChar.voiceTone };
        }
        return s;
      }));
    }
    setIsEditing(prev => ({ ...prev, [id]: false }));
  };

  const handleChange = (id, field, value) => {
    setTempData(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-fadeIn">
      {projectCharacters.map((char) => {
        const editing = isEditing[char.id];
        const currentData = editing ? tempData[char.id] : char;

        return (
          <div key={char.id} className="bg-[#121214] border border-[#2A2A30] rounded-2xl p-6 shadow-xl flex flex-col gap-5 relative transition-all hover:border-white/10 group">
            
            {/* 🚀 NÚT EDIT/DELETE LUÔN HIỂN THỊ */}
            {!editing ? (
              <div className="absolute top-5 right-5 flex gap-2">
                <button onClick={() => toggleEdit(char)} className="p-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-lg transition-colors border border-white/5" title="Sửa thông tin">
                  <Pencil size={14}/>
                </button>
                <button onClick={() => handleDeleteCharacter(char.id)} className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg transition-colors border border-red-500/10" title="Xóa nhân vật">
                  <Trash2 size={14}/>
                </button>
              </div>
            ) : (
              <div className="absolute top-5 right-5 flex gap-2">
                <button onClick={() => cancelEdit(char.id)} className="p-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-lg transition-colors border border-white/5">
                  <X size={14}/>
                </button>
                <button onClick={() => saveEdit(char.id)} className="p-2 bg-green-500/20 hover:bg-green-500 text-green-400 hover:text-white rounded-lg transition-colors border border-green-500/30 shadow-lg shadow-green-900/20">
                  <Check size={14}/>
                </button>
              </div>
            )}

            <div className="flex gap-5 items-start">
              {/* Avatar cố định */}
              <div className="w-20 h-20 rounded-full bg-[#0A0A0C] border border-[#2A2A30] flex flex-col items-center justify-center overflow-hidden shrink-0 shadow-inner">
                {char.imageUrl ? (
                  <img src={char.imageUrl} className="w-full h-full object-cover" alt="avatar" />
                ) : (
                  <Camera size={20} className="text-zinc-600" />
                )}
              </div>

              <div className="flex-1 min-w-0 pr-20">
                <div className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded border border-purple-500/20 inline-block mb-2">ID: {char.id}</div>
                
                {editing ? (
                  <>
                    <input type="text" value={currentData.name || ''} onChange={(e) => handleChange(char.id, 'name', e.target.value)} className="w-full bg-[#0A0A0C] border border-blue-500/50 text-lg font-bold text-white focus:outline-none rounded-lg px-3 py-1 mb-2" placeholder="Tên nhân vật..." autoFocus />
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <Mic size={14} className="text-blue-400 shrink-0"/>
                      <input type="text" value={currentData.voiceTone || ''} onChange={(e) => handleChange(char.id, 'voiceTone', e.target.value)} className="bg-[#0A0A0C] border border-white/10 focus:border-blue-500/50 focus:outline-none w-full rounded-md px-3 py-1.5" placeholder="Giọng điệu..." />
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-xl font-bold text-white mb-1.5 truncate pr-2">{char.name || "Chưa đặt tên"}</h3>
                    <div className="flex items-center gap-2 text-[13px] text-zinc-400 font-medium">
                      <Mic size={14} className="text-purple-400"/> {char.voiceTone || "Chưa có Tone giọng"}
                    </div>
                  </>
                )}
              </div>
            </div>

            {editing ? (
              <textarea value={currentData.description || ''} onChange={(e) => handleChange(char.id, 'description', e.target.value)} className="w-full h-24 bg-[#0A0A0C] border border-blue-500/50 rounded-xl p-3.5 text-[13px] text-zinc-200 focus:outline-none custom-scrollbar resize-none leading-relaxed" placeholder="Mô tả ngoại hình, tính cách..."></textarea>
            ) : (
              <div className="w-full h-24 bg-[#0A0A0C] border border-[#2A2A30] rounded-xl p-3.5 text-[13px] text-zinc-400 overflow-y-auto custom-scrollbar leading-relaxed shadow-inner">
                {char.description || "Chưa có mô tả chi tiết."}
              </div>
            )}

            {/* Trạng thái Voice */}
            {char.voiceUrl && (
               <div className="flex items-center gap-2 text-[11px] font-medium text-green-400 bg-green-500/10 px-3 py-2 rounded-lg border border-green-500/20">
                 <Music size={12} /> Đã tải Voice mẫu: {char.voiceFileName || "Audio.mp3"}
               </div>
            )}

            {/* 🚀 DÀN NÚT QUYỀN LỰC MỚI ĐƯỢC CHUYỂN XUỐNG ĐÂY */}
            <div className="flex flex-wrap items-center gap-3 pt-4 mt-2 border-t border-[#2A2A30]">
              <button onClick={() => { activeUploadIdRef.current = char.id; avatarInputRef.current.click(); }} className="h-9 px-4 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/5 transition-colors shadow-sm">
                <ImageIcon size={14} /> Tải Ảnh Nền
              </button>
              <button onClick={() => { activeUploadIdRef.current = char.id; charVoiceInputRef.current.click(); }} className="h-9 px-4 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/5 transition-colors shadow-sm">
                <Upload size={14} /> Tải Voice Lên
              </button>
              <button onClick={() => alert("Chức năng Generate Voice riêng cho Character đang được hoàn thiện!")} className="h-9 px-4 rounded-lg text-[12px] font-bold flex items-center gap-1.5 bg-purple-600/20 hover:bg-purple-600 text-purple-400 hover:text-white border border-purple-500/30 transition-all shadow-sm">
                <Sparkles size={14} /> Generate
              </button>
            </div>

          </div>
        );
      })}
      
      {projectCharacters.length === 0 && (
        <div className="col-span-full text-center text-zinc-500 py-16 text-sm border border-dashed border-[#2A2A30] rounded-2xl bg-[#0A0A0C]">
          Chưa có nhân vật nào trong dự án.
        </div>
      )}
    </div>
  );
}