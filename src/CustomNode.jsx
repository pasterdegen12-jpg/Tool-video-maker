import React, { useState, useEffect } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { Settings2, Key, Cpu, Image as ImageIcon, Video, Square, RectangleHorizontal, RectangleVertical, X as XIcon, Loader2, CheckCircle2, Play, Maximize2, MousePointerClick } from 'lucide-react';

const categoryColors = { Input: 'bg-gradient-to-r from-blue-900 to-blue-600', Generation: 'bg-gradient-to-r from-purple-800 to-purple-600', Output: 'bg-gradient-to-r from-emerald-800 to-emerald-600' };
const portColors = { session: '!bg-[#10B981] !border-white shadow-[0_0_8px_#10B981]', prompts: '!bg-[#3B82F6] !border-white shadow-[0_0_8px_#3B82F6]', media: '!bg-[#8B5CF6] !border-white shadow-[0_0_8px_#8B5CF6]', error: '!bg-[#EF4444] !border-white' };
const categoryIcons = { Input: <Key size={14} className="text-white opacity-80" />, Generation: <Cpu size={14} className="text-white opacity-80" />, Output: <ImageIcon size={14} className="text-white opacity-80" /> };

const PROMPT_OPTIONS = [
  { id: 'custom', label: '✍️ Tự nhập Prompt (Custom)' },
  { id: 'cinematic', label: '🎬 Phong cách Cinematic (Điện ảnh)' },
  { id: 'anime', label: '🌸 Phong cách Anime (Ghibli)' },
  { id: 'cyberpunk', label: '🤖 Phong cách Cyberpunk (Tương lai)' }
];

