import process from 'node:process';
import {authenticateSession} from './_lib/local-ai/auth.js';
import {cloudConfig} from './_lib/cloud-video/config.js';
import {readCloudBody} from './_lib/cloud-video/service.js';
import {requireValue} from './_lib/cloud-video/core.js';
import {videoRuntime} from './_lib/cloud-video/runtime.js';
import {createVideoContinuation} from './_lib/cloud-video/continuation.js';
import {videoTrace} from './_lib/cloud-video/trace.js';

export const config={maxDuration:120};
export function createVideoHandler({configure=()=>cloudConfig(process.env),authenticate=authenticateSession,createService}={}){
  return async function handler(req,res){
    // Preserve the pre-existing public upload URL contract while sharing one
    // function slot. Video generation actions still require Clerk below.
    const route=new URL(req.url,'https://www.aivideomaker.live');
    if(route.pathname==='/api/get-upload-url'||route.searchParams.get('action')==='legacy_upload'){
      const {default:uploadHandler}=await import('./_lib/cloud-video/legacy-upload.js');return uploadHandler(req,res);
    }
    let trace={};
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
    try{
      const settings=configure(),session=await authenticate(req,settings);
      const url=new URL(req.url,settings.origin),action=url.searchParams.get('action');
      trace={action};
      requireValue(['source','quote','ticket','verify','submit','list','job','health','queue_probe','batch_plan','batch_create','batch_list','batch_tick','batch_cancel'].includes(action),'NOT_FOUND',404);
      requireValue(req.method===(['list','job','health','batch_list'].includes(action)?'GET':'POST'),'METHOD_NOT_ALLOWED',405);
      let service,continuation;
      if(createService)service=createService(settings);
      else{const runtime=videoRuntime(settings);service=runtime.service;if(process.env.VERCEL==='1'){const {send}=await import('@vercel/queue');continuation=createVideoContinuation({...runtime,send});}}
      let output;
      if(action==='health')output={enabled:true,paid_enabled:settings.paidEnabled,storage:'firestore',model:'bytedance/seedance-v1.5-pro/image-to-video'};
      else if(action==='queue_probe'){const input=await readCloudBody(req);requireValue(input&&Object.keys(input).join(',')==='project_id'&&continuation,'INVALID_REQUEST');output=await continuation.probe(session,input.project_id);}
      else if(action==='list')output=await service.list(session,{project_id:url.searchParams.get('project_id'),scene_id:url.searchParams.get('scene_id')});
      else if(action==='batch_list')output=await service.batch_list(session,{project_id:url.searchParams.get('project_id')});
      else if(action==='job')output=await service.poll(session,url.searchParams.get('id'));
      else {const input=await readCloudBody(req);trace={action,projectId:input.project_id,sceneId:input.scene_id,attemptId:input.attempt_id||input.quote_id,batchId:input.batch_id};videoTrace('REQUEST_RECEIVED',trace);output=await service[action](session,input);}
      if(req.method==='POST')videoTrace('REQUEST_SUCCEEDED',{...trace,attemptId:output.attempt_id||output.quote_id||trace.attemptId,httpStatus:200,state:output.state});
      if(continuation&&['batch_create','batch_list','batch_tick'].includes(action)&&output.batches?.some(b=>b.status==='running')){await continuation.wake(session,trace.projectId||url.searchParams.get('project_id'));output.continuation='server';}
      if(continuation&&['submit','job'].includes(action)&&['queued','running'].includes(output.state))await continuation.wakeRecord(session,output.job_id);
      res.statusCode=200;res.end(JSON.stringify(output));
    }catch(error){
      // Never emit raw provider responses, SDK errors, signed URLs or credentials.
      const code=typeof error.code==='string'&&/^[A-Z][A-Z0-9_]{1,70}$/.test(error.code)?error.code:'VIDEO_UNAVAILABLE';
      res.statusCode=error.status||(['UNAUTHORIZED'].includes(code)?401:code==='FORBIDDEN_ORIGIN'?403:503);
      videoTrace('REQUEST_FAILED',{...trace,code,httpStatus:res.statusCode});
      if(res.statusCode===429&&Number.isSafeInteger(error.retryAfter)&&error.retryAfter>0)res.setHeader('Retry-After',String(error.retryAfter));
      if(res.statusCode===429||code==='LEDGER_STORAGE_FULL')console.warn(JSON.stringify({event:'video_admission_rejected',code,status:res.statusCode,retryAfter:error.retryAfter||null}));
      res.end(JSON.stringify({error:{code,message:code}}));
    }
  };
}
export default createVideoHandler();
