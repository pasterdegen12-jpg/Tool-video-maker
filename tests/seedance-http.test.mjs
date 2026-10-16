import test from 'node:test';
import assert from 'node:assert/strict';
import { payload,serveVideo,confirm,mockProvider,prediction,response,session,baseConfig } from './support/seedance-fixtures.mjs';
import { MODEL } from '../src/lib/seedanceContract.js';
import { readVideoConfig } from '../api/lib/seedance/config.js';
import { publicAddress,publicIPv4 } from '../api/lib/seedance/transport.js';
import { createProvider } from '../api/lib/seedance/provider.js';
import fs from 'node:fs/promises';
test('real loopback HTTP, Clerk verifier with test-signed session, exact upload/submit/poll; no real provider',async t=>{
  let clock=Date.now();const s=await serveVideo(t,{now:()=>clock});
  const input=payload(),q=await s.call('/api/local-video/quote',input);
  assert.equal(q.status,200);assert.equal(s.calls.length,0);
  const admitted=await s.call('/api/local-video/submit',confirm(q.body,input));
  assert.equal(admitted.status,202);assert.equal(admitted.body.state,'queued');
  assert.equal(s.calls.length,3);
  const [ticket,upload,submit]=s.calls;
  assert.equal(ticket.url,'https://api.wavespeed.ai/api/v3/media/uploads');
  assert.equal(upload.options.method,'PUT');assert.ok(!Object.keys(upload.options.headers).some(x=>/authorization/i.test(x)));
  assert.equal(upload.options.body.toString('base64'),input.image_base64);
  assert.equal(submit.url,'https://api.wavespeed.ai/api/v3/'+MODEL);
  const sent=JSON.parse(submit.options.body);
  assert.equal(sent.prompt,q.body.prompt);assert.equal(sent.image,'https://media.wavespeed.ai/test-only.png');
  assert.deepEqual(Object.keys(sent).sort(),['prompt','image',...Object.keys(input.settings)].sort());
  assert.ok(!sent.prompt.includes(input.scene.Translate));
  const path=admitted.body.status_url;
  assert.equal((await s.call(path,undefined,session('user_other'))).status,404);
  assert.equal((await s.call(path,undefined,session('user_owner',{sid:'sess_other'}))).status,404);
  assert.equal((await s.call(path)).status,429);
  clock+=2100;const done=await s.call(path);assert.equal(done.body.state,'completed');
  assert.equal(done.body.speech_review,'unverified');
  assert.ok(!JSON.stringify(done.body).includes('pred_test'));
  assert.equal((await s.call('/api/local-video/submit',confirm(q.body,input))).status,409);
  await fs.writeFile(new URL('../docs/phase5a/mock-http.json',import.meta.url),JSON.stringify({
    label:'REAL LOCAL HTTP + MOCK WAVESPEED + TEST-SIGNED CLERK; NOT LIVE GENERATION',
    quote:q.body,admitted:admitted.body,completed:done.body,provider_calls:s.calls.map(c=>({url:c.url.includes('storage.')?'[redacted test signed URL]':c.url,method:c.options.method||'GET'}))
  },null,2));
});
for(const denied of ['confirm','transfer_consent'])test('missing '+denied+' never uploads or submits',async t=>{
  const s=await serveVideo(t),q=await s.call('/api/local-video/quote',payload()),b=confirm(q.body);b[denied]=false;
  assert.equal((await s.call('/api/local-video/submit',b)).status,422);assert.equal(s.calls.length,0);
});
for(const change of ['image','prompt','settings','quote_hash','session'])test('approval bound to '+change,async t=>{
  const s=await serveVideo(t),q=await s.call('/api/local-video/quote',payload()),b=confirm(q.body);
  let token=session();
  if(change==='image')b.payload.mime_type='image/jpeg';
  if(change==='prompt')b.payload.scene.Dialogue+=' Changed.';
  if(change==='settings')b.payload.settings.seed=3;
  if(change==='quote_hash')b.request_hash='a'.repeat(64);
  if(change==='session')token=session('user_owner',{sid:'sess_other'});
  const r=await s.call('/api/local-video/submit',b,token);
  assert.ok([404,409,422].includes(r.status));assert.equal(s.calls.length,0);
});
test('expired quote and stale pricing fail closed',async t=>{
  let clock=Date.now();const s=await serveVideo(t,{now:()=>clock}),q=await s.call('/api/local-video/quote',payload());
  clock+=120001;assert.equal((await s.call('/api/local-video/submit',confirm(q.body))).status,410);
  clock=Date.parse('2027-01-01');assert.equal((await s.call('/api/local-video/quote',payload())).body.error.code,'PRICE_UNAVAILABLE');assert.equal(s.calls.length,0);
});
test('double clicks and two quotes for same request produce at most one paid POST',async t=>{
  let release;const gate=new Promise(r=>{release=r;});
  const m=mockProvider({override:async(url)=>{if(url.endsWith('/media/uploads'))await gate;}});
  const s=await serveVideo(t,m,{maxPerUser:8}),q=await s.call('/api/local-video/quote',payload()),q2=await s.call('/api/local-video/quote',payload());
  const first=s.call('/api/local-video/submit',confirm(q.body));
  while(!s.calls.length)await new Promise(r=>setImmediate(r));
  assert.equal((await s.call('/api/local-video/submit',confirm(q.body))).status,409);
  assert.equal((await s.call('/api/local-video/submit',confirm(q2.body))).status,409);
  release();assert.equal((await first).status,202);
  assert.equal(s.calls.filter(c=>c.url.endsWith('/image-to-video')).length,1);
});
test('disabled paid flag with provider key allows only local quote',async t=>{
  const s=await serveVideo(t,{}, {paidEnabled:false});
  const q=await s.call('/api/local-video/quote',payload());assert.equal(q.body.paid_enabled,false);
  assert.equal((await s.call('/api/local-video/submit',confirm(q.body))).body.error.code,'PAID_DISABLED');
  assert.equal(s.calls.length,0);
});
test('disabled config and production cannot expose feature even with key',()=>{
  for(const env of [{},{NODE_ENV:'production',LOCAL_VIDEO_ENABLED:'true'},{NODE_ENV:'development',VERCEL:'1',LOCAL_VIDEO_ENABLED:'true'}]){
    assert.throws(()=>readVideoConfig({...env,WAVESPEED_API_KEY:'test-key'}));
  }
  const cfg=readVideoConfig({NODE_ENV:'development',LOCAL_VIDEO_ENABLED:'true',WAVESPEED_API_KEY:'test-key',CLERK_ISSUER:baseConfig.issuer,CLERK_JWT_KEY:baseConfig.jwtKey});
  assert.equal(cfg.paidEnabled,false);
});
for(const [name,claims]of [['issuer',{iss:'https://foreign.clerk.dev'}],['party',{azp:'https://evil.example'}],['pending',{sts:'pending'}],['expired',{exp:1}],['session',{sid:''}]]){
  test('Clerk '+name+' rejected before provider',async t=>{
    const s=await serveVideo(t);assert.equal((await s.call('/api/local-video/quote',payload(),session('user_owner',claims))).status,401);assert.equal(s.calls.length,0);
  });
}
test('wrong origin, arbitrary URLs, Semi and excessive duration rejected',async t=>{
  const s=await serveVideo(t);
  assert.equal((await s.call('/api/local-video/quote',payload(),session(),{Origin:'https://evil.example'})).status,403);
  for(const p of [{...payload(),image_url:'https://private.example/x'},{...payload(),projectType:'semi'},{...payload(),scene:{scene_n:1,Dialogue:'word '.repeat(100)}}]){
    assert.equal((await s.call('/api/local-video/quote',p)).status,422);
  }
  assert.equal(s.calls.length,0);
});
for(const state of ['completed','failed','cancelled','timeout','deleted','running','processing','queued'])test('provider status '+state,async t=>{
  let clock=Date.now();const s=await serveVideo(t,{status:state,now:()=>clock});
  const q=await s.call('/api/local-video/quote',payload()),admit=await s.call('/api/local-video/submit',confirm(q.body));
  clock+=2001;const result=await s.call(admit.body.status_url);
  assert.equal(result.status,200);assert.equal(result.body.state,state==='processing'?'running':state);
});
for(const bad of ['timeout','malformed','wrong_model'])test('ambiguous paid '+bad+' never retries',async t=>{
  const m=mockProvider({override:async url=>{
    if(!url.endsWith('/image-to-video'))return;
    if(bad==='timeout')throw new Error('PRIVATE_PROVIDER_ERROR');
    return bad==='malformed'?{status:200,body:'private bad body'}:response({...prediction(),model:'other/model'});
  }});
  const s=await serveVideo(t,m),q=await s.call('/api/local-video/quote',payload());
  const r=await s.call('/api/local-video/submit',confirm(q.body));assert.equal(r.body.state,'admission_unknown');
  assert.ok(!JSON.stringify(r.body).includes('PRIVATE'));assert.equal(s.calls.filter(c=>c.url.endsWith('/image-to-video')).length,1);
  assert.equal((await s.call('/api/local-video/submit',confirm(q.body))).status,409);
});
for(const bad of ['private_url','credentials','redirect','expired'])test('unsafe upload '+bad+' blocked before paid submit',async t=>{
  const m=mockProvider({override:async(url,options)=>{
    if(bad==='redirect'&&url.includes('storage.'))return {status:307,headers:{location:'https://127.0.0.1'},body:''};
    if(!url.endsWith('/media/uploads')||bad==='redirect')return;
    const p=JSON.parse(options.body);
    return response({type:'image',filename:p.filename,size:p.size,download_url:'https://media.wavespeed.ai/image.png',upload:{method:'PUT',
      url:bad==='private_url'?'https://127.0.0.1/private':'https://storage.wavespeed.ai/test',
      headers:bad==='credentials'?{'Content-Type':p.content_type,Authorization:'secret'}:{'Content-Type':p.content_type},
      expires_at:new Date(Date.now()+(bad==='expired'?-1:60000)).toISOString()}});
  }});
  const s=await serveVideo(t,m),q=await s.call('/api/local-video/quote',payload());
  const r=await s.call('/api/local-video/submit',confirm(q.body));assert.equal(r.body.state,'failed');
  assert.equal(s.calls.filter(c=>c.url.endsWith('/image-to-video')).length,0);
});
test('poll retry-after, expiry, unknown IDs and invalid output URL',async t=>{
  let clock=Date.now(),phase='rate';const m=mockProvider({now:()=>clock,override:async url=>{
    if(!url.includes('/predictions/'))return;
    if(phase==='rate')return {status:429,headers:{'retry-after':'10'},body:'PRIVATE'};
    return response({...prediction('completed'),outputs:['http://localhost/video.mp4']});
  }});
  const s=await serveVideo(t,{...m,now:()=>clock}),q=await s.call('/api/local-video/quote',payload()),a=await s.call('/api/local-video/submit',confirm(q.body));
  clock+=2100;const rate=await s.call(a.body.status_url);assert.equal(rate.headers.get('retry-after'),'10');
  const calls=s.calls.length;clock+=2000;assert.equal((await s.call(a.body.status_url)).status,429);assert.equal(s.calls.length,calls);
  clock+=10000;phase='url';assert.equal((await s.call(a.body.status_url)).status,502);
  clock+=900001;assert.equal((await s.call(a.body.status_url)).status,410);
  assert.equal((await s.call('/api/local-video/jobs/'+'f'.repeat(48))).status,404);
});
test('SSRF addresses, URL credentials and rebinding are rejected',async()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.1.1','192.168.1.1','100.64.1.1','0.0.0.0','224.0.0.1','::1','::ffff:127.0.0.1'])assert.equal(publicIPv4(ip),false);
  for(const url of ['http://public.com','https://localhost/a','https://user:pass@public.com/a','https://127.1/a','https://public.com:8443/a','https://public.com/a#secret'])await assert.rejects(publicAddress(url,async()=>[{address:'93.184.216.34'}]));
  await assert.rejects(publicAddress('https://storage.wavespeed.ai/a',async()=>[{address:'127.0.0.1'}]));
  await assert.rejects(publicAddress('https://storage.wavespeed.ai/a',async()=>[{address:'93.184.216.34'},{address:'10.0.0.1'}]));
  assert.equal(await publicAddress('https://storage.wavespeed.ai/a',async()=>[{address:'93.184.216.34'}]),'93.184.216.34');
});
test('provider client itself refuses paid call when disabled',async()=>{
  let calls=0;const p=createProvider({...baseConfig,paidEnabled:false},{request:async()=>{calls++;}});
  await assert.rejects(p.submit({}));await assert.rejects(p.upload({}));assert.equal(calls,0);
});

