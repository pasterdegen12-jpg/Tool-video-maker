// Real React/jsdom components. Auth hook and WaveSpeed HTTP responses are mocks, not live acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {transformWithOxc} from 'vite';
import {MODEL,estimateCost,composeScene} from '../src/lib/seedanceContract.js';
const NativeFile=globalThis.File;
const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost:5173'});
const {window}=dom;const {document}=window;
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.location=dom.window.location;
globalThis.addEventListener=dom.window.addEventListener.bind(dom.window);globalThis.removeEventListener=dom.window.removeEventListener.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const{createRoot}=await import('react-dom/client');
let auth={isLoaded:true,isSignedIn:true,userId:'user_ui',sessionId:'sess_ui',getToken:async()=>'mock-token'};
const cache=new Map();
async function compile(url){
  if(cache.has(url.href))return cache.get(url.href);
  const{code}=await transformWithOxc(await fs.readFile(url,'utf8'),url.pathname,{jsx:{runtime:'automatic'}});
  const mod=new vm.SourceTextModule(code,{identifier:url.href,initializeImportMeta(meta){meta.env={DEV:true};}});
  await mod.link(async spec=>{
    if(/firebase|ffmpeg/.test(spec))throw new Error('No persistence or media-generation imports allowed');
    const exp=spec==='@clerk/clerk-react'?{useAuth:()=>auth}:spec.endsWith('.jsx')?await compile(new URL(spec,url)):await import(spec.startsWith('.')?new URL(spec,url).href:spec);
    return new vm.SyntheticModule(Object.keys(exp),function(){for(const[k,v]of Object.entries(exp))this.setExport(k,v);});
  });
  await mod.evaluate();cache.set(url.href,mod.namespace);return mod.namespace;
}
const Storyboard=(await compile(new URL('../src/Workspace/StoryboardTab.jsx',import.meta.url))).default;
const image=JSON.parse(await fs.readFile(new URL('./support/visual-fixture.json',import.meta.url)));
const scenes=[{scene_n:1,Character:'Judge',Dialogue:'Exact original words.',Translate:'DO NOT SPEAK TRANSLATION',Action:'Stay still.',Camera:'Fixed.',Context:'Courtroom.',Tone_of_Voice:''},
  {scene_n:2,Character:'Plaintiff',Dialogue:'Second exact scene.',Translate:'SECOND TRANSLATION'}];
