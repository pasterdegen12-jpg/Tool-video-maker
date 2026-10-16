import { composeScene,estimateCost,safeMediaUrl,MODEL } from './seedanceContract.js';
const abortError=()=>new DOMException('Cancelled','AbortError');
function pause(ms,signal){
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(abortError());return;}
    const cancel=()=>{clearTimeout(timer);reject(abortError());};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);
    signal.addEventListener('abort',cancel,{once:true});
  });
}
const hex=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');
export function createVideoController({getToken,onChange,fetchImpl=fetch,now=Date.now,sleep=pause,requestTimeoutMs=75000}){
  let active=null,approved=null,consumed=false;
  const emit=(run,value)=>{if(active===run&&!run.signal.aborted)onChange(value);};
  async function request(path,method,payload,run){
    const deadline=new AbortController();
    const stop=()=>deadline.abort();
    run.signal.addEventListener('abort',stop,{once:true});
    let timer;
    const cancellation=new Promise((_,reject)=>{
      timer=setTimeout(()=>{deadline.abort();reject(new Error('TIMEOUT'));},requestTimeoutMs);
      deadline.signal.addEventListener('abort',()=>reject(abortError()),{once:true});
    });
    try{
      return await Promise.race([cancellation,(async()=>{
        const token=await getToken();
        if(active!==run||run.signal.aborted||deadline.signal.aborted)throw abortError();
        if(!token)throw new Error('AUTH');
        const response=await fetchImpl(path,{method,headers:{Authorization:'Bearer '+token,...(method==='POST'?{'Content-Type':'application/json'}:{})},
          ...(method==='POST'?{body:JSON.stringify(payload)}:{}),signal:deadline.signal,redirect:'error',credentials:'omit',mode:'same-origin',referrerPolicy:'same-origin'});
        if(!response.headers.get('Content-Type')?.startsWith('application/json')||!response.body)throw new Error('INVALID_RESPONSE');
        const reader=response.body.getReader();let size=0,raw='';const decoder=new TextDecoder();
        try{
          while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>32768)throw new Error('INVALID_RESPONSE');raw+=decoder.decode(item.value,{stream:true});}
        }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
        const value=JSON.parse(raw+decoder.decode());
        const retry=response.headers.get('Retry-After');
        const delay=/^\d+$/.test(retry||'')?Number(retry)*1000:Date.parse(retry)-now();
        return {response,value,delay:Number.isFinite(delay)?Math.max(2000,delay):2000};
      })()]);
    }finally{clearTimeout(timer);run.signal.removeEventListener('abort',stop);}
  }
  function job(value,id,sceneId){
    if(value.job_id!==id||value.scene_id!==sceneId||!['uploading','submitting','queued','running','completed','failed','cancelled','timeout','deleted','admission_unknown'].includes(value.state)||
      !Number.isFinite(Date.parse(value.expires_at))||value.speech_review!=='unverified'||
      value.state==='completed'&&!safeMediaUrl(value.video_url)||
      value.state!=='completed'&&value.video_url!==null)throw new Error('INVALID_RESPONSE');
    return {status:value.state,busy:['uploading','submitting','queued','running'].includes(value.state),result:value.video_url,message:value.message||'',attemptId:id,stage:value.stage};
  }
  async function track(result,id,sceneId,run){
    const path='/api/local-video/jobs/'+id;
        const until=Math.min(Date.parse(result.value.expires_at),now()+900000);
        let count=0;
        while(active===run&&!run.signal.aborted){
          const state=job(result.value,id,sceneId);emit(run,state);if(!state.busy)return;
          if(count++>=180||now()+result.delay>=until){emit(run,{status:'expired',busy:false,message:'Hết thời gian theo dõi. Job có thể vẫn chạy; không tự gửi lại.'});return;}
          await sleep(result.delay,run.signal);
          const next=await request(path,'GET',null,run);
          if([429,502,503,504].includes(next.response.status)){result.delay=next.delay;continue;}
          if(!next.response.ok){emit(run,{status:'expired',busy:false,message:'Không thể tiếp tục theo dõi phiên này. Không tự gửi lại.'});return;}
          result=next;
        }
  }
  return {
    async authorizeRetry(confirmed,transferConsent){
      if(active||consumed||!approved||confirmed!==true||transferConsent!==true)return;
      const {value:q}=approved;
      if(!q.retry_predecessor_id||approved.retryAuthorization||!q.paid_enabled||Date.parse(q.expires_at)<=now())return;
      const run=new AbortController();active=run;emit(run,{status:'authorizing',busy:true,quote:q});
      try{
        const {response,value}=await request('/api/local-video/retry-authorizations','POST',{
          quote_id:q.quote_id,request_hash:q.request_hash,predecessor_id:q.retry_predecessor_id,confirm:true,transfer_consent:true},run);
        if(!response.ok)throw new Error(value.error?.message||'Không thể phê duyệt lần thử mới.');
        if(value.quote_id!==q.quote_id||value.predecessor_id!==q.retry_predecessor_id||value.expires_at!==q.expires_at||
          !/^[a-f0-9]{48}$/.test(value.authorization_id))throw new Error('INVALID_RESPONSE');
        if(active===run&&!run.signal.aborted&&approved?.value===q){
          approved.retryAuthorization=value.authorization_id;
          emit(run,{status:'quoted',busy:false,quote:q,retryAuthorized:true,message:'Đã phê duyệt một lần thử mới. Chưa upload hoặc gửi prediction; bấm Generate khi xác nhận.'});
        }
      }catch{emit(run,{status:'error',busy:false,message:'Không xác định được quyền thử lại. Không tự gửi; lấy báo giá mới sau khi quyền cũ hết hạn.'});if(active===run)approved=null;}
      finally{if(active===run)active=null;}
    },
    async discover(projectId,sceneId){
      if(active)return;
      approved=null;const run=new AbortController();active=run;emit(run,{status:'recovering',busy:true});
      try{
        const scope=await hex(JSON.stringify([projectId||'',sceneId]));
        const {response,value}=await request('/api/local-video/attempts?scope='+scope,'GET',null,run);
        if(!response.ok)throw new Error(value.error?.message||'Không đọc được nhật ký local.');
        if(!Array.isArray(value.attempts)||value.attempts.length>20||typeof value.unresolved!=='boolean'||
          value.attempts.some(a=>!/^[a-f0-9]{48}$/.test(a.job_id)||a.scene_id!==sceneId||typeof a.stage!=='string'))throw new Error('INVALID_RESPONSE');
        emit(run,{status:'recovered',busy:false,attempts:value.attempts,message:value.unresolved?
          'Có lần gửi chưa rõ kết quả; backend chặn gửi mới. Cần đối soát và phê duyệt mới.':value.attempts.length?'Chọn lần gửi để kiểm tra; không tạo prediction mới.':'Không có lần gửi của scene trong phiên Clerk này. Phiên khác không được phép xem.'});
      }catch(error){emit(run,{status:'error',busy:false,message:error.message==='AUTH'?'Cần đăng nhập lại.':error.message});}
      finally{if(active===run)active=null;}
    },
    async recover(id,sceneId){
      if(active||!/^[a-f0-9]{48}$/.test(id))return;
      approved=null;consumed=true;const run=new AbortController();active=run;
      emit(run,{status:'recovering',busy:true,attemptId:id});
      try{
        // Read metadata first; a known provider ID can then be polled using GET.
        const result=await request('/api/local-video/attempts/'+id,'GET',null,run);
        if(!result.response.ok)throw new Error('Không tìm thấy lần gửi trong phiên này; không gửi lại.');
        await track(result,id,sceneId,run);
      }catch{emit(run,{status:'tracking_unknown',busy:false,attemptId:id,message:'Chưa lấy được trạng thái. Không tự gửi lại; dùng Khôi phục/kiểm tra sau.'});}
      finally{if(active===run)active=null;}
    },
    cancel(notify=true){
      const previous=active;active=null;previous?.abort();approved=null;
      if(notify)onChange({status:'stopped',busy:false,message:'Đã dừng chờ trên giao diện. Yêu cầu bên WaveSpeed có thể tiếp tục và tính phí; không tự gửi lại.'});
    },
    async quote(payload){
      if(active)return;
      consumed=false;approved=null;
      const run=new AbortController();active=run;emit(run,{status:'quoting',busy:true});
      try{
        const snapshot=structuredClone(payload),local=composeScene(snapshot.scene,snapshot.profile,snapshot.projectType);
        const {response,value}=await request('/api/local-video/quote','POST',snapshot,run);
        if(!response.ok)throw new Error(value.error?.message||'Không lấy được báo giá.');
        const binary=atob(snapshot.image_base64),decoded=new Uint8Array(binary.length);
        for(let i=0;i<binary.length;i++)decoded[i]=binary.charCodeAt(i);
        const imageHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',decoded)),x=>x.toString(16).padStart(2,'0')).join('');
        if(!/^[a-f0-9]{48}$/.test(value.quote_id)||!/^[a-f0-9]{64}$/.test(value.request_hash)||
          value.prompt!==local.prompt||value.prompt_sha256!==await hex(local.prompt)||value.image_sha256!==imageHash||
          value.model!==MODEL||value.scene_id!==local.sceneId||JSON.stringify(value.settings)!==JSON.stringify(snapshot.settings)||
          JSON.stringify(value.cost)!==JSON.stringify(estimateCost(snapshot.settings,now()))||
          !(Date.parse(value.expires_at)>now()&&Date.parse(value.expires_at)<=now()+125000)||typeof value.paid_enabled!=='boolean')throw new Error('Báo giá không khớp với yêu cầu.');
        if(value.retry_predecessor_id!==undefined&&value.retry_predecessor_id!==null&&!/^[a-f0-9]{48}$/.test(value.retry_predecessor_id))throw new Error('Báo giá không hợp lệ.');
        if(active===run&&!run.signal.aborted){approved={value,payload:snapshot};emit(run,{status:'quoted',busy:false,quote:value});}
      }catch(error){emit(run,{status:'error',busy:false,message:error.message==='AUTH'?'Cần đăng nhập lại.':error.message==='INVALID_RESPONSE'?'Phản hồi báo giá không hợp lệ.':error.message});}
      finally{if(active===run)active=null;}
    },
    async submit(confirmed,transferConsent){
      if(active||consumed||!approved||confirmed!==true||transferConsent!==true)return;
      const {value:q,payload,retryAuthorization}=approved;
      if(!q.paid_enabled||Date.parse(q.expires_at)<=now()){
        onChange({status:'error',busy:false,message:'Gửi tính phí đang tắt hoặc báo giá đã hết hạn.'});return;
      }
      if(q.retry_predecessor_id&&!retryAuthorization){
        onChange({status:'quoted',busy:false,quote:q,message:'Cần phê duyệt thử lại một lần cho báo giá này trước khi Generate.'});return;
      }
      consumed=true;approved=null;
      const run=new AbortController();active=run;emit(run,{status:'uploading',busy:true,attemptId:q.attempt_id||q.quote_id});
      let admitted=false;
      try{
        let result=await request('/api/local-video/submit','POST',{quote_id:q.quote_id,request_hash:q.request_hash,confirm:true,transfer_consent:true,payload,
          ...(retryAuthorization?{retry_authorization_id:retryAuthorization}:{})},run);
        if(result.response.status!==202){
          emit(run,{status:'error',busy:false,message:result.value.error?.message||'Không gửi lại yêu cầu. Kiểm tra backend.'});return;
        }
        const id=result.value.job_id,path='/api/local-video/jobs/'+id;
        if(!/^[a-f0-9]{48}$/.test(id)||result.value.status_url!==path)throw new Error('INVALID_RESPONSE');
        job(result.value,id,q.scene_id);
        admitted=true;
        await track(result,id,q.scene_id,run);
      }catch{
        emit(run,{status:admitted?'tracking_unknown':'admission_unknown',busy:false,message:'Chưa xác định kết quả gửi/theo dõi. Có thể đã tính phí. Không tự gửi lại; kiểm tra WaveSpeed.'});
      }finally{if(active===run)active=null;}
    },
  };
}
