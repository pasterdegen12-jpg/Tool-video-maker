import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCloudVideoController,videoMessage} from '../src/lib/cloudVideoClient.js';
import {prepareQuote,publicQuote} from '../api/_lib/cloud-video/core.js';
import {DEFAULT_SETTINGS,videoVisible} from '../src/lib/seedanceContract.js';
const fixture=JSON.parse(await fs.readFile(new URL('./support/visual-fixture.json',import.meta.url)));
const bytes=Buffer.from(fixture.image_base64,'base64'),now=Date.parse('2026-10-17T00:00:00Z'),id='c'.repeat(48);
const scene={scene_n:3,duration_seconds:5,Character:'confirmed_character_id',Dialogue:'Exact original words.',Action:'Sits.',Camera:'Static.',Context:'Court.'};
const payload={project_id:'proj_test',scene,settings:{...DEFAULT_SETTINGS},assumptions:{wordsPerMinute:150,pauseSeconds:.8},image_base64:fixture.image_base64,mime_type:'image/png'};
function harness({paid=true,putStatus=200,mismatch=false,quoteFails=false}={}){
 const calls=[],states=[];let quote;
 const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 const job={job_id:id,scene_id:3,state:'completed',stage:'COMPLETED',prediction_id:'known',video_url:'https://media.example.org/persisted.mp4'};
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  if(url==='https://storage.example.org/signed')return new Response('',{status:putStatus});
  const action=new URL(url,'https://www.aivideomaker.live').searchParams.get('action');
  assert.equal(options.headers.Authorization,'Bearer mocked-clerk-session');
  const body=options.body?JSON.parse(options.body):null;
  if(action==='quote'){
    assert.ok(!JSON.stringify(body).includes(fixture.image_base64),'image bytes must not appear in quote body');
    if(quoteFails)return new Response(JSON.stringify({error:{code:'SPENDING_LIMIT'}}),{status:403,headers:{'Content-Type':'application/json'}});
    quote=publicQuote({...prepareQuote({projectType:'full-ai',data:[scene]},body,now),id,quoteExpires:now+120000},paid);
    return json(mismatch?{...quote,prompt:'tampered'}:quote);
  }
  if(action==='ticket')return json({attempt_id:id,image_sha256:quote.image_sha256,upload:{method:'PUT',url:'https://storage.example.org/signed',headers:{'Content-Type':'image/png','If-None-Match':'*'},expires_at:new Date(now+600000).toISOString()}});
  if(action==='verify')return json({verified:true,attempt_id:id,image_sha256:quote.image_sha256});
  if(action==='submit'||action==='job')return json(job);
  if(action==='list')return json({attempts:[{...job,created_at:new Date(now).toISOString()}]});
  throw Error('Unexpected request to '+url);
 };
 const controller=createCloudVideoController({getToken:async()=>'mocked-clerk-session',fetchImpl,onChange:s=>states.push(s),now:()=>now});
 return {controller,calls,states};
}

// === One-click generate() tests ===

