import {createHash,randomBytes} from 'node:crypto';
import {composeScene,estimateCost,validateSettings,planDuration,MODEL} from '../../../src/lib/seedanceContract.js';
import {MAX_SELECTED_IMAGE_BYTES,MAX_SELECTED_IMAGE_PIXELS} from '../../../src/lib/seedanceImage.js';

export const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const hash=value=>createHash('sha256').update(typeof value==='string'||value instanceof Uint8Array?value:canonical(value)).digest('hex');
export const id=()=>randomBytes(24).toString('hex');
export class CloudError extends Error {constructor(code,status=409){super(code);this.code=code;this.status=status;}}
export const requireValue=(condition,code='INVALID_REQUEST',status=422)=>{if(!condition)throw new CloudError(code,status);};
export const ownerOf=(session,issuer)=>hash([issuer,session.subject]);
export const sessionOf=session=>hash(session.session);
export function declaration(image){
  requireValue(image&&Object.keys(image).sort().join(',')==='height,mime,sha256,size,width');
  requireValue(/^[a-f0-9]{64}$/.test(image.sha256)&&['image/png','image/jpeg'].includes(image.mime));
  requireValue(Number.isInteger(image.size)&&image.size>0&&image.size<=MAX_SELECTED_IMAGE_BYTES);
  requireValue([image.width,image.height].every(n=>Number.isInteger(n)&&n>=32&&n<=16384)&&image.width*image.height<=MAX_SELECTED_IMAGE_PIXELS);
  return {...image};
}
export function sourceDigest(project){
  // Covers the complete saved document, including existing media and identities.
  return hash(project);
}
export function prepareQuote(project,input,now){
  requireValue(project.projectType==='full-ai','FULL_AI_REQUIRED');
  requireValue(input&&Object.keys(input).sort().join(',')==='assumptions,image,project_id,scene_id,settings');
  const scenes=project.data?.filter(s=>String(s.scene_n)===String(input.scene_id));
  requireValue(scenes?.length===1,'SCENE_NOT_FOUND',404);
  const composed=composeScene(scenes[0]);
  const settings=validateSettings(input.settings),plan=planDuration(composed.dialogue,input.assumptions);
  requireValue(plan.fits&&settings.duration>=Math.ceil(plan.seconds),'DIALOGUE_DURATION');
  const image=declaration(input.image),cost=estimateCost(settings,now);
  requireValue(cost,'PRICE_UNAVAILABLE');
  const payload={projectId:input.project_id,sceneId:composed.sceneId,prompt:composed.prompt,settings,image,cost,sourceDigest:sourceDigest(project)};
  return {...payload,model:MODEL,promptHash:hash(composed.prompt),settingsHash:hash(settings),requestHash:hash(payload)};
}
export function publicQuote(record,paidEnabled){
  return {quote_id:record.id,attempt_id:record.id,request_hash:record.requestHash,scene_id:record.sceneId,
    model:MODEL,prompt:record.prompt,prompt_sha256:record.promptHash,image_sha256:record.image.sha256,
    settings:record.settings,cost:record.cost,expires_at:new Date(record.quoteExpires).toISOString(),paid_enabled:paidEnabled};
}
export function publicJob(record){
  const states={QUOTED:'quoted',TICKETING:'uploading',UPLOADING:'uploading',VERIFYING:'uploading',READY:'ready',SUBMITTING:'admission_unknown',UNKNOWN:'admission_unknown',ACCEPTED:'queued',RUNNING:'running',COMPLETED:'completed',FAILED:'failed'};
  return {job_id:record.id,scene_id:record.sceneId,state:states[record.stage],stage:record.stage,
    prediction_id:record.predictionId||null,video_url:record.stage==='COMPLETED'?record.videoUrl:null,
    message:record.failure||'',speech_review:'unverified',expires_at:new Date(record.createdAt+30*86400000).toISOString()};
}
export function newLedger(){return {version:1,records:{},rates:{},spend:{}};}
export function rate(ledger,key,now,max){
  const previous=ledger.rates[key]||{start:now,count:0};
  const current=now-previous.start>=60000?{start:now,count:0}:previous;
  requireValue(current.count<max,'RATE_LIMIT',429);current.count++;ledger.rates[key]=current;
}
export function authorizeRecord(ledger,recordId,session,{requireSession=false}={}){
  const record=ledger.records[recordId];requireValue(record,'NOT_FOUND',404);
  if(requireSession)requireValue(record.sessionHash===sessionOf(session),'SESSION_MISMATCH',403);
  return record;
}
export function reserve(ledger,record,now,limits){
  const active=Object.values(ledger.records).filter(r=>r.id!==record.id&&['SUBMITTING','UNKNOWN','ACCEPTED','RUNNING'].includes(r.stage));
  requireValue(active.length<limits.concurrent,'CONCURRENCY_LIMIT',429);
  requireValue(!Object.values(ledger.records).some(r=>r.id!==record.id&&r.requestHash===record.requestHash&&r.paidConsent),'DUPLICATE_INPUT',409);
  const day=new Date(now).toISOString().slice(0,10),used=ledger.spend[day]||0;
  requireValue(record.cost.microUsd<=limits.perRequest&&used+record.cost.microUsd<=limits.daily,'SPENDING_LIMIT',403);
  // Reservations include ambiguous/failed submissions; never release automatically.
  ledger.spend[day]=used+record.cost.microUsd;
}
