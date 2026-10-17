import process from 'node:process';
import {authenticateSession} from './_lib/local-ai/auth.js';
import {mediaAuthConfig,authorizeTeam} from './_lib/cloud-video/config.js';
import {cloudDatabase,createCloudStore} from './_lib/cloud-video/store.js';
import {createAudioService} from './_lib/cloud-video/audio.js';
import {readCloudBody} from './_lib/cloud-video/service.js';
import {requireValue} from './_lib/cloud-video/core.js';
export const config={maxDuration:120};
export function createHandler(env=process.env){return async function handler(req,res){
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  try{
    const settings={...mediaAuthConfig(env),audioKey:env.WAVESPEED_AUDIO_API_KEY,audioEnabled:env.CLOUD_AUDIO_ENABLED==='true',r2Origin:env.R2_PUBLIC_ORIGIN};
    const session=await authenticateSession(req,settings);authorizeTeam(session,settings);
    const service=createAudioService({config:settings,store:createCloudStore(cloudDatabase(env))});
    const action=new URL(req.url,settings.origin).searchParams;
    requireValue(req.method==='POST'&&action.get('action')==='submit'||req.method==='GET'&&action.get('action')==='job','METHOD_NOT_ALLOWED',405);
    const result=req.method==='POST'?await service.submit(session,await readCloudBody(req,100000)):await service.poll(session,action.get('id'));
    res.statusCode=200;res.end(JSON.stringify(result));
  }catch(e){const code=/^[A-Z][A-Z0-9_]{1,70}$/.test(e.code||'')?e.code:'AUDIO_UNAVAILABLE';res.statusCode=e.status||(code==='UNAUTHORIZED'?401:code==='FORBIDDEN_ORIGIN'?403:503);res.end(JSON.stringify({error:{code,message:code}}));}
};}
export default createHandler();
