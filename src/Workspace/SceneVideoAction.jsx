import {useEffect,useRef,useState} from 'react';
import {useAuth} from '@clerk/clerk-react';
import {createCloudVideoController} from '../lib/cloudVideoClient.js';
import {safeMediaUrl} from '../lib/seedanceContract.js';
import VideoOptionsModal from './VideoOptionsModal.jsx';
import {Loader2,Play} from 'lucide-react';

export default function SceneVideoAction(props){
  const auth=useAuth();
  return <Action key={JSON.stringify([props.projectId,props.scene,auth.userId,auth.sessionId])} {...props} auth={auth}/>;
}
function Action({scene,projectId,auth,onCompleted,onSaveVideo,outputUrl,recoveryReady=false,recoveryError='',recoveryJob}){
  const saved=scene.videoJob?.state==='completed'&&safeMediaUrl(scene.videoUrl);
  const recoveryId=recoveryJob?.job_id,delivered=useRef(null),clicked=useRef(false);
  const [state,setState]=useState(()=>saved?{status:'completed',busy:false}:{status:'idle',busy:false});
  const [open,setOpen]=useState(false);
  const [controller]=useState(()=>createCloudVideoController({getToken:auth.getToken,onChange:setState}));
  useEffect(()=>{
    if(auth.isSignedIn&&!saved&&recoveryId)void controller.recover(recoveryId,scene.scene_n);
    return()=>controller.cancel(false);
  },[controller,projectId,scene.scene_n,auth.isSignedIn,saved,recoveryId]);
  useEffect(()=>{
    if(state.result&&state.attemptId&&delivered.current!==state.attemptId){delivered.current=state.attemptId;onCompleted?.(scene.scene_n,{url:state.result,id:state.attemptId,predictionId:state.predictionId,createdAt:state.createdAt,options:state.options});}
  },[state.result,state.attemptId,state.predictionId,state.createdAt,state.options,onCompleted,scene.scene_n]);
  const blocked=state.blocked&&state.status!=='completed'||!recoveryReady||!!recoveryError||!auth.isSignedIn;
  async function generate(options){
    if(clicked.current||state.busy||blocked)return;
    clicked.current=true;
    try{await controller.generate({project_id:projectId,scene,...options,attempt_key:crypto.randomUUID()});}
    finally{clicked.current=false;}
  }
  const failed=state.status==='error'||state.status==='failed';
  const label={quoting:'Đang chuẩn bị...',uploading:'Đang tải ảnh...',submitting:'Đang tạo video...',queued:'Đang tạo video...',running:'Đang tạo video...',recovering:'Đang kiểm tra...'}[state.status];
  return <section className="contents" aria-label={'Video scene '+scene.scene_n} data-video-state={state.status}>
    <button type="button" onClick={()=>setOpen(true)} disabled={!auth.isSignedIn}
      className="h-9 px-3 rounded-lg text-xs font-semibold bg-emerald-600 text-white inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
      {state.busy?<Loader2 size={14} className="animate-spin"/>:<Play size={14}/>}Gen Video AI
    </button>
    {label&&<span role="status" className="text-xs text-emerald-400">{label}</span>}
    {recoveryError&&<p role="alert" className="text-xs text-amber-500">{recoveryError}</p>}
    {!auth.isSignedIn&&<p role="alert">Đăng nhập trước khi tạo video.</p>}
    {(failed||state.blocked&&!state.result)&&state.message&&<p role="alert" className="text-sm text-amber-500">{state.message}</p>}
    {(state.blocked&&state.status!=='completed'||failed&&state.attemptId)&&<button type="button" disabled={state.busy} onClick={()=>controller.discover(projectId,scene.scene_n,true)} className="text-xs underline">Khôi phục trạng thái</button>}
    {open&&<VideoOptionsModal scene={scene} outputUrl={state.result||outputUrl||scene.videoUrl} savedOptions={scene.videoJob?.options} busy={state.busy} blocked={blocked} message={recoveryError||state.message||label} onGenerate={generate} onClose={()=>setOpen(false)} onSaveVideo={onSaveVideo}/>}
  </section>;
}
