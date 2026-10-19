import {videoMode,validateCloudSettings,composeVideoPrompt,cloudVideoCost} from '../../../src/lib/cloudVideoOptions.js';
import {createHash,randomBytes} from 'node:crypto';
import {composeScene,estimateCost,validateSettings,planDuration,MODEL} from '../../../src/lib/seedanceContract.js';
import {MAX_SELECTED_IMAGE_BYTES,MAX_SELECTED_IMAGE_PIXELS} from '../../../src/lib/seedanceImage.js';
import {CLOUD_MAX_DURATION} from '../../../src/lib/cloudVideoContract.js';
import {readSceneDuration,SPEECH_ASSUMPTIONS} from '../../../src/lib/sceneDuration.js';

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
export function sceneSnapshot(project,sceneId){
  const scenes=project.data?.filter(s=>String(s.scene_n)===String(sceneId));
  requireValue(project.projectType==='full-ai'&&scenes?.length===1,'SCENE_NOT_FOUND',404);
  return hash({projectType:project.projectType,sceneId:String(sceneId),prompt:composeScene(scenes[0]).prompt,
    startFrameUrl:scenes[0].startFrameUrl||'',imageUrl:scenes[0].imageUrl||''});
}
export function prepareQuote(project,input,now){
  requireValue(project.projectType==='full-ai','FULL_AI_REQUIRED');
  requireValue(input&&Object.keys(input).every(k=>['assumptions','image','images','project_id','scene_id','settings','stored_image','mode','additional_prompt','attempt_key'].includes(k)));
  const modern=Object.hasOwn(input,'mode'),mode=modern?input.mode:'start_frame_to_video',cap=videoMode(mode);
  if(modern)requireValue(typeof mode==='string'&&mode.length>0);
  if(Object.hasOwn(input,'additional_prompt'))requireValue(typeof input.additional_prompt==='string');
  if(input.attempt_key!==undefined)requireValue(modern&&/^[a-f0-9-]{36}$/.test(input.attempt_key),'INVALID_ATTEMPT_KEY');
  requireValue(mode==='start_frame_to_video'||!input.stored_image,'INVALID_MEDIA');
  if(Object.hasOwn(input,'stored_image'))requireValue(input.stored_image===true);
  const scenes=project.data?.filter(s=>String(s.scene_n)===String(input.scene_id));
  requireValue(scenes?.length===1,'SCENE_NOT_FOUND',404);
  const composed=composeVideoPrompt(scenes[0],input.additional_prompt||'');
  const canonicalDuration=readSceneDuration(scenes[0],cap.maxDuration);
  requireValue(input.settings?.duration===canonicalDuration,'SCENE_DURATION_MISMATCH');
  const settings=modern?validateCloudSettings(input.settings,mode):validateSettings(input.settings,CLOUD_MAX_DURATION),plan=planDuration(composed.dialogue,SPEECH_ASSUMPTIONS);
  requireValue(plan.seconds<=cap.maxDuration&&settings.duration>=Math.ceil(plan.seconds),'DIALOGUE_DURATION');
  let images=[];
  if(mode==='start_frame_to_video'){requireValue(!input.images,'INVALID_MEDIA');images=[declaration(input.image)];}
  else if(mode==='references_to_video'){requireValue(!input.image&&Array.isArray(input.images)&&input.images.length>=1&&input.images.length<=cap.maxImages,'INVALID_MEDIA');images=input.images.map(declaration);}
  else requireValue(!input.image&&!input.images,'INVALID_MEDIA');
  const image=images[0]||null,cost=modern?cloudVideoCost(settings,mode,now):estimateCost(settings,now,CLOUD_MAX_DURATION);
  requireValue(cost,'PRICE_UNAVAILABLE');
  const payload={projectId:input.project_id,sceneId:composed.sceneId,prompt:composed.prompt,settings,image,cost,canonicalDuration,
    snapshotVersion:2,sceneDigest:sceneSnapshot(project,composed.sceneId),storedImage:input.stored_image===true,
    ...(modern?{mode,images,additionalPrompt:input.additional_prompt||'',attemptKey:input.attempt_key||null,model:cap.model}:{})};
  return {...payload,model:cap.model,promptHash:hash(composed.prompt),settingsHash:hash(settings),requestHash:hash(payload)};
}
export function publicQuote(record,paidEnabled){
  return {quote_id:record.id,attempt_id:record.id,request_hash:record.requestHash,scene_id:record.sceneId,
    model:record.model||MODEL,prompt:record.prompt,prompt_sha256:record.promptHash,image_sha256:record.image?.sha256||null,
    ...(record.mode?{mode:record.mode,image_sha256s:record.images.map(i=>i.sha256)}:{}),
    settings:record.settings,cost:record.cost,expires_at:new Date(record.quoteExpires).toISOString(),paid_enabled:paidEnabled};
}
export function publicJob(record){
  const states={QUOTED:'quoted',TICKETING:'uploading',UPLOADING:'uploading',VERIFYING:'uploading',READY:'ready',SUBMITTING:'admission_unknown',UNKNOWN:'admission_unknown',ACCEPTED:'queued',RUNNING:'running',COMPLETED:'completed',FAILED:'failed'};
  return {job_id:record.id,scene_id:record.sceneId,state:states[record.stage],stage:record.stage,
    created_at:new Date(record.createdAt).toISOString(),prediction_id:record.predictionId||null,video_url:record.stage==='COMPLETED'?record.videoUrl:null,
    settings:record.settings,mode:record.mode||'start_frame_to_video',additional_prompt:record.additionalPrompt||'',model:record.model||MODEL,
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
export function checkAdmission(ledger,record,now,limits){
  const active=Object.values(ledger.records).filter(r=>r.id!==record.id&&['SUBMITTING','UNKNOWN','ACCEPTED','RUNNING'].includes(r.stage));
  requireValue(active.length<limits.concurrent,'CONCURRENCY_LIMIT',429);
  requireValue(!Object.values(ledger.records).some(r=>r.id!==record.id&&r.requestHash===record.requestHash&&r.paidConsent),'DUPLICATE_INPUT',409);
  const day=new Date(now).toISOString().slice(0,10),used=ledger.spend[day]||0;
  requireValue(record.cost.microUsd<=limits.perRequest&&(limits.daily===0||used+record.cost.microUsd<=limits.daily),'SPENDING_LIMIT',403);
  return {day,used};
}
export function reserve(ledger,record,now,limits){
  const {day,used}=checkAdmission(ledger,record,now,limits);
  // Reservations include ambiguous/failed submissions; never release automatically.
  ledger.spend[day]=used+record.cost.microUsd;
}
