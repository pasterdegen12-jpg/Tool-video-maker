import { useEffect,useRef,useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { SceneVisualProfileAccess } from './VisualProfiles.jsx';
import { readVideoImage } from '../lib/seedanceImageClient.js';
import { createVideoController } from '../lib/seedanceClient.js';
import { createCloudVideoController } from '../lib/cloudVideoClient.js';
import { DEFAULT_SETTINGS,composeScene,planDuration } from '../lib/seedanceContract.js';
import { Loader2, Video, Download, RefreshCw, X, ImageIcon, Play } from 'lucide-react';

const cn=(...args)=>args.filter(Boolean).join(' ');
export default function SeedanceScenePanel({scene,projectId,characters,onClose}){
  const auth=useAuth();
  return <SceneVisualProfileAccess scene={scene} characters={characters} projectId={projectId}>{resolved=>
    <Editor key={JSON.stringify([projectId,auth.userId,auth.sessionId,auth.isSignedIn,scene,resolved.profile?.visualId,resolved.profile?.visualDescription,resolved.profile?.referenceImage?.sha256])}
      scene={scene} projectId={projectId} auth={auth} resolved={resolved} onClose={onClose}/>
  }</SceneVisualProfileAccess>;
}
function Editor({scene,projectId,auth,resolved,onClose}){
  const [settings]=useState({...DEFAULT_SETTINGS});
  const [assumptions]=useState({wordsPerMinute:150,pauseSeconds:.8});
  const [image,setImage]=useState(null),[reading,setReading]=useState(false),[state,setState]=useState({status:'idle',busy:false});
  const [mediaError,setMediaError]=useState(false);
  const selection=useRef({revision:0});
  const cloud=import.meta.env.VITE_CLOUD_VIDEO_ENABLED==='true'&&globalThis.location?.protocol==='https:';
  const [controller]=useState(()=>(cloud?createCloudVideoController:createVideoController)({getToken:auth.getToken,onChange:setState}));
  useEffect(()=>{
    const selected=selection.current;
    const leave=()=>{selected.revision++;controller.cancel(false);};
    globalThis.addEventListener('pagehide',leave);
    return()=>{leave();globalThis.removeEventListener('pagehide',leave);};
  },[controller]);
  function invalidate(){controller.cancel(false);setState({status:'idle',busy:false});setMediaError(false);}
  // Validate scene can compose a prompt; block generation if not.
  let composed=null,plan=null,issue='';
  try{composed=composeScene(scene);plan=planDuration(composed.dialogue,assumptions);
    if(!plan.fits)issue='Lời thoại ước tính vượt 9 giây. Liên hệ quản trị viên.';
    else if(settings.duration<Math.ceil(plan.seconds))issue='Thời lượng ngắn hơn ước tính. Liên hệ quản trị viên.';
  }catch(error){issue=error.message;}
  async function choose(event){
    const file=event.target.files?.[0];event.target.value='';
    const revision=++selection.current.revision;invalidate();setImage(null);setReading(false);
    if(!file)return;
    if(!['image/png','image/jpeg'].includes(file.type)){setState({status:'error',busy:false,message:'Chỉ hỗ trợ PNG/JPEG tối đa 25 MiB / 24 MP.'});return;}
    setReading(true);
    try{const selected=await readVideoImage(file);if(selection.current.revision===revision)setImage(selected);}
    catch(error){if(selection.current.revision===revision)setState({status:'error',busy:false,message:error.message});}
    finally{if(selection.current.revision===revision)setReading(false);}
  }
  async function genVideo(){
    if(!image||reading||state.busy||!!issue||!auth.isSignedIn)return;
    await controller.generate({
      projectType:'full-ai',project_id:projectId,scene,profile:null,
      settings,assumptions,
      image_base64:image.image_base64,mime_type:image.mime_type,
    });
  }
  // Status label shown during processing
  const statusLabel={
    idle:'',quoting:'Đang chuẩn bị video...',uploading:'Đang tải ảnh...',
    submitting:'Đang tạo video...',recovering:'Đang tìm lần gửi...',
    queued:'Đang chờ video từ WaveSpeed...',running:'Đang tạo video...',
    completed:'Đã tạo video thành công',
    failed:'Tạo video thất bại. Thử lại hoặc liên hệ quản trị viên.',
    admission_unknown:'Đang tạo video...',stopped:'',error:'',recovered:'',
  };
  const isCompleted=state.status==='completed'&&state.result;
  const isFailed=state.status==='failed'||state.status==='error';
  const isRunning=state.busy||state.status==='queued'||state.status==='running';
  const canGenerate=auth.isSignedIn&&!!image&&!reading&&!state.busy&&!issue;
  return <section aria-label={'Seedance scene '+scene.scene_n} data-video-state={state.status}
    className="my-4 rounded-2xl border border-emerald-500/40 bg-slate-950 text-slate-100 p-5 space-y-4">
    {/* Header */}
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Video size={18} className="text-emerald-400"/>
        <h3 className="font-bold text-base">Gen Video — Scene {scene.scene_n}</h3>
      </div>
      <button className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800 transition-colors" onClick={onClose}><X size={14}/></button>
    </div>
    {/* Image picker */}
    <div className="space-y-2">
      <label className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 cursor-pointer transition-colors",
        image?"border-emerald-500/50 bg-emerald-950/20":"border-slate-700 hover:border-slate-600",
        state.busy&&"pointer-events-none opacity-60")}>
        {reading
          ?<><Loader2 size={24} className="animate-spin text-emerald-400"/><span className="text-sm text-slate-400">Đang đọc ảnh...</span></>
          :image
            ?<><img src={image.dataUrl} alt="Ảnh tham chiếu" className="max-h-48 max-w-full rounded-lg object-contain"/>
                <span className="text-xs text-slate-400">{image.name} · {image.size.toLocaleString()} byte · {image.width}×{image.height}</span>
                <span className="text-xs text-emerald-400">Nhấn để đổi ảnh</span></>
            :<><ImageIcon size={32} className="text-slate-600"/>
                <span className="text-sm text-slate-400">Chọn ảnh tham chiếu PNG/JPEG</span>
                <span className="text-xs text-slate-500">Tối đa 25 MiB / 24 MP</span></>}
        <input type="file" accept="image/png,image/jpeg" onChange={choose} disabled={state.busy} className="hidden"/>
      </label>
    </div>
    {/* Issue warning */}
    {issue&&<p role="alert" className="text-sm text-amber-400 bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-2">{issue}</p>}
    {/* Gen Video button */}
    {!isCompleted&&<button
      disabled={!canGenerate}
      onClick={genVideo}
      className={cn("w-full h-12 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
        canGenerate?"bg-emerald-600 hover:bg-emerald-500 text-white shadow-md":"bg-slate-800 text-slate-500 cursor-not-allowed")}>
      {isRunning
        ?<><Loader2 size={18} className="animate-spin"/><span>{statusLabel[state.status]||'Đang xử lý...'}</span></>
        :<><Play size={18}/><span>Gen Video</span></>}
    </button>}
    {/* Status message */}
    {(state.message||statusLabel[state.status])&&!isCompleted&&
      <p role="status" aria-live="polite" className={cn("text-sm text-center",isFailed?"text-red-400":"text-slate-400")}>
        {isFailed?(state.message||statusLabel[state.status]):(!isRunning?(state.message||''):'')}
      </p>}
    {/* Cancel while running */}
    {isRunning&&<button className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800 transition-colors" onClick={()=>controller.cancel()}>Hủy chờ</button>}
    {/* Completed video */}
    {isCompleted&&<div className="space-y-3" data-seedance-result>
      <p className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5"><Video size={16}/>Đã tạo video thành công</p>
      <video src={state.result} crossOrigin="anonymous" referrerPolicy="no-referrer" controls
        onError={()=>setMediaError(true)} className="w-full rounded-xl max-h-96 bg-black"/>
      <a href={state.result} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" download={'Scene_'+scene.scene_n+'.mp4'}
        className="flex items-center justify-center gap-2 w-full h-10 rounded-xl border border-emerald-500/50 text-sm font-semibold hover:bg-emerald-950/40 transition-colors">
        <Download size={15}/>Tải video
      </a>
      {mediaError&&<p role="alert" className="text-xs text-amber-400">Không phát được video: URL có thể hết hạn. Dùng nút tải. Không tự tạo lại.</p>}
      <p className="text-xs text-slate-500">Job và liên kết video được lưu durable. Dùng Khôi phục sau khi tải lại trang. Lời thoại cần nghe kiểm tra.</p>
    </div>}
    {/* Retry/failed state - allow retry */}
    {isFailed&&!isRunning&&<div className="space-y-2">
      <p className="text-sm text-red-400 text-center">{state.message||statusLabel[state.status]}</p>
      {image&&<button disabled={!canGenerate} onClick={genVideo}
        className={cn("w-full h-10 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-colors",
          canGenerate?"border-emerald-500/50 hover:bg-emerald-950/30":"border-slate-700 text-slate-500 cursor-not-allowed")}>
        <RefreshCw size={14}/>Thử lại
      </button>}
    </div>}
    {/* Recovery controls */}
    <details className="text-xs">
      <summary className="cursor-pointer text-slate-500 hover:text-slate-400 select-none">Khôi phục / tìm lần gửi cũ</summary>
      <div className="mt-2 space-y-2">
        <button className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800 transition-colors disabled:opacity-40"
          disabled={!auth.isSignedIn||state.busy} onClick={()=>controller.discover(projectId,scene.scene_n)}>Tìm / khôi phục lần gửi</button>
        {state.attempts?.map(a=><div key={a.job_id} className="text-xs break-all border border-slate-800 rounded-lg p-2 space-y-1">
          <p>{new Date(a.created_at).toLocaleString()} · {a.stage} · <span className="text-slate-500">{a.job_id}</span></p>
          <button className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800 transition-colors" onClick={()=>controller.recover(a.job_id,scene.scene_n)}>Khôi phục</button>
        </div>)}
        {state.attemptId&&<p className="text-slate-500 break-all">Mã lần gửi: {state.attemptId}</p>}
        {state.status==='recovered'&&!state.attempts?.length&&<p className="text-slate-500">Chưa có job cloud cho scene này.</p>}
      </div>
    </details>
    {!auth.isSignedIn&&<p className="text-sm text-amber-400">Đăng nhập trước khi tạo video.</p>}
  </section>;
}
