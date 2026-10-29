import {id,hash,canonical,ownerOf,sceneSnapshot,requireValue,publicJob} from './core.js';
import {batchSceneOptions,batchCounts,BATCH_TERMINAL} from '../../../src/lib/videoBatchPlan.js';

const activeStages=['SUBMITTING','UNKNOWN','ACCEPTED','RUNNING'];
export function batchReserves(ledger,projectId,sceneId,except){
 return Object.values(ledger.batches||{}).some(b=>b.id!==except&&b.projectId===projectId&&b.items.some(i=>String(i.sceneId)===String(sceneId)&&!BATCH_TERMINAL.includes(i.state)));
}
function boundPlan(project,scene,now){
 const options=batchSceneOptions(scene,now);
 const digest=hash({scene:sceneSnapshot(project,scene.scene_n),duration:scene.duration_seconds??null,options:scene.videoJob?.options||null,output:scene.videoUrl||null});
 return {sceneId:scene.scene_n,digest,...options};
}
function view(batch,ledger){
 const items=batch.items.map(i=>{
  const r=ledger.records[i.attemptId];
  return {scene_id:i.sceneId,state:i.state,error:i.error||'',retry_at:i.nextAt||0,settings:i.settings,mode:i.mode,cost:i.cost,job:r?publicJob(r):null};
 });
 return {batch_id:batch.id,project_id:batch.projectId,created_at:batch.createdAt,...batchCounts(batch.items),items};
}
export function createVideoBatchService({config,store,video,sourceImage,upload,now=Date.now}){
 const owner=s=>ownerOf(s,config.issuer),change=(s,fn)=>store.transact(owner(s),fn);
 const actor=(s,b)=>({...s,session:'authorized-video-batch:'+b.id}); // Trusted durable consent context, never a browser JWT.
 async function list(s,projectId){
  await store.project(owner(s),projectId);const l=await store.read(owner(s));
  return {batches:Object.values(l.batches||{}).filter(b=>b.projectId===projectId).sort((a,b)=>b.createdAt-a.createdAt).map(b=>view(b,l)),concurrency:Math.min(config.limits.concurrent,config.teamLimits.concurrent),continuation:'while_project_open'};
 }
 return {
  async batch_plan(s,input){
   requireValue(input&&Object.keys(input).join(',')==='project_id');
   const p=await store.project(owner(s),input.project_id),l=await store.read(owner(s));requireValue(p.projectType==='full-ai','FULL_AI_REQUIRED');
   const scenes=p.data.map(scene=>{
    let plan,reason='',status='eligible';
    const active=Object.values(l.records).some(r=>r.projectId===input.project_id&&String(r.sceneId)===String(scene.scene_n)&&activeStages.includes(r.stage))||batchReserves(l,input.project_id,scene.scene_n);
    try{plan=boundPlan(p,scene,now());}catch(e){reason=e.message;status='invalid';}
    if(active){reason='Đang có job hoặc đang chờ trong lô khác.';status='active';}
    else if(scene.videoUrl){reason='Đã có OUTPUT. Tạo lại riêng bằng Gen Video AI để giữ lịch sử.';status='completed';}
    return {scene_id:scene.scene_n,character:scene.Character||'',status,reason,eligible:status==='eligible',...(plan?{digest:plan.digest,settings:plan.settings,mode:plan.mode,cost:plan.cost,additional_prompt:plan.additional_prompt}:{} )};
   });
   return {project_id:input.project_id,scenes,concurrency:Math.min(config.limits.concurrent,config.teamLimits.concurrent)};
  },
  async batch_create(s,input){
   requireValue(config.paidEnabled,'PAID_DISABLED',403);
   requireValue(input&&Object.keys(input).sort().join(',')==='confirm,idempotency_key,project_id,scenes'&&input.confirm===true&&/^[a-f0-9-]{36}$/.test(input.idempotency_key));
   requireValue(Array.isArray(input.scenes)&&input.scenes.length>0&&input.scenes.length<=100&&new Set(input.scenes.map(i=>String(i.scene_id))).size===input.scenes.length);
   requireValue(input.scenes.every(i=>Object.keys(i).sort().join(',')==='digest,scene_id'&&/^[a-f0-9]{64}$/.test(i.digest)));
   const batchId=hash([owner(s),input.project_id,input.idempotency_key]).slice(0,48),selectionHash=hash(input.scenes),p=await store.project(owner(s),input.project_id);
   requireValue(p.projectType==='full-ai','FULL_AI_REQUIRED');
   const items=input.scenes.map(selected=>{
    const scene=p.data?.find(x=>String(x.scene_n)===String(selected.scene_id));let item={sceneId:selected.scene_id,state:'pending',attemptId:id(),tries:0,nextAt:0,lastWorked:0};
    try{requireValue(scene,'SCENE_NOT_FOUND');const plan=boundPlan(p,scene,now());requireValue(plan.digest===selected.digest,'SCENE_CHANGED');requireValue(!scene.videoUrl,'OUTPUT_EXISTS');item={...item,...plan};}
    catch(e){item.state='skipped';item.error=e.code||'SCENE_CONFIGURATION_CHANGED';}
    return item;
   });
   await change(s,l=>{
    l.batches||={};const old=l.batches[batchId];if(old){requireValue(old.selectionHash===selectionHash,'IDEMPOTENCY_CONFLICT');return;}
    for(const i of items)if(i.state==='pending'&&(batchReserves(l,input.project_id,i.sceneId)||Object.values(l.records).some(r=>r.projectId===input.project_id&&String(r.sceneId)===String(i.sceneId)&&activeStages.includes(r.stage)))){i.state='skipped';i.error='SCENE_ALREADY_QUEUED';}
    l.batches[batchId]={id:batchId,projectId:input.project_id,createdAt:now(),consentAt:now(),selectionHash,items};
   });
   return list(s,input.project_id);
  },
  async batch_list(s,input){return list(s,input.project_id);},
  async batch_cancel(s,input){
   await store.project(owner(s),input.project_id);
   await change(s,l=>{const b=l.batches?.[input.batch_id];requireValue(b&&b.projectId===input.project_id,'NOT_FOUND',404);b.cancelledAt=now();for(const i of b.items){const r=l.records[i.attemptId];if(!r?.paidConsent&&!activeStages.includes(r?.stage)&&!BATCH_TERMINAL.includes(i.state)){i.state='cancelled';i.error='CANCELLED_BEFORE_SUBMIT';}}});
   return list(s,input.project_id);
  },
  async batch_tick(s,input){
   await store.project(owner(s),input.project_id);
   const token=id();
   const claim=await change(s,(l,team)=>{
    if((l.batchLeaseUntil||0)>now()||(l.batchNextTick||0)>now())return null;
    const active=Object.values(l.records).filter(r=>activeStages.includes(r.stage)).length;
    const teamActive=Object.values(team.records).filter(r=>activeStages.includes(r.stage)).length;
    const capacity=active<config.limits.concurrent&&teamActive<config.teamLimits.concurrent;
    const candidates=Object.values(l.batches||{}).filter(b=>b.projectId===input.project_id).flatMap(b=>b.items.map(i=>({b,i,r:l.records[i.attemptId]}))).filter(({i,r})=>!BATCH_TERMINAL.includes(i.state)&&(i.nextAt||0)<=now()&&(r?.paidConsent||capacity));
    // Fill available capacity first; otherwise rotate polls by last work time.
    const priority=x=>x.r?.paidConsent?3:x.r?.stage==='READY'?0:x.r?1:2;
    candidates.sort((a,b)=>(capacity?priority(a)-priority(b):0)||(a.i.lastWorked||0)-(b.i.lastWorked||0));
    if(!candidates.length){l.batchNextTick=now()+5000;return null;}
    const {b,i}=candidates[0];i.lastWorked=now();l.batchLease=token;l.batchLeaseUntil=now()+150000;l.batchNextTick=now()+5000;
    return {batch:structuredClone(b),item:structuredClone(i)};
   });
   if(!claim)return list(s,input.project_id);
   const {batch:b,item:i}=claim,a=actor(s,b);
   let state=i.state,error='',nextAt=0,tries=i.tries;
   try{
    let l=await store.read(owner(s)),r=l.records[i.attemptId];
    if(r?.paidConsent){const job=await video.poll(a,r.id);state=job.state;error=job.message||'';if(state==='admission_unknown')nextAt=now()+60000;}
    else{
     const p=await store.project(owner(s),b.projectId),scene=p.data?.find(x=>String(x.scene_n)===String(i.sceneId));
     requireValue(scene&&boundPlan(p,scene,now()).digest===i.digest,'SCENE_CHANGED');
     if(!r){
      const source=i.mode==='start_frame_to_video'?await sourceImage(p,b.projectId,i.sceneId):null;
      await video.quote(a,{project_id:b.projectId,scene_id:i.sceneId,mode:i.mode,settings:i.settings,additional_prompt:i.additional_prompt,...(source?{image:source.image}:{})},{batchId:b.id,attemptId:i.attemptId});state='preparing';
     }else if(r.stage==='QUOTED'){
      const source=await sourceImage(p,b.projectId,i.sceneId,{includeBytes:true});
      try{
       requireValue(canonical(source.image)===canonical(r.image),'SOURCE_IMAGE_CHANGED');
       const ticket=await video.ticket(a,{quote_id:r.id,request_hash:r.requestHash,transfer_consent:true});
       await upload.transfer(ticket,source.bytes,r.image);
       await video.verify(a,{attempt_id:r.id,request_hash:r.requestHash});state='ready';
      }finally{source.bytes?.fill(0);}
     }else if(r.stage==='READY'){
      const job=await video.submit(a,{attempt_id:r.id,request_hash:r.requestHash,confirm:true,cost_micro_usd:r.cost.microUsd});state=job.state;error=job.message||'';
     }else{state='failed';error=r.failure||'PREPARATION_INTERRUPTED';}
    }
   }catch(e){
    const r=(await store.read(owner(s))).records[i.attemptId];
    if(r?.paidConsent){state=r.predictionId?'running':'admission_unknown';error='RECOVER_EXISTING_ATTEMPT';nextAt=now()+30000;}
    else if(['RATE_LIMIT','CONCURRENCY_LIMIT'].includes(e.code)&&tries<5){tries++;nextAt=now()+Math.max(10000,Math.min(300000,(e.retryAfter||Math.pow(2,tries)*5)*1000));error=e.code;}
    else{state='failed';error=/^[A-Z0-9_]{2,70}$/.test(e.code||'')?e.code:'BATCH_PREPARATION_FAILED';}
   }finally{
    await change(s,l=>{if(l.batchLease!==token)return;const item=l.batches[b.id].items.find(x=>x.attemptId===i.attemptId);if(item.state!=='cancelled')Object.assign(item,{state,error,nextAt,tries});l.batchLeaseUntil=0;l.batchNextTick=now()+5000;});
   }
   return list(s,input.project_id);
  },
 };
}
