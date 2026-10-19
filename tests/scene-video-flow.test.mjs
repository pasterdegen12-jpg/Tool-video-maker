// Real React/jsdom components for the Gen Video options modal. Auth hook and WaveSpeed HTTP responses are mocks, not live acceptance.
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
const dom=new JSDOM('<!doctype html><body></body>',{url:'https://www.aivideomaker.live'});
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
  const mod=new vm.SourceTextModule(code,{identifier:url.href,initializeImportMeta(meta){meta.env={DEV:false,VITE_CLOUD_VIDEO_ENABLED:"true"};}});
  await mod.link(async spec=>{
    if(/firebase|ffmpeg/.test(spec))throw new Error('No persistence or media-generation imports allowed');
    const exp=spec==='@clerk/clerk-react'?{useAuth:()=>auth}:spec.endsWith('.jsx')?await compile(new URL(spec,url)):await import(spec.startsWith('.')?new URL(spec,url).href:spec);
    return new vm.SyntheticModule(Object.keys(exp),function(){for(const[k,v]of Object.entries(exp))this.setExport(k,v);});
  });
  await mod.evaluate();cache.set(url.href,mod.namespace);return mod.namespace;
}
const Storyboard=(await compile(new URL('../src/Workspace/StoryboardTab.jsx',import.meta.url))).default;
const image=JSON.parse(await fs.readFile(new URL('./support/visual-fixture.json',import.meta.url)));

// Representative test scene: the recorded real spoken line; identities/media are isolated mocks.
const scenes=[{scene_n:1,Character:'elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses',Voiceover:'You relocated it directly under your tires. Ms. Harper, please explain the incident.',Action:'Sits.',Camera:'Fixed.',Context:'Court.',startFrameUrl:'https://media.example.org/one.png'},
{scene_n:2,Character:'second_character',Dialogue:'Second exact scene.',startFrameUrl:'https://media.example.org/two.png'}];
const bytes=Buffer.from(image.image_base64,'base64'),sha=createHash('sha256').update(bytes).digest('hex');
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
let calls=[],quotes=new Map(),completed=false,failImage=false;
const mockFetch=async(url,options={})=>{
 calls.push({url,options});
 if(url.startsWith('https://media.example.org/'))return new Response(bytes,{status:failImage?403:200,headers:{'Content-Type':'image/png'}});
 if(url.startsWith('https://storage.example.org/'))return new Response('',{status:200});
 const u=new URL(url,'https://www.aivideomaker.live'),action=u.searchParams.get('action'),b=options.body?JSON.parse(options.body):{};
 const {prepareQuote,publicQuote}=await import('../api/_lib/cloud-video/core.js');
 const job=(q)=>({job_id:q.quote_id,scene_id:q.scene_id,state:'completed',video_url:'https://media.example.org/result-'+q.scene_id+'.mp4',prediction_id:'mock-'+q.scene_id});
 if(action==='list')return json({attempts:completed?[{job_id:'f'.repeat(48),scene_id:u.searchParams.get('scene_id')||1,state:'completed',video_url:'https://media.example.org/old.mp4'}]:[]});
 if(action==='job')return json({job_id:u.searchParams.get('id'),scene_id:1,state:'completed',video_url:'https://media.example.org/old.mp4'});
 if(action==='source'){const s=scenes.find(s=>String(s.scene_n)===String(b.scene_id));return json({scene_id:s.scene_n,url:s.startFrameUrl,image:{mime:'image/png',size:bytes.length,sha256:sha,...imageDimensions(bytes,'image/png')}});}
 if(action==='quote'){const id=String(b.scene_id).repeat(48);const q=publicQuote({...prepareQuote({projectType:'full-ai',data:scenes},b,Date.now()),id,quoteExpires:Date.now()+120000},true);quotes.set(id,q);return json(q);}
 const q=quotes.get(b.quote_id||b.attempt_id);
 if(action==='ticket')return json({attempt_id:q.quote_id,image_sha256:sha,upload:{method:'PUT',url:'https://storage.example.org/'+q.scene_id,headers:{'Content-Type':'image/png','If-None-Match':'*'},expires_at:new Date(Date.now()+600000).toISOString()}});
 if(action==='verify')return json({attempt_id:q.quote_id,image_sha256:sha,verified:true});
 if(action==='submit')return json(job(q));
 throw Error('Unexpected mock route '+action);
};
import {imageDimensions} from '../src/lib/seedanceImage.js';
const flush=()=>act(async()=>new Promise(r=>setImmediate(r)));
const click=async b=>act(async()=>{assert.ok(b);b.click();});
const actionButtons=box=>[...box.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Gen Video AI');
async function mount(t,props={}){
 calls=[];quotes=new Map();completed=false;failImage=false;const oldFetch=globalThis.fetch;globalThis.fetch=mockFetch;
 const container=document.createElement('div');document.body.append(container);const r=createRoot(container),data=structuredClone(scenes),before=JSON.stringify(data);
 const base={parsedData:data,projectId:'proj_test',projectType:'full-ai',projectCharacters:[],generatedAudios:{},isGenerating:{},mergingScenes:{},mergedVideos:{},darkMode:true};
 const render=async p=>act(async()=>r.render(React.createElement(Storyboard,{...base,...p})));
 await render(props);for(let i=0;i<100&&(container.querySelector('[data-video-state="recovering"]')||actionButtons(container).some(b=>b.disabled)&&auth.isSignedIn);i++)await act(async()=>new Promise(r=>setTimeout(r,10)));
 t.after(async()=>{assert.equal(JSON.stringify(data),before);await act(async()=>r.unmount());container.remove();globalThis.fetch=oldFetch;});return {container,render};
}
async function settle(){for(let i=0;i<200;i++){await act(async()=>new Promise(r=>setTimeout(r,10)));if(!document.querySelector('[data-video-state="quoting"],[data-video-state="uploading"],[data-video-state="submitting"],[data-video-state="recovering"]'))break;}}

const modal=()=>document.querySelector('[role=dialog]');
const primary=()=>[...modal().querySelectorAll('button')].find(b=>b.textContent==='Generate Video');
const fieldChange=async(el,value)=>act(async()=>{const proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:el.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});
const upload=async(input,file)=>{Object.defineProperty(input,'files',{configurable:true,value:Array.isArray(file)?file:[file]});await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));await settle();};
const chooseMode=async value=>click(modal().querySelector('input[value="'+value+'"]'));