test('quote reservations bound both quotes and future jobs; capacity recovers after expiry',async t=>{
  let clock=Date.now();const s=await serveVideo(t,{now:()=>clock},{maxRecords:4,maxPerUser:4});
  const a=payload(),b=payload();b.settings.seed=1;
  const qa=await s.call('/api/local-video/quote',a),qb=await s.call('/api/local-video/quote',b);
  assert.equal(qa.status,200);assert.equal(qb.status,200);
  assert.equal((await s.call('/api/local-video/quote',a)).body.error.code,'CAPACITY');
  assert.equal((await s.call('/api/local-video/submit',confirm(qa.body,a))).status,202);
  assert.equal((await s.call('/api/local-video/submit',confirm(qb.body,b))).status,202);
  assert.equal((await s.call('/api/local-video/quote',a)).body.error.code,'CAPACITY');
  assert.equal(s.calls.filter(c=>c.url.endsWith('/image-to-video')).length,2);
  clock+=900001;assert.equal((await s.call('/api/local-video/quote',a)).status,200);
});
test('request byte limit and malformed JSON fail before provider',async t=>{
  const s=await serveVideo(t,{}, {maxBodyBytes:100});
  assert.equal((await s.call('/api/local-video/quote',payload())).status,413);
  const r=await fetch(s.base+'/api/local-video/quote',{method:'POST',headers:{Origin:baseConfig.origin,Authorization:'Bearer '+session(),'Content-Type':'application/json'},body:'{'});
  assert.equal(r.status,422);assert.equal(s.calls.length,0);
});
test('poll ceiling stops provider GETs, and same-origin browser GET without Origin is accepted',async t=>{
  let clock=Date.now();const s=await serveVideo(t,{now:()=>clock,status:'running'},{maxPolls:1});
  const q=await s.call('/api/local-video/quote',payload()),a=await s.call('/api/local-video/submit',confirm(q.body));
  clock+=2001;
  const r=await fetch(s.base+a.body.status_url,{headers:{Authorization:'Bearer '+session(),'Sec-Fetch-Site':'same-origin',Referer:baseConfig.origin+'/'}});
  assert.equal(r.status,200);assert.equal((await r.json()).state,'running');
  clock+=2001;const count=s.calls.length;
  assert.equal((await s.call(a.body.status_url)).status,410);assert.equal(s.calls.length,count);
});

