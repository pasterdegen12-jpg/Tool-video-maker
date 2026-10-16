import { MODEL } from '../../../src/lib/seedanceContract.js';
import { requestHttps, publicAddress } from './transport.js';
import { VideoError } from './errors.js';
export const API='https://api.wavespeed.ai/api/v3';
const terminals=['completed','failed','cancelled','timeout','deleted'];
export function retrySeconds(value,now=Date.now()){
  const n=/^\d+$/.test(String(value))?Number(value):Math.ceil((Date.parse(value)-now)/1000);
  return Number.isFinite(n)&&n>0?Math.min(600,Math.max(2,n)):2;
}
function data(response){
  if(response.status<200||response.status>=300)throw new VideoError('UPSTREAM_FAILED',response.status===429||response.status===503?retrySeconds(response.headers?.['retry-after']):0);
  try{
    const parsed=JSON.parse(response.body);
    if(parsed.code!==200||!parsed.data||typeof parsed.data!=='object'||Array.isArray(parsed.data))throw 0;
    return parsed.data;
  }catch{throw new VideoError('INVALID_PROVIDER_RESPONSE');}
}
export function validateTicket(ticket,image,now=Date.now()){
  const u=ticket.upload;
  if(ticket.type!=='image'||ticket.size!==image.bytes.length||ticket.filename!==image.filename||
    typeof ticket.download_url!=='string'||!u||u.method!=='PUT'||typeof u.url!=='string'||
    !u.headers||typeof u.headers!=='object'||Array.isArray(u.headers)||
    !Number.isFinite(Date.parse(u.expires_at))||Date.parse(u.expires_at)<=now||Date.parse(u.expires_at)>now+3600000)throw new VideoError('INVALID_PROVIDER_RESPONSE');
  const seen=new Set();
  for(const [key,value]of Object.entries(u.headers)){
    const k=key.toLowerCase();
    if(seen.has(k)||!(/^(content-type|if-none-match|x-amz-[a-z0-9-]+|x-goog-[a-z0-9-]+)$/.test(k))||
      typeof value!=='string'||value.length>4096||/[\r\n]/.test(value))throw new VideoError('INVALID_PROVIDER_RESPONSE');
    if(k==='content-type'&&value!==image.mime)throw new VideoError('INVALID_PROVIDER_RESPONSE');
    seen.add(k);
  }
  if(!seen.has('content-type')||seen.size>16)throw new VideoError('INVALID_PROVIDER_RESPONSE');
  return ticket;
}
export function createProvider(config,{request=requestHttps,checkUrl=publicAddress,now=Date.now}={}){
  const apiHeaders={'Authorization':'Bearer '+config.apiKey,'Content-Type':'application/json'};
  function paid(){if(config.paidEnabled!==true||!config.apiKey)throw new VideoError('PAID_DISABLED');}
  async function parsePrediction(raw,expectedId){
    const task=data(raw);
    if(typeof task.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(task.id)||task.model!==MODEL||
      (expectedId&&task.id!==expectedId)||!['created','pending','queued','processing','running',...terminals].includes(task.status)||
      !Array.isArray(task.outputs))throw new VideoError('INVALID_PROVIDER_RESPONSE');
    const state=['created','pending'].includes(task.status)?'queued':task.status==='processing'?'running':task.status;
    let url=null;
    if(state==='completed'){
      if(task.outputs.length!==1||typeof task.outputs[0]!=='string')throw new VideoError('INVALID_PROVIDER_RESPONSE');
      await checkUrl(task.outputs[0]);url=task.outputs[0]; // DNS validation only; never fetch provider output.
    }else if(task.outputs.length)throw new VideoError('INVALID_PROVIDER_RESPONSE');
    return {id:task.id,state,url};
  }
  return {
    async upload(image){
      paid();
      const ticket=validateTicket(data(await request(API+'/media/uploads',{method:'POST',headers:apiHeaders,
        body:JSON.stringify({filename:image.filename,size:image.bytes.length,content_type:image.mime})})),image,now());
      // Signed storage URLs come exclusively from this authenticated API response.
      await checkUrl(ticket.upload.url);await checkUrl(ticket.download_url);
      const uploaded=await request(ticket.upload.url,{method:ticket.upload.method,headers:ticket.upload.headers,
        body:image.bytes,timeoutMs:20000,maxBytes:8192});
      if(uploaded.status<200||uploaded.status>=300)throw new VideoError('UPLOAD_FAILED');
      return ticket.download_url;
    },
    async submit(payload){
      paid();
      return await parsePrediction(await request(API+'/'+MODEL,{method:'POST',headers:apiHeaders,body:JSON.stringify(payload)}));
    },
    async get(id){
      if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw new VideoError('INVALID_PROVIDER_RESPONSE');
      return await parsePrediction(await request(API+'/predictions/'+encodeURIComponent(id)+'/result',{headers:apiHeaders}),id);
    },
  };
}