test('scene click opens centered dark dialog, existing Start Frame, all three modes and defaults; no POST',async t=>{
 const {container}=await mount(t);await click(actionButtons(container)[0]);
 assert.match(modal().textContent,/Gen Video — Scene 1/);assert.ok(modal().parentElement.className.includes('fixed inset-0'));assert.ok(modal().parentElement.className.includes('items-center justify-center'));assert.ok(modal().className.includes('bg-slate-900'));
 assert.equal(modal().querySelector('img[alt="Start Frame hiện tại"]').getAttribute('src'),scenes[0].startFrameUrl);
 assert.equal(modal().querySelectorAll('input[type=radio]').length,3);assert.equal(modal().querySelector('input:checked').value,'start_frame_to_video');
 assert.equal(modal().querySelector('[aria-label="Aspect Ratio"]').value,'9:16');assert.equal(modal().querySelector('[aria-label="Resolution"]').value,'480p');
 assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
 await click([...modal().querySelectorAll('button')].find(b=>b.textContent==='Hủy'));assert.equal(modal(),null);assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
test('one explicit Generate click reaches submit and output stays only in correct scene box',async t=>{
 const {container}=await mount(t);await click(actionButtons(container)[0]);await click(primary());await settle();
 assert.equal(calls.filter(c=>c.url.includes('action=submit')).length,1);const body=JSON.parse(calls.find(c=>c.url.includes('action=quote')).options.body);
 assert.equal(body.scene_id,1);assert.equal(body.settings.duration,6);assert.equal(body.mode,'start_frame_to_video');assert.equal(body.settings.aspect_ratio,'9:16');
 const card=container.querySelector('[data-scene-id="1"]');assert.ok(card.querySelector('video[aria-label="Output scene 1"][src$="result-1.mp4"]'));assert.equal(card.querySelectorAll('video').length,1);
 assert.equal(card.querySelector('[aria-label="Video scene 1"] video'),null);
});
test('mode, ratio, resolution and custom prompt changes are nonbillable and reach the backend',async t=>{
 const {container}=await mount(t);await click(actionButtons(container)[1]);await chooseMode('text_to_video');
 await fieldChange(modal().querySelector('[aria-label="Aspect Ratio"]'),'1:1');await fieldChange(modal().querySelector('[aria-label="Resolution"]'),'720p');await fieldChange(modal().querySelector('textarea'),'Warm light.');
 assert.equal(calls.filter(c=>c.options.method==='POST').length,0);await click(primary());await settle();
 const body=JSON.parse(calls.find(c=>c.url.includes('action=quote')).options.body);assert.equal(body.mode,'text_to_video');assert.equal(body.image,undefined);assert.equal(body.settings.aspect_ratio,'1:1');assert.equal(body.settings.resolution,'720p');assert.equal(body.additional_prompt,'Warm light.');
 assert.equal(calls.filter(c=>/action=(source|ticket|verify)/.test(c.url)).length,0);assert.equal(calls.filter(c=>c.url.includes('action=submit')).length,1);
 assert.ok(container.querySelector('[data-scene-id="2"] video[src$="result-2.mp4"]'));
});
test('double Generate click cannot duplicate paid submit',async t=>{
 const {container}=await mount(t);await click(actionButtons(container)[1]);const b=primary();await act(async()=>{b.click();b.click();});await settle();assert.equal(calls.filter(c=>c.url.includes('action=submit')).length,1);
});
test('missing image can be supplied and selection alone never transfers',async t=>{
 const {container}=await mount(t,{parsedData:[{...scenes[0],startFrameUrl:''}]});await click(actionButtons(container)[0]);assert.equal(primary().disabled,true);
 const input=modal().querySelector('[aria-label="Ảnh Start Frame"]');await upload(input,new NativeFile(['invalid'],'bad.jpg',{type:'image/jpeg'}));assert.equal(primary().disabled,true);
 await upload(input,new NativeFile([bytes],'valid.png',{type:'image/png'}));assert.equal(primary().disabled,false);assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
 await click(primary());await settle();assert.equal(calls.filter(c=>c.url.includes('action=submit')).length,1);
});
test('text mode works without image; references passes ordered images, not Start Frame',async t=>{
 const {container}=await mount(t,{parsedData:[{...scenes[1],startFrameUrl:''}]});await click(actionButtons(container)[0]);await chooseMode('references_to_video');assert.equal(primary().disabled,true);
 await upload(modal().querySelector('[aria-label="Ảnh tham chiếu"]'),[new NativeFile([bytes],'one.png',{type:'image/png'}),new NativeFile([bytes],'two.png',{type:'image/png'})]);
 assert.equal(calls.filter(c=>c.options.method==='POST').length,0);await click(primary());await settle();
 const body=JSON.parse(calls.find(c=>c.url.includes('action=quote')).options.body);assert.equal(body.mode,'references_to_video');assert.equal(body.images.length,2);assert.equal(body.image,undefined);
 assert.equal(calls.filter(c=>c.url.includes('action=ticket')).length,2);assert.deepEqual(calls.filter(c=>c.url.includes('action=ticket')).map(c=>JSON.parse(c.options.body).image_index),[0,1]);assert.equal(calls.filter(c=>c.url.includes('action=submit')).length,1);
});
test('inaccessible stored image never submits, replacement control remains in modal',async t=>{
 const {container}=await mount(t);failImage=true;await click(actionButtons(container)[0]);await click(primary());await settle();assert.equal(calls.filter(c=>c.url.includes('action=submit')).length,0);assert.ok(modal().querySelector('[aria-label="Ảnh Start Frame"]'));
});
test('close and scene switch discard temporary prompt; saved scene data stays untouched',async t=>{
 const {container}=await mount(t);await click(actionButtons(container)[0]);await fieldChange(modal().querySelector('textarea'),'Only first scene.');await click(modal().querySelector('[aria-label="Đóng tùy chọn video"]'));await click(actionButtons(container)[1]);assert.equal(modal().querySelector('textarea').value,'');assert.match(modal().textContent,/Scene 2/);assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
test('existing completed output is immediate after F5; modal can reopen without regenerating, and Edit Video is real',async t=>{
 const saved={...scenes[0],videoUrl:'https://media.example.org/saved.mp4',videoJob:{id:'f'.repeat(48),state:'completed'}};
 const {container}=await mount(t,{parsedData:[saved]});await settle();assert.equal(container.querySelector('video[aria-label="Output scene 1"]').getAttribute('src'),saved.videoUrl);assert.equal(container.querySelectorAll('video').length,1);
 await click(actionButtons(container)[0]);assert.ok(modal().querySelector('video[src="'+saved.videoUrl+'"]'));await click([...modal().querySelectorAll('button')].find(b=>b.textContent==='Sửa Output video'));
 assert.ok(modal().querySelector('[data-video-editor]'));assert.ok(modal().querySelector('input[aria-label="Bắt đầu (giây)"]'));assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
test('sign-out cannot send source, quote, upload or prediction',async t=>{
 const saved=auth;auth={...auth,isSignedIn:false};t.after(()=>auth=saved);const {container}=await mount(t);await click(actionButtons(container)[0]);await settle();assert.equal(calls.length,0);assert.equal(modal(),null);
});
test('actual 28-word Scene 1 still uses 12 seconds and preserves exact dialogue',async()=>{
 const {sceneVideoPlan}=await import('../src/lib/cloudVideoContract.js');const Voiceover='Let me get this straight. Your school board spent thousands of taxpayer dollars on legal fees... to prosecute a cafeteria worker over thirty-five dollars worth of chicken nuggets?';
 const resolved=sceneVideoPlan({...scenes[0],Voiceover});assert.equal(resolved.settings.duration,12);assert.ok(resolved.composed.prompt.includes(Voiceover));assert.throws(()=>sceneVideoPlan({...scenes[0],Voiceover:Voiceover+' More words.'}),/12 giây/);
});

test('newer manually saved output replaces cached generation preview without another prediction',async t=>{
 const {container,render}=await mount(t);await click(actionButtons(container)[1]);await click(primary());await settle();
 const saved={...scenes[1],videoUrl:'https://media.example.org/manual.mp4',videoJob:{id:'manual-new',state:'completed',createdAt:Date.now()}};
 await render({parsedData:[saved]});await settle();assert.equal(container.querySelector('video[aria-label="Output scene 2"]').getAttribute('src'),saved.videoUrl);assert.equal(calls.filter(c=>c.url.includes('action=submit')).length,1);
});
test('switch from saved fixed-camera settings to References normalizes unsupported flags visibly without POST',async t=>{
 const saved={...scenes[1],videoUrl:'https://media.example.org/saved.mp4',videoJob:{state:'completed',options:{mode:'start_frame_to_video',settings:{duration:4,resolution:'480p',aspect_ratio:'9:16',generate_audio:true,camera_fixed:true,seed:10}}}};
 const {container}=await mount(t,{parsedData:[saved]});await click(actionButtons(container)[0]);await chooseMode('references_to_video');
 await upload(modal().querySelector('[aria-label="Ảnh tham chiếu"]'),new NativeFile([bytes],'one.png',{type:'image/png'}));
 assert.equal(primary().disabled,false);assert.match(modal().textContent,/không nhận khóa camera hoặc seed/);assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