test('documented deleted tombstone without outputs is terminal; other missing/malformed outputs remain rejected',async t=>{
  for(const state of ['deleted','failed','completed']){
    let clock=Date.now();
    const m=mockProvider({now:()=>clock,override:async url=>{
      if(url.includes('/predictions/'))return response({id:'pred_test',model:MODEL,status:state});
    }});
    const s=await serveVideo(t,{...m,now:()=>clock});
    const q=await s.call('/api/local-video/quote',payload()),a=await s.call('/api/local-video/submit',confirm(q.body));
    clock+=2001;const result=await s.call(a.body.status_url);
    assert.equal(result.status,state==='deleted'?200:502);
    if(state==='deleted'){
      assert.equal(result.body.state,'deleted');assert.equal(result.body.video_url,null);
      const count=s.calls.length;clock+=2001;
      assert.equal((await s.call(a.body.status_url)).body.state,'deleted');assert.equal(s.calls.length,count);
    }
  }
  for(const bad of [null,{},'invalid']){
    const provider=createProvider(baseConfig,{request:async()=>response({id:'pred_test',model:MODEL,status:'deleted',outputs:bad})});
    await assert.rejects(provider.get('pred_test'));
  }
});

// ── Phase 5A.1D: backend 25 MiB image limit regression ───────────────────────
import { validateImage, MAX_IMAGE_BYTES } from '../api/lib/seedance/images.js';
import { VideoError } from '../api/lib/seedance/errors.js';