export default function CustomNode({ id, data }) {
  const { updateNodeData } = useReactFlow(); 
  const isEngine = data.category === 'Generation';
  const isInput = data.category === 'Input';
  const isOutput = data.category === 'Output';
  
  const config = data.config || { mode: 'image', ar: '9:16', model: 'GEM_PIX_2', count: 1, duration: 4 };
  const preset = data.preset || 'custom';
  const [isUploadingInput, setIsUploadingInput] = useState(false);

  const updateConfig = (key, value) => {
    let newModel = config.model;
    if (key === 'mode') { newModel = value === 'image' ? 'GEM_PIX_2' : 'OMNI_FLASH'; }
    updateNodeData(id, { config: { ...config, [key]: value, model: newModel } });
  };

  const handleTextChange = (fieldId, newValue) => {
    const newFields = data.fields.map(f => f.id === fieldId ? { ...f, defaultValue: newValue } : f);
    updateNodeData(id, { fields: newFields });
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setIsUploadingInput(true);
    try {
        const appId = localStorage.getItem('current_autoflow_id') || `flow_${Date.now()}`;
        const newCloudUrls = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i]; const mimeType = file.type; const ext = mimeType.split('/')[1] || 'jpg';
            const fileName = `input_${Date.now()}_${i}.${ext}`;
            const uniqueCloudName = `autoflow/${appId}/inputs/${fileName}`;
            
            const urlRes = await fetch('/api/get-upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: uniqueCloudName, fileType: mimeType }) });
            const { uploadUrl } = await urlRes.json();
            await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': mimeType } });
            newCloudUrls.push(`${import.meta.env.VITE_R2_PUBLIC_URL}/${uniqueCloudName}`);
        }
        if (newCloudUrls.length > 0) {
            const newFields = data.fields.map(f => { if (f.id === 'ref_img') { return { ...f, cloudUrls: [...(f.cloudUrls || []), ...newCloudUrls] }; } return f; });
            updateNodeData(id, { fields: newFields });
        }
    } catch (err) { alert("Có lỗi khi lưu ảnh lên Cloud!"); } finally { setIsUploadingInput(false); e.target.value = ''; }
  };

  const handleRemoveImage = (indexToRemove) => {
    const newFields = data.fields.map(f => {
        if (f.id === 'ref_img' && f.cloudUrls) { return { ...f, cloudUrls: f.cloudUrls.filter((_, idx) => idx !== indexToRemove) }; }
        return f;
    });
    updateNodeData(id, { fields: newFields });
  };

  // 🚀 XỬ LÝ CHỌN ẢNH TỪ GALLERY RÕ RÀNG HƠN
  const toggleSelectGalleryImage = (url, e) => {
      e.stopPropagation();
      const currentSelected = data.selectedMedia || [];
      const isSelected = currentSelected.includes(url);
      const newSelected = isSelected ? currentSelected.filter(u => u !== url) : [...currentSelected, url];
      updateNodeData(id, { selectedMedia: newSelected });
  };

  const openFullScreen = (url, type, e) => {
      e.stopPropagation();
      const metaInfo = data.mediaMetadata ? data.mediaMetadata[url] : null;
      window.dispatchEvent(new CustomEvent('OPEN_LIGHTBOX', { detail: { url, type, meta: metaInfo } }));
  };

  const runThisNode = () => {
      window.dispatchEvent(new CustomEvent('RUN_SINGLE_NODE', { detail: id }));
  };

  return (
    <div className="w-[320px] rounded-xl shadow-xl bg-[#1E1E24] border border-[#2A2A30] overflow-visible font-sans transition-all hover:border-purple-500/50 relative group">
      <div className={`h-[38px] flex items-center justify-between px-3 rounded-t-xl ${categoryColors[data.category] || categoryColors.Output}`}>
        <div className="flex items-center gap-2">
          {categoryIcons[data.category] || <Settings2 size={14} className="text-white opacity-80" />}
          <span className="text-white text-[13px] font-bold tracking-wide">{data.label}</span>
        </div>
      </div>

      <div className="p-4 relative flex flex-col gap-4">
        {isInput && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
               <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Tùy chọn Ý tưởng</label>
               <select value={preset} onChange={(e) => updateNodeData(id, { preset: e.target.value })} className="w-full bg-[#15151A] border border-[#2A2A30] rounded-md p-2 text-xs text-blue-400 font-semibold focus:border-blue-500 focus:outline-none appearance-none cursor-pointer">
                  {PROMPT_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
               </select>
            </div>
            {preset === 'custom' && data.fields?.map((field, idx) => {
              if (field.type === 'textarea') return (
                <div key={idx} className="flex flex-col gap-1.5 animate-in fade-in zoom-in duration-200">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{field.label}</label>
                  <textarea className="nodrag nowheel w-full bg-[#15151A] border border-[#2A2A30] rounded-md p-2 text-xs text-gray-200 focus:border-blue-500 focus:outline-none resize-y min-h-[80px] custom-scrollbar placeholder:text-gray-600" placeholder={field.placeholder} value={field.defaultValue || ''} onChange={(e) => handleTextChange(field.id, e.target.value)} />
                </div>
              ); return null;
            })}
            {data.fields?.map((field, idx) => {
              if (field.type === 'image') return (
                <div key={idx} className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{field.label}</label>
                  <div className="w-full bg-[#15151A] border border-dashed border-[#2A2A30] hover:border-blue-500 rounded-md p-3 flex flex-col gap-3 transition-colors relative min-h-[80px]">
                    <div className="relative flex flex-col items-center justify-center cursor-pointer w-full h-[60px] bg-[#1E1E24] rounded border border-[#2A2A30] hover:bg-[#2A2A30] transition-all">
                      <input type="file" accept="image/*" multiple className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={handleFileChange} disabled={isUploadingInput} />
                      {isUploadingInput ? <Loader2 className="animate-spin text-blue-400 mb-1" size={18} /> : <ImageIcon size={18} className="mb-1 text-blue-400" />}
                      <span className="text-[10px] text-gray-400 font-bold uppercase">{isUploadingInput ? 'Đang tải lên...' : 'Bấm để thêm ảnh'}</span>
                    </div>
                    {field.cloudUrls && field.cloudUrls.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 w-full">
                        {field.cloudUrls.map((url, imgIdx) => (
                          <div key={imgIdx} className="relative group/img w-full pt-[100%] rounded overflow-hidden border border-[#2A2A30]">
                            <img src={url} crossOrigin="anonymous" className="absolute top-0 left-0 w-full h-full object-cover" alt="upload preview" />
                            <button onClick={() => handleRemoveImage(imgIdx)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group/img-hover:opacity-100 transition-opacity z-20 cursor-pointer shadow"><XIcon size={12} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ); return null;
            })}
          </div>
        )}

        {isEngine && (
          <div className="flex flex-col gap-3">
            <div className="flex bg-[#15151A] p-1 rounded-lg border border-[#2A2A30]">
              <button onClick={() => updateConfig('mode', 'image')} className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all ${config.mode === 'image' ? 'bg-[#2A2A30] text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}><ImageIcon size={14} /> Hình ảnh</button>
              <button onClick={() => updateConfig('mode', 'video')} className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all ${config.mode === 'video' ? 'bg-[#2A2A30] text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}><Video size={14} /> Video</button>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Khung hình</label>
              <div className="flex gap-1.5">
                <button onClick={() => updateConfig('ar', '16:9')} className={`flex-1 py-1.5 flex flex-col items-center gap-1 rounded-lg border transition-all ${config.ar === '16:9' ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-[#15151A] border-[#2A2A30] text-gray-500 hover:border-gray-500'}`}><RectangleHorizontal size={14} /> <span className="text-[10px] font-bold">16:9</span></button>
                <button onClick={() => updateConfig('ar', '1:1')} className={`flex-1 py-1.5 flex flex-col items-center gap-1 rounded-lg border transition-all ${config.ar === '1:1' ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-[#15151A] border-[#2A2A30] text-gray-500 hover:border-gray-500'}`}><Square size={14} /> <span className="text-[10px] font-bold">1:1</span></button>
                <button onClick={() => updateConfig('ar', '9:16')} className={`flex-1 py-1.5 flex flex-col items-center gap-1 rounded-lg border transition-all ${config.ar === '9:16' ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-[#15151A] border-[#2A2A30] text-gray-500 hover:border-gray-500'}`}><RectangleVertical size={14} /> <span className="text-[10px] font-bold">9:16</span></button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cấu hình Model</label>
              <div className="bg-[#15151A] border border-[#2A2A30] rounded-lg p-2 flex flex-col gap-2">
                <select value={config.model} onChange={(e) => updateConfig('model', e.target.value)} className="w-full bg-[#1E1E24] border border-[#2A2A30] rounded p-1.5 text-xs text-white font-semibold focus:border-purple-500 focus:outline-none appearance-none cursor-pointer">
                  {config.mode === 'image' ? <><option value="GEM_PIX_2">🍌 Nano Banana Pro</option><option value="IMAGEN_3">✨ Imagen 3</option></> : <><option value="OMNI_FLASH">⚡ Omni Flash</option><option value="VEO_1">🎬 Veo 1</option></>}
                </select>
                <div className="flex gap-2">
                  <div className="flex-1 flex bg-[#1E1E24] border border-[#2A2A30] rounded overflow-hidden">
                    {[1, 2, 3, 4].map(num => <button key={num} onClick={() => updateConfig('count', num)} className={`flex-1 text-[11px] font-bold py-1 ${config.count === num ? 'bg-[#2A2A30] text-white' : 'text-gray-500 hover:text-gray-300'}`}>x{num}</button>)}
                  </div>
                  {config.mode === 'video' && (
                    <div className="flex-1 flex bg-[#1E1E24] border border-[#2A2A30] rounded overflow-hidden animate-in fade-in zoom-in duration-200">
                      {[4, 6, 8].map(sec => <button key={sec} onClick={() => updateConfig('duration', sec)} className={`flex-1 text-[11px] font-bold py-1 ${config.duration === sec ? 'bg-[#2A2A30] text-white' : 'text-gray-500 hover:text-gray-300'}`}>{sec}s</button>)}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button onClick={runThisNode} className="w-full mt-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-2 shadow-lg cursor-pointer">
                <Play size={14} fill="currentColor"/> Chạy Node Này
            </button>
            <div className="flex flex-col gap-1.5">
              <input readOnly value={data.progress || 'Đang đợi lệnh...'} className="w-full bg-[#15151A] border border-[#2A2A30] rounded-md p-2 text-[11px] text-purple-400 font-bold outline-none cursor-default" />
            </div>
          </div>
        )}

        {/* 🚀 GIAO DIỆN NÚT CHỌN RÕ RÀNG Ở GALLERY */}
        {isOutput && data.preview && data.preview.type === 'gallery' && (
          <div className="w-full bg-[#15151A] rounded-lg border border-[#2A2A30] p-2 flex flex-col gap-2 min-h-[120px]">
            {data.imageUrls && data.imageUrls.length > 0 ? (
              <div className="w-full grid grid-cols-1 gap-3">
                {data.imageUrls.map((url, idx) => {
                    const isSelected = data.selectedMedia && data.selectedMedia.includes(url);
                    return (
                        <div key={idx} className={`relative flex flex-col p-1.5 rounded-md border-2 transition-all ${isSelected ? 'border-emerald-500 bg-emerald-500/10' : 'border-[#2A2A30] bg-[#0E0E10]'}`}>
                            
                            {data.outputType === 'video' ? (
                                <video crossOrigin="anonymous" src={url} autoPlay loop muted className="w-full h-auto rounded object-cover" style={{ maxHeight: '200px' }} />
                            ) : (
                                <img crossOrigin="anonymous" src={url} alt={`Result ${idx}`} className="w-full h-auto rounded object-cover" style={{ maxHeight: '200px' }} />
                            )}
                            
                            {/* KHỐI 2 NÚT BẤM VẬT LÝ NẰM DƯỚI ẢNH */}
                            <div className="flex items-center gap-2 mt-2">
                                <button onClick={(e) => toggleSelectGalleryImage(url, e)} className={`flex-1 py-2 rounded flex items-center justify-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${isSelected ? 'bg-emerald-500 text-white' : 'bg-[#1E1E24] text-gray-400 hover:text-white border border-[#2A2A30] hover:border-gray-500'}`}>
                                    {isSelected ? <><CheckCircle2 size={14}/> Đang Chọn Làm Input</> : <><MousePointerClick size={14}/> Chọn File Này</>}
                                </button>
                                <button onClick={(e) => openFullScreen(url, data.outputType, e)} className="px-3 py-2 rounded bg-[#1E1E24] text-gray-400 hover:text-white transition-all cursor-pointer border border-[#2A2A30] hover:border-gray-500" title="Xem Toàn Màn Hình">
                                    <Maximize2 size={14} />
                                </button>
                            </div>
                        </div>
                    )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full opacity-50 py-6">
                <ImageIcon size={24} className="text-gray-600 mb-2" />
                <span className="text-gray-400 text-[11px] text-center px-4">Chờ kết quả render...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {data.inputs?.map((input, idx) => (
        <div key={`in-wrap-${idx}`} className="absolute -left-[14px] flex items-center group/port" style={{ top: `${60 + idx * 35}px` }}>
            <Handle type="target" position={Position.Left} id={input.name} className={`!w-[18px] !h-[18px] !border-[3px] !relative !transform-none !left-0 !top-0 transition-transform hover:scale-125 z-50 ${portColors[input.type]}`} />
            <span className="text-[9px] font-bold text-gray-400 ml-1 opacity-0 group-hover/port:opacity-100 transition-opacity bg-[#15151A] px-1 rounded border border-[#2A2A30]">In</span>
        </div>
      ))}

      {data.outputs?.map((output, idx) => (
        <div key={`out-wrap-${idx}`} className="absolute -right-[14px] flex items-center flex-row-reverse group/port" style={{ top: `${60 + idx * 35}px` }}>
            <Handle type="source" position={Position.Right} id={output.name} className={`!w-[18px] !h-[18px] !border-[3px] !relative !transform-none !right-0 !top-0 transition-transform hover:scale-125 z-50 ${portColors[output.type]}`} />
            <span className="text-[9px] font-bold text-gray-400 mr-1 opacity-0 group-hover/port:opacity-100 transition-opacity bg-[#15151A] px-1 rounded border border-[#2A2A30]">Out</span>
        </div>
      ))}
    </div>
  );
}