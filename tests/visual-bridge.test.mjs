import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { serve, session, admission, upstreamId, json, config } from './support/local-ai-fixtures.mjs';
import { readConfig } from '../api/lib/local-ai/config.js';
import handler from '../api/local-ai/visual-profile.js';
const fixture = JSON.parse(await fs.readFile(new URL('./support/visual-fixture.json', import.meta.url)));
const payload = { mime_type: fixture.mime_type, image_base64: fixture.image_base64 };
const digest = createHash('sha256').update(Buffer.from(payload.image_base64,'base64')).digest('hex');
const proposal = { status: 'detected', visual_id: 'woman_black_coat', visual_description: 'Mock description, not real vision.' };
const completed = () => ({ job_id: upstreamId, state: 'completed', error: null, metrics: {},
  result: { operation: 'visual_profile', image_sha256: digest, profile: proposal } });

test('visual bridge requires opt-in, Clerk, correct owner; sends image only with server credential', async t => {
  const calls = [];
  const web = await serve(t, async (url, options) => { calls.push({ url, options }); return json(options.method === 'POST' ? admission() : completed(), options.method === 'POST' ? 202 : 200); }, { visualEnabled: true });
  const route = '/api/local-ai/visual-profile';
  assert.equal((await web.call(route,{ body: payload, token: '' })).status,401);
  assert.equal(calls.length,0);
  const accepted = await web.call(route,{ body: payload }); assert.equal(accepted.status,202);
  assert.equal(calls[0].url,config.gatewayUrl+'/v1/visual/profile');
  assert.deepEqual(JSON.parse(calls[0].options.body),payload);
  assert.equal(calls[0].options.headers.Authorization,'Bearer '+config.gatewayToken);
  assert.equal(calls[0].options.redirect,'error');
  assert.equal((await web.call(accepted.body.status_url,{ token:session('user_wrong') })).status,404);
  assert.equal(calls.length,1);
  const done = await web.call(accepted.body.status_url); assert.equal(done.status,200);
  assert.deepEqual(done.body.result.profile,proposal);
  const publicText = JSON.stringify(done.body);
  assert.equal(publicText.includes(config.gatewayToken),false); assert.equal(publicText.includes(payload.image_base64),false);
  const disabled = await serve(t,()=>{ throw Error('Must not fetch'); });
  assert.equal((await disabled.call(route,{body:payload})).status,404);
});
for (const bad of [
  { image_url:'http://169.254.169.254/latest/meta-data/' }, { projectId:'foreign-project' }, { userId:'user_wrong' },
  { characterId:'Plaintiff' }, { script:'private screenplay' }, { mime_type:'image/svg+xml' },
  { image_base64:'invalid' }, { mime_type:'image/jpeg' }, { image_base64:'a'.repeat(1400000) },
]) test('visual request refuses URL/project/content injection '+Object.keys(bad)[0],async t=>{
  let calls=0;const web=await serve(t,()=>{calls++;throw Error();},{visualEnabled:true});
  const response=await web.call('/api/local-ai/visual-profile',{body:{...payload,...bad}});
  assert.ok([422,413].includes(response.status));assert.equal(calls,0);
  assert.equal(JSON.stringify(response.body).includes('private screenplay'),false);
});
for (const change of [
  r=>({...r,image_sha256:'b'.repeat(64)}),r=>({...r,operation:'script'}),
  r=>({...r,profile:{...proposal,visual_id:'Plaintiff'}}),r=>({...r,profile:{...proposal,status:'no_human'}}),
]) test('private vision output is checked before the browser receives it',async t=>{
  const web=await serve(t,async(_url,o)=>json(o.method==='POST'?admission():{...completed(),result:change(completed().result)},o.method==='POST'?202:200),{visualEnabled:true});
  const a=await web.call('/api/local-ai/visual-profile',{body:payload});
  assert.equal((await web.call(a.body.status_url)).status,502);
});
test('queued/null metrics, non-detection and safe errors remain distinct from detected',async t=>{
  let current={job_id:upstreamId,state:'queued',result:null,error:null,metrics:null};
  const web=await serve(t,async(_url,o)=>json(o.method==='POST'?admission():current,o.method==='POST'?202:200),{visualEnabled:true});
  const a=await web.call('/api/local-ai/visual-profile',{body:payload});
  assert.equal((await web.call(a.body.status_url)).body.state,'queued');
  for(const status of ['ambiguous','no_human']) {
    current={...completed(),result:{...completed().result,profile:{status,visual_id:'',visual_description:''}}};
    await new Promise(r=>setTimeout(r,2));assert.equal((await web.call(a.body.status_url)).body.result.profile.status,status);
  }
  current={job_id:upstreamId,state:'failed',result:null,error:{code:'CUDA_OOM',message:'PRIVATE TOKEN'},metrics:null};
  await new Promise(r=>setTimeout(r,2));const failed=await web.call(a.body.status_url);
  assert.equal(failed.body.error.code,'CUDA_OOM');assert.equal(JSON.stringify(failed.body).includes('PRIVATE TOKEN'),false);
});
test('vision response bound, capacity and timeout reuse existing bridge limits',async t=>{
  const web=await serve(t,async(_url,o)=>json(o.method==='POST'?admission():{...completed(),padding:'x'.repeat(9000)},o.method==='POST'?202:200),{visualEnabled:true,maxJobs:1});
  const a=await web.call('/api/local-ai/visual-profile',{body:payload});
  assert.equal((await web.call('/api/local-ai/visual-profile',{body:payload})).status,429);
  assert.equal((await web.call(a.body.status_url)).status,502);
  const stuck=await serve(t,()=>new Promise(()=>{}),{visualEnabled:true,requestTimeoutMs:10});
  const timeout=await stuck.call('/api/local-ai/visual-profile',{body:payload});assert.equal(timeout.status,504);
  assert.equal(timeout.body.error.submission,'unknown');
});
test('production/Vercel cannot enable visual upload route',async()=>{
  for(const env of [{NODE_ENV:'production',LOCAL_AI_BRIDGE_ENABLED:'true',LOCAL_AI_VISUAL_ENABLED:'true'},
    {NODE_ENV:'development',VERCEL:'1',LOCAL_AI_BRIDGE_ENABLED:'true',LOCAL_AI_VISUAL_ENABLED:'true'}]) assert.throws(()=>readConfig(env));
  // Default environment in the test process is not an enabled local server.
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.body=JSON.parse(value);}};
  await handler({url:'/api/local-ai/visual-profile',method:'POST'},res);assert.equal(res.statusCode,404);
});

test('near-limit base64 validation is bounded and a canonical padded PNG is admitted to the decoder',async t=>{
  const raw=Buffer.concat([Buffer.from(payload.image_base64,'base64'),Buffer.alloc(900000)]);
  const web=await serve(t,async()=>json(admission(),202),{visualEnabled:true});
  const response=await web.call('/api/local-ai/visual-profile',{body:{...payload,image_base64:raw.toString('base64')}});
  assert.equal(response.status,202);
});
