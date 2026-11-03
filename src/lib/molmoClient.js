import {validVisualProposal} from './visualProfile.js';
const messages={UNAUTHORIZED:'Cần đăng nhập lại.',PROJECT_FORBIDDEN:'Bạn không có quyền truy cập dự án.',CHARACTER_CHANGED:'Ảnh hoặc nhân vật đã thay đổi. Đề xuất cũ không được lưu.',REFERENCE_IMAGE_MISSING:'Hãy tải ảnh nhân vật trước.',REFERENCE_IMAGE_FORBIDDEN:'Ảnh phải thuộc kho của dự án.',REFERENCE_IMAGE_INVALID:'Ảnh không hợp lệ.',REFERENCE_IMAGE_UNAVAILABLE:'Không đọc được ảnh đã lưu.',MOLMO_UNAVAILABLE:'Dịch vụ phân tích ảnh chưa sẵn sàng.',VISUAL_OUTPUT_INVALID:'Kết quả AI không đúng định dạng. ID đã duyệt được giữ nguyên; không tự gọi lại AI.',VISUAL_OUTPUT_UNSUPPORTED:'Đề xuất chứa thông tin không phù hợp. Không lưu ID này.',SUBMISSION_UNKNOWN:'Chưa xác định được kết quả gửi. Không gửi lại để tránh tính phí trùng.'};
export async function molmoRequest(getToken,action,input,{fetchImpl=fetch,signal}={}){
 const token=await getToken();if(!token)throw Error(messages.UNAUTHORIZED);
 const r=await fetchImpl('/api/qwen?action=molmo_'+action,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(input),credentials:'omit',mode:'same-origin',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)});
 const value=await r.json();if(!r.ok)throw Error(messages[value.error?.code]||'Không thể phân tích ảnh. Khôi phục trạng thái trước khi thử lại.');return value;
}
const pause=(ms,signal)=>new Promise((resolve,reject)=>{const stop=()=>{clearTimeout(timer);reject(Error('CANCELLED'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},ms);signal.addEventListener('abort',stop,{once:true});});
export function createMolmoController({getToken,onChange,projectId,characterId,fetchImpl=fetch,sleep=pause,now=Date.now}){
 let active=null,requestKey=null;
 async function run(create){
  if(active)return;const abort=new AbortController();active=abort;const deadline=now()+300000;
  try{
   onChange({status:create?'submitting':'recovering',busy:true,message:create?'Đang phân tích ảnh...':'Đang kiểm tra đề xuất đã lưu…'});
   if(create)requestKey||=crypto.randomUUID();
   const call=(action,extra={})=>molmoRequest(getToken,action,{projectId,characterId,...extra},{fetchImpl,signal:abort.signal});
   let job=await call(create?'create':'status',create?{requestKey}:{}),errors=0;
   for(;;){
    if(abort.signal.aborted)return;
    if(job.id&&(!/^[a-f0-9]{64}$/.test(job.id)||job.projectId!==projectId||job.characterId!==characterId))throw Error('Đề xuất không khớp nhân vật.');
    if(job.state==='proposal_ready'){
     if(!validVisualProposal(job.profile))throw Error('Đề xuất không hợp lệ.');
     requestKey=null;onChange({status:job.profile.status,busy:false,result:job.profile,jobId:job.id,message:job.profile.status==='detected'?'Sẵn sàng duyệt ID.':'Không xác định được một nhân vật rõ ràng trong ảnh.'});return;
    }
    const busy=['submitting','running'].includes(job.state);
    onChange({status:job.state,busy,jobId:job.id,message:messages[job.error]||(busy?'Đang phân tích ảnh…':job.state==='confirmed'?'Đã lưu ID.':job.state==='idle'?'Sẵn sàng phân tích ảnh.':job.state==='polling_paused'?'Đã hết thời gian chờ; prediction được giữ để kiểm tra.':'Không thể phân tích ảnh. ID đã duyệt vẫn được giữ.')} );
    if(!busy){if(!['unknown','polling_paused'].includes(job.state))requestKey=null;return;}
    if(now()>=deadline)throw Error('Đã dừng chờ. Khôi phục trạng thái để kiểm tra prediction cũ.');
    await sleep(Math.max(2000,Math.min(15000,job.pollAfterMs||2000)),abort.signal);
    try{job=await call('status',{jobId:job.id});errors=0;}catch(e){if(++errors>=3)throw e;await sleep(10000,abort.signal);}
   }
  }catch(e){if(!abort.signal.aborted)onChange({status:'error',busy:false,message:e.message+' Không tự gửi lại yêu cầu.'});}
  finally{if(active===abort)active=null;}
 }
 return{submit:()=>run(true),resume:()=>run(false),cancel(){active?.abort();active=null;}};
}