const digest=value=>createHash('sha256').update(value).digest('hex');
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Retry-After':'2'}});
let lastPayload,lastQuote,calls=[],paid=true,slow=null,retryPredecessor=null;
function mockFetch(url,options){
  calls.push({url,options});assert.ok(url.startsWith('/api/local-video/'));
  if(url.includes('/attempts?scope='))return Promise.resolve(json({attempts:[{job_id:'c'.repeat(48),scene_id:1,state:'completed',stage:'COMPLETED',created_at:new Date().toISOString()}],unresolved:false}));
  if(url.includes('/attempts/'))return Promise.resolve(json({job_id:'c'.repeat(48),scene_id:1,state:'completed',stage:'COMPLETED',video_url:'https://video.wavespeed.ai/recovered-only.mp4',speech_review:'unverified',expires_at:new Date(Date.now()+900000).toISOString()}));
  if(url.endsWith('/retry-authorizations'))return Promise.resolve(json({quote_id:lastQuote.quote_id,predecessor_id:retryPredecessor,authorization_id:'d'.repeat(48),expires_at:lastQuote.expires_at}));
  if(url.endsWith('/quote')){
    lastPayload=JSON.parse(options.body);const prompt=composeScene(lastPayload.scene,lastPayload.profile).prompt;
    lastQuote={quote_id:'a'.repeat(48),request_hash:'b'.repeat(64),image_sha256:digest(Buffer.from(lastPayload.image_base64,'base64')),
      prompt_sha256:digest(prompt),prompt,scene_id:lastPayload.scene.scene_n,settings:lastPayload.settings,
      plan:{},cost:estimateCost(lastPayload.settings),model:MODEL,expires_at:new Date(Date.now()+120000).toISOString(),paid_enabled:paid,retry_predecessor_id:retryPredecessor};
    return Promise.resolve(json(lastQuote));
  }
  const state=url.endsWith('/submit')?'queued':'completed';
  const result={job_id:'c'.repeat(48),state,scene_id:lastPayload.scene.scene_n,video_url:state==='completed'?'https://video.wavespeed.ai/test-only.mp4':null,
    speech_review:'unverified',expires_at:new Date(Date.now()+900000).toISOString(),message:null};
  if(url.endsWith('/submit'))return Promise.resolve(json({...result,status_url:'/api/local-video/jobs/'+'c'.repeat(48)},202));
  if(slow)return slow(options.signal,result);
  return Promise.resolve(json(result));
}
const find=(box,text)=>[...box.querySelectorAll('button')].find(b=>b.textContent.includes(text));
const click=async node=>{assert.ok(node);await act(async()=>node.click());};
const flush=()=>act(async()=>new Promise(r=>setImmediate(r)));
async function mount(t,props={}){
  calls=[];paid=true;slow=null;retryPredecessor=null;const oldFetch=globalThis.fetch,oldAuth=auth;globalThis.fetch=mockFetch;
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  const source=structuredClone(scenes),before=JSON.stringify(source);
  const base={parsedData:source,projectId:'project_ui',projectType:'full-ai',projectCharacters:[],generatedAudios:{},isGenerating:{},mergingScenes:{},mergedVideos:{},darkMode:true,
    setActiveGenModal:()=>{throw new Error('Generate Audio must not run');},setActiveVideoGenModal:()=>{}};
  const render=async p=>act(async()=>root.render(React.createElement(Storyboard,{...base,...p})));
  await render(props);
  t.after(async()=>{assert.equal(JSON.stringify(source),before);await act(async()=>root.unmount());container.remove();globalThis.fetch=oldFetch;auth=oldAuth;});
  return{container,render};
}
async function openAndQuote(container){
  await click(find(container,'Gen Video AI'));
  const input=container.querySelector('input[type=file]');
  Object.defineProperty(input,'files',{configurable:true,value:[new NativeFile([Buffer.from(image.image_base64,'base64')],'reference.png',{type:'image/png'})]});
  await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));
  for(let n=0;n<50&&find(container,'Kiểm tra ảnh').disabled;n++)await flush();
  await click(find(container,'Kiểm tra ảnh'));
  for(let n=0;n<50&&!find(container,'xác nhận tính phí');n++)await flush();
  assert.ok(find(container,'xác nhận tính phí'));
}
async function confirmSubmit(container){
  const checks=[...container.querySelectorAll('input[type=checkbox]')].slice(-2);
  await click(checks[0]);await click(checks[1]);await click(find(container,'xác nhận tính phí'));
  for(let n=0;n<50&&container.querySelector('[data-video-state]')?.dataset.videoState!=='queued';n++)await flush();
}
test('one Full AI scene, complete prompt, two consent checks, genuine mock transport result only, no source/media writes',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});
  const{container}=await mount(t);await openAndQuote(container);
  assert.equal(container.querySelectorAll('[data-video-state]').length,1);
  assert.ok(container.querySelector('[data-original-scene]').textContent.includes(scenes[0].Dialogue));
  const prompt=container.querySelector('textarea').value;
  assert.ok(prompt.includes(scenes[0].Dialogue));assert.ok(!prompt.includes(scenes[0].Translate));
  assert.equal(find(container,'xác nhận tính phí').disabled,true);assert.equal(calls.length,1);
  await confirmSubmit(container);assert.equal(calls.filter(c=>c.url.endsWith('/submit')).length,1);
  await act(async()=>t.mock.timers.tick(2000));for(let n=0;n<10;n++)await flush();
  assert.equal(container.querySelector('[data-video-state]').dataset.videoState,'completed');
  assert.equal(container.querySelector('[data-seedance-result] video').getAttribute('src'),'https://video.wavespeed.ai/test-only.mp4');
  assert.match(container.textContent,/Lời thoại chưa được kiểm chứng/);
});
test('paid-disabled quote cannot submit even when both consent boxes are checked',async t=>{
  const{container}=await mount(t);paid=false;await openAndQuote(container);
  const checks=[...container.querySelectorAll('input[type=checkbox]')].slice(-2);await click(checks[0]);await click(checks[1]);
  assert.equal(find(container,'xác nhận tính phí').disabled,true);assert.equal(calls.length,1);
});
test('changing image invalidates previous quote and consent',async t=>{
  const{container}=await mount(t);await openAndQuote(container);
  const input=container.querySelector('input[type=file]');
  await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));await flush();
  assert.equal(find(container,'xác nhận tính phí'),undefined);assert.equal(calls.length,1);
});
for(const kind of ['cancel','scene','project','session'])test('late provider result ignored after '+kind,async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});
  const{container,render}=await mount(t);await openAndQuote(container);
  let release,signal;
  slow=(s,value)=>new Promise(r=>{signal=s;release=()=>r(json(value));});
  await confirmSubmit(container);await act(async()=>t.mock.timers.tick(2000));for(let n=0;n<10&&!release;n++)await flush();
  assert.ok(release);
  if(kind==='cancel')await click(find(container,'Cancel Waiting'));
  if(kind==='scene')await click([...container.querySelectorAll('button')].filter(b=>b.textContent.includes('Gen Video AI'))[1]);
  if(kind==='project')await render({projectId:'project_other'});
  if(kind==='session'){auth={...auth,sessionId:'sess_new'};await render({});}
  assert.equal(signal.aborted,true);await act(async()=>release());await flush();
  assert.equal(container.querySelector('[data-seedance-result]'),null);
});
test('Semi has no video control and signed-out Full AI cannot request quote',async t=>{
  const{container,render}=await mount(t,{projectType:'semi'});assert.equal(find(container,'Gen Video AI'),undefined);
  auth={...auth,isSignedIn:false};await render({});await click(find(container,'Gen Video AI'));
  assert.equal(find(container,'Kiểm tra ảnh').disabled,true);assert.equal(calls.length,0);
});

