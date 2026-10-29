import {validNewRequestDuration} from '../../../src/lib/generationDurationPolicy.js';
import {batchReserves} from './batch.js';
import {providerVideoPayload} from '../../../src/lib/cloudVideoOptions.js';
import {Buffer} from 'node:buffer';
import {id,ownerOf,sessionOf,prepareQuote,publicQuote,publicJob,authorizeRecord,rate,reserve,checkAdmission,requireValue,CloudError,sourceDigest,sceneSnapshot,canonical} from './core.js';

// Each provider operation is separated by a committed transaction. A cold start
// may resume GET polling, but can never resume/repeat a prediction POST.
export function createCloudVideoService({config,store,upload,provider,archive,sourceImage,now=Date.now}){
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
    const current=await project(session,r.projectId);
    requireValue(r.snapshotVersion===2?sceneSnapshot(current,r.sceneId)===r.sceneDigest:sourceDigest(current)===r.sourceDigest,'PROJECT_CHANGED');
    if(r.canonicalDuration!==undefined)requireValue(current.data.find(s=>String(s.scene_n)===String(r.sceneId))?.duration_seconds===r.canonicalDuration,'PROJECT_CHANGED');
  }
  const validQuote=(r,session,requestHash)=>{
    requireValue(r.sessionHash===sessionOf(session),'SESSION_MISMATCH',403);
    requireValue(r.quoteExpires>now()&&validNewRequestDuration(r.settings.duration),'QUOTE_EXPIRED',410);
    requireValue(r.requestHash===requestHash,'QUOTE_MISMATCH');
  };
  const transition=(r,stage)=>{if(r.stage===stage)return;r.stage=stage;r.updatedAt=now();r.transitions.push({stage,at:r.updatedAt});};
  async function failBeforePrediction(session,attemptId,code){
    await change(session,l=>{const r=authorizeRecord(l,attemptId,session);if(['TICKETING','UPLOADING','VERIFYING'].includes(r.stage)){r.failure=code;transition(r,'FAILED');}});
  }
  async function finishJob(session,record){
    if(record.stage==='COMPLETED')await store.publishVideo(owner(session),record);
    return publicJob(record);
  }
  async function poll(session,attemptId){
    let record=await owned(session,attemptId);
    if(!record.predictionId||['COMPLETED','FAILED'].includes(record.stage))return finishJob(session,record);
    const ticket=id();
    const claimed=await change(session,l=>{
      const r=authorizeRecord(l,attemptId,session);rate(l,'poll',now(),40);
      if(r.nextPoll>now()||r.pollUntil>now())return false;
      r.pollToken=ticket;r.pollUntil=now()+30000;r.nextPoll=now()+3000;return true;
    });
    if(!claimed)return publicJob(record);
    let result;
    try{result=await provider.get(record.predictionId,record.model);}catch{
      await change(session,l=>{const r=l.records[attemptId];if(r.pollToken===ticket){r.pollUntil=0;r.failure='STATUS_UNAVAILABLE; use recovery, do not resubmit';}});
      return finishJob(session,await owned(session,attemptId));
    }
    let archived=null;
    if(result.state==='completed'){
      try{archived=await archive(result.url,owner(session),record);}catch{
        await change(session,l=>{const r=l.records[attemptId];r.pollUntil=0;r.failure='ARCHIVE_PENDING; recover without creating another prediction';});
        return finishJob(session,await owned(session,attemptId));
      }
    }
    await change(session,l=>{
      const r=l.records[attemptId];if(r.pollToken!==ticket||['COMPLETED','FAILED'].includes(r.stage))return;
      r.pollUntil=0;r.failure='';
      if(result.state==='completed'){r.providerUrl=result.url;r.videoUrl=archived;transition(r,'COMPLETED');}
      else if(['failed','cancelled','timeout','deleted'].includes(result.state)){r.failure='PROVIDER_'+result.state.toUpperCase();transition(r,'FAILED');}
      else transition(r,result.state==='running'?'RUNNING':'ACCEPTED');
    });
    return finishJob(session,await owned(session,attemptId));
  }
  return {
    async source(session,input){
      requireValue(input&&Object.keys(input).sort().join(',')==='project_id,scene_id');
      const current=await project(session,input.project_id);
      await change(session,l=>rate(l,'source',now(),10));
      requireValue(sourceImage,'SOURCE_IMAGE_UNAVAILABLE',503);
      return sourceImage(current,input.project_id,input.scene_id);
    },
    async quote(session,input,batchContext=null){
      const source=await project(session,input?.project_id);
      const prepared=prepareQuote(source,input,now()),attemptId=batchContext?.attemptId||id();
      if(input.stored_image){
        requireValue(sourceImage,'SOURCE_IMAGE_UNAVAILABLE',503);
        const selected=await sourceImage(source,input.project_id,input.scene_id);
        requireValue(canonical(selected.image)===canonical(prepared.image),'SOURCE_IMAGE_CHANGED');
      }
      const record={...prepared,...(batchContext?{batchId:batchContext.batchId}:{}),id:attemptId,sessionHash:sessionOf(session),createdAt:now(),updatedAt:now(),quoteExpires:now()+120000,stage:prepared.mode==='text_to_video'?'READY':'QUOTED',transitions:[{stage:prepared.mode==='text_to_video'?'READY':'QUOTED',at:now()}]};
      await change(session,(l,team)=>{
        requireValue(!batchReserves(l,record.projectId,record.sceneId,record.batchId),'BATCH_SCENE_RESERVED');
        if(batchContext){const b=l.batches?.[record.batchId];requireValue(b&&!b.cancelledAt&&b.items.some(i=>i.attemptId===record.id&&i.state!=='cancelled'),'BATCH_CANCELLED');}
        requireValue(!l.records[attemptId],'ALREADY_USED');
        // History is not admission capacity. Retain all durable paid records;
        // the store's serialized-byte ceiling protects Firestore document size.
        rate(l,'quote',now(),10);rate(team,'quote',now(),30);
        requireValue(!Object.values(l.records).some(r=>r.projectId===record.projectId&&String(r.sceneId)===String(record.sceneId)&&['SUBMITTING','UNKNOWN','ACCEPTED','RUNNING'].includes(r.stage)),'UNRESOLVED_ATTEMPT');
        checkAdmission(l,record,now(),config.limits);checkAdmission(team,record,now(),config.teamLimits);
        l.records[attemptId]=record;
      });
      return publicQuote(record,config.paidEnabled);
    },
    async ticket(session,input){
      requireValue(input?.transfer_consent===true&&['quote_id,request_hash,transfer_consent','image_index,quote_id,request_hash,transfer_consent'].includes(Object.keys(input).sort().join(',')));
      const record=await owned(session,input.quote_id,true);await unchanged(session,record);
      const index=input.image_index??0,images=record.images||[record.image];
      requireValue(Number.isInteger(index)&&index>=0&&index<images.length&&index===(record.uploadedImages?.length||0),'INVALID_IMAGE_INDEX');
      await change(session,l=>{const r=authorizeRecord(l,record.id,session);validQuote(r,session,input.request_hash);rate(l,'upload',now(),12);
        requireValue(r.stage==='QUOTED'&&index===(r.uploadedImages?.length||0),'ALREADY_USED');r.transferConsent={at:now(),requestHash:r.requestHash,sessionHash:r.sessionHash};transition(r,'TICKETING');});
      try{
        const ticket=await upload.ticket(images[index]);
        await change(session,l=>{const r=l.records[record.id];requireValue(r.stage==='TICKETING','ALREADY_USED');
          r.pendingImageIndex=index;r.downloadUrl=ticket.download_url;r.uploadExpires=Date.parse(ticket.upload.expires_at);transition(r,'UPLOADING');});
        // The signed URL is returned once, never stored in Firestore/logs.
        return {attempt_id:record.id,upload:ticket.upload,image_sha256:images[index].sha256};
      }catch(e){await failBeforePrediction(session,record.id,e.code||'UPLOAD_TICKET_FAILED');throw e;}
    },
    async verify(session,input){
      requireValue(input&&['attempt_id,request_hash','attempt_id,image_index,request_hash'].includes(Object.keys(input).sort().join(',')));
      const record=await owned(session,input.attempt_id,true);await unchanged(session,record);
      const index=input.image_index??0,images=record.images||[record.image];
      requireValue(Number.isInteger(index)&&index===(record.pendingImageIndex??0)&&images[index],'INVALID_IMAGE_INDEX');
      await change(session,l=>{const r=l.records[record.id];validQuote(r,session,input.request_hash);
        requireValue(r.stage==='UPLOADING'&&r.uploadExpires>now(),'UPLOAD_EXPIRED');transition(r,'VERIFYING');});
      try{
        await upload.verify(record.downloadUrl,images[index]);
        await change(session,l=>{const r=l.records[record.id];requireValue(r.stage==='VERIFYING','ALREADY_USED');r.verifiedAt=now();r.uploadedImages=[...(r.uploadedImages||[]),{sha256:images[index].sha256,url:record.downloadUrl}];transition(r,r.uploadedImages.length===images.length?'READY':'QUOTED');});
        return {attempt_id:record.id,verified:true,image_sha256:images[index].sha256};
      }catch(e){await failBeforePrediction(session,record.id,e.code||'IMAGE_VERIFICATION_FAILED');throw e;}
    },
    async submit(session,input){
      requireValue(config.paidEnabled,'PAID_DISABLED',403);
      requireValue(input&&Object.keys(input).sort().join(',')==='attempt_id,confirm,cost_micro_usd,request_hash'&&input.confirm===true);
      const record=await owned(session,input.attempt_id,true);await unchanged(session,record);
      await change(session,(l,team)=>{const r=authorizeRecord(l,record.id,session);validQuote(r,session,input.request_hash);
        requireValue(!batchReserves(l,r.projectId,r.sceneId,r.batchId),'BATCH_SCENE_RESERVED');
        if(r.batchId){const b=l.batches?.[r.batchId];requireValue(b&&!b.cancelledAt&&b.items.some(i=>i.attemptId===r.id&&i.state!=='cancelled'),'BATCH_CANCELLED');}
        requireValue(r.stage==='READY'&&(r.mode==='text_to_video'||r.verifiedAt&&r.transferConsent&&(!r.mode||(r.uploadedImages?.length||0)===r.images.length)),'NOT_READY');
        requireValue(input.cost_micro_usd===r.cost.microUsd,'COST_MISMATCH');
        reserve(l,r,now(),config.limits);reserve(team,r,now(),config.teamLimits);r.paidConsent={at:now(),requestHash:r.requestHash,costMicroUsd:r.cost.microUsd,sessionHash:r.sessionHash};
        transition(r,'SUBMITTING');});
      // Never place this POST inside a transaction callback or retry loop.
      try{
        const result=await provider.submit(providerVideoPayload(record),async predictionId=>{
          await change(session,l=>{const r=l.records[record.id];r.predictionId=predictionId;transition(r,'ACCEPTED');});
        },record.model);
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
      return finishJob(session,await owned(session,record.id));
    },
    async list(session,input){
      await store.project(owner(session),input.project_id,false);
      const ledger=await store.read(owner(session));
      const records=Object.values(ledger.records).filter(r=>r.projectId===input.project_id&&(!input.scene_id||String(r.sceneId)===String(input.scene_id))).sort((a,b)=>b.createdAt-a.createdAt).slice(0,input.scene_id?20:80);
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
