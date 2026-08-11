import React, { useState, useEffect } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { Settings2, Key, Cpu, Image as ImageIcon, Video, Square, RectangleHorizontal, RectangleVertical, X as XIcon, Loader2 } from 'lucide-react';

const categoryColors = { Input: 'bg-gradient-to-r from-blue-900 to-blue-600', Generation: 'bg-gradient-to-r from-purple-800 to-purple-600', Output: 'bg-gradient-to-r from-emerald-800 to-emerald-600' };
const portColors = { session: '!bg-[#10B981]', prompts: '!bg-[#3B82F6]', media: '!bg-[#8B5CF6]', error: '!bg-[#EF4444]' };
const categoryIcons = { Input: <Key size={14} className="text-white opacity-80" />, Generation: <Cpu size={14} className="text-white opacity-80" />, Output: <ImageIcon size={14} className="text-white opacity-80" /> };

export default function CustomNode({ id, data }) {
  const { updateNodeData } = useReactFlow(); 
  const isEngine = data.category === 'Generation';
  
  const [mode, setMode] = useState('image');
  const [ar, setAr] = useState('9:16');
  const [model, setModel] = useState('GEM_PIX_2');
  const [count, setCount] = useState(1);
  const [duration, setDuration] = useState(4);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [isUploadingInput, setIsUploadingInput] = useState(false);

  useEffect(() => { if (isEngine) setModel(mode === 'image' ? 'GEM_PIX_2' : 'OMNI_FLASH'); }, [mode, isEngine]);

  const handleTextChange = (fieldId, newValue) => {
    const newFields = data.fields.map(f => f.id === fieldId ? { ...f, defaultValue: newValue } : f);
    updateNodeData(id, { fields: newFields });
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setIsUploadingInput(true);
    try {
        const base64Promises = files.map(file => new Promise((resolve) => {
            const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(file);
        }));
        const newBase64Array = await Promise.all(base64Promises);
        setUploadedImages(prev => [...prev, ...newBase64Array]);

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
    setUploadedImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
    const newFields = data.fields.map(f => {
        if (f.id === 'ref_img' && f.cloudUrls) { return { ...f, cloudUrls: f.cloudUrls.filter((_, idx) => idx !== indexToRemove) }; }
        return f;
    });
    updateNodeData(id, { fields: newFields });
  };

  useEffect(() => {
    const refField = data.fields?.find(f => f.id === 'ref_img');
    if (refField?.cloudUrls && refField.cloudUrls.length > 0 && uploadedImages.length === 0) {
        const loadBase64FromCloud = async () => {
            try {
                const b64s = await Promise.all(refField.cloudUrls.map(async url => {
                    const res = await fetch(url);
                    const blob = await res.blob();
                    return new Promise(resolve => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob); });
                }));
                setUploadedImages(b64s);
            } catch(e) {}
        };
        loadBase64FromCloud();
    }
  }, [data.fields, uploadedImages.length]);

  return (
    <div className="w-[300px] rounded-xl shadow-2xl bg-[#1E1E24] border border-[#2A2A30] overflow-hidden font-sans transition-all hover:border-purple-500/50 relative">
      <div className={`h-[38px] flex items-center justify-between px-3 ${categoryColors[data.category] || categoryColors.Output}`}>
        <div className="flex items-center gap-2">
          {categoryIcons[data.category] || <Settings2 size={14} className="text-white opacity-80" />}
          <span className="text-white text-[13px] font-bold tracking-wide">{data.label}</span>
        </div>
        <div className="w-2 h-2 rounded-full bg-white/50 animate-pulse"></div>
      </div>

      <div className="p-4 relative flex flex-col gap-4">
        {isEngine ? (
          <div className="flex flex-col gap-3">
            <input type="hidden" id="opt_mode" value={mode} />
            <input type="hidden" id="opt_model" value={model} />
            <input type="hidden" id="opt_ar" value={ar} />
            <input type="hidden" id="opt_count" value={count} />
            <input type="hidden" id="opt_duration" value={duration} />

            <div className="flex bg-[#15151A] p-1 rounded-lg border border-[#2A2A30]">
              <button onClick={() => setMode('image')} className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all ${mode === 'image' ? 'bg-[#2A2A30] text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}><ImageIcon size={14} /> Hình ảnh</button>
              <button onClick={() => setMode('video')} className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all ${mode === 'video' ? 'bg-[#2A2A30] text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}><Video size={14} /> Video</button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Khung hình</label>
              <div className="flex gap-1.5">
                <button onClick={() => setAr('16:9')} className={`flex-1 py-1.5 flex flex-col items-center gap-1 rounded-lg border transition-all ${ar === '16:9' ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-[#15151A] border-[#2A2A30] text-gray-500 hover:border-gray-500'}`}><RectangleHorizontal size={14} /> <span className="text-[10px] font-bold">16:9</span></button>
                <button onClick={() => setAr('1:1')} className={`flex-1 py-1.5 flex flex-col items-center gap-1 rounded-lg border transition-all ${ar === '1:1' ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-[#15151A] border-[#2A2A30] text-gray-500 hover:border-gray-500'}`}><Square size={14} /> <span className="text-[10px] font-bold">1:1</span></button>
                <button onClick={() => setAr('9:16')} className={`flex-1 py-1.5 flex flex-col items-center gap-1 rounded-lg border transition-all ${ar === '9:16' ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-[#15151A] border-[#2A2A30] text-gray-500 hover:border-gray-500'}`}><RectangleVertical size={14} /> <span className="text-[10px] font-bold">9:16</span></button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cấu hình Model</label>
              <div className="bg-[#15151A] border border-[#2A2A30] rounded-lg p-2 flex flex-col gap-2">
                <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full bg-[#1E1E24] border border-[#2A2A30] rounded p-1.5 text-xs text-white font-semibold focus:border-purple-500 focus:outline-none appearance-none cursor-pointer">
                  {mode === 'image' ? <><option value="GEM_PIX_2">🍌 Nano Banana Pro</option><option value="IMAGEN_3">✨ Imagen 3</option></> : <><option value="OMNI_FLASH">⚡ Omni Flash</option><option value="VEO_1">🎬 Veo 1</option></>}
                </select>
                <div className="flex gap-2">
                  <div className="flex-1 flex bg-[#1E1E24] border border-[#2A2A30] rounded overflow-hidden">
                    {[1, 2, 3, 4].map(num => <button key={num} onClick={() => setCount(num)} className={`flex-1 text-[11px] font-bold py-1 ${count === num ? 'bg-[#2A2A30] text-white' : 'text-gray-500 hover:text-gray-300'}`}>x{num}</button>)}
                  </div>
                  {mode === 'video' && (
                    <div className="flex-1 flex bg-[#1E1E24] border border-[#2A2A30] rounded overflow-hidden animate-in fade-in zoom-in duration-200">
                      {[4, 6, 8].map(sec => <button key={sec} onClick={() => setDuration(sec)} className={`flex-1 text-[11px] font-bold py-1 ${duration === sec ? 'bg-[#2A2A30] text-white' : 'text-gray-500 hover:text-gray-300'}`}>{sec}s</button>)}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 mt-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Tiến trình</label>
              <input readOnly value={data.fields?.find(f => f.id === 'f1')?.defaultValue || 'Đang đợi lệnh...'} className="w-full bg-[#15151A] border border-[#2A2A30] rounded-md p-2 text-[11px] text-purple-400 font-bold outline-none cursor-default" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {data.fields && data.fields.map((field, idx) => (
              <div key={idx} className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{field.label}</label>
                
                {field.type === 'textarea' ? (
                  <textarea 
                    className="nodrag nowheel w-full bg-[#15151A] border border-[#2A2A30] rounded-md p-2 text-xs text-gray-200 focus:border-purple-500 focus:outline-none resize-y min-h-[80px] custom-scrollbar placeholder:text-gray-600" 
                    placeholder={field.placeholder} value={field.defaultValue || ''} onChange={(e) => handleTextChange(field.id, e.target.value)}
                  />
                ) : field.type === 'image' ? (
                  <div className="w-full bg-[#15151A] border border-dashed border-[#2A2A30] hover:border-purple-500 rounded-md p-3 flex flex-col gap-3 transition-colors relative min-h-[80px]">
                    <div className="relative flex flex-col items-center justify-center cursor-pointer w-full h-[60px] bg-[#1E1E24] rounded border border-[#2A2A30] hover:bg-[#2A2A30] transition-all">
                      <input type="file" accept="image/*" multiple className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={handleFileChange} disabled={isUploadingInput} />
                      {isUploadingInput ? <Loader2 className="animate-spin text-purple-400 mb-1" size={18} /> : <ImageIcon size={18} className="mb-1 text-purple-400" />}
                      <span className="text-[10px] text-gray-400 font-bold uppercase">{isUploadingInput ? 'Đang lưu Cloud...' : 'Bấm để tải thêm ảnh'}</span>
                    </div>
                    {uploadedImages.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 w-full">
                        {uploadedImages.map((b64, imgIdx) => (
                          <div key={imgIdx} className="relative group w-full pt-[100%] rounded overflow-hidden border border-[#2A2A30]">
                            <img src={b64} className="absolute top-0 left-0 w-full h-full object-cover" alt="upload preview" />
                            <button onClick={() => handleRemoveImage(imgIdx)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20 cursor-pointer shadow" title="Xóa ảnh này"><XIcon size={12} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    <input type="hidden" id={`base64_${field.id}`} value={JSON.stringify(uploadedImages)} />
                  </div>
                ) : (
                  <input type={field.type} className="nodrag w-full bg-[#15151A] border border-[#2A2A30] rounded-md p-2 text-xs text-gray-200 focus:border-purple-500 focus:outline-none placeholder:text-gray-600" placeholder={field.placeholder} value={field.defaultValue || ''} onChange={(e) => handleTextChange(field.id, e.target.value)} />
                )}
              </div>
            ))}

            {/* 🚀 CHỈ HIỂN THỊ KHI ĐÃ CÓ LINK XỊN TỪ R2 */}
            {data.preview && data.preview.type === 'gallery' && (
              <div className="w-full bg-[#15151A] rounded-lg border border-[#2A2A30] p-2 flex flex-col gap-2 items-center justify-center min-h-[120px]">
                {data.imageUrls && data.imageUrls.length > 0 && !data.imageUrls[0].includes('flow-content') ? (
                  <div className="w-full grid grid-cols-1 gap-2">
                    {data.imageUrls.map((url, idx) => (
                        data.outputType === 'video' ? (
                            <video key={idx} crossOrigin="anonymous" src={url} autoPlay loop muted controls className="w-full h-auto rounded-md border border-[#2A2A30] object-cover" style={{ maxHeight: '200px' }} />
                        ) : (
                            <img key={idx} crossOrigin="anonymous" src={url} alt={`Result ${idx + 1}`} className="w-full h-auto rounded-md border border-[#2A2A30] object-cover" style={{ maxHeight: '200px' }} />
                        )
                    ))}
                  </div>
                ) : (
                  <><ImageIcon size={24} className="text-gray-600 mb-1" /><span className="text-gray-500 text-[11px] text-center px-4">Đang đợi tải video...</span></>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {data.inputs?.map((input, idx) => <Handle key={`in-${idx}`} type="target" position={Position.Left} id={input.name} className={`w-[12px] h-[12px] border-2 border-[#1E1E24] -ml-[6px] ${portColors[input.type]}`} style={{ top: `${45 + idx * 35}px` }} />)}
      {data.outputs?.map((output, idx) => <Handle key={`out-${idx}`} type="source" position={Position.Right} id={output.name} className={`w-[12px] h-[12px] border-2 border-[#1E1E24] -mr-[6px] ${portColors[output.type]}`} style={{ top: `${45 + idx * 35}px` }} />)}
    </div>
  );
}