test('settings changes invalidate quote and explicit consent; no automatic submit',async t=>{
  const {container}=await mount(t);await openAndQuote(container);
  const checks=[...container.querySelectorAll('input[type=checkbox]')].slice(-2);
  await click(checks[0]);await click(checks[1]);
  const select=container.querySelector('[aria-label="Độ phân giải"]');
  await act(async()=>{select.value='720p';select.dispatchEvent(new window.Event('change',{bubbles:true}));});
  assert.equal(find(container,'xác nhận tính phí'),undefined);
  assert.equal(calls.filter(c=>c.url.endsWith('/submit')).length,0);
  await click(find(container,'Kiểm tra ảnh'));
  for(let n=0;n<100&&!find(container,'xác nhận tính phí');n++)await flush();
  assert.equal(lastPayload.settings.resolution,'720p');assert.equal(find(container,'xác nhận tính phí').disabled,true);
});
test('approved Visual Profile is optional supplement; original Character is unchanged and Set ID never called',async t=>{
  const {approveVisualProfile}=await import('../src/lib/visualProfile.js');
  const character={id:'judge_id',name:'Judge',imageUrl:''};
  character.visualProfile=approveVisualProfile(character,{status:'detected',visual_id:'man_black_coat',visual_description:'Approved fixture description.'},
    {dataUrl:'data:image/png;base64,'+image.image_base64,sha256:digest(Buffer.from(image.image_base64,'base64'))});
  const original=JSON.stringify(character);
  const {container}=await mount(t,{projectCharacters:[character]});await openAndQuote(container);
  assert.equal(lastPayload.profile.visualId,'man_black_coat');
  assert.equal(lastPayload.scene.Character,'Judge');assert.ok(lastPayload.scene.Dialogue===scenes[0].Dialogue);
  const check=[...container.querySelectorAll('label')].find(l=>l.textContent.includes('Dùng Visual Profile')).querySelector('input');
  await click(check);await click(find(container,'Kiểm tra ảnh'));await flush();
  assert.equal(lastPayload.profile,null);assert.equal(JSON.stringify(character),original);
  assert.ok(calls.every(c=>c.url.endsWith('/quote')));
});

