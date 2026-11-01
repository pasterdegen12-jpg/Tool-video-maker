import test from 'node:test';import assert from 'node:assert/strict';
import {batchHarness} from './video-batch.test.mjs';
import {createVideoContinuation} from '../api/_lib/cloud-video/continuation.js';
import {videoTrace} from '../api/_lib/cloud-video/trace.js';
import {createVideoHandler} from '../api/video.js';
const session={subject:'shared_admin',session:'browser_a'};
test('private durable wake-ups finish shared batch without any browser tick and never duplicate predictions',async()=>{
 const h=batchHarness(3),messages=[];let clock=Date.parse('2026-11-01');await h.create([1,2,3]);
 const {video,batch}=h.services();const c=createVideoContinuation({...h.deps,service:{...video,...batch},now:()=>clock,send:async(topic,m,options)=>{messages.push({topic,m,options});return{messageId:'message-'+messages.length};}});
 await c.wake(session,'proj_batch');await c.wake(session,'proj_batch');assert.equal(messages.length,1);assert.equal(h.calls.length,0);
 for(let n=0;n<30&&n<messages.length;n++){clock+=10000;h.advance(10000);await c.consume(messages[n].m,{messageId:'message-'+n});}
 assert.equal(h.calls.filter(x=>x.kind==='post').length,3);assert.equal(h.project.data.filter(s=>s.videoUrl).length,3);
 assert.ok(messages.slice(1).every(x=>x.options.delaySeconds===15));
 await c.consume(messages[0].m,{messageId:'redelivered'});assert.equal(h.calls.filter(x=>x.kind==='post').length,3);
});
test('queue publication failure is explicit, retains intent and allows idempotent wake retry',async()=>{
 const h=batchHarness(1);await h.create([1]);let failed=true,count=0;const {video,batch}=h.services();const c=createVideoContinuation({...h.deps,service:{...video,...batch},send:async()=>{count++;if(failed)throw Error('secret upstream body');}});
 await assert.rejects(c.wake(session,'proj_batch'),/DISPATCH_UNAVAILABLE/);assert.equal(h.calls.length,0);failed=false;await c.wake(session,'proj_batch');assert.equal(count,2);assert.equal(Object.keys(h.ledger().batches).length,1);
});
test('ambiguous paid attempt is not released or re-posted by server continuation',async()=>{
 const h=batchHarness(1,{unknown:true});await h.create([1]);const msgs=[];const {video,batch}=h.services();const c=createVideoContinuation({...h.deps,service:{...video,...batch},send:async(t,m)=>msgs.push(m)});await c.wake(session,'proj_batch');
 for(let n=0;n<10&&n<msgs.length;n++){h.advance(10000);await c.consume(msgs[n],{messageId:String(n)});}
 assert.equal(h.calls.filter(x=>x.kind==='post').length,1);assert.equal(Object.values(h.ledger().records)[0].stage,'UNKNOWN');assert.ok(msgs.length<10);
});
test('diagnostic allowlist excludes secrets, screenplay, URLs and unsafe error strings',()=>{
 const events=[];videoTrace('SUBMIT_RECEIVED',{attemptId:'a'.repeat(48),projectId:'proj_a',sceneId:20,token:'SECRET',prompt:'PRIVATE',url:'https://private',code:'raw/unsafe?secret'},e=>events.push(e));
 assert.equal(events[0].attemptId,'a'.repeat(48));for(const s of ['SECRET','PRIVATE','https','unsafe'])assert.ok(!JSON.stringify(events).includes(s));assert.doesNotThrow(()=>videoTrace('TEST',{},()=>{throw Error('sink');}));
});
test('legacy upload path retains OPTIONS, method and reserved-video-path protection without a provider call',async()=>{
 const handler=createVideoHandler({configure:()=>{throw Error('video auth must not alter legacy upload');}});
 for(const [method,body,status]of [['OPTIONS',null,200],['GET',null,405],['POST',{fileName:'_video_reserved/test.mp4'},400]]){
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},end(){},json(v){this.body=v;}};
  await handler({url:'/api/get-upload-url',method,body},res);assert.equal(res.statusCode,status);assert.equal(res.headers['Access-Control-Allow-Origin'],'*');
 }
});
