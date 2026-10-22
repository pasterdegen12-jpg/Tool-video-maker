import {randomBytes,createHash} from 'node:crypto';
import {canonicalIdentity,confirmedIdentity,migrateCharacterIdentity} from '../../../src/lib/characterIdentity.js';
import {validVisualProposal} from '../../../src/lib/visualProfile.js';

export const digest=v=>createHash('sha256').update(typeof v==='string'?v:canonicalIdentity(v)).digest('hex');
export const token=()=>randomBytes(32).toString('hex');
export const TTL=30*60*1000,LEASE=90*1000,RETENTION=86400000;
export const active=j=>['queued','running'].includes(j.state);
export function need(ok,code,status=409){if(!ok)throw Object.assign(Error(code),{code,status});}
export const blank=()=>({version:1,jobs:{},worker:{at:0,status:'offline'},rate:{at:0,count:0}});
export function authorize(project,session,issuer){
 need(project&&project.projectType==='full-ai','PROJECT_NOT_FOUND',404);
 const owner=digest(JSON.stringify([issuer,session.subject]));
 for(const field of ['owner','ownerId','userId'])need(!project[field]||[owner,session.subject].includes(project[field]),'PROJECT_FORBIDDEN',403);
 return owner;
}
export function character(project,id){const matches=project.characters?.filter(c=>c.id===id);need(matches?.length===1,'CHARACTER_NOT_FOUND',404);return matches[0];}
export const binding=c=>digest(c);
export function sweep(q,now){
 const removed=[];
 for(const j of Object.values(q.jobs)){
  if(['queued','running','proposal_ready'].includes(j.state)&&j.expiresAt<=now){j.state='expired';j.updatedAt=now;}
  if(j.state==='running'&&j.leaseUntil<=now){j.state=j.attempts>=3?'failed':'queued';j.error=j.attempts>=3?'WORKER_INTERRUPTED':'WORKER_RETRY';j.nextAt=now+15000;}
  if(!active(j)&&j.updatedAt+RETENTION<=now){delete q.jobs[j.id];removed.push(j.id);}
 }
 return removed;
}
export function enqueue(q,{project,projectId,characterId,owner,requestKey,image},now){
 need(/^[a-f0-9-]{36}$/.test(requestKey),'INVALID_REQUEST',422);
 const c=character(project,characterId),fingerprint=binding(c);
 const repeated=Object.values(q.jobs).find(j=>j.owner===owner&&j.requestKey===requestKey);
 if(repeated){need(repeated.projectId===projectId&&repeated.characterId===characterId,'IDEMPOTENCY_CONFLICT');return repeated;}
 const previous=Object.values(q.jobs).filter(j=>j.projectId===projectId&&j.characterId===characterId);
 const existing=previous.find(j=>active(j)&&j.binding===fingerprint&&j.sourceHash===image.sha256);
 if(existing)return existing;
 need(Object.values(q.jobs).filter(active).length<32&&Object.keys(q.jobs).length<128,'QUEUE_FULL',429);
 if(now-q.rate.at>=60000)q.rate={at:now,count:0};need(q.rate.count<20,'RATE_LIMIT',429);q.rate.count++;
 // New canonical image/character invalidates prior proposals, never a saved identity.
 for(const j of previous)if(['queued','running','proposal_ready'].includes(j.state)){j.state='cancelled';j.updatedAt=now;}
 const id=token();const job={id,projectId,characterId,owner,requestKey,binding:fingerprint,sourceHash:image.sha256,imageUrl:image.url,imageMime:image.mime,
  state:'queued',createdAt:now,updatedAt:now,expiresAt:now+TTL,attempts:0,nextAt:now,leaseHash:null,leaseUntil:0,error:null};
 q.jobs[id]=job;return job;
}
export function owned(q,id,owner,projectId){const j=q.jobs[id];need(j&&j.owner===owner&&j.projectId===projectId,'JOB_NOT_FOUND',404);return j;}
export function lease(q,id,secret,now){const j=q.jobs[id];need(j&&j.state==='running'&&j.leaseUntil>now&&j.leaseHash===digest(secret),'LEASE_LOST');return j;}
export function claim(q,ready,now){
 q.worker={at:now,status:ready?'ready':'unavailable'};
 // Physical concurrency is also enforced by the unchanged single-worker Gateway.
 if(!ready||Object.values(q.jobs).some(j=>j.state==='running'&&j.leaseUntil>now))return null;
 const j=Object.values(q.jobs).filter(j=>j.state==='queued'&&j.nextAt<=now).sort((a,b)=>a.createdAt-b.createdAt)[0];
 if(!j)return null;
 const secret=token();j.state='running';j.attempts++;j.updatedAt=now;j.leaseUntil=now+LEASE;j.leaseHash=digest(secret);
 return {id:j.id,lease:secret,projectId:j.projectId,characterId:j.characterId,imageUrl:j.imageUrl,sourceHash:j.sourceHash,mime:j.imageMime,expiresAt:j.expiresAt};
}
export function finish(q,id,secret,result,now){
 const prior=q.jobs[id];
 if(prior?.state==='proposal_ready'&&prior.leaseHash===digest(secret)){need(prior.resultHash===digest(result),'RESULT_CONFLICT');return prior;}
 const j=lease(q,id,secret,now);
 need(result?.sourceHash===j.sourceHash&&validVisualProposal(result?.profile),'INVALID_RESULT',422);
 j.resultHash=digest(result);j.state='proposal_ready';j.updatedAt=now;j.leaseUntil=0;return j;
}
export function approve(q,project,jobId,owner,input,result,now){
 const j=owned(q,jobId,owner,project.id);
 if(j.state==='confirmed'){need(j.confirmedId===input.confirmedId,'CONFIRM_CONFLICT');return {project,changed:[]};}
 need(j.state==='proposal_ready'&&result&&result.profile.status==='detected'&&input.confirm===true,'PROPOSAL_REQUIRED');
 const c=character(project,j.characterId);need(binding(c)===j.binding,'CHARACTER_CHANGED');
 const migration=migrateCharacterIdentity(project,{projectId:project.id,ownerHash:c.characterIdentity?.ownerHash||owner,characterId:j.characterId,proposal:result.profile,
  confirmedId:input.confirmedId,referenceImage:result.referenceImage,confirmedAt:now,jobId:j.id,expectedPreviousId:confirmedIdentity(c,project.id)?.confirmedId||null});
 j.state='confirmed';j.confirmedId=input.confirmedId;j.updatedAt=now;
 return {project:{...project,data:migration.data,characters:migration.characters},changed:migration.changed};
}
export function publicJob(j,q,now,result){
 const worker=q.worker.at+150000>now?q.worker.status:'offline';
 return {id:j.id,projectId:j.projectId,characterId:j.characterId,state:j.state,expiresAt:j.expiresAt,error:j.error,worker,
  ...(j.state==='proposal_ready'&&result?{profile:result.profile,referenceImage:result.referenceImage}:{}),
  pollAfterMs:j.state==='running'?5000:worker==='offline'?30000:15000};
}
