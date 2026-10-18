// Real React/jsdom components for one-click Gen Video flow. Auth hook and WaveSpeed HTTP responses are mocks, not live acceptance.
import test from 'node:test';
import {setTimeout as realTimeout} from 'node:timers';
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
const click=async node=>{assert.ok(node,'Target button should exist');await act(async()=>node.click());};
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
async function selectImage(container){
  const input=container.querySelector('input[type=file]');
  assert.ok(input,'File input must exist');
  Object.defineProperty(input,'files',{configurable:true,value:[new NativeFile([Buffer.from(image.image_base64,'base64')],'reference.png',{type:'image/png'})]});
  await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));
  for(let n=0;n<50&&find(container,'Gen Video')?.disabled;n++)await flush();
}

test('one-click flow: select image -> click Gen Video -> completed video, no quote/prompt/consent UI',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});
  const{container}=await mount(t);
  // Step 1: Open panel
  await click(find(container,'Gen Video AI'));
  assert.equal(container.querySelectorAll('[data-video-state]').length,1);
  // Verify NO prompt textarea, NO price quote, NO consent checkboxes exist
  assert.equal(container.querySelector('textarea'),null,'No prompt textarea in one-click UX');
  assert.equal(container.querySelectorAll('input[type=checkbox]').length,0,'No consent checkboxes in one-click UX');
  assert.ok(!container.textContent.includes('Giá tham khảo'),'No price quote displayed to team user');
  assert.ok(!container.textContent.includes('Tôi xác nhận prompt'),'No consent text displayed');
  // Selecting image makes ZERO network requests
  assert.equal(calls.length,0);
  await selectImage(container);
  assert.equal(calls.length,0,'No network calls on selecting image');
  // Gen Video button is enabled
  const genBtn=find(container,'Gen Video');
  assert.ok(genBtn);
  assert.equal(genBtn.disabled,false);
  // Click Gen Video once
  await click(genBtn);
  for(let n=0;n<50&&calls.filter(c=>c.url.endsWith('/submit')).length===0;n++)await flush();
  // Internal pipeline ran: quote and submit called automatically
  assert.equal(calls.filter(c=>c.url.endsWith('/quote')).length,1);
  assert.equal(calls.filter(c=>c.url.endsWith('/submit')).length,1);
  // Poll to completion
  await act(async()=>t.mock.timers.tick(2000));for(let n=0;n<10;n++)await flush();
  assert.equal(container.querySelector('[data-video-state]').dataset.videoState,'completed');
  assert.equal(container.querySelector('[data-seedance-result] video').getAttribute('src'),'https://video.wavespeed.ai/test-only.mp4');
  assert.ok(container.textContent.includes('Đã tạo video thành công'));
});

test('paid-disabled: clicking Gen Video fails gracefully and never submits',async t=>{
  const{container}=await mount(t);
  paid=false;
  await click(find(container,'Gen Video AI'));
  await selectImage(container);
  await click(find(container,'Gen Video'));
  for(let n=0;n<50&&!container.textContent.includes('Tạo video thất bại');n++)await flush();
  assert.equal(calls.filter(c=>c.url.endsWith('/quote')).length,1);
  assert.equal(calls.filter(c=>c.url.endsWith('/submit')).length,0,'Never submits when paid disabled');
  assert.ok(container.textContent.includes('Tạo video thất bại'));
});

test('changing image clears previous selection and resets to unread/idle',async t=>{
  const{container}=await mount(t);
  await click(find(container,'Gen Video AI'));
  await selectImage(container);
  assert.equal(find(container,'Gen Video').disabled,false);
  // Change image - clear files
  const input=container.querySelector('input[type=file]');
  Object.defineProperty(input,'files',{configurable:true,value:[]});
  await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));
  await flush();
  // No files selected -> Gen Video disabled
  assert.equal(find(container,'Gen Video').disabled,true);
  assert.equal(calls.length,0);
});

for(const kind of ['cancel','scene','project','session'])test('late provider result ignored after '+kind,async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});
  const{container,render}=await mount(t);
  await click(find(container,'Gen Video AI'));
  await selectImage(container);
  let release,signal;
  slow=(s,value)=>new Promise(r=>{signal=s;release=()=>r(json(value));});
  await click(find(container,'Gen Video'));
  for(let n=0;n<500&&!release;n++){await act(async()=>{t.mock.timers.tick(20);await new Promise(resolve=>realTimeout(resolve,10));});await flush();}
  assert.ok(release);
  if(kind==='cancel')await click(find(container,'Hủy chờ'));
  if(kind==='scene')await click([...container.querySelectorAll('button')].filter(b=>b.textContent.includes('Gen Video AI'))[1]);
  if(kind==='project')await render({projectId:'project_other'});
  if(kind==='session'){auth={...auth,sessionId:'sess_new'};await render({});}
  assert.equal(signal.aborted,true);await act(async()=>release());await flush();
  assert.equal(container.querySelector('[data-seedance-result]'),null);
});

test('Semi has no video control and signed-out Full AI cannot click Gen Video',async t=>{
  const{container,render}=await mount(t,{projectType:'semi'});
  assert.equal(find(container,'Gen Video AI'),undefined);
  auth={...auth,isSignedIn:false};
  await render({});
  await click(find(container,'Gen Video AI'));
  assert.ok(container.textContent.includes('Đăng nhập trước khi tạo video'));
  assert.equal(find(container,'Gen Video').disabled,true);
  assert.equal(calls.length,0);
});

test('legacy overlay cannot override saved Character; prompt composed internally from canonical scene',async t=>{
  const {approveVisualProfile}=await import('../src/lib/visualProfile.js');
  const character={id:'judge_id',name:'Judge',imageUrl:''};
  character.visualProfile=approveVisualProfile(character,{status:'detected',visual_id:'man_black_coat',visual_description:'Approved fixture description.'},
    {dataUrl:'data:image/png;base64,'+image.image_base64,sha256:digest(Buffer.from(image.image_base64,'base64'))});
  const original=JSON.stringify(character);
  const {container}=await mount(t,{projectCharacters:[character]});
  await click(find(container,'Gen Video AI'));
  await selectImage(container);
  await click(find(container,'Gen Video'));
  for(let n=0;n<50&&!lastPayload;n++)await flush();
  assert.equal(lastPayload.profile,null);
  assert.equal(lastPayload.scene.Character,'Judge');
  assert.ok(lastPayload.scene.Dialogue===scenes[0].Dialogue);
  assert.equal(JSON.stringify(character),original);
});

test('reopened Storyboard recovers existing video without picking image, quoting or submitting',async t=>{
  const {container}=await mount(t);
  await click(find(container,'Gen Video AI'));
  await click(find(container,'Tìm / khôi phục lần gửi'));
  await flush();
  await click(find(container,'Khôi phục'));
  await flush();
  assert.equal(container.querySelector('[data-video-state]').dataset.videoState,'completed');
  assert.equal(container.querySelector('[data-seedance-result] video').getAttribute('src'),'https://video.wavespeed.ai/recovered-only.mp4');
  assert.equal(calls.length,2);
  assert.ok(calls.every(c=>c.options.method==='GET'));
});
