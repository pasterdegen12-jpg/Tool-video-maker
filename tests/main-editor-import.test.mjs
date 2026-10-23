// Actual React MainEditor + parser + Firebase helper; mocked SDK/auth, not live acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {transformWithOxc} from 'vite';
import React,{act} from 'react';
const dom=new JSDOM('<html><body></body></html>',{url:'https://www.aivideomaker.live/'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
let writes=[],routes=[],alerts=[],aiCalls=0;
globalThis.alert=message=>alerts.push(message);
globalThis.fetch=()=>{throw Error('No provider/Qwen/media network allowed');};
const cache=new Map();
async function compile(url){
 if(cache.has(url.href))return cache.get(url.href);
 const {code}=await transformWithOxc(await fs.readFile(url,'utf8'),url.pathname,{jsx:{runtime:'automatic'}});
 const mod=new vm.SourceTextModule(code,{initializeImportMeta(meta){meta.env={DEV:false};}});
 await mod.link(async name=>{
  let e;
  if(name==='@clerk/clerk-react')e={useAuth:()=>({getToken:async()=>{throw Error('Structured import must not request token for AI');}})};
  else if(name==='react-router-dom')e={useNavigate:()=>path=>routes.push(path)};
  else if(name==='firebase/app')e={initializeApp:()=>({})};
  else if(name==='firebase/firestore')e={getFirestore:()=>({}),doc:(_db,collection,id)=>({collection,id}),setDoc:async(ref,data)=>{writes.push({ref,data:structuredClone(data)});}};
  else if(name==='./lib/geminiClient.js')e={callGeminiBackend:async()=>{aiCalls++;return {characters:[{id:'char_unstructured',name:'Mira',description:'',voiceTone:''}],scenes:[{scene_n:1,Character:'Mira',Dialogue:'Hello.'}]};}};
  else if(name==='./LocalParserPanel.jsx')e={default:()=>null};
  else if(name==='./firebase.js')e=await compile(new URL(name,url));
  else e=await import(name.startsWith('.')?new URL(name,url).href:name);
  return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);});
 });await mod.evaluate();cache.set(url.href,mod.namespace);return mod.namespace;
}
const Main=(await compile(new URL('../src/MainEditor.jsx',import.meta.url))).default;
const speech='"Look at me and be completely honest right now—after all this back and forth, are you really going to leave him?"';
const input=`scene_1\nContext: hook\nCharacter: Judge — Judge\nTone: (skeptical, gentle, knowing smirk)\nDialogue: ${speech}`;
async function mount(t,script){
 writes=[];routes=[];alerts=[];aiCalls=0;
 const el=document.createElement('div');document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(React.createElement(Main,{darkMode:true})));
 const area=el.querySelector('textarea');
 await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(area,script);area.dispatchEvent(new window.Event('input',{bubbles:true}));});
 t.after(async()=>{await act(async()=>root.unmount());el.remove();});
 return {area,button:[...el.querySelectorAll('button')].find(b=>b.textContent.includes('TẠO VIDEO (GEN AI)'))};
}
test('screenshot import clicks through parser/save/navigation exactly once, without Qwen or Gemini',async t=>{
 const {button}=await mount(t,input);
 await act(async()=>{button.click();button.click();});
 assert.equal(writes.length,1);assert.equal(routes.length,1);assert.equal(aiCalls,0);assert.deepEqual(alerts,[]);
 const {ref,data}=writes[0];assert.equal(ref.collection,'projects');assert.equal(routes[0],'/project/'+ref.id);
 assert.equal(data.originalScript,input);assert.equal(data.projectType,'full-ai');assert.equal(data.characters.length,1);
 assert.equal(data.characters[0].name,'Judge');assert.equal(data.characters[0].characterIdentity,undefined);
 assert.equal(data.data[0].Dialogue,speech);assert.equal(data.data[0].Character,'Judge');assert.ok(data.data[0].duration_seconds>0);
});
test('ambiguous declaration preserves textarea and writes no partial project; corrected retry succeeds',async t=>{
 const invalid=input.replace('Judge — Judge','Judge — Lawyer');const {button,area}=await mount(t,invalid);
 await act(async()=>button.click());assert.equal(writes.length,0);assert.equal(routes.length,0);assert.equal(area.value,invalid);
 assert.match(alerts[0],/scene_1.*Character/);assert.match(alerts[0],/tách lời thoại/);
 await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(area,input);area.dispatchEvent(new window.Event('input',{bubbles:true}));});
 await act(async()=>button.click());assert.equal(writes.length,1);assert.equal(aiCalls,0);
});
test('unstructured input still uses existing Gemini fallback and persists once',async t=>{
 const {button}=await mount(t,'INT. ROOM\nMIRA: Hello.');await act(async()=>button.click());
 assert.equal(aiCalls,1);assert.equal(writes.length,1);assert.equal(routes.length,1);
});
