import {parseGeminiResponse} from './geminiContract.js';
export async function callGeminiBackend(promptText,getToken,fetchImpl=fetch){
  const token=await getToken();if(!token)throw new Error('Cần đăng nhập để phân tích kịch bản.');
  const response=await fetchImpl('/api/gemini',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({prompt:promptText,request_id:crypto.randomUUID()}),credentials:'omit',redirect:'error',mode:'same-origin',referrerPolicy:'same-origin',signal:AbortSignal.timeout(120000)});
  if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Backend Gemini không khả dụng.');
  const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Máy chủ AI đang quá tải lượt yêu cầu. Vui lòng bấm nút thử lại!');
  return parseGeminiResponse(data);
}
