export function createVideoBatchClient({getToken,fetchImpl=fetch}){
 async function call(action,projectId,body){
  const token=await getToken();if(!token)throw Error('Đăng nhập trước khi tạo video.');
  const res=await fetchImpl('/api/video?action='+action+(body?'':'&project_id='+encodeURIComponent(projectId)),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json();if(!res.ok)throw Object.assign(Error(data.error?.code||'VIDEO_UNAVAILABLE'),{retryAfter:Number(res.headers.get('Retry-After'))||0});return data;
 }
 return {plan:p=>call('batch_plan',p,{project_id:p}),list:p=>call('batch_list',p),tick:p=>call('batch_tick',p,{project_id:p}),
  create:(p,scenes,key)=>call('batch_create',p,{project_id:p,scenes,idempotency_key:key,confirm:true}),cancel:(p,id)=>call('batch_cancel',p,{project_id:p,batch_id:id})};
}
