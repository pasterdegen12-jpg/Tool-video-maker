import {sceneCameraFixed} from './sceneCamera.js';
import {videoMode,composeVideoPrompt,cloudVideoCost} from './cloudVideoOptions.js';
import {readSceneDuration} from './sceneDuration.js';
const messages={SCENE_DURATION_MISSING:'Scene chưa lưu thời lượng từ phân tích kịch bản. Cần phân tích lại ở MainEditor; không tự đoán cho dự án cũ.',SCENE_DURATION_INVALID:'Thời lượng scene đã lưu không hợp lệ. Kiểm tra lại bước phân tích kịch bản.',SCENE_DURATION_INCOMPATIBLE:'Thời lượng scene đã lưu vượt hợp đồng chế độ video. Chọn chế độ tương thích hoặc phân tích/chia lại scene ở MainEditor.',SCENE_DURATION_MISMATCH:'Thông số thời lượng không khớp scene đã lưu. Tải lại dữ liệu phân tích kịch bản.',SOURCE_IMAGE_MISSING:'Scene chưa có ảnh INPUT. Chọn ảnh ngay tại scene.',SOURCE_IMAGE_FORBIDDEN:'Ảnh INPUT không thuộc kho ảnh của dự án. Chọn lại ảnh cho scene.',SOURCE_IMAGE_UNAVAILABLE:'Không đọc được ảnh INPUT đã lưu. Chọn lại ảnh cho scene.',SOURCE_IMAGE_INVALID:'Ảnh INPUT không hợp lệ hoặc vượt giới hạn. Chọn PNG/JPEG tối đa 25 MiB / 24 MP.',SOURCE_IMAGE_CHANGED:'Ảnh INPUT đã thay đổi. Tải lại dự án rồi thử lại.',DIALOGUE_DURATION:'Thời lượng scene đã lưu không đủ cho lời thoại theo quy tắc phân tích. Kiểm tra lại hoặc chia scene ở MainEditor; hệ thống không tự cắt nội dung.',IMAGE_INVALID:'Ảnh không hợp lệ. Chọn PNG/JPEG khác.',SESSION_MISMATCH:'Phiên đăng nhập đã thay đổi. Tải lại trang.',UNAUTHORIZED:'Cần đăng nhập lại.',TEAM_FORBIDDEN:'Tài khoản chưa được cấp quyền tạo video của nhóm. Liên hệ quản trị viên.',PROJECT_FORBIDDEN:'Dự án chưa được cấp quyền tạo video cho tài khoản này.',PROJECT_CHANGED:'Nội dung hoặc ảnh của scene đã thay đổi. Tải lại dự án rồi thử lại.',QUOTE_EXPIRED:'Phiên tạo video hết hạn. Vui lòng thử lại.',CONCURRENCY_LIMIT:'Đang có video được xử lý. Chờ video đó hoàn tất rồi thử lại.',SPENDING_LIMIT:'Không đủ hạn mức chi phí ngày hoặc mỗi video. Liên hệ quản trị viên; chưa gửi yêu cầu tính phí.',UNRESOLVED_ATTEMPT:'Scene đang có yêu cầu chưa hoàn thành. Dùng Khôi phục để kiểm tra.',DUPLICATE_INPUT:'Yêu cầu này đã được gửi. Dùng Khôi phục để xem kết quả.',PAID_DISABLED:'Quản trị viên đang tắt tạo video tính phí. Chưa gửi yêu cầu tạo video.',RATE_LIMIT:'Có quá nhiều yêu cầu. Đợi một phút rồi thử lại.',IMAGE_HASH_MISMATCH:'Tạo video thất bại. Thử lại hoặc liên hệ quản trị viên.',ARCHIVE_PENDING:'Video đang chờ lưu. Dùng Khôi phục để tiếp tục.',STATUS_UNAVAILABLE:'Chưa đọc được trạng thái. Dùng Khôi phục để kiểm tra.'};
export const videoMessage=code=>({LEDGER_STORAGE_FULL:'Kho nhật ký video đã đầy dung lượng. Video cũ vẫn được giữ; cần mở rộng lưu trữ trước khi gửi yêu cầu mới.',LEDGER_CAPACITY:'Nhật ký video đã đạt giới hạn lưu trữ của phiên bản cũ. Chưa gửi yêu cầu tính phí.'}[code]||messages[String(code).split(';')[0]]||null);
import {estimateCost,safeMediaUrl} from './seedanceContract.js';
import {imageDimensions,MAX_SELECTED_IMAGE_BYTES} from './seedanceImage.js';
import {CLOUD_MAX_DURATION} from './cloudVideoContract.js';
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const sleep=(ms,signal)=>new Promise((resolve,reject)=>{const stop=()=>{clearTimeout(timer);reject(new Error('CANCELLED'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},ms);signal.addEventListener('abort',stop,{once:true});});
export function createCloudVideoController({getToken,onChange,fetchImpl=fetch,now=Date.now,wait=sleep}){
  let active=null,consumed=false,retryAt=0;
  const emit=(run,value)=>{if(active===run&&!run.signal.aborted)onChange(value);};
  async function request(action,payload,run,query={}){
    const token=await getToken();if(!token)throw new Error('Cần đăng nhập lại.');
    if(run.signal.aborted)throw new Error('CANCELLED');
    const parameters=new URLSearchParams({action,...query});
    const response=await fetchImpl('/api/video?'+parameters,{method:payload?'POST':'GET',headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.any([run.signal,AbortSignal.timeout(120000)]),credentials:'omit',mode:'same-origin',redirect:'error',cache:'no-store',referrerPolicy:'same-origin'});
    if(response.status===429){
      const header=response.headers.get('retry-after');
      const until=header&&/^\d+$/.test(header)?now()+Number(header)*1000:header?Date.parse(header):NaN;
      retryAt=Number.isFinite(until)&&until>now()?until:now();
      throw Object.assign(new Error(`Yêu cầu tạm thời bị giới hạn.${retryAt>now()?' Đợi '+Math.ceil((retryAt-now())/1000)+' giây rồi':''} Bấm Generate Video để thử lại khi sẵn sàng; lựa chọn hiện tại được giữ nguyên.`),{code:'RATE_LIMIT',retryAt});
    }
    if(!response.headers.get('content-type')?.startsWith('application/json'))throw new Error('Tạo video thất bại. Thử lại hoặc liên hệ quản trị viên.');
    const raw=await response.text();if(raw.length>100000)throw new Error('Phản hồi quá lớn.');
    const value=JSON.parse(raw);if(!response.ok)throw Object.assign(new Error(videoMessage(value.error?.code)||'Không thể tạo video. Liên hệ quản trị viên.'),{code:value.error?.code});return value;
  }
  function checkedJob(value,id,sceneId){
    if(value.job_id!==id||String(value.scene_id)!==String(sceneId)||!['quoted','ready','uploading','admission_unknown','queued','running','completed','failed'].includes(value.state)||
      value.state==='completed'&&!safeMediaUrl(value.video_url))throw new Error('Tạo video thất bại. Thử lại hoặc liên hệ quản trị viên.');
    return {status:value.state,busy:['queued','running'].includes(value.state),attemptId:id,result:value.video_url,message:videoMessage(value.message)||(value.state==='admission_unknown'?'Yêu cầu chưa rõ kết quả. Chỉ khôi phục, không gửi lại.':''),options:value.settings?{settings:value.settings,mode:value.mode||'start_frame_to_video',additional_prompt:value.additional_prompt||''}:undefined,predictionId:value.prediction_id,createdAt:Date.parse(value.created_at)||0,blocked:true};
  }
  async function track(value,id,sceneId,run){
    for(let count=0;count<180;count++){
      const state=checkedJob(value,id,sceneId);emit(run,state);if(!state.busy){if(state.status==='completed')consumed=false;return;}
      await wait(5000,run.signal);value=await request('job',null,run,{id});
    }
    emit(run,{status:'stopped',busy:false,attemptId:id,message:'Job đã lưu. Dùng Khôi phục để tiếp tục; không gửi lại.'});
  }
  async function transferImage(q,bytes,image,run,index){
    const ticket=await request('ticket',{quote_id:q.quote_id,request_hash:q.request_hash,transfer_consent:true,...(index===undefined?{}:{image_index:index})},run),u=ticket.upload;
    if(ticket.attempt_id!==q.quote_id||ticket.image_sha256!==image.sha256||!u||u.method!=='PUT'||!safeMediaUrl(u.url)||Date.parse(u.expires_at)<=now()||Date.parse(u.expires_at)>now()+3600000||
      !u.headers||!Object.entries(u.headers).every(([k,v])=>/^(content-type|if-none-match|x-amz-[a-z0-9-]+|x-goog-[a-z0-9-]+)$/i.test(k)&&typeof v==='string'&&!/[\r\n]/.test(v))||
      !Object.entries(u.headers).some(([k,v])=>k.toLowerCase()==='content-type'&&v===image.mime)||!Object.entries(u.headers).some(([k,v])=>k.toLowerCase()==='if-none-match'&&v==='*'))throw new Error('UPLOAD_TICKET_INVALID');
    // Exact original bytes; only provider-supplied headers. Never Clerk/API credentials.
    const put=await fetchImpl(u.url,{method:u.method,headers:u.headers,body:bytes,mode:'cors',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.any([run.signal,AbortSignal.timeout(90000)])});
    if(!put.ok)throw new Error('UPLOAD_HTTP_'+put.status);
    const verified=await request('verify',{attempt_id:q.quote_id,request_hash:q.request_hash,...(index===undefined?{}:{image_index:index})},run);
    if(verified.verified!==true||verified.image_sha256!==image.sha256||verified.attempt_id!==q.quote_id)throw new Error('IMAGE_VERIFICATION_FAILED');
  }
  return {
    cancel(notify=true){active?.abort();active=null;consumed=false;if(notify)onChange({status:'stopped',busy:false,message:'Đã dừng chờ. Job đã nhận vẫn có thể tính phí; dùng Khôi phục.'});},
    // Called only by Generate Video inside the options modal. No work on open/change.
    async generate(payload){
      if(active||consumed)return;
      if(retryAt>now()){onChange({status:'error',busy:false,blocked:false,code:'RATE_LIMIT',message:'Đợi '+Math.ceil((retryAt-now())/1000)+' giây rồi bấm Generate Video để thử lại. Lựa chọn hiện tại được giữ nguyên.'});return;}
      const run=new AbortController();active=run;consumed=false;
      let attemptId=null;
      try{
        // Step 1: read and hash image bytes locally
        const modern=Object.hasOwn(payload,'mode'),mode=payload.mode||'start_frame_to_video';
        const cap=videoMode(mode),local=composeVideoPrompt(payload.scene,payload.additional_prompt||'');
        payload={...payload,settings:{...payload.settings,camera_fixed:sceneCameraFixed(payload.scene,mode,payload.settings?.camera_fixed)}};
        if(payload.settings?.duration!==readSceneDuration(payload.scene,mode))throw Error('Thời lượng request không khớp ước tính lời thoại hiện tại. Đóng và mở lại tùy chọn video để chuẩn bị yêu cầu mới.');
        const media=[];
        if(mode==='start_frame_to_video'){
        emit(run,{status:'quoting',busy:true,message:'Đang chuẩn bị...'});
        let bytes,mime=payload.mime_type;
        if(payload.stored_image){
          const source=await request('source',{project_id:payload.project_id,scene_id:local.sceneId},run);
          if(String(source.scene_id)!==String(local.sceneId)||source.url!==(payload.scene.startFrameUrl||payload.scene.imageUrl)||!safeMediaUrl(source.url))throw new Error(videoMessage('SOURCE_IMAGE_CHANGED'));
          let response;try{response=await fetchImpl(source.url,{method:'GET',credentials:'omit',mode:'cors',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.any([run.signal,AbortSignal.timeout(45000)])});}catch{throw new Error(videoMessage('SOURCE_IMAGE_UNAVAILABLE'));}
          if(!response.ok||Number(response.headers.get('content-length'))>MAX_SELECTED_IMAGE_BYTES)throw new Error(videoMessage('SOURCE_IMAGE_UNAVAILABLE'));
          const reader=response.body.getReader(),chunks=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_SELECTED_IMAGE_BYTES)throw new Error(videoMessage('SOURCE_IMAGE_INVALID'));chunks.push(value);}}finally{await reader.cancel();}
          bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
          mime=source.image.mime;const dims=imageDimensions(bytes,mime);
          if(size!==source.image.size||await digest(bytes)!==source.image.sha256||dims.width!==source.image.width||dims.height!==source.image.height)throw new Error(videoMessage('SOURCE_IMAGE_CHANGED'));
        }else bytes=Uint8Array.from(atob(payload.image_base64),c=>c.charCodeAt(0));
        media.push({bytes,image:{mime,size:bytes.length,sha256:await digest(bytes),...imageDimensions(bytes,mime)}});
        }else if(mode==='references_to_video'){
          if(!Array.isArray(payload.references)||!payload.references.length||payload.references.length>cap.maxImages)throw Error('Chọn từ 1 đến 9 ảnh tham chiếu.');
          for(const reference of payload.references){const bytes=Uint8Array.from(atob(reference.image_base64),c=>c.charCodeAt(0)),mime=reference.mime_type;
            media.push({bytes,image:{mime,size:bytes.length,sha256:await digest(bytes),...imageDimensions(bytes,mime)}});}
        }
        const image=media[0]?.image;
        // Step 2: quote (server validates scene, image, settings, budget policy)
        emit(run,{status:'quoting',busy:true,message:'Đang chuẩn bị video...'});
        const q=await request('quote',{project_id:payload.project_id,scene_id:local.sceneId,...(mode==='text_to_video'?{}:mode==='references_to_video'?{images:media.map(m=>m.image)}:{image}),settings:payload.settings,assumptions:payload.assumptions,...(payload.stored_image&&mode==='start_frame_to_video'?{stored_image:true}:{}),...(modern?{mode,additional_prompt:payload.additional_prompt||'',attempt_key:payload.attempt_key||crypto.randomUUID()}:{} )},run);
        if(q.prompt!==local.prompt||q.image_sha256!==(image?.sha256||null)||q.model!==cap.model||String(q.scene_id)!==String(local.sceneId)||JSON.stringify(q.settings)!==JSON.stringify(payload.settings)||
          JSON.stringify(q.cost)!==JSON.stringify(modern?cloudVideoCost(payload.settings,mode,now()):estimateCost(payload.settings,now(),CLOUD_MAX_DURATION))||
          !/^[a-f0-9]{48}$/.test(q.quote_id)||!/^[a-f0-9]{64}$/.test(q.request_hash)||typeof q.paid_enabled!=='boolean'||Date.parse(q.expires_at)<=now()||Date.parse(q.expires_at)>now()+125000)
          throw new Error('Tạo video thất bại. Thử lại hoặc liên hệ quản trị viên.');
        if(modern&&(q.mode!==mode||JSON.stringify(q.image_sha256s)!==JSON.stringify(media.map(m=>m.image.sha256))))throw Error('Thông số media không khớp.');
        if(!q.paid_enabled)throw new Error(videoMessage('PAID_DISABLED'));
        attemptId=q.quote_id;
        // Step 3: upload image via signed URL (required: image bytes cannot pass through Vercel body limit)
        emit(run,{status:'uploading',busy:true,attemptId,message:'Đang tải ảnh...'});
        for(let i=0;i<media.length;i++)await transferImage(q,media[i].bytes,media[i].image,run,mode==='references_to_video'?i:undefined);
        // Step 4: submit (server enforces budget, concurrency, idempotency, durable reservation)
        emit(run,{status:'submitting',busy:true,attemptId,message:'Đang tạo video...'});
        consumed=true;
        const value=await request('submit',{attempt_id:q.quote_id,request_hash:q.request_hash,confirm:true,cost_micro_usd:q.cost.microUsd},run);
        await track(value,q.quote_id,q.scene_id,run);
      }catch(e){
        if(e.message==='CANCELLED'){emit(run,{status:'stopped',busy:false,attemptId,message:'Đã dừng chờ. Job đã nhận vẫn có thể tính phí; dùng Khôi phục.'});}
        else{emit(run,{status:'error',busy:false,attemptId,blocked:consumed,code:e.code,message:videoMessage(e.message)||e.message||'Không thể tạo video.'});}
      }finally{if(active===run)active=null;}
    },
    async listProject(projectId){
      const run=new AbortController();active=run;
      try{const value=await request('list',null,run,{project_id:projectId});
        if(!Array.isArray(value.attempts)||value.attempts.length>80)throw new Error('INVALID_RESPONSE');
        return value.attempts.map(job=>{checkedJob(job,job.job_id,job.scene_id);return job;});
      }finally{if(active===run)active=null;}
    },
    async discover(projectId,sceneId,restore=false){
      if(active)return;const run=new AbortController();active=run;emit(run,{status:'recovering',busy:true});
      try{const value=await request('list',null,run,{project_id:projectId,scene_id:String(sceneId)});if(!Array.isArray(value.attempts)||value.attempts.length>20)throw new Error('INVALID_RESPONSE');
        if(value.attempts.some(a=>String(a.scene_id)!==String(sceneId)))throw new Error('INVALID_RESPONSE');
        const existing=value.attempts.find(a=>['admission_unknown','queued','running','completed'].includes(a.state));
        if(restore&&existing){consumed=true;await track(await request('job',null,run,{id:existing.job_id}),existing.job_id,sceneId,run);return;}
        emit(run,{status:'recovered',busy:false,attempts:value.attempts,message:value.attempts.length?'Chọn job để xem kết quả đã lưu; không tạo video mới.':'Chưa có job cloud cho scene này.'});
      }catch(e){emit(run,{status:'error',busy:false,message:e.message});}finally{if(active===run)active=null;}
    },
    async recover(id,sceneId){
      if(active||!/^[a-f0-9]{48}$/.test(id))return;consumed=true;const run=new AbortController();active=run;emit(run,{status:'recovering',busy:true,attemptId:id});
      try{await track(await request('job',null,run,{id}),id,sceneId,run);}catch(e){emit(run,{status:'error',busy:false,attemptId:id,message:e.message+' — Không gửi lại prediction.'});}finally{if(active===run)active=null;}
    },
  };
}
