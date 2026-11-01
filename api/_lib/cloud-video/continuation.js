import {hash,ownerOf,requireValue,CloudError} from './core.js';
import {videoTrace} from './trace.js';
export const VIDEO_TOPIC='video-continuation';
export function createVideoContinuation({store,service,config,send,now=Date.now}){
 const key=m=>hash([m.kind,m.projectId,m.attemptId||'']);
 const session=m=>({subject:m.subject,session:'server-video-continuation'});
 const marker=async(m,until)=>store.transact(ownerOf(session(m),config.issuer),l=>{l.dispatcher||={};l.dispatcher[key(m)]={until};});
 return {
  async probe(s,projectId){await store.project(ownerOf(s,config.issuer),projectId);const result=await send(VIDEO_TOPIC,{kind:'probe',subject:s.subject,projectId},{retentionSeconds:300});return{queued:true,message_id:result.messageId};},
  async wakeRecord(s,attemptId){const l=await store.read(ownerOf(s,config.issuer));const r=l.records[attemptId];requireValue(r,'NOT_FOUND',404);return this.wake(s,r.projectId,attemptId);},
  async wake(s,projectId,attemptId){
   await store.project(ownerOf(s,config.issuer),projectId);
   const message={kind:attemptId?'poll':'batch',subject:s.subject,projectId,deadline:now()+86400000,...(attemptId?{attemptId}:{})};
   const claimed=await store.transact(ownerOf(s,config.issuer),l=>{l.dispatcher||={};if(l.dispatcher[key(message)]?.until>now())return false;l.dispatcher[key(message)]={until:now()+180000};return true;});
   if(!claimed)return;
   try{await send(VIDEO_TOPIC,message,{idempotencyKey:key(message)+':'+Math.floor(now()/60000),retentionSeconds:86400});videoTrace('JOB_QUEUED',{projectId,attemptId});}
   catch{await marker(message,0);throw new CloudError('DISPATCH_UNAVAILABLE',503);}
  },
  async consume(m,metadata){
   requireValue(m&&['batch','poll','probe'].includes(m.kind)&&typeof m.subject==='string'&&/^proj_[A-Za-z0-9_-]{1,100}$/.test(m.projectId)&&(!m.attemptId||/^[a-f0-9]{48}$/.test(m.attemptId)),'INVALID_QUEUE_MESSAGE');
   const s=session(m);await store.project(ownerOf(s,config.issuer),m.projectId);
   if(m.kind==='probe'){videoTrace('CONTINUATION_PROBE',{projectId:m.projectId,state:'received'});return;}
   if(!Number.isFinite(m.deadline)||m.deadline<now()){await marker(m,0);videoTrace('CONTINUATION_BLOCKED',{projectId:m.projectId,code:'RECOVERY_REQUIRED'});return;}
   let pending;
   if(m.kind==='batch'){const result=await service.batch_tick(s,{project_id:m.projectId});pending=result.batches.some(b=>b.status==='running')&&!result.batches.some(b=>b.items.some(i=>i.state==='admission_unknown'));}
   else {const result=await service.poll(s,m.attemptId);pending=['queued','running'].includes(result.state);}
   if(pending){
    // Acknowledge only after the next durable wake-up exists. Redelivery uses
    // this deterministic key; existing ledger leases guard all paid dispatches.
    await send(VIDEO_TOPIC,m,{idempotencyKey:metadata.messageId+':next',delaySeconds:15,retentionSeconds:86400});await marker(m,now()+180000);
   }else await marker(m,0);
   videoTrace('CONTINUATION_COMPLETE',{projectId:m.projectId,attemptId:m.attemptId,state:pending?'waiting':'finished'});
  },
 };
}
