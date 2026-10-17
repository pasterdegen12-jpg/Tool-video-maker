export function createAudioTransport({getToken,fetchImpl=fetch}){
  async function request(action,payload,handle){
    const token=await getToken();if(!token)throw new Error('Cần đăng nhập để tạo Audio.');
    const response=await fetchImpl('/api/audio?action='+action+(handle?'&id='+encodeURIComponent(handle):''),{method:payload?'POST':'GET',
      headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{}),
      credentials:'omit',redirect:'error',mode:'same-origin',referrerPolicy:'same-origin',signal:AbortSignal.timeout(120000)});
    if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Backend Audio không khả dụng.');
    const value=await response.json();if(!response.ok)throw new Error(value.error?.code||'AUDIO_FAILED');return value;
  }
  return {submit:(mode,payload)=>request('submit',{mode,payload,idempotency_key:crypto.randomUUID()}),poll:handle=>request('job',null,handle)};
}