test('MAX_IMAGE_BYTES is exactly 25 MiB',()=>{
  assert.equal(MAX_IMAGE_BYTES,26214400,'Raw byte limit must be exactly 25 MiB');
});

test('validateImage rejects base64 string whose decoded length exceeds 25 MiB',()=>{
  // Build a base64 string that decodes to 25 MiB + 1 byte.
  // base64 of (26214401 bytes): ceil(26214401 * 4/3) = 34952536 chars (rounded up to multiple of 4 = 34952540).
  const overBase64='A'.repeat(34952540); // length > 34952536 pre-guard triggers first
  assert.throws(()=>validateImage(overBase64,'image/png'),VideoError,'Oversized base64 must throw VideoError');
});

test('validateImage rejects exactly 25 MiB + 1 decoded bytes via pre-guard',()=>{
  // 25 MiB + 1 byte raw = 26214401. Base64 = ceil(26214401*4/3) = 13981015 (exact) — let's compute:
  // 26214401 * 4 / 3 = 13981014.666... → ceil = 13981015, padded to multiple of 4 = 34952536.
  // The pre-guard is base64.length > 34952536. A string of length 34952537 must be rejected.
  const overPreGuard='A'.repeat(34952537);
  assert.throws(()=>validateImage(overPreGuard,'image/png'),VideoError,'Pre-guard must reject base64 above 34952536 chars');
});

