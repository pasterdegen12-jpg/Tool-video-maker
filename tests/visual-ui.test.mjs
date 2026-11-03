// Actual React components in jsdom. MOCK Clerk hook/vision transport; no live acceptance claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {transformWithOxc} from 'vite';
const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost:5173'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.location=dom.window.location;
globalThis.addEventListener=dom.window.addEventListener.bind(dom.window);globalThis.removeEventListener=dom.window.removeEventListener.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
let auth={isSignedIn:true,isLoaded:true,sessionId:'sess_mock',userId:'user_mock',getToken:async()=>'mock-session'};
const cache=new Map();
async function compile(url,env={DEV:true,VITE_ENABLE_LOCAL_VISUAL_ID:'true'}){
  const key=url.href+JSON.stringify(env);if(cache.has(key))return cache.get(key);
  const {code}=await transformWithOxc(await fs.readFile(url,'utf8'),url.pathname,{jsx:{runtime:'automatic'}});
  const mod=new vm.SourceTextModule(code,{identifier:url.href,initializeImportMeta(meta){meta.env=env;}});
  await mod.link(async spec=>{
    if(/firebase|wavespeed|ffmpeg/.test(spec))throw Error('Visual UI must never import persistence/media generation');
    const exp=spec==='@clerk/clerk-react'?{useAuth:()=>auth}:spec.endsWith('.jsx')?await compile(new URL(spec,url),env):await import(spec.startsWith('.')?new URL(spec,url).href:spec);
    return new vm.SyntheticModule(Object.keys(exp),function(){for(const[k,v]of Object.entries(exp))this.setExport(k,v);});
  });await mod.evaluate();cache.set(key,mod.namespace);return mod.namespace;
}
const visual=await compile(new URL('../src/Workspace/VisualProfiles.jsx',import.meta.url));
const Setup=(await compile(new URL('../src/Workspace/SetupTab.jsx',import.meta.url))).default;
const Storyboard=(await compile(new URL('../src/Workspace/StoryboardTab.jsx',import.meta.url))).default;
const {molmoHarness}=await import('./molmo.test.mjs');
const capture=JSON.parse(await fs.readFile(new URL('../docs/phase3a/full-ai.web-http.json',import.meta.url)));
const originalScenes=capture.response.result.web_data.scenes;
let h;
const find=(root,text)=>[...root.querySelectorAll('button')].find(b=>b.textContent.includes(text));
const click=async b=>{assert.ok(b);await act(async()=>b.click());};
const flush=()=>act(async()=>new Promise(r=>setImmediate(r)));
function Tree({projectId='proj_molmo',projectType='full-ai',chars=h.project.characters}={}){
 const [saved,setSaved]=React.useState(null);const characters=saved?.characters||chars;
 return React.createElement(visual.VisualProfilesProvider,{projectId,projectType,characters,onConfirmed:identity=>setSaved({characters:characters.map(c=>c.id===identity.characterId?{...c,characterIdentity:identity}:c)})},
 React.createElement(Setup,{projectCharacters:characters,parsedData:h.project.data,darkMode:true}),
 React.createElement(Storyboard,{parsedData:h.project.data,projectCharacters:characters,projectId,generatedAudios:{},isGenerating:{},mergingScenes:{},mergedVideos:{},projectType,darkMode:true}));
}
async function mount(t,options={}){
 h=molmoHarness();h.project.data=structuredClone(originalScenes);h.project.characters=structuredClone(capture.response.result.web_data.characters).map(c=>({...c,imageUrl:h.image.url}));
 const oldAuth=auth,oldFetch=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,opts)=>{if(h.transport)return h.transport(url,opts);const action=new URL(url,'https://www.aivideomaker.live').searchParams.get('action');assert.ok(action.startsWith('molmo_'));calls.push(action);const input=JSON.parse(opts.body);assert.ok(!input.imageUrl&&!input.image_base64);try{return new Response(JSON.stringify(await h.service.user(h.session,action.slice(6),input)),{headers:{'Content-Type':'application/json'}});}catch(e){return new Response(JSON.stringify({error:{code:e.code}}),{status:e.status||409});}};
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 await act(async()=>root.render(React.createElement(Tree,options)));await flush();
 t.after(async()=>{await act(async()=>root.unmount());container.remove();globalThis.fetch=oldFetch;auth=oldAuth;});
 return{container,calls,render:async props=>{await act(async()=>root.render(React.createElement(Tree,props)));await flush();}};
}
async function detect(t,panel){await click(find(panel,'✦ Set ID'));await flush();await act(async()=>t.mock.timers.tick(2000));await flush();}
test('actual Setup hosted approval preserves every original scene and stable character ID',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});const {container,calls}=await mount(t);const before=structuredClone(h.project);
 assert.equal(h.posts,0);assert.ok(calls.every(a=>a==='molmo_status'));
 const panel=container.querySelector('[aria-label="Visual ID Plaintiff"]');await detect(t,panel);assert.equal(h.posts,1);assert.equal(panel.querySelector('input[type=file]'),null);
 assert.equal(find(panel,'Xác nhận Visual ID và lưu'),undefined);assert.deepEqual(h.project.data,before.data);assert.deepEqual(h.project.characters.map(c=>[c.id,c.name,c.imageUrl]),before.characters.map(c=>[c.id,c.name,c.imageUrl]));
 assert.equal(container.querySelectorAll('[data-visual-status=confirmed]').length,5);
});
test('automatic save and failed regeneration preserve approved identity',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});const {container}=await mount(t),panel=container.querySelector('[aria-label="Visual ID Plaintiff"]');
 await detect(t,panel);assert.equal(find(panel,'Xác nhận Visual ID và lưu'),undefined);const saved=structuredClone(h.project.characters);
 assert.equal(panel.querySelectorAll('button').length,1);assert.equal(panel.querySelector('img'),null);
 h.status('failed');await detect(t,panel);assert.deepEqual(h.project.characters,saved);
});
for(const subjectStatus of ['ambiguous','no_subject'])test(subjectStatus+' has no approval action',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});const {container}=await mount(t);h.output({subjectStatus,visualId:'',visualDescription:'',hair:'',facialHair:'',clothing:'',accessories:[]});
 const panel=container.querySelector('[aria-label="Visual ID Plaintiff"]');await detect(t,panel);assert.equal(find(panel,'Xác nhận Visual ID và lưu'),undefined);
});
for(const change of ['character','reference','project','session'])test('changing '+change+' discards late hosted response',async t=>{
 const {container,render}=await mount(t);let release,signal;
 h.transport=(_u,o)=>new Promise(r=>{release=r;signal=o.signal;});
 await click(find(container.querySelector('[aria-label="Visual ID Plaintiff"]'),'✦ Set ID'));assert.ok(release);
 const staleRelease=release,staleSignal=signal,options={};
 if(change==='character'||change==='reference')options.chars=h.project.characters.map(c=>({...c,[change==='character'?'name':'imageUrl']:(change==='character'?c.name:c.imageUrl)+'new'}));
 if(change==='project')options.projectId='proj_other';if(change==='session')auth={...auth,sessionId:'other'};
 await render(options);assert.equal(staleSignal.aborted,true);
 await act(async()=>staleRelease(new Response(JSON.stringify({id:'d'.repeat(64),projectId:'proj_molmo',characterId:'bad',state:'proposal_ready',profile:{status:'detected',visual_id:'person_black_suit',visual_description:'A person wearing a black suit.'}}))));
 assert.equal(find(container,'Xác nhận Visual ID và lưu'),undefined);
});
test('Semi hides Set ID; hosted Set ID does not require Qwen flags; signed-out cannot submit',async t=>{
 const {container,render}=await mount(t,{projectType:'semi'});assert.equal(find(container,'✦ Set ID'),undefined);
 await render({});assert.equal(find(container,'✦ Set ID').disabled,false);assert.ok(!container.textContent.includes('Qwen Local'));assert.equal(h.posts,0);
 auth={...auth,isSignedIn:false};await render({});assert.equal(find(container,'✦ Set ID').disabled,true);
});
test('saved IDs hydrate after remount without a paid request or changed scene mappings',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});const {container,render}=await mount(t);const panel=container.querySelector('[aria-label="Visual ID Plaintiff"]');await detect(t,panel);assert.equal(find(panel,'Xác nhận Visual ID và lưu'),undefined);
 const saved=JSON.parse(JSON.stringify(h.project.characters)),before=JSON.stringify(h.project.data),posts=h.posts;
 await render({projectType:'semi'});await render({chars:saved});assert.equal(container.querySelectorAll('[data-approved-visual-id]').length,1);assert.equal(h.posts,posts);assert.equal(JSON.stringify(h.project.data),before);
});
test('Firestore characters override stale navigation data',async()=>{
 const {savedProjectCharacters}=await import('../src/lib/characterIdentity.js');assert.deepEqual(savedProjectCharacters({characters:[]},{characters:[{id:'stale'}]}),[]);
});
