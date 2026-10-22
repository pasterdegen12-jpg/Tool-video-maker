import {validVisualProposal} from './visualProfile.js';
export const remoteQwenVisible=(env,location)=>env.VITE_ENABLE_REMOTE_QWEN==='true'&&location?.origin==='https://www.aivideomaker.live';
const messages={UNAUTHORIZED:'Cần đăng nhập lại.',PROJECT_FORBIDDEN:'Bạn không có quyền truy cập dự án này.',REFERENCE_IMAGE_MISSING:'Nhân vật chưa có ảnh đã lưu. Hãy tải ảnh nhân vật trước.',REFERENCE_IMAGE_FORBIDDEN:'Ảnh nhân vật phải nằm trong kho ảnh của dự án.',REFERENCE_IMAGE_INVALID:'Ảnh đã lưu không hợp lệ.',QUEUE_FULL:'Hàng đợi đang đầy. Thử lại sau.',CHARACTER_CHANGED:'Ảnh hoặc nhân vật đã thay đổi. Đề xuất cũ không được lưu.',QWEN_UNAVAILABLE:'Chưa kết nối được hàng đợi Qwen. Thử khôi phục trạng thái.',RATE_LIMIT:'Có nhiều yêu cầu cùng lúc. Thử lại sau một phút.'};
export async function remoteQwenRequest(getToken,action,input,{fetchImpl=fetch,signal}={}){
 const bearer=await getToken();if(!bearer)throw Error(messages.UNAUTHORIZED);
 const response=await fetchImpl('/api/qwen?action='+action,{method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:JSON.stringify(input),credentials:'omit',mode:'same-origin',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});
 const value=await response.json();if(!response.ok)throw Error(messages[value.error?.code]||'Không thể xử lý yêu cầu Qwen. Khôi phục trạng thái hoặc thử lại.');return value;
}
export function createRemoteQwenController({getToken,onChange,projectId,characterId,fetchImpl=fetch,sleep=(ms,signal)=>new Promise((resolve,reject)=>{const t=setTimeout(resolve,ms);signal.addEventListener('abort',()=>{clearTimeout(t);reject(Error('CANCELLED'));},{once:true});})}){
 let active=null,jobId=null,requestKey=null;
 const base={projectId,characterId};
 const call=(action,data={},signal)=>remoteQwenRequest(getToken,action,{...base,...data},{fetchImpl,signal});
 function state(job){
  if(job.id&&(!/^[a-f0-9]{64}$/.test(job.id)||job.projectId!==projectId||job.characterId!==characterId))throw Error('Phản hồi không khớp nhân vật.');
  if(job.state==='proposal_ready'){
   if(!validVisualProposal(job.profile))throw Error('Đề xuất không hợp lệ.');
   return{status:job.profile.status,busy:false,result:job.profile,jobId:job.id,message:job.profile.status==='detected'?'Đề xuất chưa lưu. Hãy kiểm tra và xác nhận.':'Ảnh chưa xác định được một người rõ ràng. Hãy thay ảnh nhân vật.'};
  }
  const busy=['queued','running'].includes(job.state);
  const message=job.state==='queued'?(job.worker==='offline'||job.worker==='unavailable'?'Máy chủ Qwen đang ngoại tuyến. Yêu cầu đang chờ xử lý.':'Đang chờ Qwen xử lý')
   :job.state==='running'?'Qwen đang phân tích ảnh…':job.state==='expired'?'Yêu cầu đã hết hạn. Bạn có thể Set ID lại.':job.state==='failed'?'Qwen xử lý thất bại. ID đã xác nhận được giữ nguyên.':job.state==='cancelled'?'Yêu cầu đã hủy. ID đã lưu không thay đổi.':job.state==='confirmed'?'ID đã được xác nhận và lưu.':['offline','unavailable'].includes(job.worker)?'Qwen Local chưa kết nối; yêu cầu mới vẫn được xếp hàng.':'Qwen sẵn sàng nhận yêu cầu.';
  return{status:job.state,busy,result:null,jobId:job.id,message};
 }
 async function run(create){
  if(active)return;const abort=new AbortController();active=abort;
  try{
   if(create){requestKey||=crypto.randomUUID();onChange({status:'submitting',busy:true,message:'Đang đưa yêu cầu vào hàng đợi…'});}
   let job=await call(create?'create':'status',create?{requestKey}:{},abort.signal);
   for(;;){
    if(abort.signal.aborted)return;jobId=job.id||null;const next=state(job);onChange(next);
    if(!next.busy){if(job.state!=='idle')requestKey=null;return;}
    await sleep(Math.max(5000,Math.min(60000,job.pollAfterMs||15000)),abort.signal);
    job=await call('status',{jobId},abort.signal);
   }
  }catch(error){if(!abort.signal.aborted)onChange({status:'error',busy:false,jobId,message:error.message+' Dùng Khôi phục trạng thái; không tự tạo job mới.'});}
  finally{if(active===abort)active=null;}
 }
 return{submit:()=>run(true),resume:()=>run(false),cancel(notify=true){active?.abort();active=null;if(notify&&jobId)call('cancel',{jobId}).then(j=>onChange(state(j))).catch(e=>onChange({status:'error',busy:false,message:e.message}));}};
}
