import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const baseline=JSON.parse(await fs.readFile(new URL('./support/media-transport-baseline.json',import.meta.url)));
const sha=text=>createHash('sha256').update(text).digest('hex');
import {createGeminiService} from '../api/_lib/cloud-video/gemini.js';
import {createAudioService,validateAudio,AUDIO_MODELS} from '../api/_lib/cloud-video/audio.js';
import {geminiRequest,parseGeminiResponse,GEMINI_MODEL} from '../src/lib/geminiContract.js';
import {newLedger,ownerOf} from '../api/_lib/cloud-video/core.js';
import {mediaAuthConfig,authorizeTeam} from '../api/_lib/cloud-video/config.js';
const session={subject:'allowed',session:'session-one'},issuer='https://clerk.example.org';
function harness(){const ledgers=new Map();let team=newLedger(),tail=Promise.resolve();return {read:()=>team,transact(owner,fn){const p=tail.then(()=>{const l=structuredClone(ledgers.get(owner)||newLedger()),t=structuredClone(team),r=fn(l,t);ledgers.set(owner,l);team=t;return structuredClone(r);});tail=p.catch(()=>{});return p;}};}
const cfg={issuer,allowedOwners:[ownerOf(session,issuer)],geminiEnabled:true,keys:['mock-one','mock-two','mock-three'],audioEnabled:true,audioKey:'mock-audio',r2Origin:'https://media.example.org'};
const input={prompt:'Exact authored prompt: Full AI / Semi. Không dịch lại.',request_id:'11111111-1111-4111-8111-111111111111'};
const response=text=>({status:200,body:JSON.stringify({candidates:[{content:{parts:[{text}]}}]})});
for(const flow of ['full-ai','semi'])test('Gemini '+flow+' keeps exact request, fixture content and response normalization',async()=>{
 const capture=JSON.parse(await fs.readFile('docs/phase3a/'+flow+'.web-http.json','utf8'));
 const scenes=capture.response.result.web_data.scenes;const original={characters:capture.response.result.web_data.characters||[],scenes};let calls=0;
 const run=createGeminiService({config:cfg,store:harness(),request:async(url,options)=>{calls++;assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');assert.deepEqual(JSON.parse(options.body),{contents:[{parts:[{text:input.prompt}]}],generationConfig:{response_mime_type:'application/json',temperature:0}});assert.equal(options.headers['x-goog-api-key'],'mock-one');return response('```json\n'+JSON.stringify(original)+'\n```');}});
 assert.deepEqual(parseGeminiResponse(await run(session,input)),original);assert.equal(calls,1);assert.equal(scenes.length,flow==='full-ai'?23:22);
});
test('Gemini ordered fallback preserves invalid-JSON and provider-error behavior',async()=>{const keys=[];const run=createGeminiService({config:cfg,store:harness(),request:async(_u,o)=>{keys.push(o.headers['x-goog-api-key']);return keys.length===1?{status:429,body:JSON.stringify({error:{message:'exhausted'}})}:keys.length===2?response('bad JSON'):response('[{"scene_n":1,"Voiceover":"unchanged"}]');}});assert.deepEqual(parseGeminiResponse(await run(session,input)),{characters:[],scenes:[{scene_n:1,Voiceover:'unchanged'}]});assert.deepEqual(keys,cfg.keys);});
test('Gemini rejects outsiders, oversized/arbitrary input, duplicate request IDs, and concurrent calls',async()=>{
 let release,calls=0;const run=createGeminiService({config:cfg,store:harness(),request:async()=>{calls++;await new Promise(r=>release=r);return response('{}');}});
 await assert.rejects(run({...session,subject:'outsider'},input),/TEAM_FORBIDDEN/);await assert.rejects(run(session,{...input,url:'https://evil.invalid'}),/INVALID_REQUEST/);await assert.rejects(run(session,{...input,prompt:'a'.repeat(100001)}),/INVALID_REQUEST/);
 const pending=run(session,input);while(!release)await new Promise(r=>setImmediate(r));await assert.rejects(run(session,{...input,request_id:'22222222-2222-4222-8222-222222222222'}),/GEMINI_BUSY/);release();await pending;await assert.rejects(run(session,input),/GEMINI_ALREADY_USED/);assert.equal(calls,1);
});
test('Gemini exhaustion is bounded and redacted',async()=>{let calls=0;const run=createGeminiService({config:cfg,store:harness(),request:async()=>{calls++;throw Error('mock upstream secret');}});await assert.rejects(run(session,input),e=>e.code==='GEMINI_EXHAUSTED'&&!e.message.includes('secret'));assert.equal(calls,3);assert.equal(GEMINI_MODEL,'gemini-2.5-flash');assert.equal(geminiRequest('x').generationConfig.temperature,0);});
test('MainEditor media workflow stays byte-identical outside authorized inline import-error presentation',async()=>{
 const after=await fs.readFile('src/MainEditor.jsx','utf8');
 const tail=after.slice(after.indexOf('  const performCutVideo'))
  .replace("onChange={(e) => {setScript(e.target.value);setImportError('');}}\n              aria-invalid={!!importError}\n              aria-describedby={importError?'script-import-error':undefined}","onChange={(e) => setScript(e.target.value)}")
  .replace("            {importError && <p id=\"script-import-error\" role=\"alert\" className={cn('text-sm rounded-xl border p-3 whitespace-pre-wrap break-words',darkMode?'text-red-300 border-red-700/50 bg-red-950/30':'text-red-700 border-red-200 bg-red-50')}>{importError}</p>}\n",'');
 assert.equal(sha(tail),baseline.mainEditorWorkflow);
 assert.ok(!/VITE_GEMINI_KEY|generativelanguage.googleapis.com/.test(after));
});
const mini={text:'Exact original text.',voice_id:'Semicook',language_boost:'auto',emotion:'neutral',format:'mp3',sample_rate:32000,bitrate:128000,enable_sync_mode:true};
const clone={text:'Exact original text.',audio:'https://media.example.org/voice.wav',language:'auto',enable_sync_mode:true,reference_text:'Exact reference.'};
for(const mode of ['minimax','clone'])test('Audio '+mode+' payload/model unchanged; durable ID and polling',async()=>{
 const payload=mode==='minimax'?mini:clone,calls=[],store=harness();let count=0;
 const service=createAudioService({config:cfg,store,checkUrl:async()=>true,request:async(url,o)=>{calls.push({url,o});count++;return {status:200,body:JSON.stringify({code:200,data:{id:'known_id',model:AUDIO_MODELS[mode],status:count===1?'processing':'completed',outputs:count===1?[]:['https://output.example.org/audio.mp3']}})};}});
 const body={mode,payload,idempotency_key:input.request_id},first=await service.submit(session,body);assert.deepEqual(JSON.parse(calls[0].o.body),payload);assert.ok(calls[0].url.endsWith('/'+AUDIO_MODELS[mode]));
 await assert.rejects(service.submit(session,body),/AUDIO_ALREADY_USED/);await assert.rejects(service.poll({...session,subject:'outsider'},first.handle),/AUDIO_FORBIDDEN/);
 const result=await service.poll(session,first.handle);assert.equal(result.data.status,'completed');assert.equal(calls.length,2);await service.poll(session,first.handle);assert.equal(calls.length,2);assert.ok(!JSON.stringify(result).includes(cfg.audioKey));
});
test('Audio rejects arbitrary references and unknown fields before provider request',()=>{assert.throws(()=>validateAudio('clone',{...clone,audio:'https://evil.invalid/private'},cfg.r2Origin));assert.throws(()=>validateAudio('minimax',{...mini,url:'https://evil.invalid'},cfg.r2Origin));assert.deepEqual(validateAudio('clone',clone,cfg.r2Origin),clone);});
test('Audio ambiguous submission never automatically retries or allows new charge',async()=>{let posts=0;const service=createAudioService({config:cfg,store:harness(),request:async()=>{posts++;throw Error('network failed');}});await assert.rejects(service.submit(session,{mode:'minimax',payload:mini,idempotency_key:input.request_id}));await assert.rejects(service.submit(session,{mode:'minimax',payload:mini,idempotency_key:'22222222-2222-4222-8222-222222222222'}),/AUDIO_ACTIVE_OR_UNKNOWN/);assert.equal(posts,1);});
test('Audio batch, text preparation and saved-media logic are unchanged',async()=>{
 const after=await fs.readFile('src/Workspace/Workspace.jsx','utf8');
 const section=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
 assert.equal(sha(section(after,'  const handleStartBatchGen','  const handleStartMerge')),baseline.audioBatch);
 assert.equal(sha(section(after,'      let cleanText','\n\n')),baseline.audioText);
 assert.equal(sha(section(after,'      if (audioUrl) {','  const getTextToGen')),baseline.audioPersistence);
 assert.ok(!/VITE_WAVESPEED_API_KEY|api.wavespeed.ai/.test(after));
});
test('team authorization is fail-closed, independent from client-submitted user IDs',()=>{assert.throws(()=>mediaAuthConfig({VIDEO_WEB_ORIGIN:'https://www.aivideomaker.live',CLERK_ISSUER:issuer,CLERK_JWT_KEY:'-----BEGIN PUBLIC KEY-----'}),/TEAM_CONFIGURATION/);authorizeTeam(session,cfg);assert.throws(()=>authorizeTeam({...session,subject:'forged'},cfg),/TEAM_FORBIDDEN/);});

test('local media origins are explicit and never accepted on Vercel',()=>{const base={VIDEO_WEB_ORIGIN:'http://localhost:5173',CLERK_ISSUER:issuer,CLERK_JWT_KEY:'-----BEGIN PUBLIC KEY-----',MEDIA_ALLOWED_OWNER_HASHES:cfg.allowedOwners[0]};assert.throws(()=>mediaAuthConfig(base),/CONFIGURATION/);assert.equal(mediaAuthConfig({...base,LOCAL_MEDIA_ENABLED:'true'}).origin,base.VIDEO_WEB_ORIGIN);assert.throws(()=>mediaAuthConfig({...base,LOCAL_MEDIA_ENABLED:'true',VERCEL:'1'}),/CONFIGURATION/);assert.throws(()=>mediaAuthConfig({...base,LOCAL_MEDIA_ENABLED:'true',VIDEO_WEB_ORIGIN:'http://192.168.1.1:5173'}),/CONFIGURATION/);});
