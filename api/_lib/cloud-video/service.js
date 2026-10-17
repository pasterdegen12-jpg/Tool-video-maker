import {Buffer} from 'node:buffer';
import {id,ownerOf,sessionOf,prepareQuote,publicQuote,publicJob,authorizeRecord,rate,reserve,requireValue,CloudError,sourceDigest} from './core.js';

// Each provider operation is separated by a committed transaction. A cold start
// may resume GET polling, but can never resume/repeat a prediction POST.
export function createCloudVideoService({config,store,upload,provider,archive,now=Date.now}){
  const owner=session=>ownerOf(session,config.issuer);
  const change=(session,fn)=>store.transact(owner(session),(ledger,team)=>{
    const result=fn(ledger,team);
    for(const r of Object.values(ledger.records))if(r.paidConsent)team.records[r.id]={id:r.id,stage:r.stage,requestHash:r.requestHash,paidConsent:true,owner:owner(session)};
    return result;
  });
  const project=(session,projectId)=>store.project(owner(session),projectId);
  async function owned(session,attemptId,strict=false){
    requireValue(/^[a-f0-9]{48}$/.test(attemptId),'INVALID_ID');
    const record=authorizeRecord(await store.read(owner(session)),attemptId,session,{requireSession:strict});
    await store.project(owner(session),record.projectId,false);return record;
  }
  async function unchanged(session,r){
    requireValue(sourceDigest(await project(session,r.projectId))===r.sourceDigest,'PROJECT_CHANGED');
  }
  const validQuote=(r,session,requestHash)=>{
    requireValue(r.sessionHash===sessionOf(session),'SESSION_MISMATCH',403);
    requireValue(r.quoteExpires>now(),'QUOTE_EXPIRED',410);
    requireValue(r.requestHash===requestHash,'QUOTE_MISMATCH');
  };
  const transition=(r,stage)=>{if(r.stage===stage)return;r.stage=stage;r.updatedAt=now();r.transitions.push({stage,at:r.updatedAt});};
  async function failBeforePrediction(session,attemptId,code){
    await change(session,l=>{const r=authorizeRecord(l,attemptId,session);if(['TICKETING','UPLOADING','VERIFYING'].includes(r.stage)){r.failure=code;transition(r,'FAILED');}});
  }
  async function poll(session,attemptId){
    let record=await owned(session,attemptId);
    if(!record.predictionId||['COMPLETED','FAILED'].includes(record.stage))return publicJob(record);
    const ticket=id();
    const claimed=await change(session,l=>{
      const r=authorizeRecord(l,attemptId,session);rate(l,'poll',now(),40);
      if(r.nextPoll>now()||r.pollUntil>now())return false;
      r.pollToken=ticket;r.pollUntil=now()+30000;r.nextPoll=now()+3000;return true;
    });
    if(!claimed)return publicJob(record);
    let result;
    try{result=await provider.get(record.predictionId);}catch{
      await change(session,l=>{const r=l.records[attemptId];if(r.pollToken===ticket){r.pollUntil=0;r.failure='STATUS_UNAVAILABLE; use recovery, do not resubmit';}});
      return publicJob(await owned(session,attemptId));
    }
    let archived=null;
    if(result.state==='completed'){
      try{archived=await archive(result.url,owner(session),record);}catch{
        await change(session,l=>{const r=l.records[attemptId];r.pollUntil=0;r.failure='ARCHIVE_PENDING; recover without creating another prediction';});
        return publicJob(await owned(session,attemptId));
      }
    }
    await change(session,l=>{
      const r=l.records[attemptId];if(r.pollToken!==ticket||['COMPLETED','FAILED'].includes(r.stage))return;
      r.pollUntil=0;r.failure='';
      if(result.state==='completed'){r.providerUrl=result.url;r.videoUrl=archived;transition(r,'COMPLETED');}
      else if(['failed','cancelled','timeout','deleted'].includes(result.state)){r.failure='PROVIDER_'+result.state.toUpperCase();transition(r,'FAILED');}
      else transition(r,result.state==='running'?'RUNNING':'ACCEPTED');
    });
    return publicJob(await owned(session,attemptId));
  }
  return {
    async quote(session,input){
      const source=await project(session,input?.project_id);
      const prepared=prepareQuote(source,input,now()),attemptId=id();
      const record={...prepared,id:attemptId,sessionHash:sessionOf(session),createdAt:now(),updatedAt:now(),quoteExpires:now()+120000,stage:'QUOTED',transitions:[{stage:'QUOTED',at:now()}]};
      await change(session,(l,team)=>{
        rate(l,'quote',now(),10);rate(team,'quote',now(),30);requireValue(Object.keys(l.records).length<80,'LEDGER_CAPACITY',429);
        requireValue(!Object.values(l.records).some(r=>r.projectId===record.projectId&&String(r.sceneId)===String(record.sceneId)&&['SUBMITTING','UNKNOWN','ACCEPTED','RUNNING'].includes(r.stage)),'UNRESOLVED_ATTEMPT');
        l.records[attemptId]=record;
      });
      return publicQuote(record,config.paidEnabled);
    },
    async ticket(session,input){
      requireValue(input?.transfer_consent===true&&Object.keys(input).sort().join(',')==='quote_id,request_hash,transfer_consent');
      const record=await owned(session,input.quote_id,true);await unchanged(session,record);
      await change(session,l=>{const r=authorizeRecord(l,record.id,session);validQuote(r,session,input.request_hash);rate(l,'upload',now(),3);
        requireValue(r.stage==='QUOTED','ALREADY_USED');r.transferConsent={at:now(),requestHash:r.requestHash,sessionHash:r.sessionHash};transition(r,'TICKETING');});
      try{
        const ticket=await upload.ticket(record.image);
        await change(session,l=>{const r=l.records[record.id];requireValue(r.stage==='TICKETING','ALREADY_USED');
          r.downloadUrl=ticket.download_url;r.uploadExpires=Date.parse(ticket.upload.expires_at);transition(r,'UPLOADING');});
        // The signed URL is returned once, never stored in Firestore/logs.
        return {attempt_id:record.id,upload:ticket.upload,image_sha256:record.image.sha256};
      }catch(e){await failBeforePrediction(session,record.id,e.code||'UPLOAD_TICKET_FAILED');throw e;}
    },
    async verify(session,input){
      requireValue(input&&Object.keys(input).sort().join(',')==='attempt_id,request_hash');
      const record=await owned(session,input.attempt_id,true);await unchanged(session,record);
      await change(session,l=>{const r=l.records[record.id];validQuote(r,session,input.request_hash);
        requireValue(r.stage==='UPLOADING'&&r.uploadExpires>now(),'UPLOAD_EXPIRED');transition(r,'VERIFYING');});
      try{
        await upload.verify(record.downloadUrl,record.image);
        await change(session,l=>{const r=l.records[record.id];requireValue(r.stage==='VERIFYING','ALREADY_USED');r.verifiedAt=now();transition(r,'READY');});
        return {attempt_id:record.id,verified:true,image_sha256:record.image.sha256};
      }catch(e){await failBeforePrediction(session,record.id,e.code||'IMAGE_VERIFICATION_FAILED');throw e;}
    },
    async submit(session,input){
      requireValue(config.paidEnabled,'PAID_DISABLED',403);
      requireValue(input&&Object.keys(input).sort().join(',')==='attempt_id,confirm,cost_micro_usd,request_hash'&&input.confirm===true);
      const record=await owned(session,input.attempt_id,true);await unchanged(session,record);
      await change(session,(l,team)=>{const r=authorizeRecord(l,record.id,session);validQuote(r,session,input.request_hash);
        requireValue(r.stage==='READY'&&r.verifiedAt&&r.transferConsent,'NOT_READY');
        requireValue(input.cost_micro_usd===r.cost.microUsd,'COST_MISMATCH');
        reserve(l,r,now(),config.limits);reserve(team,r,now(),config.teamLimits);r.paidConsent={at:now(),requestHash:r.requestHash,costMicroUsd:r.cost.microUsd,sessionHash:r.sessionHash};
        transition(r,'SUBMITTING');});
      // Never place this POST inside a transaction callback or retry loop.
      try{
        const result=await provider.submit({image:record.downloadUrl,prompt:record.prompt,...record.settings},async predictionId=>{
          await change(session,l=>{const r=l.records[record.id];r.predictionId=predictionId;transition(r,'ACCEPTED');});
        });
        const archived=result.state==='completed'?await archive(result.url,owner(session),{...record,predictionId:result.id}):null;
        await change(session,l=>{const r=l.records[record.id];requireValue(r.predictionId===result.id,'PREDICTION_MISMATCH');
          if(result.state==='completed'){r.providerUrl=result.url;r.videoUrl=archived;transition(r,'COMPLETED');}
          else if(['failed','cancelled','timeout','deleted'].includes(result.state)){r.failure='PROVIDER_'+result.state.toUpperCase();transition(r,'FAILED');}
        });
      }catch(e){
        await change(session,l=>{const r=l.records[record.id];
          if(r.predictionId){r.failure='RESPONSE_INCOMPLETE; recover saved prediction';return;}
          r.failure=e.code==='SUBMISSION_REJECTED'?'SUBMISSION_REJECTED':'SUBMISSION_UNKNOWN; do not resubmit';
          transition(r,e.code==='SUBMISSION_REJECTED'?'FAILED':'UNKNOWN');});
      }
      return publicJob(await owned(session,record.id));
    },
    async list(session,input){
      await store.project(owner(session),input.project_id,false);
      const ledger=await store.read(owner(session));
      const records=Object.values(ledger.records).filter(r=>r.projectId===input.project_id&&String(r.sceneId)===String(input.scene_id)).sort((a,b)=>b.createdAt-a.createdAt).slice(0,20);
      return {attempts:records.map(r=>({...publicJob(r),created_at:new Date(r.createdAt).toISOString()}))};
    },
    poll,
  };
}

export async function readCloudBody(req,maxBytes=16384){
  let raw='';
  if(req.body!==undefined){raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);}
  else{for await(const chunk of req){raw+=chunk;requireValue(Buffer.byteLength(raw)<=maxBytes,'BODY_TOO_LARGE',413);}}
  requireValue(Buffer.byteLength(raw)<=maxBytes,'BODY_TOO_LARGE',413);
  try{return JSON.parse(raw);}catch{throw new CloudError('INVALID_JSON',400);}
}
