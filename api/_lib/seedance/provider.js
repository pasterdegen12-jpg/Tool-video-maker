import {validNewRequestDuration} from '../../../src/lib/generationDurationPolicy.js';
import {VIDEO_MODES} from '../../../src/lib/cloudVideoOptions.js';
import { MODEL } from '../../../src/lib/seedanceContract.js';
import { requestHttps, publicAddress } from './transport.js';
import { VideoError } from './errors.js';
import {annotateFailure,diagnosticError,storageFailureReason} from './diagnostics.js';
import {createHash,randomUUID} from 'node:crypto';
export const API='https://api.wavespeed.ai/api/v3';
const terminals=['completed','failed','cancelled','timeout','deleted'];
export function retrySeconds(value,now=Date.now()){
  const n=/^\d+$/.test(String(value))?Number(value):Math.ceil((Date.parse(value)-now)/1000);
  return Number.isFinite(n)&&n>0?Math.min(600,Math.max(2,n)):2;
}
function data(response){
  if(response.status<200||response.status>=300){
    const error=diagnosticError('UPSTREAM_FAILED','HTTP_STATUS',response.status);
    error.retryAfter=response.status===429||response.status===503?retrySeconds(response.headers?.['retry-after']):0;
    throw error;
  }
  try{
    const parsed=JSON.parse(response.body);
    if(parsed.code!==200||!parsed.data||typeof parsed.data!=='object'||Array.isArray(parsed.data))throw 0;
    return parsed.data;
  }catch{throw diagnosticError('INVALID_PROVIDER_RESPONSE','RESPONSE_SCHEMA',response.status);}
}
export function validateTicket(ticket,image,now=Date.now()){
  const u=ticket.upload;
  const invalid=reason=>{throw diagnosticError('INVALID_PROVIDER_RESPONSE',reason);};
  if(ticket.type!=='image')invalid('TICKET_TYPE');
  if(ticket.size!==image.bytes.length)invalid('TICKET_SIZE');
  // WaveSpeed may assign a storage filename. It is metadata, not an echoed
  // request identifier or a URL to construct. Keep a bounded matching suffix.
  if(typeof ticket.filename!=='string'||ticket.filename.length>255||/[/\\]/.test(ticket.filename)||
    Array.from(ticket.filename).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)||
    !(image.mime==='image/png'?/\.png$/i:/\.jpe?g$/i).test(ticket.filename))invalid('TICKET_FILENAME');
  if(typeof ticket.download_url!=='string')invalid('TICKET_DOWNLOAD_URL');
  if(!u||u.method!=='PUT'||typeof u.url!=='string')invalid('TICKET_UPLOAD');
  if(!u.headers||typeof u.headers!=='object'||Array.isArray(u.headers))invalid('TICKET_HEADERS');
  if(!Number.isFinite(Date.parse(u.expires_at))||Date.parse(u.expires_at)<=now||Date.parse(u.expires_at)>now+3600000)invalid('TICKET_EXPIRY');
  const seen=new Set();
  for(const [key,value]of Object.entries(u.headers)){
    const k=key.toLowerCase();
    if(seen.has(k)||!(/^(content-type|if-none-match|x-amz-[a-z0-9-]+|x-goog-[a-z0-9-]+)$/.test(k))||
      typeof value!=='string'||value.length>4096||/[\r\n]/.test(value))invalid('TICKET_HEADERS');
    if(k==='content-type'&&value!==image.mime)invalid('TICKET_CONTENT_TYPE');
    seen.add(k);
  }
  if(!seen.has('content-type')||seen.size>16)invalid('TICKET_HEADERS');
  return ticket;
}
// Upload-only capability for an explicitly authorized local diagnostic. It has
// no prediction method. The web provider below retains its existing paid gate.
export function createImageUploader(apiKey,{request=requestHttps,checkUrl=publicAddress,now=Date.now}={}){
  return {async upload(image){
    let step='TICKET_REQUEST',httpStatus=null;
    try{
      if(!apiKey||/\s/.test(apiKey))throw new VideoError('CONFIGURATION_ERROR');
      const raw=await request(API+'/media/uploads',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
        body:JSON.stringify({filename:image.filename,size:image.bytes.length,content_type:image.mime})});
      httpStatus=raw.status;const parsed=data(raw);
      step='TICKET_VALIDATE';const ticket=validateTicket(parsed,image,now());
      // Signed storage URLs come exclusively from this authenticated response.
      step='UPLOAD_URL_CHECK';httpStatus=null;await checkUrl(ticket.upload.url);
      step='DOWNLOAD_URL_CHECK';await checkUrl(ticket.download_url);
      step='IMAGE_PUT';
      const uploaded=await request(ticket.upload.url,{method:ticket.upload.method,headers:ticket.upload.headers,
        body:image.bytes,timeoutMs:20000,maxBytes:8192});
      httpStatus=uploaded.status;
      if(uploaded.status<200||uploaded.status>=300)throw diagnosticError('UPLOAD_FAILED',storageFailureReason(uploaded.body),uploaded.status);
      return ticket.download_url;
    }catch(error){throw annotateFailure(error,step,httpStatus);}
  }};
}
export function createProvider(config,{request=requestHttps,checkUrl=publicAddress,now=Date.now,diagnostics=event=>console.info(JSON.stringify(event))}={}){
  const apiHeaders={'Authorization':'Bearer '+config.apiKey,'Content-Type':'application/json'};
  const uploader=createImageUploader(config.apiKey,{request,checkUrl,now});
  function paid(){if(config.paidEnabled!==true||!config.apiKey)throw new VideoError('PAID_DISABLED');}
  const models=new Set(Object.values(VIDEO_MODES).map(v=>v.model));
  const checkedModel=model=>{if(!models.has(model))throw new VideoError('INVALID_PROVIDER_MODEL');return model;};
  async function parsePrediction(raw,expectedId,model=MODEL){
    checkedModel(model);
    const task=data(raw);
    // Get Result explicitly permits a deleted tombstone without outputs.
    const deletedWithoutOutputs=task.status==='deleted'&&!Object.hasOwn(task,'outputs');
    if(typeof task.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(task.id)||task.model!==model||
      (expectedId&&task.id!==expectedId)||!['created','pending','queued','processing','running',...terminals].includes(task.status)||
      (!Array.isArray(task.outputs)&&!deletedWithoutOutputs))throw new VideoError('INVALID_PROVIDER_RESPONSE');
    const state=['created','pending'].includes(task.status)?'queued':task.status==='processing'?'running':task.status;
    let url=null;
    if(state==='completed'){
      if(task.outputs.length!==1||typeof task.outputs[0]!=='string')throw new VideoError('INVALID_PROVIDER_RESPONSE');
      await checkUrl(task.outputs[0]);url=task.outputs[0]; // DNS validation only; never fetch provider output.
    }else if(task.outputs?.length)throw new VideoError('INVALID_PROVIDER_RESPONSE');
    return {id:task.id,state,url};
  }
  return {
    async upload(image){
      paid();
      return uploader.upload(image);
    },
    async submit(payload,onAccepted=()=>{},model=MODEL){
      checkedModel(model);
      paid();
      if(!validNewRequestDuration(payload.duration))throw new VideoError('INVALID_PROVIDER_DURATION');
      const body=JSON.stringify(payload),requestId=randomUUID();
      const emit=event=>{try{diagnostics(event);}catch{/* Observability must never retry or block a billable request. */}};
      // Allowlisted scalar diagnostics of the exact serialized request. Never log
      // credentials, dialogue, image URLs or complete payloads; no ledger changes.
      const serialized=JSON.parse(body);
      emit({event:'video_provider_request',requestId,model,bodySha256:createHash('sha256').update(body).digest('hex'),
        promptSha256:createHash('sha256').update(serialized.prompt||'').digest('hex'),promptChars:[...(serialized.prompt||'')].length,
        cameraFixed:serialized.camera_fixed??null,duration:serialized.duration,resolution:serialized.resolution,aspectRatio:serialized.aspect_ratio,
        generateAudio:serialized.generate_audio,seed:serialized.seed??null,hasImage:!!serialized.image,hasLastImage:!!serialized.last_image,referenceImageCount:serialized.reference_images?.length||0});
      const raw=await request(API+'/'+model,{method:'POST',headers:apiHeaders,body});
      if([400,401,402,403,404,422].includes(raw.status))throw new VideoError('SUBMISSION_REJECTED');
      const task=data(raw);
      if(task.model===model&&typeof task.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(task.id)){
        emit({event:'video_provider_accepted',requestId,predictionId:task.id,model});
        // Persist the accepted ID before validating the remaining fields/URLs.
        await onAccepted(task.id);
      }
      return await parsePrediction(raw,undefined,model);
    },
    async get(id,model=MODEL){
      checkedModel(model);
      if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw new VideoError('INVALID_PROVIDER_RESPONSE');
      return await parsePrediction(await request(API+'/predictions/'+encodeURIComponent(id)+'/result',{headers:apiHeaders}),id,model);
    },
  };
}
