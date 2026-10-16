// CPU/mock tests only. Real image upload evidence is kept separately in docs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {createImageUploader,createProvider,validateTicket} from '../api/_lib/seedance/provider.js';
import {failureInfo,validFailure,storageFailureReason} from '../api/_lib/seedance/diagnostics.js';
import {VideoError} from '../api/_lib/seedance/errors.js';
import {createAttemptJournal} from '../api/_lib/seedance/journal.js';
import {diagnoseUpload} from '../scripts/diagnose-video-upload.mjs';
import {payload,confirm,serveVideo,mockProvider,response,baseConfig} from './support/seedance-fixtures.mjs';
const bytes=Buffer.from('exact mock image bytes');
const image={bytes,mime:'image/jpeg',filename:'reference.jpg'};
const ticket=()=>({type:'image',filename:'generated-storage-name.jpg',size:bytes.length,download_url:'https://media.wavespeed.ai/opaque.jpg',
  upload:{method:'PUT',url:'https://storage.wavespeed.ai/opaque?signature=SECRET',headers:{'Content-Type':'image/jpeg'},expires_at:new Date(Date.now()+60000).toISOString()}});

test('provider-assigned filename is allowed, returned URLs and exact bytes remain unchanged',async()=>{
  const calls=[],value=ticket();
  const uploader=createImageUploader('mock-key',{checkUrl:async()=>{},request:async(url,options)=>{
    calls.push({url,options});return options.method==='POST'?response(value):{status:204,body:''};
  }});
  assert.equal(await uploader.upload(image),value.download_url);
  assert.equal(calls.length,2);assert.equal(calls[1].url,value.upload.url);assert.deepEqual(calls[1].options.body,bytes);
  assert.equal(calls[1].options.headers.Authorization,undefined);
  assert.equal('submit' in uploader,false);
});
for(const filename of ['',null,42,'../file.jpg','dir/file.jpg','dir\\file.jpg','file.png','a'.repeat(256)+'.jpg','file\r\n.jpg'])test('unsafe/incompatible ticket filename rejected: '+JSON.stringify(filename),()=>{
  assert.throws(()=>validateTicket({...ticket(),filename},image),e=>e.reason==='TICKET_FILENAME');
});
for(const [name,modify,reason] of [
  ['type',t=>{t.type='video';},'TICKET_TYPE'],['size',t=>{t.size++;},'TICKET_SIZE'],
  ['mime',t=>{t.upload.headers['Content-Type']='image/png';},'TICKET_CONTENT_TYPE'],
  ['expired',t=>{t.upload.expires_at=new Date(1).toISOString();},'TICKET_EXPIRY'],
  ['authorization',t=>{t.upload.headers.Authorization='PRIVATE';},'TICKET_HEADERS'],
])test('ticket '+name+' safety retained',()=>{const value=ticket();modify(value);assert.throws(()=>validateTicket(value,image),e=>e.reason===reason);});

for(const [mode,step,status,code,reason] of [
  ['http','TICKET_REQUEST',429,'UPSTREAM_FAILED','HTTP_STATUS'],
  ['json','TICKET_REQUEST',200,'INVALID_PROVIDER_RESPONSE','RESPONSE_SCHEMA'],
  ['ticket','TICKET_VALIDATE',200,'INVALID_PROVIDER_RESPONSE','TICKET_SIZE'],
  ['upload-url','UPLOAD_URL_CHECK',null,'INVALID_PROVIDER_RESPONSE','UNSPECIFIED'],
  ['download-url','DOWNLOAD_URL_CHECK',null,'INVALID_PROVIDER_RESPONSE','UNSPECIFIED'],
  ['put','IMAGE_PUT',403,'UPLOAD_FAILED','HTTP_STATUS'],
  ['transport','TICKET_REQUEST',null,'INTERNAL','UNSPECIFIED'],
])test('safe persisted upload diagnostic: '+mode,async t=>{
  const logs=[];t.mock.method(console,'error',s=>logs.push(s));
  const m=mockProvider({override:async(url,options)=>{
    if(url.endsWith('/media/uploads')){
      if(mode==='http')return {status:429,headers:{'retry-after':'7'},body:'SECRET BODY'};
      if(mode==='json')return {status:200,body:'SECRET BODY'};
      if(mode==='transport')throw Error('PRIVATE KEY https://signed.example/?SECRET');
      if(mode==='ticket'){
        const b=JSON.parse(options.body),v=ticket();v.filename=b.filename;v.size=b.size+1;
        return response(v);
      }
    }
    if(mode==='put'&&options.method==='PUT')return {status:403,body:'SECRET SIGNATURE'};
  }});
  const originalCheck=m.checkUrl;
  m.checkUrl=async url=>{
    if(mode==='upload-url'&&url.includes('storage.')||mode==='download-url'&&url.includes('media.'))throw new VideoError('INVALID_PROVIDER_RESPONSE');
    return originalCheck(url);
  };
  const s=await serveVideo(t,m),q=await s.call('/api/local-video/quote',payload());
  const a=await s.call('/api/local-video/submit',confirm(q.body));
  const file=path.join(s.journalPath,a.body.job_id+'.json'),raw=await fs.readFile(file,'utf8'),saved=JSON.parse(raw).record;
  assert.equal(saved.stage,'FAILED');assert.equal(saved.upstreamId,null);
  assert.deepEqual(saved.failure,{step,code,http_status:status,reason,at:saved.failure.at});assert.ok(validFailure(saved.failure));
  assert.equal(m.calls.filter(c=>c.url.endsWith('/image-to-video')).length,0);
  for(const secret of ['SECRET','PRIVATE','signature=',baseConfig.apiKey,payload().image_base64])assert.ok(!(raw+logs.join()).includes(secret));
  assert.equal(logs.length,1);assert.equal(JSON.parse(logs[0]).step,step);
  const closed=once(s.server,'close');s.server.close();s.server.closeAllConnections();await closed;await s.server.closeJournal();
  const resumed=await serveVideo(t,{}, {journalPath:s.journalPath,paidEnabled:false});
  const found=await resumed.call('/api/local-video/attempts/'+saved.id);assert.equal(found.body.state,'failed');
  assert.match(found.body.message,/Chưa gửi yêu cầu tạo video/);assert.equal(resumed.calls.length,0);
  assert.equal(await fs.readFile(file,'utf8'),raw);
});

