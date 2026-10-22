import process from 'node:process';
import {Buffer} from 'node:buffer';
import {timingSafeEqual,createHash} from 'node:crypto';
import {authenticateSession} from './_lib/local-ai/auth.js';
import {mediaBaseConfig} from './_lib/cloud-video/config.js';
import {cloudDatabase} from './_lib/cloud-video/store.js';
import {readCloudBody} from './_lib/cloud-video/service.js';
import {queueStore} from './_lib/qwen/store.js';
import {qwenService} from './_lib/qwen/service.js';
import {referenceReader} from './_lib/qwen/image.js';
import {need} from './_lib/qwen/queue.js';

export const config={maxDuration:60};
export function authenticateWorker(req,expected){
 need(/^[a-f0-9]{64}$/.test(expected||''),'WORKER_CONFIGURATION',503);
 const match=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||'');
 need(match&&timingSafeEqual(createHash('sha256').update(match[1]).digest(),Buffer.from(expected,'hex')),'UNAUTHORIZED',401);
 need(!req.headers.origin,'WORKER_ONLY',403);
}
export function createQwenHandler({env=process.env,authenticate=authenticateSession,service}={}){return async(req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 try {
  need(env.QWEN_REMOTE_ENABLED==='true','QWEN_UNAVAILABLE',503);
  const settings=mediaBaseConfig(env),url=new URL(req.url,settings.origin),action=url.searchParams.get('action');
  const isWorker=action?.startsWith('worker_');
  need(req.method==='POST','METHOD_NOT_ALLOWED',405);
  let session;
  if(isWorker)authenticateWorker(req,env.QWEN_WORKER_TOKEN_SHA256);else session=await authenticate(req,settings);
  const input=await readCloudBody(req,isWorker?750000:4096);
  const backend=service||qwenService({store:queueStore(cloudDatabase(env)),issuer:settings.issuer,readImage:referenceReader(env.R2_PUBLIC_ORIGIN)});
  const result=isWorker?await backend.worker(action.slice(7),input):await backend.user(session,action,input);
  res.statusCode=200;res.end(JSON.stringify(result));
 }catch(error){
  const code=/^[A-Z_]{2,64}$/.test(error.code||'')?error.code:'QWEN_UNAVAILABLE';
  res.statusCode=error.status||(code==='UNAUTHORIZED'?401:code==='FORBIDDEN_ORIGIN'?403:503);
  res.end(JSON.stringify({error:{code}}));
 }
};}
export default createQwenHandler();
