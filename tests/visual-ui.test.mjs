// Actual React components in jsdom. MOCK Clerk hook/vision transport; no live acceptance claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {transformWithOxc} from 'vite';
const NativeFile=globalThis.File;
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
const capture=JSON.parse(await fs.readFile(new URL('../docs/phase3a/full-ai.web-http.json',import.meta.url)));
const fixtures=JSON.parse(await fs.readFile(new URL('./support/visual-fixture.json',import.meta.url)));
const scenes=capture.response.result.web_data.scenes;
const {migrateCharacterIdentity}=await import('../src/lib/characterIdentity.js');
let savedProject, persistenceWrites=0;
function resetSaved(){savedProject=structuredClone({id:'project_a',projectType:'full-ai',data:scenes,characters});persistenceWrites=0;}
async function routePersistence(url,options,fallback){
  if(!url.includes('/character-project/'))return fallback(url,options);
  if(options.method==='POST'){const input=JSON.parse(options.body);const migrated=migrateCharacterIdentity(savedProject,{projectId:decodeURIComponent(url.split('/').at(-1)),ownerHash:'a'.repeat(64),characterId:input.characterId,proposal,confirmedId:input.confirmedId,referenceImage:input.image,confirmedAt:Date.now(),jobId:input.jobId,expectedPreviousId:input.expectedPreviousId});savedProject={...savedProject,data:migrated.data,characters:migrated.characters};persistenceWrites++;return json({project:savedProject,fingerprint:'mock-fingerprint',changed:migrated.changed});}
  return json({project:savedProject,fingerprint:'mock-fingerprint'});
}
const characters=capture.response.result.web_data.characters;
const id='b'.repeat(48),hash=createHash('sha256').update(Buffer.from(fixtures.image_base64,'base64')).digest('hex');
const proposal={status:'detected',visual_id:'woman_black_coat',visual_description:'Mock visible appearance only.'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Retry-After':'1'}});
const admit=()=>json({job_id:id,state:'queued',status_url:'/api/local-ai/jobs/'+id,expires_at:new Date(Date.now()+300000).toISOString(),max_polls:120},202);
const done=(profile=proposal)=>json({job_id:id,state:'completed',error:null,result:{operation:'visual_profile',image_sha256:hash,profile}});
const find=(root,text)=>[...root.querySelectorAll('button')].find(b=>b.textContent.includes(text));
const click=async b=>{assert.ok(b);await act(async()=>b.click());};
const flush=()=>act(async()=>{await new Promise(r=>setImmediate(r));});
async function choose(container){const input=container.querySelector('input[type=file]');Object.defineProperty(input,'files',{configurable:true,value:[new NativeFile([Buffer.from(fixtures.image_base64,'base64')],'reference.png',{type:'image/png'})]});await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));for(let n=0;n<100 && find(container,'✦ Set ID').disabled;n++)await flush();assert.equal(find(container,'✦ Set ID').disabled,false);}
function Tree({chars=characters,projectId='project_a',projectType='full-ai',full=false,module=visual,setup=Setup}={}){
  const [saved,setSaved]=React.useState(null);
  const activeChars=saved?.characters||chars,activeScenes=saved?.data||scenes;
  chars=activeChars;
  const plaintiff=chars.find(c=>c.id===characters.find(c=>c.name==='Plaintiff').id)||chars[0];
  return React.createElement(module.VisualProfilesProvider,{projectId,projectType,characters:chars,onConfirmed:setSaved},
    full?React.createElement(setup,{projectCharacters:chars,parsedData:activeScenes,darkMode:true}):plaintiff&&React.createElement(module.SetIdPanel,{character:plaintiff}),
    React.createElement(Storyboard,{parsedData:activeScenes,projectCharacters:chars,projectId,generatedAudios:{},isGenerating:{},mergingScenes:{},mergedVideos:{},projectType,darkMode:true}));
}
function tree(options){return React.createElement(Tree,options);}
async function mount(t,options={}){resetSaved();const beforeAuth=auth;const oldFetch=globalThis.fetch;const inference=globalThis.fetch;globalThis.fetch=(u,o)=>routePersistence(u,o,inference);const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>root.render(tree(options)));t.after(async()=>{await act(async()=>root.unmount());container.remove();auth=beforeAuth;globalThis.fetch=oldFetch;});return{container,render:async opts=>{await act(async()=>root.render(tree(opts)));}};}
async function detect(t,container){await choose(container);await click(find(container,'✦ Set ID'));for(let n=0;n<100&&!container.querySelector('[data-detection-status=queued]')&&container.dataset?.detectionStatus!=='queued';n++)await flush();await act(async()=>t.mock.timers.tick(1000));for(let n=0;n<10;n++)await flush();}

