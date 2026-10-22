import {authorize,character,binding,enqueue,owned,claim,lease,finish,approve,publicJob,need,LEASE} from './queue.js';
import {checkedResult} from './image.js';

export function qwenService({store,issuer,readImage,now=Date.now}){
 const ids=input=>{need(/^proj_[A-Za-z0-9_-]{1,100}$/.test(input.projectId)&&/^[A-Za-z0-9_-]{1,100}$/.test(input.characterId),'INVALID_REQUEST',422);};
 async function user(session,action,input){
  ids(input);
  const project=await store.project(input.projectId),owner=authorize(project,session,issuer);
  const c=character(project,input.characterId);
  if(action==='create'){
   need(Object.keys(input).sort().join(',')==='characterId,projectId,requestKey','INVALID_REQUEST',422);
   const image=await readImage(c,input.projectId);
   return store.transact({projectId:input.projectId,now:now()},(q,p)=>{
    authorize(p,session,issuer);need(binding(character(p,input.characterId))===binding(c),'CHARACTER_CHANGED');
    const j=enqueue(q,{project:p,projectId:input.projectId,characterId:input.characterId,owner,requestKey:input.requestKey,image},now());j.subject=session.subject;
    return {value:publicJob(j,q,now())};
   });
  }
  need(['status','cancel','confirm'].includes(action),'NOT_FOUND',404);
  if(input.jobId)need(/^[a-f0-9]{64}$/.test(input.jobId),'INVALID_REQUEST',422);
  const q=await store.read();
  const job=input.jobId?owned(q,input.jobId,owner,input.projectId):Object.values(q.jobs).filter(j=>j.owner===owner&&j.projectId===input.projectId&&j.characterId===input.characterId).sort((a,b)=>b.createdAt-a.createdAt)[0];
  if(!job){need(action==='status','JOB_NOT_FOUND',404);return {state:'idle',worker:q.worker.at+150000>now()?q.worker.status:'offline'};}
  need(job.characterId===input.characterId,'JOB_NOT_FOUND',404);
  if(action==='confirm'&&job.state!=='confirmed')need((await readImage(c,input.projectId)).sha256===job.sourceHash,'CHARACTER_CHANGED');
  return store.transact({projectId:input.projectId,resultId:job.id,now:now()},(state,p,result)=>{
   authorize(p,session,issuer);const j=owned(state,job.id,owner,input.projectId);
   if(['queued','running','proposal_ready'].includes(j.state)&&binding(character(p,j.characterId))!==j.binding){j.state='cancelled';j.error='CHARACTER_CHANGED';j.updatedAt=now();}
   if(action==='confirm'){
    need(Object.keys(input).sort().join(',')==='characterId,confirm,confirmedId,jobId,projectId','INVALID_REQUEST',422);
    const saved=approve(state,{...p,id:input.projectId},j.id,owner,input,result,now());
    return{patchProject:{data:saved.project.data,characters:saved.project.characters},value:saved};
   }
   if(action==='cancel'&&['queued','running','proposal_ready'].includes(j.state)){j.state='cancelled';j.updatedAt=now();}
   return{value:publicJob(j,state,now(),result)};
  });
 }
 async function worker(action,input){
  if(action==='claim'){
   need(typeof input.ready==='boolean','INVALID_REQUEST',422);
   const reply=await store.transact({now:now()},q=>({value:{job:claim(q,input.ready,now()),pollAfterMs:60000}}));
   if(reply.job){
    try{const q=await store.read(),j=q.jobs[reply.job.id],p=await store.project(j.projectId);authorize(p,{subject:j.subject},issuer);need(binding(character(p,j.characterId))===j.binding,'CHARACTER_CHANGED');}
    catch{await store.transact({now:now()},q=>{const j=q.jobs[reply.job.id];if(j?.state==='running'){j.state='cancelled';j.updatedAt=now();j.error='CHARACTER_CHANGED';}return{value:null};});reply.job=null;}
   }
   return reply;
  }
  need(['renew','result','retry','fail'].includes(action)&&/^[a-f0-9]{64}$/.test(input.jobId)&&/^[a-f0-9]{64}$/.test(input.lease),'INVALID_REQUEST',422);
  const q=await store.read(),record=q.jobs[input.jobId];need(record,'JOB_NOT_FOUND',404);
  const result=action==='result'?checkedResult(input.result):null;
  return store.transact({projectId:record.projectId,resultId:record.id,now:now()},(state,p)=>{
   authorize(p,{subject:record.subject},issuer);
   need(binding(character(p,record.characterId))===record.binding,'CHARACTER_CHANGED');
   let j;
   if(action==='result'){j=finish(state,record.id,input.lease,result,now());return{saveResult:result,value:{state:j.state}};}
   j=lease(state,record.id,input.lease,now());
   state.worker={at:now(),status:action==='retry'?'unavailable':'busy'};
   if(action==='renew'){j.leaseUntil=now()+LEASE;j.updatedAt=now();}
   else {j.state=action==='retry'&&j.attempts<3?'queued':'failed';j.nextAt=now()+60000;j.leaseUntil=0;j.error=action==='retry'?'GPU_UNAVAILABLE':'INFERENCE_FAILED';j.updatedAt=now();}
   return{value:{state:j.state}};
  });
 }
 return {user,worker};
}
