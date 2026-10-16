import { once } from 'node:events';
import { config as clerk,session } from './local-ai-fixtures.mjs';
import { readVideoConfig } from '../../api/lib/seedance/config.js';
import { createVideoServer } from '../../scripts/local-video-server.mjs';
import { MODEL,DEFAULT_SETTINGS } from '../../src/lib/seedanceContract.js';
import { publicAddress } from '../../api/lib/seedance/transport.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
export {session};
export const fixture=JSON.parse(await fs.readFile(new URL('./visual-fixture.json',import.meta.url)));
export const payload=()=>({projectType:'full-ai',scene:{scene_n:1,Character:'Judge',Dialogue:'Exact test words.',Translate:'NEVER SPEAK TRANSLATION',Action:'No action invented.',Camera:'Static.',Context:'Test context.',Tone_of_Voice:''},profile:null,
  settings:{...DEFAULT_SETTINGS},assumptions:{wordsPerMinute:150,pauseSeconds:.8},image_base64:fixture.image_base64,mime_type:fixture.mime_type});
export const baseConfig=readVideoConfig({NODE_ENV:'development',LOCAL_VIDEO_ENABLED:'true',LOCAL_VIDEO_PAID_ENABLED:'true',
  WAVESPEED_API_KEY:'fake-provider-test-key',CLERK_ISSUER:clerk.issuer,CLERK_JWT_KEY:clerk.jwtKey});
export const response=(data,status=200,headers={})=>({status,headers,body:JSON.stringify({code:status===200?200:status,data})});
export const prediction=(state='created',id='pred_test')=>({id,model:MODEL,status:state,outputs:state==='completed'?['https://video.wavespeed.ai/test-only.mp4']:[]});
export function mockProvider({now=Date.now,status='completed',override}={}){
  const calls=[];
  const request=async(url,options={})=>{
    calls.push({url,options:{...options,body:Buffer.isBuffer(options.body)?Buffer.from(options.body):options.body}});
    if(override){const r=await override(url,options,calls);if(r!==undefined)return r;}
    if(url.endsWith('/media/uploads')){
      const b=JSON.parse(options.body);
      return response({type:'image',filename:b.filename,size:b.size,download_url:'https://media.wavespeed.ai/test-only.png',
        upload:{method:'PUT',url:'https://storage.wavespeed.ai/test-only?signature=PRIVATE_TEST',headers:{'Content-Type':b.content_type,'If-None-Match':'*'},expires_at:new Date(now()+60000).toISOString()}});
    }
    if(url.includes('storage.wavespeed.ai'))return {status:204,headers:{},body:''};
    if(url.endsWith('/image-to-video'))return response(prediction());
    if(url.includes('/predictions/'))return response(prediction(status));
    throw new Error('Unexpected mock endpoint');
  };
  const checkUrl=url=>publicAddress(url,async()=>[{address:'93.184.216.34',family:4}]);
  return {request,checkUrl,calls};
}
export async function serveVideo(t,options={},overrides={}){
  const mock=options.request?options:mockProvider(options);
  const journalPath=overrides.journalPath||await fs.mkdtemp(path.join(os.tmpdir(),'seedance-test-journal-'));
  const server=createVideoServer({...baseConfig,journalPath,jobTtlMs:900000,retentionMs:900000,...overrides},{...mock,now:options.now});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{if(server.listening){const closed=once(server,'close');server.close();server.closeAllConnections();await closed;}await server.closeJournal();});
  const base='http://127.0.0.1:'+server.address().port;
  return {...mock,base,server,journalPath,async call(path,input,token=session(),headers={}){
    const r=await fetch(base+path,{method:input===undefined?'GET':'POST',headers:{Origin:baseConfig.origin,Authorization:'Bearer '+token,
      ...(input!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(input!==undefined?{body:JSON.stringify(input)}:{})});
    let body=await r.json();
    // Existing HTTP regressions wait for admission, using the new read-only
    // attempt endpoint. They still count every mocked provider call.
    if(path==='/api/local-video/submit'&&r.status===202&&!options.immediate){
      for(let n=0;n<100&&['uploading','submitting'].includes(body.state);n++){
        await new Promise(resolve=>setTimeout(resolve,5));
        const status=await fetch(base+'/api/local-video/attempts/'+body.job_id,{headers:{Origin:baseConfig.origin,Authorization:'Bearer '+token}});
        body={...body,...await status.json()};
      }
    }
    return {status:r.status,body,headers:r.headers};
  }};
}
export const confirm=(q,p=payload())=>({quote_id:q.quote_id,request_hash:q.request_hash,confirm:true,transfer_consent:true,payload:p});
