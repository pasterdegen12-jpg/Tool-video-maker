import {useEffect,useRef,useState} from 'react';
import {MAX_EDIT_VIDEO_BYTES,readEditVideo,trimArguments,trimVideo} from '../lib/videoEditing.js';
import {safeMediaUrl} from '../lib/seedanceContract.js';

export default function VideoTrimEditor({source,onClose,onSave}){
  const [start,setStart]=useState(0),[end,setEnd]=useState(0),[duration,setDuration]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null);
  const video=useRef(null),live=useRef(true),objectUrls=useRef([]),abort=useRef(new AbortController());
  useEffect(()=>{live.current=true;abort.current=new AbortController();const controller=abort.current,urls=objectUrls.current;return()=>{live.current=false;controller.abort();urls.forEach(url=>URL.revokeObjectURL(url));};},[]);
  async function render(){
    if(busy)return;setBusy(true);setError('');
    try{
      trimArguments(start,end,duration);let file=source.file;
      if(!file){
        if(!safeMediaUrl(source.url))throw Error('URL video không hợp lệ.');
        const response=await fetch(source.url,{credentials:'omit',redirect:'error',signal:abort.current.signal});
        if(!response.ok||Number(response.headers.get('content-length'))>MAX_EDIT_VIDEO_BYTES)throw Error('Không đọc được video, hoặc file vượt 100 MiB.');
        const reader=response.body.getReader(),chunks=[];let size=0;
        try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_EDIT_VIDEO_BYTES)throw Error('Video vượt 100 MiB.');chunks.push(value);}}finally{await reader.cancel();}
        file=new File(chunks,'source.mp4',{type:response.headers.get('content-type')?.split(';')[0]||'video/mp4'});
      }
      await readEditVideo(file);const edited=await trimVideo(file,start,end,duration);
      if(!live.current)return;const url=URL.createObjectURL(edited);objectUrls.current.push(url);setResult({file:edited,url});
    }catch(e){if(live.current)setError(e.message);}finally{if(live.current)setBusy(false);}
  }
  return <div className="absolute inset-0 z-10 flex flex-col rounded-2xl bg-slate-900 p-5" data-video-editor>
    <div className="mb-4 flex items-center justify-between"><h3 className="font-bold">Edit Video · Cắt bản sao</h3><button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-700 px-3 py-2">Đóng editor</button></div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto"><video crossOrigin="anonymous" ref={video} src={source.url} controls className="mx-auto max-h-64 w-full bg-black" onLoadedMetadata={e=>{const d=e.currentTarget.duration;if(!Number.isFinite(d)||d<=0||d>600){setError('Chỉ chỉnh sửa video tối đa 10 phút.');return;}setDuration(d);setEnd(d);}}/>
      <div className="grid grid-cols-2 gap-3">{[['Bắt đầu (giây)',start,setStart],['Kết thúc (giây)',end,setEnd]].map(([label,value,set])=><label key={label} className="text-sm">{label}<input aria-label={label} type="number" min="0" max={duration} step="0.1" value={value} disabled={busy} onChange={e=>{set(Number(e.target.value));setResult(null);}} className="mt-1 w-full rounded-lg bg-slate-950 p-2"/></label>)}</div>
      <button type="button" disabled={busy||!duration} onClick={render} className="rounded-lg bg-blue-600 px-4 py-2 disabled:opacity-40">{busy?'Đang xuất bản cắt…':'Tạo bản xem trước'}</button>
      {result&&<div className="space-y-3"><video crossOrigin="anonymous" src={result.url} controls className="max-h-56 w-full bg-black"/><a href={result.url} download="edited-video.mp4" className="text-sm underline">Tải bản cắt</a><button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{if(await onSave(result.file)===false)setError('Không lưu được OUTPUT. Đóng editor để xem thông báo chi tiết; bản gốc vẫn được giữ.');}catch(e){setError(e.message);}finally{if(live.current)setBusy(false);}}} className="ml-4 rounded-lg bg-emerald-600 px-4 py-2">Lưu bản cắt vào OUTPUT</button></div>}
      <p className="text-xs text-slate-400">Xử lý trên máy. Chỉ nút Lưu mới cập nhật OUTPUT; video gốc được giữ trong lịch sử. Không tạo video AI.</p>
      {error&&<p role="alert" className="text-sm text-amber-300">{error}</p>}</div>
  </div>;
}
