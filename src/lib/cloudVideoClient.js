const messages={TEAM_FORBIDDEN:'Đã đạt giới hạn tạo video của nhóm. Liên hệ quản trị viên.',PROJECT_FORBIDDEN:'Dự án chưa được cấp quyền tạo video cho tài khoản này.',PROJECT_CHANGED:'Dữ liệu dự án đã thay đổi. Liên hệ quản trị viên.',QUOTE_EXPIRED:'Phiên tạo video hết hạn. Vui lòng thử lại.',CONCURRENCY_LIMIT:'Đã đạt giới hạn tạo video của nhóm. Liên hệ quản trị viên.',SPENDING_LIMIT:'Đã đạt giới hạn tạo video của nhóm. Liên hệ quản trị viên.',UNRESOLVED_ATTEMPT:'Scene đang có yêu cầu chưa hoàn thành. Dùng Khôi phục để kiểm tra.',DUPLICATE_INPUT:'Yêu cầu này đã được gửi. Dùng Khôi phục để xem kết quả.',PAID_DISABLED:'Tạo video thất bại. Thử lại hoặc liên hệ quản trị viên.',RATE_LIMIT:'Có quá nhiều yêu cầu. Đợi một phút rồi thử lại.',IMAGE_HASH_MISMATCH:'Tạo video thất bại. Thử lại hoặc liên hệ quản trị viên.',ARCHIVE_PENDING:'Video đang chờ lưu. Dùng Khôi phục để tiếp tục.',STATUS_UNAVAILABLE:'Chưa đọc được trạng thái. Dùng Khôi phục để kiểm tra.'};
export const videoMessage=code=>messages[String(code).split(';')[0]]||null;
import {composeScene,estimateCost,MODEL,safeMediaUrl} from './seedanceContract.js';
import {imageDimensions} from './seedanceImage.js';
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const sleep=(ms,signal)=>new Promise((resolve,reject)=>{const stop=()=>{clearTimeout(timer);reject(new Error('CANCELLED'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},ms);signal.addEventListener('abort',stop,{once:true});});
export function createCloudVideoController({getToken,onChange,fetchImpl=fetch,now=Date.now,wait=sleep}){
  let active=null,consumed=false;
  const emit=(run,value)=>{if(active===run&&!run.signal.aborted)onChange(value);};
  async function request(action,payload,run,query={}){
    const token=await getToken();if(!token)throw new Error('Cần đăng nhập lại.');
    if(run.signal.aborted)throw new Error('CANCELLED');
    const parameters=new URLSearchParams({action,...query});
    const response=await fetchImpl('/api/video?'+parameters,{method:payload?'POST':'GET',headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.any([run.signal,AbortSignal.timeout(120000)]),credentials:'omit',mode:'same-origin',redirect:'error',cache:'no-store',referrerPolicy:'same-origin'});
    if(!response.headers.get('content-type')?.startsWith('application/json'))throw new Error('Tạo video thất bại. Thử lại hoặc liên hệ quản trị viên.');
    const raw=await response.text();if(raw.length>100000)throw new Error('Phản hồi quá lớn.');
    const value=JSON.parse(raw);if(!response.ok)throw new Error(videoMessage(value.error?.code)||'Tạo video thất bại. Thử lại hoặc liên hệ quản trị viên.');return value;
  }
  function checkedJob(value,id,sceneId){
    if(value.job_id!==id||String(value.scene_id)!==String(sceneId)||!['quoted','ready','uploading','admission_unknown','queued','running','completed','failed'].includes(value.state)||
      value.state==='completed'&&!safeMediaUrl(value.video_url))throw new Error('Tạo video thất bại. Thử lại hoặc liên hệ quản trị viên.');
    return {status:value.state,busy:['queued','running'].includes(value.state),attemptId:id,result:value.video_url,message:value.message||'',predictionId:value.prediction_id};
  }
  async function track(value,id,sceneId,run){
    for(let count=0;count<180;count++){
      const state=checkedJob(value,id,sceneId);emit(run,state);if(!state.busy)return;
      await wait(5000,run.signal);value=await request('job',null,run,{id});
    }
    emit(run,{status:'stopped',busy:false,attemptId:id,message:'Job đã lưu. Dùng Khôi phục để tiếp tục; không gửi lại.'});
  }
  async function transferImage(q,bytes,image,run){
    const ticket=await request('ticket',{quote_id:q.quote_id,request_hash:q.request_hash,transfer_consent:true},run),u=ticket.upload;
    if(ticket.attempt_id!==q.quote_id||ticket.image_sha256!==image.sha256||!u||u.method!=='PUT'||!safeMediaUrl(u.url)||Date.parse(u.expires_at)<=now()||Date.parse(u.expires_at)>now()+3600000||
      !u.headers||!Object.entries(u.headers).every(([k,v])=>/^(content-type|if-none-match|x-amz-[a-z0-9-]+|x-goog-[a-z0-9-]+)$/i.test(k)&&typeof v==='string'&&!/[\r\n]/.test(v))||
      !Object.entries(u.headers).some(([k,v])=>k.toLowerCase()==='content-type'&&v===image.mime)||!Object.entries(u.headers).some(([k,v])=>k.toLowerCase()==='if-none-match'&&v==='*'))throw new Error('UPLOAD_TICKET_INVALID');
    // Exact original bytes; only provider-supplied headers. Never Clerk/API credentials.
    const put=await fetchImpl(u.url,{method:u.method,headers:u.headers,body:bytes,mode:'cors',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.any([run.signal,AbortSignal.timeout(90000)])});
    if(!put.ok)throw new Error('UPLOAD_HTTP_'+put.status);
    const verified=await request('verify',{attempt_id:q.quote_id,request_hash:q.request_hash},run);
    if(verified.verified!==true||verified.image_sha256!==image.sha256||verified.attempt_id!==q.quote_id)throw new Error('IMAGE_VERIFICATION_FAILED');
  }
  return {
    cancel(notify=true){active?.abort();active=null;consumed=false;if(notify)onChange({status:'stopped',busy:false,message:'Đã dừng chờ. Job đã nhận vẫn có thể tính phí; dùng Khôi phục.'});},
    // Single-click generation: quote → upload → verify → submit automatically.
    // The user's "Gen Video" click is the only required action.
    async generate(payload){
      if(active||consumed)return;const run=new AbortController();active=run;consumed=false;
      let attemptId=null;
      try{
        // Step 1: read and hash image bytes locally
        const local=composeScene(payload.scene),bytes=Uint8Array.from(atob(payload.image_base64),c=>c.charCodeAt(0));
        const image={mime:payload.mime_type,size:bytes.length,sha256:await digest(bytes),...imageDimensions(bytes,payload.mime_type)};
        // Step 2: quote (server validates scene, image, settings, budget policy)
        emit(run,{status:'quoting',busy:true,message:'Đang chuẩn bị video...'});
        const q=await request('quote',{project_id:payload.project_id,scene_id:local.sceneId,image,settings:payload.settings,assumptions:payload.assumptions},run);
        if(q.prompt!==local.prompt||q.image_sha256!==image.sha256||q.model!==MODEL||String(q.scene_id)!==String(local.sceneId)||JSON.stringify(q.settings)!==JSON.stringify(payload.settings)||
          JSON.stringify(q.cost)!==JSON.stringify(estimateCost(payload.settings,now()))||
          !/^[a-f0-9]{48}$/.test(q.quote_id)||!/^[a-f0-9]{64}$/.test(q.request_hash)||typeof q.paid_enabled!=='boolean'||Date.parse(q.expires_at)<=now()||Date.parse(q.expires_at)>now()+125000)
          throw new Error('Tạo video thất bại. Thử lại hoặc liên hệ quản trị viên.');
        if(!q.paid_enabled)throw new Error('Tạo video thất bại. Thử lại hoặc liên hệ quản trị viên.');
        attemptId=q.quote_id;
        // Step 3: upload image via signed URL (required: image bytes cannot pass through Vercel body limit)
        emit(run,{status:'uploading',busy:true,attemptId,message:'Đang tải ảnh...'});
        await transferImage(q,bytes,image,run);
        // Step 4: submit (server enforces budget, concurrency, idempotency, durable reservation)
        emit(run,{status:'submitting',busy:true,attemptId,message:'Đang tạo video...'});
        consumed=true;
        const value=await request('submit',{attempt_id:q.quote_id,request_hash:q.request_hash,confirm:true,cost_micro_usd:q.cost.microUsd},run);
        await track(value,q.quote_id,q.scene_id,run);
      }catch(e){
        if(e.message==='CANCELLED'){emit(run,{status:'stopped',busy:false,attemptId,message:'Đã dừng chờ. Job đã nhận vẫn có thể tính phí; dùng Khôi phục.'});}
        else{emit(run,{status:'error',busy:false,attemptId,message:e.message||'Tạo video thất bại. Thử lại hoặc liên hệ quản trị viên.'});}
      }finally{if(active===run)active=null;}
    },
    async discover(projectId,sceneId){
      if(active)return;const run=new AbortController();active=run;emit(run,{status:'recovering',busy:true});
      try{const value=await request('list',null,run,{project_id:projectId,scene_id:String(sceneId)});if(!Array.isArray(value.attempts)||value.attempts.length>20)throw new Error('INVALID_RESPONSE');
        emit(run,{status:'recovered',busy:false,attempts:value.attempts,message:value.attempts.length?'Chọn job để xem kết quả đã lưu; không tạo video mới.':'Chưa có job cloud cho scene này.'});
      }catch(e){emit(run,{status:'error',busy:false,message:e.message});}finally{if(active===run)active=null;}
    },
    async recover(id,sceneId){
      if(active||!/^[a-f0-9]{48}$/.test(id))return;consumed=true;const run=new AbortController();active=run;emit(run,{status:'recovering',busy:true,attemptId:id});
      try{await track(await request('job',null,run,{id}),id,sceneId,run);}catch(e){emit(run,{status:'error',busy:false,attemptId:id,message:e.message+' — Không gửi lại prediction.'});}finally{if(active===run)active=null;}
    },
  };
}
