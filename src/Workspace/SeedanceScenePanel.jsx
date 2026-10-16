import { useEffect,useRef,useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { SceneVisualProfileAccess } from './VisualProfiles.jsx';
import { readVideoImage } from '../lib/seedanceImageClient.js';
import { createVideoController } from '../lib/seedanceClient.js';
import { ASPECTS,DEFAULT_SETTINGS,composeScene,planDuration,estimateCost,MODEL,MAX_PROMPT_CHARS } from '../lib/seedanceContract.js';
const button='rounded-lg border border-emerald-500/50 px-3 py-2 text-sm font-semibold disabled:opacity-40';
export default function SeedanceScenePanel({scene,projectId,characters,onClose}){
  const auth=useAuth();
  return <SceneVisualProfileAccess scene={scene} characters={characters} projectId={projectId}>{resolved=>
    <Editor key={JSON.stringify([projectId,auth.userId,auth.sessionId,auth.isSignedIn,scene,resolved.profile?.visualId,resolved.profile?.visualDescription,resolved.profile?.referenceImage?.sha256])}
      scene={scene} projectId={projectId} auth={auth} resolved={resolved} onClose={onClose}/>
  }</SceneVisualProfileAccess>;
}
function Editor({scene,projectId,auth,resolved,onClose}){
  const [settings,setSettings]=useState({...DEFAULT_SETTINGS});
  const [assumptions,setAssumptions]=useState({wordsPerMinute:150,pauseSeconds:.8});
  const [image,setImage]=useState(null),[reading,setReading]=useState(false),[state,setState]=useState({status:'idle',busy:false});
  const [confirm,setConfirm]=useState(false),[transfer,setTransfer]=useState(false),[mediaError,setMediaError]=useState(false);
  const selection=useRef({revision:0});
  const [controller]=useState(()=>createVideoController({getToken:auth.getToken,onChange:setState}));
  useEffect(()=>{
    const selected=selection.current;
    const leave=()=>{selected.revision++;controller.cancel(false);};
    globalThis.addEventListener('pagehide',leave);
    return()=>{leave();globalThis.removeEventListener('pagehide',leave);};
  },[controller]);
  function invalidate(){
    controller.cancel(false);setConfirm(false);setTransfer(false);setMediaError(false);setState({status:'idle',busy:false});
  }
  const profile=null; // The saved scene Character is the only effective identity.
  let composed=null,plan=null,issue='';
  try{composed=composeScene(scene,profile);plan=planDuration(composed.dialogue,assumptions);
    if(!plan.fits)issue='Lời thoại ước tính cần '+plan.seconds+' giây, vượt 9 giây. Cần người dùng rà soát; không tự chia/cắt lời thoại.';
    else if(settings.duration<Math.ceil(plan.seconds))issue='Thời lượng đang chọn ngắn hơn ước tính '+plan.seconds+' giây. Hãy tăng thời lượng.';
  }catch(error){issue=error.message;}
  let cost=null;
  try{cost=estimateCost(settings);}catch{issue ||= 'Thông số video không hợp lệ.';}
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
  function setting(key,value){invalidate();setSettings(previous=>({...previous,[key]:value}));}
  const quote=state.quote;
  const labels={quoting:'Đang kiểm tra ảnh và lập báo giá…',uploading:'Đang upload ảnh…',submitting:'Đang gửi tới WaveSpeed…',recovering:'Đang tìm lại lần gửi…',queued:'Đang chờ video từ WaveSpeed…',running:'WaveSpeed đang tạo video…',completed:'Video đã sẵn sàng. Cần tự kiểm tra lời thoại.',failed:'Provider/upload lỗi; không tự gửi lại.',cancelled:'Provider báo đã hủy.',timeout:'Provider báo timeout.',deleted:'Provider báo đã xóa.'};
  return <section aria-label={'Seedance scene '+scene.scene_n} data-video-state={state.status}
    className="my-4 rounded-2xl border border-emerald-500/50 bg-slate-950 text-slate-100 p-5 space-y-4">
    <div className="flex justify-between gap-4"><h3 className="font-bold">Generate Video — Scene {scene.scene_n}</h3><button className={button} onClick={onClose}>Đóng</button></div>
    <p className="text-xs text-slate-400">WaveSpeed · Seedance 1.5 Pro Standard · một scene · chưa lưu Cloud. Không cần Qwen Set ID. Đóng hoặc đổi scene chỉ dừng chờ trên giao diện; job provider có thể vẫn chạy.</p>
    <button className={button} disabled={!auth.isSignedIn||state.busy} onClick={()=>{setConfirm(false);setTransfer(false);controller.discover(projectId,scene.scene_n);}}>Tìm / khôi phục lần gửi</button>
    {state.attempts?.map(a=><div key={a.job_id} className="text-xs break-all">{new Date(a.created_at).toLocaleString()} · {a.stage} · {a.job_id}
      <button className={button} onClick={()=>controller.recover(a.job_id,scene.scene_n)}>Khôi phục / kiểm tra trạng thái</button>
    </div>)}
    {state.attemptId&&<p className="text-xs break-all">Mã lần gửi local: {state.attemptId}. Giữ nguyên phiên Clerk để khôi phục.</p>}
    <details open><summary>Nội dung scene gốc — chỉ đọc</summary><dl className="mt-3 space-y-2 text-xs" data-original-scene>
      {Object.entries(scene).map(([key,value])=><div key={key}><dt className="font-bold text-emerald-300">{key}</dt><dd className="whitespace-pre-wrap break-words">{typeof value==='string'?value:JSON.stringify(value)}</dd></div>)}
    </dl></details>
    <p className="text-xs">Ảnh OpenFrame/R2 hiện chưa được xác minh quyền truy cập cho provider. Chọn bản ảnh gốc từ máy; không thay ảnh hoặc dữ liệu scene đang lưu.</p>
    <label className="block">Ảnh tham chiếu PNG/JPEG, tối đa 25 MiB / 24 MP
      <input type="file" accept="image/png,image/jpeg" onChange={choose} disabled={state.busy} className="block my-2"/>
    </label>
    {image&&<img src={image.dataUrl} alt="Ảnh sẽ chuyển tới WaveSpeed sau khi xác nhận" onError={()=>{invalidate();setImage(null);setState({status:'error',busy:false,message:'Không giải mã được ảnh PNG/JPEG. Hãy chọn file ảnh hợp lệ.'});}} className="max-h-64 max-w-full rounded object-contain"/>}
    {image&&<p className="text-xs break-all">{image.name} · {image.size} byte · {image.width}×{image.height} px · SHA-256: {image.image_sha256}. Giữ nguyên file gốc.</p>}
    <p className="text-xs text-amber-300">Chấp nhận ảnh local không bảo đảm WaveSpeed chấp nhận: giới hạn byte/pixel riêng của Seedance chưa được xác minh. Không tự nén, đổi định dạng hoặc thu nhỏ ảnh. Báo giá local chưa phải kiểm tra provider.</p>
    <p className="text-xs">{resolved.status==='confirmed'?'Character ID đã lưu: '+resolved.identity.confirmedId:'Dùng Character hiện có; chưa có Character ID được lưu.'}</p>
    {composed?.spokenSource==='Voiceover'&&<p className="text-amber-300">Dữ liệu Full AI cũ: đọc lời thoại nguyên văn từ Voiceover; không đổi scene.</p>}
    <label className="block text-sm">Prompt đầy đủ, tạm thời ({MAX_PROMPT_CHARS} ký tự tối đa của ứng dụng)
      <textarea aria-label="Seedance prompt" readOnly value={composed?.prompt||''} rows={10} className="mt-2 w-full rounded bg-slate-900 p-3 text-xs"/>
    </label>
    <p className="text-xs">Translate được giữ riêng và không đưa vào phần lời nói. Các field trống không được bổ sung nội dung.</p>
    <fieldset disabled={state.busy} className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
      <label>Tốc độ nói (từ/phút)<input aria-label="Tốc độ nói" className="block w-full bg-slate-800 p-2" type="number" min="80" max="220" value={assumptions.wordsPerMinute} onChange={e=>{invalidate();setAssumptions({...assumptions,wordsPerMinute:Number(e.target.value)});}}/></label>
      <label>Khoảng nghỉ (giây)<input aria-label="Khoảng nghỉ" className="block w-full bg-slate-800 p-2" type="number" min="0" max="3" step=".1" value={assumptions.pauseSeconds} onChange={e=>{invalidate();setAssumptions({...assumptions,pauseSeconds:Number(e.target.value)});}}/></label>
      <label>Thời lượng<select aria-label="Thời lượng" className="block w-full bg-slate-800 p-2" value={settings.duration} onChange={e=>setting('duration',Number(e.target.value))}>{[4,5,6,7,8,9].map(n=><option key={n} value={n}>{n} giây</option>)}</select></label>
      <label>Độ phân giải<select aria-label="Độ phân giải" className="block w-full bg-slate-800 p-2" value={settings.resolution} onChange={e=>setting('resolution',e.target.value)}>{['480p','720p'].map(v=><option key={v}>{v}</option>)}</select></label>
      <label>Tỷ lệ khung hình<select aria-label="Tỷ lệ khung hình" className="block w-full bg-slate-800 p-2" value={settings.aspect_ratio} onChange={e=>setting('aspect_ratio',e.target.value)}>{ASPECTS.map(v=><option key={v}>{v}</option>)}</select></label>
      <label>Seed<input aria-label="Seed" type="number" min="-1" max="2147483647" className="block w-full bg-slate-800 p-2" value={settings.seed} onChange={e=>setting('seed',Number(e.target.value))}/></label>
      <label><input type="checkbox" checked={settings.generate_audio} onChange={e=>setting('generate_audio',e.target.checked)}/> Âm thanh Seedance</label>
      <label><input type="checkbox" checked={settings.camera_fixed} onChange={e=>setting('camera_fixed',e.target.checked)}/> camera_fixed — cố định camera</label>
    </fieldset>
    <p className="text-xs">Camera gốc: {scene.Camera||'(trống)'}. Kiểm tra camera_fixed trước khi xác nhận; tắt không thêm chỉ dẫn chuyển động. Seed -1 là ngẫu nhiên.</p>
    {plan&&<p className="text-sm">{plan.words} từ × 60 / {plan.wordsPerMinute} + {plan.words?plan.pauseSeconds:0} giây nghỉ ≈ {plan.seconds} giây. Gợi ý: {plan.suggested===null?'không vừa 4–9 giây':plan.suggested+' giây'}.
      {plan.suggested!==null&&<button className="ml-2 underline" disabled={state.busy} onClick={()=>setting('duration',plan.suggested)}>Dùng gợi ý</button>}</p>}
    {issue&&<p role="alert" className="text-amber-300">{issue}</p>}
    <p className="text-sm">Ước tính: {cost?'USD '+cost.usd:'Giá chưa xác minh — chặn gửi'}. Đây là giá tham khảo, phí thực tế có thể khác.</p>
    <p className="text-xs text-amber-300">Seedance không bảo đảm đọc Dialogue nguyên văn hoặc đồng bộ chính xác. Cần nghe và kiểm tra video trả về. Tắt âm thanh không gọi Generate Audio hiện có.</p>
    <button className={button} disabled={!auth.isSignedIn||!image||reading||state.busy||!!issue||!cost} onClick={()=>{setConfirm(false);setTransfer(false);controller.quote({projectType:'full-ai',project_id:projectId,scene,profile,settings,assumptions,image_base64:image.image_base64,mime_type:image.mime_type});}}>Kiểm tra ảnh &amp; lấy báo giá</button>
    <p className="text-xs">Bước báo giá chỉ chuyển ảnh đến backend local để kiểm tra; chưa upload WaveSpeed và chưa tính phí.</p>
    {quote&&<div className="space-y-3 border border-amber-400/40 p-4 rounded">
      <p>{MODEL} · Scene {quote.scene_id} · {quote.settings.duration}s · {quote.settings.resolution} · {quote.settings.aspect_ratio} · audio {String(quote.settings.generate_audio)} · camera_fixed {String(quote.settings.camera_fixed)} · seed {quote.settings.seed}</p>
      <p className="font-bold">Giá tham khảo USD {quote.cost.usd}</p>
      <p className="text-xs"><a href={quote.cost.source} target="_blank" rel="noopener noreferrer" className="underline">Nguồn giá chính thức</a> · kiểm tra {quote.cost.verifiedDate} · xác nhận hết hạn {new Date(quote.expires_at).toLocaleTimeString()}</p>
      <p className="text-xs break-all">Ảnh SHA-256: {quote.image_sha256}<br/>Prompt SHA-256: {quote.prompt_sha256}</p>
      <label className="block"><input type="checkbox" checked={transfer} onChange={e=>setTransfer(e.target.checked)}/> Tôi đồng ý chuyển đúng ảnh đã xem sang WaveSpeed (bao gồm metadata trong file).</label>
      <label className="block"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/> Tôi xác nhận prompt, camera, thông số và phí tham khảo cho MỘT video này; phí thực tế có thể khác.</label>
      {!quote.paid_enabled&&<p role="status" className="text-amber-300">Backend đang tắt gửi yêu cầu tính phí. Chưa upload ảnh tới provider.</p>}
      {quote.retry_predecessor_id&&<div className="space-y-2 text-sm">
        <p>Lần trước thất bại trước khi gửi prediction. Thử lại sẽ tạo một lần gửi mới có thể tính phí; giữ nguyên bản ghi cũ.</p>
        <p className="text-xs break-all">Lần trước: {quote.retry_predecessor_id}</p>
        <button className={button} disabled={!confirm||!transfer||!quote.paid_enabled||state.busy||state.retryAuthorized}
          onClick={()=>controller.authorizeRetry(confirm,transfer)}>{state.retryAuthorized?'Đã phê duyệt thử lại một lần':'Phê duyệt thử lại một lần'}</button>
      </div>}
      <button className={button} disabled={!confirm||!transfer||!quote.paid_enabled||state.busy||!!quote.retry_predecessor_id&&!state.retryAuthorized} onClick={()=>controller.submit(confirm,transfer)}>Generate Video — xác nhận tính phí</button>
    </div>}
    <p role="status" aria-live="polite">{reading?'Đang đọc ảnh…':state.message||labels[state.status]||''}</p>
    {state.busy&&<button className={button} onClick={()=>controller.cancel()}>Cancel Waiting</button>}
    {state.status==='completed'&&state.result&&<div data-seedance-result className="space-y-2">
      <video src={state.result} crossOrigin="anonymous" referrerPolicy="no-referrer" controls onError={()=>setMediaError(true)} className="max-h-96 w-full"/>
      <a href={state.result} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" download={'Scene_'+scene.scene_n+'.mp4'} className="underline">Mở / tải video</a>
      <p className="text-xs">URL provider tạm thời; chưa lưu Cloud. Nếu trình duyệt mở tab thay vì tải, dùng chức năng lưu video. Lời thoại chưa được kiểm chứng.</p>
      {mediaError&&<p role="alert">Không phát được video: URL có thể hết hạn hoặc không cho phép phát nhúng. Thử liên kết tải; không tự tạo lại video.</p>}
    </div>}
    {!auth.isSignedIn&&<p>Đăng nhập trước khi lấy báo giá.</p>}
  </section>;
}
