import React, { useState } from 'react';
import { Camera, Mic, Trash2, Upload, Pencil, Check, X, Sparkles, Image as ImageIcon, Music } from 'lucide-react';

export default function SetupTab({ 
  projectCharacters, setProjectCharacters, 
  parsedData, setParsedData, 
  handleSaveSetupData, // 🚀 NHẬN HÀM LƯU FIREBASE TỪ WORKSPACE
  handleDeleteCharacter, avatarInputRef, charVoiceInputRef, activeUploadIdRef, darkMode 
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
    
    // Tạo mảng Characters mới
    const newCharacters = projectCharacters.map(c => c.id === id ? updatedChar : c);
    let newParsedData = null;

    // Cập nhật tên Character & Tone giọng trong các Scene liên quan
    if (parsedData && updatedChar.name) {
      const oldChar = projectCharacters.find(c => c.id === id);
      newParsedData = parsedData.map(s => {
        if (oldChar && s.Character === oldChar.name) {
          return { ...s, Character: updatedChar.name, Tone_of_Voice: updatedChar.voiceTone };
        }
        return s;
      });
    }

    // 🚀 GỌI HÀM NÀY ĐỂ BẮN DATA LÊN FIREBASE NGAY LẬP TỨC
    handleSaveSetupData(newCharacters, newParsedData);
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
          <div key={char.id} className={`border rounded-2xl p-6 shadow-xl flex flex-col gap-5 relative transition-all group ${darkMode ? 'bg-[#121214] border-[#2A2A30] hover:border-white/10' : 'bg-white border-zinc-200 hover:border-zinc-300'}`}>
            
            {!editing ? (
              <div className="absolute top-5 right-5 flex gap-2">
                <button onClick={() => toggleEdit(char)} className={`p-2 rounded-lg transition-colors border shadow-sm cursor-pointer ${darkMode ? 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border-white/5' : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 border-zinc-200'}`} title="Sửa thông tin">
                  <Pencil size={14}/>
                </button>
                <button onClick={() => handleDeleteCharacter(char.id)} className={`p-2 rounded-lg transition-colors border shadow-sm cursor-pointer ${darkMode ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border-red-500/10' : 'bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border-red-100'}`} title="Xóa nhân vật">
                  <Trash2 size={14}/>
                </button>
              </div>
            ) : (
              <div className="absolute top-5 right-5 flex gap-2">
                <button onClick={() => cancelEdit(char.id)} className={`p-2 rounded-lg transition-colors border shadow-sm cursor-pointer ${darkMode ? 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border-white/5' : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 border-zinc-200'}`}>
                  <X size={14}/>
                </button>
                <button onClick={() => saveEdit(char.id)} className={`p-2 rounded-lg transition-colors border cursor-pointer ${darkMode ? 'bg-green-500/20 hover:bg-green-500 text-green-400 hover:text-white border-green-500/30 shadow-green-900/20 shadow-lg' : 'bg-green-100 hover:bg-green-500 text-green-700 hover:text-white border-green-200 shadow-md'}`} title="Lưu lại">
                  <Check size={14}/>
                </button>
              </div>
            )}

            <div className="flex gap-5 items-start">
              <div className={`w-20 h-20 rounded-full border flex flex-col items-center justify-center overflow-hidden shrink-0 shadow-inner ${darkMode ? 'bg-[#0A0A0C] border-[#2A2A30]' : 'bg-zinc-100 border-zinc-200'}`}>
                {char.imageUrl ? (
                  <img src={char.imageUrl} crossOrigin="anonymous" className="w-full h-full object-cover" alt="avatar" />
                ) : (
                  <Camera size={20} className={darkMode ? 'text-zinc-600' : 'text-zinc-400'} />
                )}
              </div>

              <div className="flex-1 min-w-0 pr-20">
                <div className={`text-[10px] font-bold px-2.5 py-0.5 rounded border inline-block mb-2 ${darkMode ? 'text-purple-400 bg-purple-500/10 border-purple-500/20' : 'text-purple-700 bg-purple-50 border-purple-200'}`}>ID: {char.id}</div>
                
                {editing ? (
                  <>
                    <input type="text" value={currentData.name || ''} onChange={(e) => handleChange(char.id, 'name', e.target.value)} className={`w-full border text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded-lg px-3 py-1.5 mb-2 transition-all ${darkMode ? 'bg-[#0A0A0C] border-[#2A2A30] text-white' : 'bg-white border-zinc-300 text-zinc-900 shadow-sm'}`} placeholder="Tên nhân vật..." autoFocus />
                    <div className="flex items-center gap-2 text-xs">
                      <Mic size={14} className="text-blue-500 shrink-0"/>
                      <input type="text" value={currentData.voiceTone || ''} onChange={(e) => handleChange(char.id, 'voiceTone', e.target.value)} className={`w-full border focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded-md px-3 py-1.5 transition-all ${darkMode ? 'bg-[#0A0A0C] border-[#2A2A30] text-zinc-300' : 'bg-white border-zinc-300 text-zinc-800 shadow-sm'}`} placeholder="Giọng điệu..." />
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className={`text-xl font-bold mb-1.5 truncate pr-2 ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{char.name || "Chưa đặt tên"}</h3>
                    <div className={`flex items-center gap-2 text-[13px] font-medium ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      <Mic size={14} className="text-purple-500"/> {char.voiceTone || "Chưa có Tone giọng"}
                    </div>
                  </>
                )}
              </div>
            </div>

            {editing ? (
              <textarea value={currentData.description || ''} onChange={(e) => handleChange(char.id, 'description', e.target.value)} className={`w-full h-24 border rounded-xl p-3.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/50 custom-scrollbar resize-none leading-relaxed transition-all ${darkMode ? 'bg-[#0A0A0C] border-[#2A2A30] text-zinc-200' : 'bg-white border-zinc-300 text-zinc-800 shadow-sm'}`} placeholder="Mô tả ngoại hình, tính cách..."></textarea>
            ) : (
              <div className={`w-full h-24 border rounded-xl p-3.5 text-[13px] overflow-y-auto custom-scrollbar leading-relaxed shadow-inner ${darkMode ? 'bg-[#0A0A0C] border-[#2A2A30] text-zinc-400' : 'bg-zinc-50 border-zinc-200 text-zinc-700'}`}>
                {char.description || "Chưa có mô tả chi tiết."}
              </div>
            )}

            {char.voiceUrl && (
               <div className={`flex items-center gap-2 text-[11px] font-medium px-3 py-2 rounded-lg border ${darkMode ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-green-700 bg-green-50 border-green-200'}`}>
                 <Music size={12} /> Đã tải Voice mẫu: {char.voiceFileName || "Audio.mp3"}
               </div>
            )}

            <div className={`flex flex-wrap items-center gap-3 pt-4 mt-2 border-t ${darkMode ? 'border-[#2A2A30]' : 'border-zinc-200'}`}>
              <button onClick={() => { activeUploadIdRef.current = char.id; avatarInputRef.current.click(); }} className={`h-9 px-4 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 border transition-colors shadow-sm cursor-pointer ${darkMode ? 'bg-white/5 hover:bg-white/10 text-zinc-300 border-white/5' : 'bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-300'}`}>
                <ImageIcon size={14} /> Tải Ảnh Nền
              </button>
              <button onClick={() => { activeUploadIdRef.current = char.id; charVoiceInputRef.current.click(); }} className={`h-9 px-4 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 border transition-colors shadow-sm cursor-pointer ${darkMode ? 'bg-white/5 hover:bg-white/10 text-zinc-300 border-white/5' : 'bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-300'}`}>
                <Upload size={14} /> Tải Voice Lên
              </button>
              <button onClick={() => alert("Chức năng Generate Voice riêng cho Character đang được hoàn thiện!")} className={`h-9 px-4 rounded-lg text-[12px] font-bold flex items-center gap-1.5 border transition-all shadow-sm cursor-pointer ${darkMode ? 'bg-purple-600/20 hover:bg-purple-600 text-purple-400 hover:text-white border-purple-500/30' : 'bg-purple-50 hover:bg-purple-100 text-purple-600 border-purple-200'}`}>
                <Sparkles size={14} /> Generate
              </button>
            </div>

          </div>
        );
      })}
      
      {projectCharacters.length === 0 && (
        <div className={`col-span-full text-center py-16 text-sm border border-dashed rounded-2xl ${darkMode ? 'text-zinc-500 border-[#2A2A30] bg-[#0A0A0C]' : 'text-zinc-500 border-zinc-300 bg-zinc-50'}`}>
          Chưa có nhân vật nào trong dự án.
        </div>
      )}
    </div>
  );
}