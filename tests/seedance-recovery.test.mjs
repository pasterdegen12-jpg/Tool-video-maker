import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import process from 'node:process';
import {createAttemptJournal} from '../api/_lib/seedance/journal.js';
import {payload,serveVideo,confirm,mockProvider,prediction,response,session,baseConfig} from './support/seedance-fixtures.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const temp=()=>fs.mkdtemp(path.join(os.tmpdir(),'seedance-recovery-'));
const read=async(dir,id)=>JSON.parse(readFileSync(path.join(dir,id+'.json'),'utf8')).record;
async function stop(s){const closed=once(s.server,'close');s.server.close();s.server.closeAllConnections();await closed;await s.server.closeJournal();}
test('durable quote -> upload -> accepted ID -> restart with paid=false -> completed; no duplicate POST',async t=>{
  let clock=Date.now();const dir=await temp(),s=await serveVideo(t,{now:()=>clock},{journalPath:dir});
  const p=payload();p.project_id='saved-project';const original=JSON.stringify(p);
  const q=await s.call('/api/local-video/quote',p);assert.equal(q.body.attempt_id,q.body.quote_id);
  const quoted=await read(dir,q.body.attempt_id);assert.equal(quoted.stage,'QUOTED');
  const a=await s.call('/api/local-video/submit',confirm(q.body,p));
  assert.equal(a.body.job_id,q.body.attempt_id);
  const saved=await read(dir,a.body.job_id);assert.equal(saved.upstreamId,'pred_test');assert.equal(saved.stage,'SUBMITTED');
  assert.deepEqual(saved.events.map(e=>e.stage),['QUOTED','UPLOADING','UPLOADED','SUBMITTING','SUBMITTED','SUBMITTED']);
  const raw=await fs.readFile(path.join(dir,a.body.job_id+'.json'),'utf8');
  for(const secret of [p.image_base64,p.scene.Dialogue,baseConfig.apiKey,session(),'Bearer','image_base64'])assert.ok(!raw.includes(secret));
  await stop(s);clock+=2100;
  const resumed=await serveVideo(t,{now:()=>clock},{journalPath:dir,paidEnabled:false});
  const list=await resumed.call('/api/local-video/attempts?scope='+hash(['saved-project',p.scene.scene_n]));
  assert.equal(list.body.attempts[0].job_id,a.body.job_id);
  const done=await resumed.call(a.body.status_url);assert.equal(done.body.state,'completed');assert.ok(done.body.video_url);
  assert.equal(resumed.calls.length,1);assert.ok(resumed.calls[0].url.includes('/predictions/'));
  assert.equal((await read(dir,a.body.job_id)).stage,'COMPLETED');
  assert.equal(JSON.stringify(p),original);
  await stop(resumed);
  const third=await serveVideo(t,{now:()=>clock},{journalPath:dir});
  const q2=await third.call('/api/local-video/quote',p);
  assert.equal((await third.call('/api/local-video/submit',confirm(q2.body,p))).body.error.code,'ALREADY_USED');
  assert.equal(third.calls.length,0);
});
test('ownership, session and origin checks protect both journal lookup routes',async t=>{
  const s=await serveVideo(t),p=payload(),q=await s.call('/api/local-video/quote',p),a=await s.call('/api/local-video/submit',confirm(q.body,p));
  for(const token of [session('user_other'),session('user_owner',{sid:'sess_other'})]){
    assert.equal((await s.call('/api/local-video/attempts/'+a.body.job_id,undefined,token)).status,404);
    assert.deepEqual((await s.call('/api/local-video/attempts?scope='+hash(['',p.scene.scene_n]),undefined,token)).body.attempts,[]);
  }
  assert.equal((await s.call('/api/local-video/attempts/'+a.body.job_id,undefined,'invalid')).status,401);
  assert.equal((await s.call('/api/local-video/attempts/'+a.body.job_id,undefined,session(),{Origin:'https://evil.example'})).status,403);
});
for(const kind of ['upload','reject','timeout','malformed'])test('durable '+kind+' outcome cannot silently resubmit',async t=>{
  const mock=mockProvider({override:async url=>{
    if(kind==='upload'&&url.endsWith('/media/uploads'))throw Error('PRIVATE_API_KEY');
    if(!url.endsWith('/image-to-video'))return;
    if(kind==='reject')return response({},422);
    if(kind==='timeout')throw Error('PRIVATE_BEARER');
    if(kind==='malformed')return {status:200,body:'bad response'};
  }});
  const s=await serveVideo(t,mock),q=await s.call('/api/local-video/quote',payload());
  const a=await s.call('/api/local-video/submit',confirm(q.body));
  const r=await read(s.journalPath,a.body.job_id);
  assert.equal(r.stage,['timeout','malformed'].includes(kind)?'UNKNOWN':'FAILED');
  assert.equal(mock.calls.filter(c=>c.url.endsWith('/image-to-video')).length,kind==='upload'?0:1);
  await stop(s);
  const next=await serveVideo(t,{}, {journalPath:s.journalPath});
  const q2=await next.call('/api/local-video/quote',payload());
  assert.equal((await next.call('/api/local-video/submit',confirm(q2.body))).status,409);assert.equal(next.calls.length,0);
});
for(const phase of ['before-id','after-id'])test('actual process kill '+phase+' preserves safe recovery',async t=>{
  const dir=await temp();
  const worker=spawn(process.execPath,['tests/support/seedance-crash-worker.mjs',dir,phase],{cwd:process.cwd(),env:{...process.env,TEST_CLERK_JWT_KEY:baseConfig.jwtKey},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stderr='';worker.stderr.on('data',b=>{stderr+=b;});
  t.after(()=>{if(worker.exitCode===null)worker.kill('SIGKILL');});
  const port=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Worker startup timeout: '+stderr)),10000);
    worker.once('error',reject);worker.stdout.once('data',b=>{clearTimeout(timer);resolve(JSON.parse(String(b)).port);});
  });
  const call=async(route,body)=>{const r=await fetch('http://127.0.0.1:'+port+route,{method:'POST',headers:{Origin:baseConfig.origin,Authorization:'Bearer '+session(),'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json();};
  const q=await call('/api/local-video/quote',payload());assert.ok(q.attempt_id,JSON.stringify(q));
  const a=await call('/api/local-video/submit',confirm(q));assert.ok(a.job_id,JSON.stringify(a));
  assert.equal(a.job_id,q.attempt_id);
  const desired=phase==='before-id'?'SUBMITTING':'SUBMITTED';
  let r;
  const deadline=Date.now()+10000;
  do{r=await read(dir,a.job_id);if(r.stage===desired)break;await new Promise(resolve=>setTimeout(resolve,20));}while(Date.now()<deadline);
  assert.equal(r.stage,desired);
  const exited=once(worker,'exit');worker.kill('SIGKILL');await exited;
  const m=mockProvider({override:async url=>url.includes('/predictions/')?response(prediction('completed','crash_test_id')):undefined});
  const recovered=await serveVideo(t,m,{journalPath:dir,paidEnabled:false});
  const result=await recovered.call('/api/local-video/jobs/'+a.job_id);
  if(phase==='before-id'){
    assert.equal(result.body.state,'admission_unknown');assert.equal(recovered.calls.length,0);
    assert.equal((await read(dir,a.job_id)).stage,'UNKNOWN');
  }else{assert.equal(result.body.state,'completed');assert.equal(recovered.calls.length,1);assert.ok(recovered.calls[0].url.includes('crash_test_id/result'));}
});
test('client disconnect after body admission cannot erase backend outcome',async t=>{
  let release;const wait=new Promise(r=>{release=r;});
  const m=mockProvider({override:async url=>{if(url.endsWith('/image-to-video'))await wait;}});
  const s=await serveVideo(t,{...m,immediate:true}),q=await s.call('/api/local-video/quote',payload());
  const a=await s.call('/api/local-video/submit',confirm(q.body));assert.equal(a.status,202);
  release();
  let saved;for(let n=0;n<100;n++){saved=await read(s.journalPath,a.body.job_id);if(saved.upstreamId)break;await new Promise(r=>setTimeout(r,5));}
  assert.equal(saved.upstreamId,'pred_test');assert.equal(m.calls.filter(c=>c.url.endsWith('/image-to-video')).length,1);
});
test('corrupt/partial records and concurrent writers fail closed without deleting evidence',async t=>{
  const s=await serveVideo(t),q=await s.call('/api/local-video/quote',payload()),dir=s.journalPath;
  assert.throws(()=>createAttemptJournal(dir));await stop(s);
  const target=path.join(dir,q.body.attempt_id+'.json'),original=await fs.readFile(target);
  await fs.writeFile(target,'{"partial":');assert.throws(()=>createAttemptJournal(dir));assert.equal(await fs.readFile(target,'utf8'),'{"partial":');
  await fs.writeFile(target,original);
  const tempFile=target+'.tmp';await fs.writeFile(tempFile,'partial write');assert.throws(()=>createAttemptJournal(dir));assert.equal(await fs.readFile(tempFile,'utf8'),'partial write');
});
test('journal full / invalid extra fields stop new admission; unresolved records are not silently purged',async t=>{
  let clock=Date.now();const s=await serveVideo(t,{now:()=>clock},{journalMaxRecords:1});
  const q=await s.call('/api/local-video/quote',payload());assert.equal(q.status,200);
  assert.equal((await s.call('/api/local-video/quote',payload())).body.error.code,'CAPACITY');assert.equal(s.calls.length,0);
  clock+=120001;assert.equal((await s.call('/api/local-video/quote',payload())).status,200);
  const dir=await temp(),journal=createAttemptJournal(dir);t.after(()=>journal.close());
  const r=await read(s.journalPath,(await fs.readdir(s.journalPath)).find(f=>f.endsWith('.json')).slice(0,-5));
  assert.throws(()=>journal.create({...r,raw_image:'forbidden'}));assert.equal((await fs.readdir(dir)).filter(f=>f.endsWith('.json')).length,0);
});
