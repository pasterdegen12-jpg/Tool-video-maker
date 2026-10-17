import process from 'node:process';
import {authenticateSession} from './_lib/local-ai/auth.js';
import {mediaAuthConfig} from './_lib/cloud-video/config.js';
import {cloudDatabase,createCloudStore} from './_lib/cloud-video/store.js';
import {createGeminiService} from './_lib/cloud-video/gemini.js';
import {readCloudBody} from './_lib/cloud-video/service.js';
import {requireValue} from './_lib/cloud-video/core.js';
export const config={maxDuration:120};
export function createHandler(env=process.env){return async function handler(req,res){
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  try{
    const settings={...mediaAuthConfig(env),geminiEnabled:env.CLOUD_GEMINI_ENABLED==='true',keys:[env.GEMINI_API_KEY_1,env.GEMINI_API_KEY_2,env.GEMINI_API_KEY_3].filter(Boolean)};
    const session=await authenticateSession(req,settings);requireValue(req.method==='POST','METHOD_NOT_ALLOWED',405);
    const service=createGeminiService({config:settings,store:createCloudStore(cloudDatabase(env))});
    const value=await service(session,await readCloudBody(req,400000));res.statusCode=200;res.end(JSON.stringify(value));
  }catch(e){const code=/^[A-Z][A-Z0-9_]{1,70}$/.test(e.code||'')?e.code:'GEMINI_UNAVAILABLE';res.statusCode=e.status||(code==='UNAUTHORIZED'?401:code==='FORBIDDEN_ORIGIN'?403:503);res.end(JSON.stringify({error:{code,message:code==='GEMINI_EXHAUSTED'?'Máy chủ AI đang quá tải lượt yêu cầu. Vui lòng bấm nút thử lại!':code}}));}
};}
export default createHandler();
