// Browser-controller unit tests. All responses mocked; no Clerk or provider network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createVideoController} from '../src/lib/seedanceClient.js';
import {composeScene,estimateCost,MODEL} from '../src/lib/seedanceContract.js';
import {payload} from './support/seedance-fixtures.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
function harness({onSubmit,onPoll,onQuote,sleepOverride}={}){
  let clock=Date.now();const calls=[],states=[],delays=[],p=payload();
  const json=(x,status=200,headers={})=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json',...headers}});
  const job=state=>({job_id:'c'.repeat(48),scene_id:p.scene.scene_n,state,video_url:state==='completed'?'https://video.wavespeed.ai/mock.mp4':null,
    expires_at:new Date(clock+900000).toISOString(),speech_review:'unverified',status_url:'/api/local-video/jobs/'+'c'.repeat(48)});
  const controller=createVideoController({getToken:async()=>'mock-token',now:()=>clock,onChange:s=>states.push(s),
    sleep:async(ms,signal)=>{delays.push(ms);clock+=ms;if(sleepOverride)await sleepOverride(ms,signal);},
    fetchImpl:async(url,options)=>{
      calls.push({url,options});
      if(url.endsWith('/quote')){
        const prompt=composeScene(p.scene).prompt;
        const q={quote_id:'a'.repeat(48),request_hash:'b'.repeat(64),image_sha256:hash(Buffer.from(p.image_base64,'base64')),
          prompt,prompt_sha256:hash(prompt),scene_id:p.scene.scene_n,settings:p.settings,cost:estimateCost(p.settings,clock),model:MODEL,
          expires_at:new Date(clock+120000).toISOString(),paid_enabled:true};
        return onQuote?onQuote(q,json):json(q);
      }
      if(url.endsWith('/submit'))return onSubmit?onSubmit(job,json):json(job('queued'),202);
      return onPoll?onPoll(job,json,calls):json(job('completed'));
    }});
  return {controller,calls,states,delays,p,advance:n=>{clock+=n;}};
}
test('double-click controller submit consumes confirmation before await, only one POST',async()=>{
  const h=harness();await h.controller.quote(h.p);
  await Promise.all([h.controller.submit(true,true),h.controller.submit(true,true)]);
  await h.controller.submit(true,true);
  assert.equal(h.calls.filter(c=>c.url.endsWith('/submit')).length,1);
  assert.equal(h.states.at(-1).status,'completed');
});
test('no paid submit without both acknowledgements or after expiration',async()=>{
  const h=harness();await h.controller.quote(h.p);
  await h.controller.submit(false,true);await h.controller.submit(true,false);
  h.advance(120001);await h.controller.submit(true,true);
  assert.equal(h.calls.length,1);assert.equal(h.states.at(-1).status,'error');
});
test('Retry-After is honored for GET without retrying paid submit',async()=>{
  let count=0;
  const h=harness({onPoll:(job,json)=>++count===1?json({error:{}},429,{'Retry-After':'10'}):json(job('completed'))});
  await h.controller.quote(h.p);await h.controller.submit(true,true);
  assert.deepEqual(h.delays,[2000,10000]);assert.equal(h.states.at(-1).status,'completed');
  assert.equal(h.calls.filter(c=>c.url.endsWith('/submit')).length,1);
});
test('polling ends at 180 GETs and never resubmits',async()=>{
  const h=harness({onPoll:(job,json)=>json(job('running'))});
  await h.controller.quote(h.p);await h.controller.submit(true,true);
  assert.equal(h.calls.filter(c=>c.options.method==='GET').length,180);
  assert.equal(h.states.at(-1).status,'expired');
  assert.equal(h.calls.filter(c=>c.url.endsWith('/submit')).length,1);
});
test('ambiguous paid failure is not retried; losing known tracking is distinguished',async()=>{
  for(const stage of ['submit','poll']){
    const fail=()=>{throw new Error('mock timeout');};
    const h=harness(stage==='submit'?{onSubmit:fail}:{onPoll:fail});
    await h.controller.quote(h.p);await h.controller.submit(true,true);await h.controller.submit(true,true);
    assert.equal(h.states.at(-1).status,stage==='submit'?'admission_unknown':'tracking_unknown');
    assert.equal(h.calls.filter(c=>c.url.endsWith('/submit')).length,1);
  }
});
test('quote hash mismatch and oversized response cannot authorize submit',async()=>{
  for(const kind of ['hash','size']){
    const h=harness({onQuote:(q,json)=>json(kind==='hash'?{...q,image_sha256:'0'.repeat(64)}:{...q,extra:'x'.repeat(33000)})});
    await h.controller.quote(h.p);await h.controller.submit(true,true);
    assert.equal(h.states.at(-1).status,'error');assert.equal(h.calls.length,1);
  }
});
test('unsafe completed output is never emitted for media preview',async()=>{
  const h=harness({onPoll:(job,json)=>json({...job('completed'),video_url:'http://localhost/private'})});
  await h.controller.quote(h.p);await h.controller.submit(true,true);
  assert.equal(h.states.at(-1).status,'tracking_unknown');assert.ok(h.states.every(s=>!s.result));
});

test('recovery discovers and retrieves an existing result using GET only, without image or new consent',async()=>{
  const calls=[],states=[],id='f'.repeat(48),scene=3;
  const c=createVideoController({getToken:async()=>'mock-token',onChange:s=>states.push(s),fetchImpl:async(url,options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify(url.includes('?scope=')?{attempts:[{job_id:id,scene_id:scene,stage:'COMPLETED'}],unresolved:false}:
      {job_id:id,scene_id:scene,state:'completed',stage:'COMPLETED',video_url:'https://video.wavespeed.ai/recovered.mp4',expires_at:new Date(Date.now()+60000).toISOString(),speech_review:'unverified'}),{headers:{'Content-Type':'application/json'}});
  }});
  await c.discover('saved-project',scene);assert.equal(states.at(-1).attempts[0].job_id,id);
  await c.recover(id,scene);assert.equal(states.at(-1).status,'completed');assert.ok(states.at(-1).result.endsWith('recovered.mp4'));
  await c.submit(true,true);assert.equal(calls.length,2);assert.ok(calls.every(c=>c.options.method==='GET'&&!c.options.body));
});
test('unknown recovery is terminal and never submits or polls automatically',async()=>{
  const calls=[],states=[],id='f'.repeat(48);
  const c=createVideoController({getToken:async()=>'mock-token',onChange:s=>states.push(s),fetchImpl:async(url,options)=>{
    calls.push({url,options});return new Response(JSON.stringify({job_id:id,scene_id:3,state:'admission_unknown',stage:'UNKNOWN',video_url:null,
      expires_at:new Date(Date.now()+60000).toISOString(),speech_review:'unverified',message:'Unknown; do not retry.'}),{headers:{'Content-Type':'application/json'}});
  }});
  await c.recover(id,3);await c.submit(true,true);assert.equal(states.at(-1).status,'admission_unknown');assert.equal(calls.length,1);
});
