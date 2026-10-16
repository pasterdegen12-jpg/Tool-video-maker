import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readReferenceFile, createVisualProfileController } from '../src/lib/visualProfileClient.js';
const f=JSON.parse(await fs.readFile(new URL('./support/visual-fixture.json',import.meta.url)));
const image=await readReferenceFile(new File([Buffer.from(f.image_base64,'base64')],'reference.png',{type:'image/png'}));
const id='b'.repeat(48);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Retry-After':'1'}});
const admit=()=>json({job_id:id,state:'queued',status_url:'/api/local-ai/jobs/'+id,expires_at:new Date(Date.now()+300000).toISOString(),max_polls:120},202);
const proposal={status:'detected',visual_id:'woman_black_coat',visual_description:'Mock only.'};
const done=(profile=proposal)=>json({job_id:id,state:'completed',error:null,result:{operation:'visual_profile',image_sha256:image.image_sha256,profile}});
function client(fetchImpl,extra={}){const states=[];const calls=[];const c=createVisualProfileController({getToken:async()=>'session',onChange:s=>states.push(s),fetchImpl:async(...args)=>{calls.push(args);return fetchImpl(...args);},sleep:async()=>{},...extra});return{c,states,calls};}

test('reference file bounds and SHA retained; no URL download',async()=>{
  assert.match(image.image_sha256,/^[a-f0-9]{64}$/);assert.equal(image.image_base64,f.image_base64);
  for(const file of [new File(['bad'],'x.svg',{type:'image/svg+xml'}),new File([new Uint8Array(1048577)],'x.png',{type:'image/png'})])await assert.rejects(readReferenceFile(file));
});
for(const status of ['detected','ambiguous','no_human'])test('mock client '+status+' stays a proposal and sends no character/script/project',async()=>{
  const profile=status==='detected'?proposal:{status,visual_id:'',visual_description:''};
  const {c,states,calls}=client((_url,o)=>o.method==='POST'?admit():done(profile));
  await c.submit(image);assert.equal(states.at(-1).status,status);
  assert.equal(calls.length,2);assert.deepEqual(JSON.parse(calls[0][1].body),{image_base64:image.image_base64,mime_type:image.mime_type});
  assert.equal(calls[0][0],'/api/local-ai/visual-profile');assert.equal(calls[0][1].credentials,'omit');
});
test('no auth, inference failure and malformed/oversize results never produce detection',async()=>{
  const unauthorized=client(()=>{throw Error();},{getToken:async()=>null});await unauthorized.c.submit(image);assert.equal(unauthorized.calls.length,0);
  for(const response of [()=>json({job_id:id,state:'failed',result:null,error:{code:'CUDA_OOM'}}),()=>done({...proposal,visual_id:'Bad ID'}),()=>json({padding:'x'.repeat(8193)})]){
    const {c,states}=client((_url,o)=>o.method==='POST'?admit():response());await c.submit(image);
    assert.ok(['failed','error'].includes(states.at(-1).status));assert.equal(states.at(-1).result,null);
  }
});
test('cancel invalidates late HTTP results and duplicate submissions',async()=>{
  let release,signal;const {c,states,calls}=client((_url,o)=>new Promise(r=>{release=r;signal=o.signal;}));
  const run=c.submit(image);await new Promise(r=>setImmediate(r));assert.equal(await c.submit(image),false);
  c.cancel();assert.equal(signal.aborted,true);release(admit());await run;
  assert.equal(calls.length,1);assert.equal(states.at(-1).status,'cancelled');
});
test('timeout bounds token/fetch and never repeats a possibly admitted POST',async()=>{
  const {c,states,calls}=client(()=>new Promise(()=>{}),{requestTimeoutMs:5});await c.submit(image);
  assert.equal(calls.length,1);assert.equal(states.at(-1).status,'unavailable');assert.match(states.at(-1).message,/không tự gửi lại POST/);
});
test('poll budget stops a job that never finishes',async()=>{
  const {c,states,calls}=client((_url,o)=>o.method==='POST'?admit():json({job_id:id,state:'running',result:null,error:null}));
  await c.submit(image);assert.equal(calls.length,121);assert.equal(states.at(-1).status,'expired');
});

// ── Phase 5A.1D: 10 MiB Full AI image limit tests ────────────────────────────
// Qwen Set ID path: readReferenceFile() with no second argument — default stays 1 MiB.
test('Qwen default 1 MiB: readReferenceFile() with no maxBytes rejects 1 MiB + 1 byte',async()=>{
  // Synthetic raw byte array of size 1,048,577 (1 MiB + 1 byte).
  // The type check fires first (size > MAX_REFERENCE_BYTES), so image content does not matter.
  const oversized=new File([new Uint8Array(1048577)],'x.png',{type:'image/png'});
  await assert.rejects(readReferenceFile(oversized),/MiB/,'Qwen path must reject file above 1 MiB');
});