test('reopened Storyboard recovers existing video without picking image, quoting or submitting',async t=>{
  const {container}=await mount(t);await click(find(container,'Gen Video AI'));
  await click(find(container,'Tìm / khôi phục'));await flush();
  await click(find(container,'Khôi phục / kiểm tra'));await flush();
  assert.equal(container.querySelector('[data-video-state]').dataset.videoState,'completed');
  assert.equal(container.querySelector('[data-seedance-result] video').getAttribute('src'),'https://video.wavespeed.ai/recovered-only.mp4');
  assert.equal(calls.length,2);assert.ok(calls.every(c=>c.options.method==='GET'));
});
test('retry requires two consents and a separate authorization click before Generate; no automatic submission',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});
  const {container}=await mount(t);retryPredecessor='f'.repeat(48);await openAndQuote(container);
  const checks=[...container.querySelectorAll('input[type=checkbox]')].slice(-2);
  assert.equal(find(container,'Phê duyệt thử lại một lần').disabled,true);
  await click(checks[0]);await click(checks[1]);
  assert.equal(find(container,'xác nhận tính phí').disabled,true);
  await click(find(container,'Phê duyệt thử lại một lần'));await flush();
  assert.equal(calls.filter(c=>c.url.endsWith('/submit')).length,0);
  assert.equal(find(container,'Đã phê duyệt thử lại một lần').disabled,true);
  assert.equal(find(container,'xác nhận tính phí').disabled,false);
  const authorization=JSON.parse(calls.find(c=>c.url.endsWith('/retry-authorizations')).options.body);
  assert.equal(authorization.predecessor_id,retryPredecessor);assert.equal(authorization.confirm,true);assert.equal(authorization.transfer_consent,true);
  await click(find(container,'xác nhận tính phí'));await flush();
  const submissions=calls.filter(c=>c.url.endsWith('/submit'));assert.equal(submissions.length,1);
  assert.equal(JSON.parse(submissions[0].options.body).retry_authorization_id,'d'.repeat(48));
});
test('paid=false and setting changes prevent reuse of retry authorization',async t=>{
  const {container}=await mount(t);retryPredecessor='f'.repeat(48);paid=false;await openAndQuote(container);
  const checks=[...container.querySelectorAll('input[type=checkbox]')].slice(-2);await click(checks[0]);await click(checks[1]);
  assert.equal(find(container,'Phê duyệt thử lại một lần').disabled,true);assert.equal(calls.length,1);
  paid=true;await click(find(container,'Kiểm tra ảnh'));
  for(let n=0;n<100&&!find(container,'Phê duyệt thử lại một lần');n++)await flush();
  const checks2=[...container.querySelectorAll('input[type=checkbox]')].slice(-2);await click(checks2[0]);await click(checks2[1]);
  await click(find(container,'Phê duyệt thử lại một lần'));await flush();
  const select=container.querySelector('[aria-label="Độ phân giải"]');
  await act(async()=>{select.value='720p';select.dispatchEvent(new window.Event('change',{bubbles:true}));});
  assert.equal(find(container,'xác nhận tính phí'),undefined);
  await click(find(container,'Kiểm tra ảnh'));
  for(let n=0;n<100&&!find(container,'Phê duyệt thử lại một lần');n++)await flush();
  assert.equal(find(container,'Phê duyệt thử lại một lần').disabled,true);assert.equal(find(container,'xác nhận tính phí').disabled,true);
  assert.equal(calls.filter(c=>c.url.endsWith('/submit')).length,0);
});