test('actual Setup persists confirmed Character into five fixture scenes; other authored fields and media remain unchanged',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});let calls=0;
  globalThis.fetch=async(url,o)=>{calls++;assert.match(url,/^\/api\/local-ai\//);return o.method==='POST'?admit():done();};
  const baseline=JSON.stringify({scenes,characters});
  const {container}=await mount(t,{full:true});
  assert.equal([...container.querySelectorAll('button')].filter(b=>b.textContent==='✦ Set ID').length,3);
  const panel=container.querySelector('[aria-label="Visual ID Plaintiff"]');await detect(t,panel);
  assert.equal(container.querySelectorAll('[data-visual-status=confirmed]').length,0);
  await click(find(panel,'Xác nhận Character ID và lưu'));
  const mapped=container.querySelectorAll('[data-visual-status=confirmed]');assert.equal(mapped.length,5);
  assert.ok([...mapped].every(e=>e.textContent==='Character ID: woman_black_coat'));
  assert.equal(calls,2);assert.equal(JSON.stringify({scenes,characters}),baseline);
  assert.equal(persistenceWrites,1);
  for(let i=0;i<scenes.length;i++){const before=scenes[i],after=savedProject.data[i];assert.deepEqual({...after,Character:before.Character},before);if(before.Character==='Plaintiff')assert.equal(after.Character,'woman_black_coat');else assert.deepEqual(after,before);}
});
test('cancel proposal and later inference failure preserve saved Character identity',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});let phase='success';
  globalThis.fetch=async(_u,o)=>o.method==='POST'?admit():phase==='success'?done():json({job_id:id,state:'failed',result:null,error:{code:'CUDA_OOM'}});
  const{container}=await mount(t);await detect(t,container);await click(find(container,'Xác nhận Character ID và lưu'));
  await detect(t,container);await click(find(container,'Hủy đề xuất'));assert.equal(container.querySelectorAll('[data-visual-status=confirmed]').length,5);
  phase='failure';await detect(t,container);assert.equal(container.querySelectorAll('[data-visual-status=confirmed]').length,5);
  assert.match(container.textContent,/Profile đã duyệt được giữ nguyên/);
});
for(const status of ['ambiguous','no_human'])test('UI '+status+' requires another image and exposes no confirm action',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});globalThis.fetch=async(_u,o)=>o.method==='POST'?admit():done({status,visual_id:'',visual_description:''});
  const{container}=await mount(t);await detect(t,container);assert.equal(find(container,'Xác nhận Character ID và lưu'),undefined);
  assert.equal(container.querySelectorAll('[data-visual-status=confirmed]').length,0);
});
for(const change of ['character','reference','project','session','file'])test('changing '+change+' rejects a stale successful detection',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});let release,signal;
  globalThis.fetch=async(_u,o)=>o.method==='POST'?admit():new Promise(r=>{release=r;signal=o.signal;});
  const{container,render}=await mount(t);await detect(t,container);assert.ok(release);
  if(change==='file')await choose(container);
  else{const options={};if(change==='character')options.chars=characters.map(c=>c.name==='Plaintiff'?{...c,name:'Renamed'}:c);
    if(change==='reference')options.chars=characters.map(c=>c.name==='Plaintiff'?{...c,imageUrl:'/new-reference.png'}:c);
    if(change==='project')options.projectId='project_b';
    if(change==='session')auth={...auth,sessionId:'sess_other',userId:'user_other'};
    await render(options);}
  assert.equal(signal.aborted,true);await act(async()=>release(done()));await flush();
  assert.equal(find(container,'Xác nhận Character ID và lưu'),undefined);assert.equal(container.querySelectorAll('[data-visual-status=confirmed]').length,0);
});
test('Semi hides Set ID; unavailable service exposes disabled status; signed-out cannot submit',async t=>{
  const{container,render}=await mount(t,{projectType:'semi'});assert.equal(find(container,'✦ Set ID'),undefined);
  for(const env of [{DEV:true},{DEV:false,VITE_ENABLE_LOCAL_VISUAL_ID:'true'}]){
    const module=await compile(new URL('../src/Workspace/VisualProfiles.jsx',import.meta.url),env);
    await render({module});assert.equal(find(container,'✦ Set ID').disabled,true);assert.match(container.textContent,/Qwen Local chưa kết nối/);
  }
  auth={...auth,isSignedIn:false};await render({});assert.equal(find(container,'✦ Set ID').disabled,true);
});

