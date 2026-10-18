import {useEffect,useRef,useState} from 'react';
import {useAuth} from '@clerk/clerk-react';
import {createCloudVideoController} from '../lib/cloudVideoClient.js';
import {readVideoImage} from '../lib/seedanceImageClient.js';
import {safeMediaUrl} from '../lib/seedanceContract.js';
import {sceneVideoPlan} from '../lib/cloudVideoContract.js';
import {Loader2,Play} from 'lucide-react';

// Mounted once per stable project/scene/source/session, never as a global selection.
export default function SceneVideoAction(props){
  const auth=useAuth();
  return <Action key={JSON.stringify([props.projectId,props.scene,auth.userId,auth.sessionId])} {...props} auth={auth}/>;
}
function Action({scene,projectId,auth,onCompleted,recoveryReady=false,recoveryError='',recoveryJob}){
  const saved=scene.videoJob?.state==='completed'&&safeMediaUrl(scene.videoUrl);
  const recoveryId=recoveryJob?.job_id;
  const delivered=useRef(null);
  const [state,setState]=useState(()=>saved?{status:'completed',busy:false,blocked:true}:{status:'idle',busy:false});
  const [image,setImage]=useState(null),[picker,setPicker]=useState(false),[reading,setReading]=useState(false);
  const [controller]=useState(()=>createCloudVideoController({getToken:auth.getToken,onChange:setState}));
  const selection=useRef({revision:0}),clicked=useRef(false);
  let effective=null,issue='';
  try{effective=sceneVideoPlan(scene);}catch(e){issue=e.message;}
  useEffect(()=>{
    const selected=selection.current;
    if(auth.isSignedIn&&!saved&&recoveryId)void controller.recover(recoveryId,scene.scene_n);
    return()=>{selected.revision++;controller.cancel(false);};
  },[controller,projectId,scene.scene_n,auth.isSignedIn,saved,recoveryId]);
  useEffect(()=>{
    if(state.result&&state.attemptId&&delivered.current!==state.attemptId){delivered.current=state.attemptId;onCompleted?.(scene.scene_n,{url:state.result,id:state.attemptId,predictionId:state.predictionId,createdAt:state.createdAt});}
  },[state.result,state.attemptId,state.predictionId,state.createdAt,onCompleted,scene.scene_n]);
  async function generate(){
    if(clicked.current||state.busy||state.blocked||reading||!auth.isSignedIn)return;
    if(issue){setState({status:'error',busy:false,message:issue});return;}
    if(!image&&!(scene.startFrameUrl||scene.imageUrl)){setPicker(true);return;}
    clicked.current=true;
    try{await controller.generate({project_id:projectId,scene,...effective,
      ...(image?{image_base64:image.image_base64,mime_type:image.mime_type}:{stored_image:true})});}
    finally{clicked.current=false;}
  }
  async function choose(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    const current=++selection.current.revision;setReading(true);setImage(null);
    try{const value=await readVideoImage(file);if(current===selection.current.revision){setImage(value);setState({status:'idle',busy:false});}}
    catch(e){if(current===selection.current.revision)setState({status:'error',busy:false,message:e.message});}
    finally{if(current===selection.current.revision)setReading(false);}
  }
  const failed=state.status==='error'||state.status==='failed';
  const label={quoting:'Đang chuẩn bị...',uploading:'Đang tải ảnh...',submitting:'Đang tạo video...',queued:'Đang tạo video...',running:'Đang tạo video...',recovering:'Đang kiểm tra...'}[state.status];
  return <section className="contents" aria-label={'Video scene '+scene.scene_n} data-video-state={state.status}>
    <button type="button" onClick={generate} disabled={state.busy||state.blocked||reading||!auth.isSignedIn||!recoveryReady||!!recoveryError}
      className="h-9 px-3 rounded-lg text-xs font-semibold bg-emerald-600 text-white inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
      {state.busy?<Loader2 size={14} className="animate-spin"/>:<Play size={14}/>}{state.status==='completed'?'Đã tạo video':label||(image?'Gen Video':'Gen Video AI')}
    </button>
    {recoveryError&&<p role="alert" className="text-xs text-amber-500">{recoveryError}</p>}
    {!auth.isSignedIn&&<p role="alert">Đăng nhập trước khi tạo video.</p>}
    {(picker||failed&&!state.blocked)&&<label className="block text-sm">{image?'Đổi ảnh cho scene':'Chọn / thay ảnh cho scene'}
      <input aria-label={'Ảnh scene '+scene.scene_n} type="file" accept="image/png,image/jpeg" disabled={state.busy||reading} onChange={choose}/>
    </label>}
    {image&&<img src={image.dataUrl} alt={'Ảnh đã chọn cho scene '+scene.scene_n} className="max-h-40 rounded-lg"/>}
    {reading&&<p role="status">Đang kiểm tra ảnh...</p>}
    {(failed||state.blocked&&!state.result)&&state.message&&<p role="alert" className="text-sm text-amber-500">{state.message}</p>}
    {(state.blocked&&state.status!=='completed'||failed)&&<button type="button" disabled={state.busy} onClick={()=>controller.discover(projectId,scene.scene_n,true)} className="text-xs underline">Khôi phục trạng thái</button>}
  </section>;
}
