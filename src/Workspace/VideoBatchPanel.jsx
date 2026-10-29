import {useEffect,useRef,useState} from 'react';
import {useAuth} from '@clerk/clerk-react';
import {createPortal} from 'react-dom';
import {createVideoBatchClient} from '../lib/videoBatchClient.js';
import {BATCH_LABELS} from '../lib/videoBatchPlan.js';
import {VIDEO_MODES} from '../lib/cloudVideoOptions.js';

const button='rounded-lg border border-slate-600 px-3 py-2 text-sm disabled:opacity-40 hover:bg-slate-800';
export default function VideoBatchPanel(props){const auth=useAuth();return <Panel key={props.projectId+':'+auth.userId} {...props} auth={auth}/>;}
function Panel({projectId,open,onClose,onOutputs,onStates,auth}){
 const [client]=useState(()=>createVideoBatchClient({getToken:auth.getToken}));
 const [plan,setPlan]=useState(null),[selected,setSelected]=useState({}),[batches,setBatches]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const clicked=useRef(false),key=useRef(null),delivered=useRef(new Set()),callbacks=useRef({onOutputs,onStates});
 useEffect(()=>{callbacks.current={onOutputs,onStates};},[onOutputs,onStates]);
 function accept(result){
  setBatches(result.batches);const states={};
  for(const b of result.batches)for(const i of b.items){states[String(i.scene_id)]??=i;
   if(i.state==='completed'&&i.job?.video_url&&!delivered.current.has(i.job.job_id)){delivered.current.add(i.job.job_id);callbacks.current.onOutputs?.(i.scene_id,{url:i.job.video_url,id:i.job.job_id,predictionId:i.job.prediction_id,createdAt:Date.parse(i.job.created_at),options:{mode:i.job.mode,settings:i.job.settings,additional_prompt:i.job.additional_prompt}});}}
  callbacks.current.onStates?.(states);
 }
 useEffect(()=>{
  if(!auth.isSignedIn)return;let live=true,timer,retries=0;
  async function refresh(){
   let delay=15000;
   try{const result=await client.list(projectId);if(!live)return;accept(result);retries=0;
    if(result.batches.some(b=>b.status==='running')){const progressed=await client.tick(projectId);if(!live)return;accept(progressed);delay=6000;}
   }catch(e){if(!live)return;setError(e.message);retries++;delay=Math.max(15000,Math.min(300000,(e.retryAfter||2**Math.min(retries,6)*5)*1000));}
   if(live)timer=setTimeout(refresh,delay);
  }
  void refresh();return()=>{live=false;clearTimeout(timer);};
  // Stable authenticated project lifetime; no rerender quote/dispatch loop.
 },[client,projectId,auth.isSignedIn]);
 useEffect(()=>{
  if(!open||!auth.isSignedIn)return;let live=true;
  Promise.resolve().then(async()=>{if(!live)return;setBusy(true);setPlan(null);setSelected({});setError('');key.current=null;return client.plan(projectId);}).then(p=>{if(live&&p){setPlan(p);setSelected(Object.fromEntries(p.scenes.filter(s=>s.eligible).map(s=>[s.scene_id,true])));}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setBusy(false);});return()=>{live=false;};
 },[open,client,projectId,auth.isSignedIn]);
 const chosen=(plan?.scenes||[]).filter(s=>s.eligible&&selected[s.scene_id]);
 async function generate(){
  if(clicked.current||!chosen.length)return;clicked.current=true;setBusy(true);setError('');key.current||=crypto.randomUUID();
  try{accept(await client.create(projectId,chosen.map(s=>({scene_id:s.scene_id,digest:s.digest})),key.current));setSelected({});onClose();}
  catch(e){setError(e.message);}finally{clicked.current=false;setBusy(false);}
 }
 const running=batches.filter(b=>b.status==='running');
 return <>
  {batches.length>0&&<section aria-label="Tiến độ lô video" className="rounded-xl border border-emerald-800 bg-slate-900 p-3 text-sm text-slate-200 mb-3">
   {batches.slice(0,5).map(b=><div key={b.batch_id} className="py-2"><p>{b.status==='completed'?'Hoàn thành':b.status==='finished_with_errors'?'Đã kết thúc — có lỗi':b.status==='running'?'Lô đang xử lý':'Lô đã kết thúc'} · {b.counts.selected} scene: chờ {b.counts.queued}, đang tạo {b.counts.running}, xong {b.counts.completed}, lỗi {b.counts.failed}, bỏ qua {b.counts.skipped+b.counts.cancelled}</p>
    <details><summary className="cursor-pointer text-emerald-400">Trạng thái từng scene</summary>{b.items.map(i=><p key={i.scene_id}>Scene {i.scene_id}: {BATCH_LABELS[i.state]||i.state}{i.error?' · '+i.error:''}</p>)}</details>
    {b.status==='running'&&<button className={button+' mt-2'} onClick={()=>client.cancel(projectId,b.batch_id).then(accept).catch(e=>setError(e.message))}>Dừng các scene chưa gửi</button>}
   </div>)}
   {running.length>0&&<p className="text-xs text-slate-400">Giữ dự án mở để tiếp tục hàng đợi. Nếu đóng hết trình duyệt, job đã gửi vẫn chạy; scene chờ sẽ tiếp tục khi mở lại. Dừng hàng đợi không hủy job đã gửi.</p>}
   {error&&<p role="status" className="text-amber-300">{error}</p>}
  </section>}
  {open&&createPortal(<div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
   <section role="dialog" aria-modal="true" aria-label="Gen All Video" className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl">
    <h2 className="text-lg font-bold">Gen All Video</h2><p className="mt-2 text-sm text-slate-400">Chọn scene cần tạo. Giữ nguyên thiết lập từng scene; ảnh và OUTPUT cũ không bị thay đổi khi chọn.</p>
    <p className="my-2 text-xs text-slate-400">Hàng đợi tiếp tục khi dự án mở. Tối đa {plan?.concurrency||1} job đang tạo theo cấu hình hiện tại.</p>
    <div className="flex gap-2 my-4"><button className={button} disabled={busy} onClick={()=>{key.current=null;setSelected(Object.fromEntries((plan?.scenes||[]).filter(s=>s.eligible).map(s=>[s.scene_id,true])));}}>Chọn tất cả đủ điều kiện</button><button className={button} disabled={busy} onClick={()=>{key.current=null;setSelected({});}}>Bỏ chọn tất cả</button></div>
    <div className="space-y-2">{plan?.scenes.map(s=><label key={s.scene_id} className="flex gap-3 rounded-xl border border-slate-800 p-3">
     <input type="checkbox" aria-label={'Chọn Scene '+s.scene_id} checked={!!selected[s.scene_id]} disabled={busy||!s.eligible} onChange={e=>{key.current=null;setSelected(v=>({...v,[s.scene_id]:e.target.checked}));}}/>
     <span className="text-sm"><strong>Scene {s.scene_id} · {s.character}</strong><span className="block text-xs text-slate-400">{s.reason||'Sẵn sàng'}{s.settings?' · '+VIDEO_MODES[s.mode]?.label+' · '+s.settings.aspect_ratio+' · '+s.settings.resolution:''}</span>{s.additional_prompt&&<span className="block text-xs">Custom prompt: {s.additional_prompt}</span>}</span>
    </label>)}</div>
    {error&&<p role="alert" className="my-3 text-amber-300">{error}</p>}
    <footer className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 bg-slate-900 pt-4">
     <p>{chosen.length} scene đã chọn · Ước tính ${ (chosen.reduce((n,s)=>n+s.cost.microUsd,0)/1e6).toFixed(4)}</p>
     <button className={button} onClick={onClose}>Đóng</button><button className="rounded-xl bg-emerald-600 px-4 py-2 font-bold disabled:opacity-40" disabled={busy||!chosen.length||!auth.isSignedIn} onClick={generate}>Generate {chosen.length} Videos</button>
    </footer>
   </section>
  </div>,document.body)}
 </>;
}