test('validateImage rejects unsupported MIME types',()=>{
  assert.throws(()=>validateImage('AA==','image/webp'),VideoError,'WebP must be rejected at backend (not supported by Seedance)');
  assert.throws(()=>validateImage('AA==','image/gif'),VideoError,'GIF must be rejected');
});

test('validateImage rejects empty or non-string base64',()=>{
  assert.throws(()=>validateImage('','image/png'),VideoError,'Empty string must be rejected');
  assert.throws(()=>validateImage(null,'image/png'),VideoError,'null must be rejected');
  assert.throws(()=>validateImage(42,'image/png'),VideoError,'Number must be rejected');
});

test('validateImage rejects base64 with invalid characters',()=>{
  assert.throws(()=>validateImage('!!!invalid!!!','image/png'),VideoError,'Invalid base64 chars must be rejected');
});

test('validateImage rejects a corrupt PNG (wrong header)',()=>{
  // Valid base64 of 8 bytes all zero — will fail the PNG header check.
  const noHeader=Buffer.alloc(8).toString('base64');
  assert.throws(()=>validateImage(noHeader,'image/png'),VideoError,'Corrupt PNG header must be rejected');
});

test('validateImage rejects a corrupt JPEG (wrong SOI marker)',()=>{
  const noMarker=Buffer.alloc(4).toString('base64');
  assert.throws(()=>validateImage(noMarker,'image/jpeg'),VideoError,'Corrupt JPEG SOI must be rejected');
});

test('HTTP body limit accepts normal fixture payload with new base64 25 MiB + 1 MiB ceiling',async t=>{
  // The existing fixture image is tiny (< 1 KiB decoded). This confirms the new ceiling
  // does not accidentally block ordinary payloads.
  const s=await serveVideo(t);
  const q=await s.call('/api/local-video/quote',payload());
  assert.equal(q.status,200,'Normal fixture payload must be accepted with base64 25 MiB + 1 MiB body ceiling');
  assert.equal(s.calls.length,0,'No provider calls on quote');
});

test('HTTP body limit base64 25 MiB + 1 MiB: request just over custom override ceiling is rejected 413',async t=>{
  // Override ceiling to a tiny value to confirm the body reader still enforces the limit.
  // (The original test at line 163 uses maxBodyBytes:100; this uses a slightly larger override
  // to confirm the mechanism works independently of the specific ceiling value.)
  const s=await serveVideo(t,{},{maxBodyBytes:200});
  assert.equal((await s.call('/api/local-video/quote',payload())).status,413,
    'Body exceeding custom ceiling must return 413');
  assert.equal(s.calls.length,0,'No provider calls on oversized body');
});

test('config maxBodyBytes is 36001112 in production config shape',()=>{
  const cfg=readVideoConfig({NODE_ENV:'development',LOCAL_VIDEO_ENABLED:'true',
    WAVESPEED_API_KEY:'fake-key',CLERK_ISSUER:baseConfig.issuer,CLERK_JWT_KEY:baseConfig.jwtKey});
  assert.equal(cfg.maxBodyBytes,36001112,'maxBodyBytes must be exactly base64 25 MiB + 1 MiB');
});