test('sanitizer drops arbitrary message/URL/header/cause and unexpected diagnostic fields',()=>{
  const error={code:'PRIVATE',message:'SECRET',httpStatus:700,diagnostic:{step:'SECRET',reason:'SECRET',http_status:'SECRET',url:'SECRET'}};
  assert.deepEqual(failureInfo(error,'IMAGE_PUT'),{step:'IMAGE_PUT',code:'INTERNAL',http_status:null,reason:'UNSPECIFIED'});
  assert.equal(validFailure({...failureInfo(error,'IMAGE_PUT'),at:Date.now(),url:'SECRET'}),false);
});
test('storage response keeps only known error classification, never raw XML or signed URL',async()=>{
  const raw='<Error><Code>SignatureDoesNotMatch</Code><StringToSign>SECRET SIGNED URL</StringToSign></Error>';
  assert.equal(storageFailureReason(raw),'STORAGE_SIGNATURE_MISMATCH');
  assert.equal(storageFailureReason('<Code>SECRET</Code>'),'HTTP_STATUS');
  const uploader=createImageUploader('mock',{checkUrl:async()=>{},request:async(url,options)=>options.method==='POST'?response(ticket()):{status:403,body:raw}});
  await assert.rejects(uploader.upload(image),e=>e.diagnostic.reason==='STORAGE_SIGNATURE_MISMATCH'&&!JSON.stringify(e).includes('SECRET'));
});
test('legacy records need no migration; journal rejects untrusted failure content',async t=>{
  const s=await serveVideo(t),q=await s.call('/api/local-video/quote',payload());
  const r=JSON.parse(await fs.readFile(path.join(s.journalPath,q.body.attempt_id+'.json'))).record;
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'diagnostic-journal-')),journal=createAttemptJournal(dir);t.after(()=>journal.close());
  journal.create(r);
  assert.throws(()=>journal.update(r.id,{failure:{step:'IMAGE_PUT',code:'UPLOAD_FAILED',http_status:403,reason:'HTTP_STATUS',at:Date.now(),raw:'SECRET'}}));
});
test('journal failure after upload stops before prediction and writes only safe fallback log',async t=>{
  const logs=[];t.mock.method(console,'error',s=>logs.push(s));
  const s=await serveVideo(t,{immediate:true}),q=await s.call('/api/local-video/quote',payload());
  const rename=syncFs.renameSync;
  t.mock.method(syncFs,'renameSync',(from,to)=>{
    if(String(to).endsWith(q.body.attempt_id+'.json')&&JSON.parse(syncFs.readFileSync(from)).record.stage==='UPLOADED')throw Error('PRIVATE DISK PATH');
    return rename(from,to);
  });
  await s.call('/api/local-video/submit',confirm(q.body));
  await s.server.closeJournal();
  assert.equal(s.calls.length,2);assert.equal(s.calls.filter(c=>c.url.endsWith('/image-to-video')).length,0);
  assert.equal(JSON.parse(logs[0]).code,'JOURNAL_UNAVAILABLE');assert.equal(JSON.parse(logs[0]).step,'UPLOAD_COMPLETE_WRITE');
  assert.ok(!logs.join().includes('PRIVATE'));
});
test('paid=false still blocks both web-provider operations; upload-only diagnostic is separate',async()=>{
  let calls=0;const p=createProvider({...baseConfig,paidEnabled:false},{request:async()=>{calls++;}});
  await assert.rejects(p.upload(image),e=>e.code==='PAID_DISABLED');await assert.rejects(p.submit({}),e=>e.code==='PAID_DISABLED');assert.equal(calls,0);
});
test('upload diagnostic validates hash/paid flag, never submits and refuses rerun of same report',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'upload-diagnostic-')),p=payload();
  const imagePath=path.join(dir,'image.png'),reportPath=path.join(dir,'result.json'),bytes=Buffer.from(p.image_base64,'base64');await fs.writeFile(imagePath,bytes);
  const input={imagePath,reportPath,expectedSha256:createHash('sha256').update(bytes).digest('hex')};
  const m=mockProvider(),env={LOCAL_VIDEO_PAID_ENABLED:'false',WAVESPEED_API_KEY:'mock-key',VITE_WAVESPEED_API_KEY:''};
  await assert.rejects(diagnoseUpload(input,{...m,env:{...env,LOCAL_VIDEO_PAID_ENABLED:'true'}}));
  await assert.rejects(diagnoseUpload({...input,expectedSha256:'0'.repeat(64)},{...m,env}));assert.equal(m.calls.length,0);
  const result=await diagnoseUpload(input,{...m,env});assert.equal(result.state,'PASS');assert.equal(result.prediction_requests,0);assert.equal(m.calls.length,2);
  await assert.rejects(diagnoseUpload(input,{...m,env}));assert.equal(m.calls.length,2);
  assert.deepEqual(await fs.readFile(imagePath),bytes);
  const raw=await fs.readFile(reportPath,'utf8');for(const value of ['PRIVATE_TEST','signature=',env.WAVESPEED_API_KEY])assert.ok(!raw.includes(value));
});