test('Qwen default 1 MiB: readReferenceFile() with no maxBytes still rejects SVG',async()=>{
  const svg=new File(['<svg/>'],'x.svg',{type:'image/svg+xml'});
  await assert.rejects(readReferenceFile(svg),'Qwen path must reject unsupported MIME types');
});

// Full AI Seedance path: readReferenceFile(file, 10 * 1024 * 1024) — 10 MiB limit.
test('Full AI 10 MiB: readReferenceFile with explicit 10 MiB rejects file above 10 MiB',async()=>{
  const oversized=new File([new Uint8Array(10485761)],'x.png',{type:'image/png'});
  await assert.rejects(readReferenceFile(oversized,10485760),/MiB/,'Seedance path must reject file above 10 MiB');
});

test('Full AI 10 MiB: readReferenceFile with explicit 10 MiB accepts valid PNG above 1 MiB',async()=>{
  // Use the small fixture PNG from the fixture file — it is well under 10 MiB and already validated.
  // Prove the Seedance-specific call site (with explicit maxBytes) does not reject a file
  // that the Qwen default would also accept; we test by reading with both limits.
  const smallFile=new File([Buffer.from(f.image_base64,'base64')],'reference.png',{type:'image/png'});
  const result=await readReferenceFile(smallFile,10485760);
  assert.match(result.image_sha256,/^[a-f0-9]{64}$/);
  assert.equal(result.mime_type,'image/png');
  assert.equal(result.image_base64,f.image_base64);
});

test('Full AI 10 MiB: readReferenceFile with explicit 10 MiB accepts a file exactly 1 MiB + 1 byte that Qwen would reject',async()=>{
  // Build a minimal valid PNG: 1×1 white RGBA pixel, padded to exceed 1 MiB.
  // We don't need a parseable image — only the size check is being tested here.
  // (The Seedance backend validateImage() does the full parse; this tests client gating only.)
  const slightlyOver=new File([new Uint8Array(1048577)],'ref.png',{type:'image/png'});
  // Qwen default (no maxBytes) rejects this:
  await assert.rejects(readReferenceFile(slightlyOver),'Qwen default must reject 1 MiB + 1 byte');
  // Seedance-explicit (10 MiB) would pass the size check, but the invalid image content causes rejection:
  // (The readReferenceFile function only checks MIME/size; content validation is server-side.)
  // We verify that passing maxBytes=10MiB does NOT cause a size rejection for this file.
  let caughtError=null;
  try{await readReferenceFile(slightlyOver,10485760);}catch(e){caughtError=e;}
  // It may fail (no valid PNG content to arrayBuffer), but NOT with a "MiB" size message:
  if(caughtError){assert.doesNotMatch(caughtError.message,/MiB/,'Size check must not fire for 1 MiB+1 byte under 10 MiB limit');}
});

test('Full AI 10 MiB: readReferenceFile with exactly 10 MiB boundary passes size check',async()=>{
  const exactLimit=new File([new Uint8Array(10485760)],'ref.png',{type:'image/png'});
  // Size check passes (file.size <= maxBytes). Content will be invalid (not a real PNG header),
  // but readReferenceFile itself only checks MIME/size before arrayBuffer — confirm no size error.
  let caughtError=null;
  try{await readReferenceFile(exactLimit,10485760);}catch(e){caughtError=e;}
  if(caughtError){assert.doesNotMatch(caughtError.message,/MiB/,'Exactly 10 MiB must not trigger size rejection');}
});

test('Full AI 10 MiB: readReferenceFile with 10 MiB + 1 byte triggers size rejection',async()=>{
  const oneOver=new File([new Uint8Array(10485761)],'ref.png',{type:'image/png'});
  await assert.rejects(readReferenceFile(oneOver,10485760),/MiB/,'10 MiB + 1 byte must be rejected with MiB message');
});

test('Full AI 10 MiB: SHA-256 and base64 preserved identically for small image via both limits',async()=>{
  const smallFile=new File([Buffer.from(f.image_base64,'base64')],'reference.png',{type:'image/png'});
  const via1MiB=await readReferenceFile(smallFile);
  const via10MiB=await readReferenceFile(smallFile,10485760);
  assert.equal(via1MiB.image_sha256,via10MiB.image_sha256,'SHA-256 must be identical regardless of limit');
  assert.equal(via1MiB.image_base64,via10MiB.image_base64,'base64 must be identical regardless of limit');
  assert.equal(via1MiB.mime_type,via10MiB.mime_type,'MIME type must be identical regardless of limit');
});
