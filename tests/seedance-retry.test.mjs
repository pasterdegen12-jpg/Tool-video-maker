// Mock-only provider and test-signed Clerk. Never calls real WaveSpeed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {payload,serveVideo,confirm,mockProvider,response,session} from './support/seedance-fixtures.mjs';
import {prePredictionFailure,canAuthorizeRetry} from '../api/lib/seedance/retry.js';
import {createAttemptJournal} from '../api/lib/seedance/journal.js';
const authBody=(q,id)=>({quote_id:q.quote_id,request_hash:q.request_hash,predecessor_id:id,confirm:true,transfer_consent:true});
const authorize=(s,q,id,token,headers)=>s.call('/api/local-video/retry-authorizations',authBody(q,id),token,headers);
const record=async(s,id)=>JSON.parse(await fs.readFile(s.journalPath+'/'+id+'.json','utf8')).record;
async function stop(s){const closed=once(s.server,'close');s.server.close();s.server.closeAllConnections();await closed;await s.server.closeJournal();}
async function failed(t,extra={}){
  let first=true;const mock=mockProvider({override:async url=>{if(first&&url.endsWith('/media/uploads')){first=false;return response({},400);}}});
  const s=await serveVideo(t,mock,{maxPerUser:24,...extra}),p=payload(),q=await s.call('/api/local-video/quote',p);
  const a=await s.call('/api/local-video/submit',confirm(q.body,p));assert.equal(a.body.stage,'FAILED');
  return {s,p,old:a.body.job_id};
}
test('separate single-use authorization, immutable predecessor, one new POST and durable child',async t=>{
  const {s,p,old}=await failed(t),before=await fs.readFile(s.journalPath+'/'+old+'.json');
  const q=(await s.call('/api/local-video/quote',p)).body;assert.equal(q.retry_predecessor_id,old);
  assert.equal((await s.call('/api/local-video/submit',confirm(q,p))).status,409);
  const auth=await authorize(s,q,old);assert.equal(auth.status,200);assert.notEqual(q.quote_id,old);
  assert.equal((await authorize(s,q,old)).body.error.code,'ALREADY_USED');
  const q3=(await s.call('/api/local-video/quote',p)).body;
  assert.equal((await authorize(s,q3,old)).status,409);
  const body={...confirm(q,p),retry_authorization_id:auth.body.authorization_id};
  assert.equal((await s.call('/api/local-video/submit',{...body,retry_authorization_id:'0'.repeat(48)})).status,409);
  const results=await Promise.all([s.call('/api/local-video/submit',body),s.call('/api/local-video/submit',body)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[202,409]);
  assert.equal(s.calls.filter(c=>c.url.endsWith('/image-to-video')).length,1);
  assert.deepEqual(await fs.readFile(s.journalPath+'/'+old+'.json'),before);
  const saved=await record(s,q.quote_id);assert.equal(saved.retry.predecessorId,old);assert.ok(saved.retry.consumedAt>=saved.retry.authorizedAt);
  assert.equal(saved.upstreamId,'pred_test');await stop(s);
  const resumed=await serveVideo(t,{}, {journalPath:s.journalPath,paidEnabled:false});
  assert.equal((await resumed.call('/api/local-video/attempts/'+q.quote_id)).body.stage,'SUBMITTED');
  assert.equal(resumed.calls.length,0);assert.deepEqual(await fs.readFile(s.journalPath+'/'+old+'.json'),before);
});
for(const consent of ['confirm','transfer_consent'])test('retry authorization requires '+consent,async t=>{
  const {s,p,old}=await failed(t),q=(await s.call('/api/local-video/quote',p)).body,b=authBody(q,old);b[consent]=false;
  assert.equal((await s.call('/api/local-video/retry-authorizations',b)).status,422);
  assert.equal((await record(s,q.quote_id)).retry,undefined);
});
for(const changed of ['request_hash','predecessor','missing_quote','user','session','origin'])test('retry authorization rejects '+changed,async t=>{
  const {s,p,old}=await failed(t),q=(await s.call('/api/local-video/quote',p)).body,b=authBody(q,old);
  let token=session(),headers={};
  if(changed==='request_hash')b.request_hash='0'.repeat(64);
  if(changed==='predecessor')b.predecessor_id='0'.repeat(48);
  if(changed==='missing_quote'){
    b.quote_id='f'.repeat(48);
  }
  if(changed==='user')token=session('user_other');
  if(changed==='session')token=session('user_owner',{sid:'sess_other'});
  if(changed==='origin')headers={Origin:'https://evil.example'};
  const result=await s.call('/api/local-video/retry-authorizations',b,token,headers);assert.ok([403,404,409,410].includes(result.status));
  assert.equal(s.calls.filter(c=>c.url.endsWith('/image-to-video')).length,0);
});
test('new session cannot authorize its own fresh quote against another session predecessor',async t=>{
  const {s,p,old}=await failed(t),token=session('user_owner',{sid:'sess_new'}),q=(await s.call('/api/local-video/quote',p,token)).body;
  assert.equal(q.retry_predecessor_id,null);assert.equal((await authorize(s,q,old,token)).status,409);
});
for(const changed of ['scene','image','settings'])test('retry binds exact '+changed,async t=>{
  const {s,p,old}=await failed(t);
  if(changed==='scene')p.scene.Dialogue+=' New.';
  if(changed==='settings')p.settings.seed=7;
  if(changed==='image'){
    const {PNG}=await import('pngjs');const png=PNG.sync.read(Buffer.from(p.image_base64,'base64'));png.data[0]^=1;p.image_base64=PNG.sync.write(png).toString('base64');
  }
  const q=(await s.call('/api/local-video/quote',p)).body;
  assert.equal((await authorize(s,q,old)).status,409);assert.equal(s.calls.filter(c=>c.url.endsWith('/image-to-video')).length,0);
});
for(const stage of ['UPLOADING','SUBMITTING'])test('no retry during '+stage,async t=>{
  let release;const gate=new Promise(r=>{release=r;});
  const mock=mockProvider({override:async url=>{if(url.endsWith(stage==='UPLOADING'?'/media/uploads':'/image-to-video'))await gate;}});
  const s=await serveVideo(t,{...mock,immediate:true}),p=payload(),q=(await s.call('/api/local-video/quote',p)).body;
  const a=await s.call('/api/local-video/submit',confirm(q,p));
  for(let n=0;n<50&&(await record(s,a.body.job_id)).stage!==stage;n++)await new Promise(r=>setTimeout(r,5));
  assert.equal((await record(s,a.body.job_id)).stage,stage);
  const q2=(await s.call('/api/local-video/quote',p)).body;assert.equal(q2.retry_predecessor_id,null);
  assert.equal((await authorize(s,q2,a.body.job_id)).status,409);release();await s.server.closeJournal();
  assert.equal(s.calls.filter(c=>c.url.endsWith('/image-to-video')).length,1);
});
for(const kind of ['UNKNOWN','SUBMITTED','FAILED_WITH_ID'])test('cannot authorize retry of '+kind,async t=>{
  let clock=Date.now();const mock=mockProvider({now:()=>clock,status:'failed',override:async url=>{
    if(kind==='UNKNOWN'&&url.endsWith('/image-to-video'))throw Error('ambiguous');
  }});
  const s=await serveVideo(t,{...mock,now:()=>clock}),p=payload(),q=(await s.call('/api/local-video/quote',p)).body;
  const a=await s.call('/api/local-video/submit',confirm(q,p));
  if(kind==='FAILED_WITH_ID'){clock+=2100;await s.call(a.body.status_url);}
  const q2=(await s.call('/api/local-video/quote',p)).body;assert.equal(q2.retry_predecessor_id,null);
  assert.equal((await authorize(s,q2,a.body.job_id)).status,409);assert.equal(s.calls.filter(c=>c.url.endsWith('/image-to-video')).length,1);
});
test('authorization expiry, restart and paid=false do not submit or reuse old quote',async t=>{
  const {s,p,old}=await failed(t);await stop(s);
  let clock=Date.now();const resumed=await serveVideo(t,{now:()=>clock},{journalPath:s.journalPath,paidEnabled:false});
  const q=(await resumed.call('/api/local-video/quote',p)).body;
  assert.equal((await authorize(resumed,q,old)).body.error.code,'PAID_DISABLED');await stop(resumed);
  const live=await serveVideo(t,{now:()=>clock},{journalPath:s.journalPath});
  assert.equal((await authorize(live,q,old)).status,404);
  const fresh=(await live.call('/api/local-video/quote',p)).body,auth=await authorize(live,fresh,old);assert.equal(auth.status,200);
  clock+=120001;
  assert.equal((await live.call('/api/local-video/submit',{...confirm(fresh,p),retry_authorization_id:auth.body.authorization_id})).status,410);
  assert.equal(live.calls.length,0);
});
test('missing/ambiguous timeline rejected; corrupt referenced evidence fails journal startup',async t=>{
  const {s,p,old}=await failed(t),parent=await record(s,old),q=(await s.call('/api/local-video/quote',p)).body;
  for(const stages of [['FAILED'],['QUOTED','SUBMITTING','FAILED'],['QUOTED','UPLOADING','UNKNOWN','FAILED']]){
    assert.equal(prePredictionFailure({...parent,events:stages.map((stage,n)=>({stage,at:parent.createdAt+n}))}),false);
  }
  assert.equal(canAuthorizeRetry([],old,{...parent,id:q.quote_id,stage:'QUOTED',expiresAt:Date.now()+1000},Date.now()),false);
  await authorize(s,q,old);await stop(s);
  const file=s.journalPath+'/'+old+'.json',raw=await fs.readFile(file,'utf8'),envelope=JSON.parse(raw);
  envelope.record.events[1].stage='SUBMITTING';envelope.checksum=createHash('sha256').update(JSON.stringify(envelope.record)).digest('hex');
  await fs.writeFile(file,JSON.stringify(envelope));assert.throws(()=>createAttemptJournal(s.journalPath));
  assert.equal(await fs.readFile(file,'utf8'),JSON.stringify(envelope));
});
