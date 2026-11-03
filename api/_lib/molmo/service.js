import {authorize,character,binding,digest,token,need} from '../qwen/queue.js';
import {confirmedIdentity} from '../../../src/lib/characterIdentity.js';
import {parseMolmoOutputs} from './output.js';
import {MOLMO_MODEL,PROMPT_VERSION} from './prompt.js';
const active=['submitting','running','unknown'];
const terminal=['failed','cancelled','timeout','deleted'];
const view=j=>j?{id:j.id,projectId:j.projectId,characterId:j.characterId,state:j.state,predictionId:j.predictionId||null,error:j.error||null,...(j.profile?{profile:j.profile}:{}),pollAfterMs:2000}:{state:'idle'};
export function molmoService({store,issuer,readImage,provider,now=Date.now}){return {async user(session,action,input){
 need(input&&/^proj_[A-Za-z0-9_-]{1,100}$/.test(input.projectId)&&/^[A-Za-z0-9_-]{1,100}$/.test(input.characterId),'INVALID_REQUEST',422);
 need(['create','status','cancel'].includes(action),'NOT_FOUND',404);
 const project=await store.project(input.projectId),owner=authorize(project,session,issuer),c=character(project,input.characterId);
 const key=digest([owner,input.projectId,input.characterId]);
 const change=fn=>store.transact(key,input.projectId,(state,p)=>{authorize(p,session,issuer);return fn(state,p);});
 if(action==='create'){
  need(Object.keys(input).sort().join(',')==='characterId,projectId,requestKey'&&/^[a-f0-9-]{36}$/.test(input.requestKey),'INVALID_REQUEST',422);
  const image=await readImage(c,input.projectId),jobId=digest([key,input.requestKey]);
  const admitted=await change((state,p)=>{
   need(binding(character(p,input.characterId))===binding(c),'CHARACTER_CHANGED');
   if(state.jobs[jobId])return{value:{job:state.jobs[jobId],send:false}};
   const cached=Object.values(state.jobs).find(j=>(!state.latestJobId||state.latestJobId===j.id)&&j.sourceHash===image.sha256&&j.model===MOLMO_MODEL&&j.promptVersion===PROMPT_VERSION&&j.binding===binding(c)&&active.includes(j.state));
   if(cached)return{value:{job:cached,send:false}};
   const job={id:jobId,projectId:input.projectId,characterId:input.characterId,model:MOLMO_MODEL,promptVersion:PROMPT_VERSION,binding:binding(c),sourceHash:image.sha256,imageUrl:image.url,state:'submitting',createdAt:now(),updatedAt:now(),deadline:now()+300000};
   state.latestJobId=jobId;job.autoSave=true;state.jobs[jobId]=job;return{value:{job,send:true}};
  });
  if(!admitted.send)return {...view(admitted.job),identity:c.characterIdentity?.jobId===admitted.job.id?c.characterIdentity:null};
  // A committed reservation precedes the only paid POST. No retry, including
  // connection loss or process death; status can recover a persisted ID only.
  try{
   const accepted=await provider.submit(image.url);
   await change(state=>{const j=state.jobs[jobId];j.predictionId=accepted.id;j.state='running';j.updatedAt=now();return{value:null};});
  }catch{
   await change(state=>{const j=state.jobs[jobId];if(!j.predictionId){j.state='unknown';j.error='SUBMISSION_UNKNOWN';}return{value:null};});
  }
  return view((await store.read(key)).jobs[jobId]);
 }
 const current=await store.read(key),job=input.jobId?current.jobs[input.jobId]:current.jobs[current.latestJobId]||Object.values(current.jobs).sort((a,b)=>b.createdAt-a.createdAt)[0];
 if(!job){need(action==='status','JOB_NOT_FOUND',404);return view(null);}
 if(action==='status'&&job.state!=='confirmed'&&job.binding!==binding(c))return view({...job,state:'failed',error:'CHARACTER_CHANGED',profile:undefined});
 if(action==='cancel')return view(job); // Stop UI polling only; retain paid job and its ID.
 // Old proposals were collected under manual review. Leave them in history.
 if(job.state==='proposal_ready')return view(null);
 if(job.state==='confirmed')return {...view(job),identity:c.characterIdentity?.jobId===job.id?c.characterIdentity:null};
 if(job.state==='submitting'&&now()-job.createdAt>60000){
  return change(state=>{const j=state.jobs[job.id];if(j.state==='submitting'){j.state='unknown';j.error='SUBMISSION_UNKNOWN';}return{value:view(j)};});
 }
 if(job.state!=='running')return view(job);
 const expired=job.deadline<=now();
 const polledView=j=>view(expired&&j.state==='running'?{...j,state:'polling_paused',error:'POLLING_TIMEOUT'}:j);
 const lease=token();
 const claimed=await change(state=>{const j=state.jobs[job.id];if(j.state!=='running'||j.pollUntil>now()||j.nextPoll>now())return{value:false};j.pollToken=lease;j.pollUntil=now()+30000;j.nextPoll=now()+2000;return{value:true};});
 if(!claimed)return polledView(job);
 try{
  const result=await provider.get(job.predictionId);
  let profile,error;
  if(result.status==='completed'){try{profile=parseMolmoOutputs(result.outputs);}catch(e){error=e.code||'VISUAL_OUTPUT_INVALID';}}
  if(profile?.status==='detected' && job.autoSave){
   const image=await readImage(c,input.projectId);
   if(image.sha256!==job.sourceHash)error='CHARACTER_CHANGED';
  }
  return change((state,p)=>{const j=state.jobs[job.id];if(j.pollToken!==lease)return{value:view(j)};
   j.pollUntil=0;j.updatedAt=now();
   if(binding(character(p,input.characterId))!==j.binding){j.state='failed';j.error='CHARACTER_CHANGED';}
   else if(error){j.state='failed';j.error=error;}
   else if(profile){
    if(!j.autoSave){j.profile=profile;j.state='proposal_ready';}
    else if(state.latestJobId!==j.id||profile.status!=='detected'){
     j.state='failed';j.error='NO_CURRENT_VISUAL_ID';
    }else{
     const selected=character(p,j.characterId),confirmedId=profile.visual_id;
     const conflict=p.characters.some(other=>other.id!==selected.id&&[other.id,other.name,confirmedIdentity(other,j.projectId)?.confirmedId,...(other.characterIdentity?.previousIds||[])].includes(confirmedId));
     if(conflict){j.state='failed';j.error='IDENTITY_CONFLICT';return {value:view(j)};}
     const old=selected.characterIdentity;
     const identity={version:1,status:'confirmed',projectId:j.projectId,ownerHash:old?.ownerHash||owner,characterId:selected.id,originalName:old?.originalName||selected.name,
      confirmedId,proposal:profile,referenceImage:{url:j.imageUrl,sha256:j.sourceHash},sourceImageUrl:j.imageUrl,confirmedAt:now(),jobId:j.id,
      previousIds:[...new Set([...(old?.previousIds||[]),...(old?.confirmedId?[old.confirmedId]:[])])]};
     j.profile=profile;j.state='confirmed';j.confirmedId=confirmedId;
     return {characters:p.characters.map(x=>x.id===selected.id?{...x,characterIdentity:identity}:x),value:{...view(j),identity}};
    }
   }
   else if(terminal.includes(result.status)){j.state='failed';j.error='PROVIDER_'+result.status.toUpperCase();}
   return{value:polledView(j)};
  });
 }catch{
  return change(state=>{const j=state.jobs[job.id];if(j.pollToken===lease){j.pollUntil=0;j.nextPoll=now()+10000;}return{value:{...polledView(j),pollAfterMs:10000}};});
 }
}};}