// Persisted data fixture only: no real Qwen or Clerk request.
const savedIds=['elderly_man_gray_hair_white_beard_glasses_black_robe','woman_dark_hair_ponytail_white_polka_dot_top_blue_jeans','woman_long_dark_hair_white_dress_light_blue_cardigan_pink_bag'];
const savedNames=['Judge','Lawyer','Defendant'];
const confirmedChars=savedIds.map((confirmedId,i)=>({id:'char_'+(i+1),name:savedNames[i],imageUrl:'https://example.org/avatar.png',characterIdentity:{version:1,status:'confirmed',characterId:'char_'+(i+1),projectId:'project_a',confirmedId,referenceImage:{sha256:'a'.repeat(64),dataUrl:'data:image/png;base64,'+fixtures.image_base64}},visualProfile:{status:'detected',visualId:'stale_proposal'}}));
test('production Setup reads all three saved identities offline across tab remount and reload hydration; no inference',async t=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected network');};
 const module=await compile(new URL('../src/Workspace/VisualProfiles.jsx',import.meta.url),{DEV:false});
 const setup=(await compile(new URL('../src/Workspace/SetupTab.jsx',import.meta.url),{DEV:false})).default;
 const{container,render}=await mount(t,{module,setup,chars:confirmedChars,full:true});
 const verify=()=>{for(let i=0;i<3;i++){const panel=container.querySelector('[aria-label="Visual ID '+savedNames[i]+'"]');assert.ok(panel);assert.equal(panel.querySelector('[data-approved-visual-id]').getAttribute('data-approved-visual-id'),savedIds[i]);assert.match(panel.textContent,/Đã xác nhận/);assert.match(panel.textContent,/Qwen Local chưa kết nối/);assert.ok(find(panel,'✦ Set ID').disabled);assert.ok(!panel.textContent.includes('stale_proposal'));}};
 verify();await render({module,setup,chars:confirmedChars,projectType:'semi',full:true});await render({module,setup,chars:JSON.parse(JSON.stringify(confirmedChars)),full:true});verify();assert.equal(calls,0);
});
test('proposal, wrong project and missing persisted identity never show confirmed',async t=>{
 const module=await compile(new URL('../src/Workspace/VisualProfiles.jsx',import.meta.url),{DEV:false});
 const setup=(await compile(new URL('../src/Workspace/SetupTab.jsx',import.meta.url),{DEV:false})).default;
 const chars=structuredClone(confirmedChars);chars[0].characterIdentity.status='detected';chars[1].characterIdentity.projectId='other';delete chars[2].characterIdentity;
 const{container}=await mount(t,{module,setup,chars,full:true});assert.equal(container.querySelectorAll('[data-approved-visual-id]').length,0);assert.equal((container.textContent.match(/Chưa Set ID/g)||[]).length,3);
});
test('Firestore character hydration wins over stale route state and preserves display names',async()=>{
 const {savedProjectCharacters}=await import('../src/lib/characterIdentity.js');
 const stale=confirmedChars.map(c=>({...c,characterIdentity:null}));
 assert.deepEqual(savedProjectCharacters({characters:confirmedChars},{characters:stale}),confirmedChars);
 assert.deepEqual(savedProjectCharacters({characters:[]},{characters:stale}),[]);
 assert.deepEqual(savedProjectCharacters({}, {characters:stale}),stale);
 assert.deepEqual(savedProjectCharacters({characters:confirmedChars}).map(c=>c.name),savedNames);
});

test('production remote Set ID uses saved character image binding, restores proposal and requires explicit save',async t=>{
 for(const c of confirmedChars)c.characterIdentity.proposal={status:'detected',visual_id:c.characterIdentity.confirmedId,visual_description:'Previously confirmed appearance.'};
 const previousLocation=globalThis.location;globalThis.location={origin:'https://www.aivideomaker.live',protocol:'https:',hostname:'www.aivideomaker.live'};t.after(()=>{globalThis.location=previousLocation;});
 const env={DEV:false,VITE_ENABLE_REMOTE_QWEN:'true'},module=await compile(new URL('../src/Workspace/VisualProfiles.jsx',import.meta.url),env),setup=(await compile(new URL('../src/Workspace/SetupTab.jsx',import.meta.url),env)).default;
 const calls=[];let created=false,saves=0;
 globalThis.fetch=async(url,options)=>{
  assert.ok(url.startsWith('/api/qwen?'));const action=new URL(url,'https://www.aivideomaker.live').searchParams.get('action'),body=JSON.parse(options.body);calls.push(action);
  assert.ok(!('image_base64' in body));assert.ok(!('imageUrl' in body));
  if(action==='confirm'){saves++;return json({project:{characters:confirmedChars,data:scenes},changed:[]});}
  if(action==='create')created=true;
  return json(created?{id:'d'.repeat(64),projectId:'project_a',characterId:body.characterId,state:'proposal_ready',profile:proposal}:{state:'idle',worker:'offline'});
 };
 const {container,render}=await mount(t,{module,setup,chars:confirmedChars,full:true});await flush();assert.ok(calls.every(c=>c==='status'));assert.equal(saves,0);
 const panel=container.querySelector('[aria-label="Visual ID Judge"]');assert.equal(panel.querySelector('input[type=file]'),null);assert.equal(find(panel,'✦ Set ID').disabled,false);
 await click(find(panel,'✦ Set ID'));await flush();assert.match(panel.textContent,/Qwen đề xuất/);assert.equal(saves,0);assert.ok(panel.textContent.includes(savedIds[0]));
 await render({module,setup,chars:confirmedChars,full:true,projectType:'semi'});await render({module,setup,chars:confirmedChars,full:true});await flush();
 assert.match(container.querySelector('[aria-label="Visual ID Judge"]').textContent,/Qwen đề xuất/);assert.equal(saves,0);
 await click(find(container.querySelector('[aria-label="Visual ID Judge"]'),'Xác nhận Character ID và lưu'));assert.equal(saves,1);
});
