// Real React/jsdom components for one-click Gen Video flow. Auth hook and WaveSpeed HTTP responses are mocks, not live acceptance.
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
 if(action==='list')return json({attempts:completed?[{job_id:'f'.repeat(48),scene_id:u.searchParams.get('scene_id'),state:'completed',video_url:'https://media.example.org/old.mp4'}]:[]});
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
 await render(props);for(let i=0;i<100&&container.querySelector('[data-video-state="recovering"]');i++)await act(async()=>new Promise(r=>setTimeout(r,10)));
 t.after(async()=>{assert.equal(JSON.stringify(data),before);await act(async()=>r.unmount());container.remove();globalThis.fetch=oldFetch;});return {container,render};
}
async function settle(){for(let i=0;i<200;i++){await act(async()=>new Promise(r=>setTimeout(r,10)));if(!document.querySelector('[data-video-state="quoting"],[data-video-state="uploading"],[data-video-state="submitting"],[data-video-state="recovering"]'))break;}}
test('stored INPUT: originating scene button directly generates, duration adapts, result stays in same card',async t=>{
 const {container}=await mount(t);assert.ok(calls.every(c=>c.options.method==='GET'),'render must never initiate paid work');
 await click(actionButtons(container)[0]);await settle();
 assert.equal(calls.filter(c=>c.url.includes('action=submit')).length,1,'one existing-image click must reach submit');
 const body=JSON.parse(calls.find(c=>c.url.includes('action=quote')).options.body);
 assert.equal(body.scene_id,1);assert.equal(body.settings.duration,6);
 const card=container.querySelector('[data-scene-id="1"]');assert.ok(card);assert.ok(card.querySelector('video[src$="result-1.mp4"]'));
 assert.ok(!container.textContent.includes('Gen Video — Scene'),'No global panel');
});
test('scene 2 uses its own saved image and prompt; rapid double-click cannot duplicate submit',async t=>{
 const {container}=await mount(t);const b=actionButtons(container)[1];await act(async()=>{b.click();b.click();});await settle();
 assert.equal(calls.filter(c=>c.url.includes('action=submit')).length,1);
 assert.ok(calls.some(c=>c.url==='https://media.example.org/two.png'));assert.ok(!calls.some(c=>c.url==='https://media.example.org/one.png'));
 assert.ok(container.querySelector('[data-scene-id="2"] video[src$="result-2.mp4"]'));
});
test('missing image: picker is attached to scene; selection alone is nonbillable',async t=>{
 const {container}=await mount(t,{parsedData:[{...scenes[0],startFrameUrl:''}]});await click(actionButtons(container)[0]);
 const card=container.querySelector('[data-scene-id="1"]');assert.ok(card?.querySelector('input[type=file]'));
 assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
test('inaccessible stored image never submits and offers inline replacement',async t=>{
 const {container}=await mount(t);failImage=true;await click(actionButtons(container)[0]);await settle();
 assert.equal(calls.filter(c=>c.url.includes('action=submit')).length,0);assert.ok(container.querySelector('[data-scene-id="1"] input[type=file]'));
});

test('existing completed cloud result restores on mount using GET only; old scene video is preserved',async t=>{
 const {container,render}=await mount(t);completed=true;await render({projectId:'proj_reopened',parsedData:[{...scenes[0],videoUrl:'https://media.example.org/legacy.mp4'}]});await settle();
 assert.ok(container.querySelector('[data-scene-id="1"] video[src$="old.mp4"]'));assert.ok(container.querySelector('video[src$="legacy.mp4"]'));
 assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
test('sign-out never sends source, quote, upload or prediction',async t=>{
 const saved=auth;auth={...auth,isSignedIn:false};t.after(()=>auth=saved);const {container}=await mount(t);await click(actionButtons(container)[0]);await settle();assert.equal(calls.length,0);
});
test('actual production 28-word Scene 1 selects 12 seconds; old five/nine-second gate is reproduced numerically',async()=>{
 const {sceneVideoPlan}=await import('../src/lib/cloudVideoContract.js');const {planDuration}=await import('../src/lib/seedanceContract.js');
 const Voiceover='Let me get this straight. Your school board spent thousands of taxpayer dollars on legal fees... to prosecute a cafeteria worker over thirty-five dollars worth of chicken nuggets?';
 const plan=planDuration(Voiceover);assert.equal(plan.words,28);assert.equal(plan.seconds,12);assert.equal(plan.fits,false);
 const resolved=sceneVideoPlan({...scenes[0],Voiceover});assert.equal(resolved.settings.duration,12);assert.ok(resolved.composed.prompt.includes(Voiceover));
 assert.throws(()=>sceneVideoPlan({...scenes[0],Voiceover:Voiceover+' More words.'}),/12 giây/);
});

test('missing image selection validates bytes, then one inline Generate click submits; invalid image never charges',async t=>{
 const {container}=await mount(t,{parsedData:[{...scenes[0],startFrameUrl:''}]});await click(actionButtons(container)[0]);const input=container.querySelector('input[type=file]');
 Object.defineProperty(input,'files',{configurable:true,value:[new NativeFile(['invalid'],'bad.jpg',{type:'image/jpeg'})]});await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));await settle();assert.equal(calls.filter(c=>c.url.includes('action=submit')).length,0);
 Object.defineProperty(input,'files',{configurable:true,value:[new NativeFile([bytes],'valid.png',{type:'image/png'})]});await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));await settle();
 assert.equal(calls.filter(c=>c.options.method==='POST').length,0);const button=[...container.querySelectorAll('button')].find(b=>b.textContent==='Gen Video');assert.ok(button);assert.equal(button.disabled,false);await click(button);await settle();assert.equal(calls.filter(c=>c.url.includes('action=submit')).length,1);
});