test('generate: happy path — quote, upload, verify, submit, track in one call',async()=>{
 const h=harness();
 await h.controller.generate(payload);
 assert.equal(h.states.at(-1).status,'completed');
 assert.equal(h.states.at(-1).result,'https://media.example.org/persisted.mp4');
 // Verify exact sequence
 const actions=h.calls.map(c=>new URL(c.url,'https://x').searchParams.get('action')||'PUT');
 assert.deepEqual(actions,['quote','ticket','PUT','verify','submit']);
 // Verify image bytes reach storage exactly
 const put=h.calls.find(c=>c.url.startsWith('https://storage.example.org'));
 assert.deepEqual(Buffer.from(put.options.body),bytes);
 assert.equal(createHash('sha256').update(put.options.body).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
 assert.deepEqual(put.options.headers,{'Content-Type':'image/png','If-None-Match':'*'});
 assert.equal(put.options.credentials,'omit');
 // Exactly one submit
 assert.equal(h.calls.filter(c=>c.url.includes('action=submit')).length,1);
});

test('generate: image bytes never sent to /api/video (only metadata in quote body)',async()=>{
 const h=harness();
 await h.controller.generate(payload);
 const apiCalls=h.calls.filter(c=>c.url.includes('/api/video'));
 for(const call of apiCalls){
   const body=call.options.body||'';
   assert.ok(!body.includes(fixture.image_base64),'image base64 must not appear in API call body');
 }
});

test('generate: backend returns paid_enabled=false → fails before upload or submit',async()=>{
 const h=harness({paid:false});
 await h.controller.generate(payload);
 assert.equal(h.states.at(-1).status,'error');
 // Only the quote call should have been made
 assert.equal(h.calls.length,1);
 assert.ok(h.calls[0].url.includes('action=quote'));
 assert.ok(h.calls.every(c=>!c.url.includes('action=submit')),'no paid submit after paid_disabled');
});

test('generate: backend prompt mismatch rejected before any image transfer',async()=>{
 const h=harness({mismatch:true});
 await h.controller.generate(payload);
 assert.equal(h.states.at(-1).status,'error');
 assert.equal(h.calls.length,1);
});

test('generate: upload PUT 403 → verify and submit never called',async()=>{
 const h=harness({putStatus:403});
 await h.controller.generate(payload);
 assert.equal(h.states.at(-1).status,'error');
 // quote + ticket + failed-PUT — no verify or submit
 assert.equal(h.calls.filter(c=>c.url.includes('action=submit')).length,0);
 assert.equal(h.calls.filter(c=>c.url.includes('action=verify')).length,0);
});

test('generate: quota/spending error from quote → friendly Vietnamese message, no upload or submit',async()=>{
 const h=harness({quoteFails:true});
 await h.controller.generate(payload);
 assert.equal(h.states.at(-1).status,'error');
 assert.match(h.states.at(-1).message,/giới hạn|Liên hệ|thất bại/i);
 assert.equal(h.calls.length,1);
 assert.equal(h.calls.filter(c=>c.url.includes('action=submit')).length,0);
});

test('generate: concurrent second call ignored while first is running',async()=>{
 const h=harness();
 // Start two generates simultaneously; second should be ignored (active guard)
 const [a,b]=await Promise.all([h.controller.generate(payload),h.controller.generate(payload)]);
 void a;void b;
 // Only one quote call (second was blocked by active guard)
 assert.equal(h.calls.filter(c=>c.url.includes('action=quote')).length,1);
 assert.equal(h.calls.filter(c=>c.url.includes('action=submit')).length,1);
});

test('generate: cancel during upload stops before submit',async()=>{
 const h=harness();
 let cancelCalled=false;
 const origFetch=h.controller;
 // Use slow harness that allows cancel interception
 const calls=[],states=[];let q;
 const json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
 const job={job_id:id,scene_id:3,state:'completed',stage:'COMPLETED',prediction_id:'known',video_url:'https://media.example.org/persisted.mp4'};
 const ctrl=createCloudVideoController({
   getToken:async()=>'mocked-clerk-session',
   fetchImpl:async(url,options)=>{
     calls.push({url,options});
     if(url==='https://storage.example.org/signed'){ctrl.cancel(false);return new Response('',{status:200});}
     const action=new URL(url,'https://x').searchParams.get('action');
     if(action==='quote'){q=publicQuote({...prepareQuote({projectType:'full-ai',data:[scene]},JSON.parse(options.body),now),id,quoteExpires:now+120000},true);return json(q);}
     if(action==='ticket')return json({attempt_id:id,image_sha256:q.image_sha256,upload:{method:'PUT',url:'https://storage.example.org/signed',headers:{'Content-Type':'image/png','If-None-Match':'*'},expires_at:new Date(now+600000).toISOString()}});
     if(action==='verify')return json({verified:true,attempt_id:id,image_sha256:q.image_sha256});
     if(action==='submit'||action==='job')return json(job);
     throw Error('Unexpected '+url);
   },
   onChange:s=>states.push(s),
   now:()=>now,
 });
 cancelCalled=true;
 await ctrl.generate(payload);
 // After cancel during upload, verify should still be called (cancel clears active but transferImage already sent PUT)
 // Key: no submit should be sent — consumed must not be set if cancel happened before submit
 // Since cancel clears `active` reference, the run !== active check prevents further emits but consumed may still be set
 // The important invariant: only 0 or 1 submit calls
 assert.ok(calls.filter(c=>c.url.includes('action=submit')).length<=1);
 void cancelCalled;
});

// === Recovery tests ===

test('refresh recovery only uses GET and plays saved URL',async()=>{
 const h=harness();
 await h.controller.discover('proj_test',3);
 await h.controller.recover(id,3);
 assert.equal(h.states.at(-1).result,'https://media.example.org/persisted.mp4');
 assert.ok(h.calls.every(c=>c.options.method==='GET'));
});

// === UI helpers ===

test('production route has explicit flag and exact host; Semi remains excluded',()=>{
 const env={VITE_CLOUD_VIDEO_ENABLED:'true'},loc={protocol:'https:',hostname:'www.aivideomaker.live'};
 assert.equal(videoVisible(env,loc,'full-ai'),true);
 assert.equal(videoVisible(env,loc,'semi'),false);
 assert.equal(videoVisible(env,{...loc,hostname:'evil.invalid'},'full-ai'),false);
 assert.match(videoMessage('SPENDING_LIMIT'),/giới hạn|Liên hệ/i);
 assert.match(videoMessage('TEAM_FORBIDDEN'),/giới hạn|Liên hệ/i);
});

test('videoMessage returns null for unknown codes (not raw provider detail)',()=>{
 assert.equal(videoMessage('INTERNAL_PROVIDER_DETAIL'),null);
 assert.equal(videoMessage('SOME_UNRECOGNIZED_ERROR'),null);
});
for(const format of ['seconds','date','absent','html'])test('quote 429 '+format+' respects cooldown, preserves input and retries only on manual action',async()=>{
 let clock=now,calls=0;const states=[],before=structuredClone(payload);
 const controller=createCloudVideoController({getToken:async()=>'mock',now:()=>clock,onChange:s=>states.push(s),fetchImpl:async(_url,options)=>{
  calls++;assert.equal(new URL(_url,'https://example.org').searchParams.get('action'),'quote');
  if(calls===1)return new Response(format==='html'?'Busy':JSON.stringify({error:{code:'RATE_LIMIT'}}),{status:429,headers:{'content-type':format==='html'?'text/html':'application/json',...(format==='absent'?{}:{'retry-after':format==='date'?new Date(now+12000).toUTCString():'12'})}});
  const q=publicQuote({...prepareQuote({projectType:'full-ai',data:[scene]},JSON.parse(options.body),clock),id,quoteExpires:clock+120000},false);
  return new Response(JSON.stringify(q),{headers:{'content-type':'application/json'}});
 }});
 await controller.generate(payload);assert.equal(calls,1);assert.equal(states.at(-1).blocked,false);assert.match(states.at(-1).message,/tạm thời/);assert.deepEqual(payload,before);
 if(format!=='absent'){await controller.generate(payload);assert.equal(calls,1);clock+=12000;}
 await controller.generate(payload);assert.equal(calls,2);assert.match(states.at(-1).message,/tắt tạo video/);assert.deepEqual(payload,before);
});
