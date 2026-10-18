import process from 'node:process';
import {authenticateSession} from './_lib/local-ai/auth.js';
import {cloudConfig,authorizeTeam} from './_lib/cloud-video/config.js';
import {cloudDatabase,createCloudStore} from './_lib/cloud-video/store.js';
import {createCloudUpload} from './_lib/cloud-video/upload.js';
import {createCloudVideoService,readCloudBody} from './_lib/cloud-video/service.js';
import {createProvider} from './_lib/seedance/provider.js';
import {requireValue} from './_lib/cloud-video/core.js';
import {createVideoArchive} from './_lib/cloud-video/archive.js';
import {createSourceImageReader} from './_lib/cloud-video/source-image.js';

export const config={maxDuration:120};
export function createVideoHandler({configure=()=>cloudConfig(process.env),authenticate=authenticateSession,createService}={}){
  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
    try{
      const settings=configure(),session=await authenticate(req,settings);
      authorizeTeam(session,settings);
      const url=new URL(req.url,settings.origin),action=url.searchParams.get('action');
      requireValue(['source','quote','ticket','verify','submit','list','job','health'].includes(action),'NOT_FOUND',404);
      requireValue(req.method===(['list','job','health'].includes(action)?'GET':'POST'),'METHOD_NOT_ALLOWED',405);
      const service=createService?createService(settings):createCloudVideoService({config:settings,store:createCloudStore(cloudDatabase(process.env)),upload:createCloudUpload(settings.apiKey),provider:createProvider(settings),archive:createVideoArchive(process.env),sourceImage:createSourceImageReader(process.env.R2_PUBLIC_ORIGIN)});
      let output;
      if(action==='health')output={enabled:true,paid_enabled:settings.paidEnabled,storage:'firestore',model:'bytedance/seedance-v1.5-pro/image-to-video'};
      else if(action==='list')output=await service.list(session,{project_id:url.searchParams.get('project_id'),scene_id:url.searchParams.get('scene_id')});
      else if(action==='job')output=await service.poll(session,url.searchParams.get('id'));
      else output=await service[action](session,await readCloudBody(req));
      res.statusCode=200;res.end(JSON.stringify(output));
    }catch(error){
      // Never emit raw provider responses, SDK errors, signed URLs or credentials.
      const code=typeof error.code==='string'&&/^[A-Z][A-Z0-9_]{1,70}$/.test(error.code)?error.code:'VIDEO_UNAVAILABLE';
      res.statusCode=error.status||(['UNAUTHORIZED'].includes(code)?401:code==='FORBIDDEN_ORIGIN'?403:503);
      res.end(JSON.stringify({error:{code,message:code}}));
    }
  };
}
export default createVideoHandler();
