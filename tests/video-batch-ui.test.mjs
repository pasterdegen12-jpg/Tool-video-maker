// Actual React component; authentication and HTTP are isolated mocks, never provider calls.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
import React,{act} from 'react';import {JSDOM} from 'jsdom';import {transformWithOxc} from 'vite';
const dom=new JSDOM('<body></body>',{url:'https://www.aivideomaker.live'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
const url=new URL('../src/Workspace/VideoBatchPanel.jsx',import.meta.url);
const {code}=await transformWithOxc(await fs.readFile(url,'utf8'),url.pathname,{jsx:{runtime:'automatic'}});
const mod=new vm.SourceTextModule(code);
await mod.link(async spec=>{const exp=spec==='@clerk/clerk-react'?{useAuth:()=>({isSignedIn:true,userId:'mock',getToken:async()=>'mock-only'})}:await import(spec.startsWith('.')?new URL(spec,url).href:spec);return new vm.SyntheticModule(Object.keys(exp),function(){for(const [k,v]of Object.entries(exp))this.setExport(k,v);});});await mod.evaluate();
const Component=mod.namespace.default;
async function mount(t){
 const calls=[],old=globalThis.fetch;let close=0;const scenes=Array.from({length:7},(_,i)=>({scene_id:i+1,character:'char_'+i,eligible:i<5,reason:i===5?'Đã có OUTPUT':'',digest:'a'.repeat(64),mode:'start_frame_to_video',settings:{aspect_ratio:'9:16',resolution:'480p'},cost:{microUsd:96000}}));
 globalThis.fetch=async(u,o={})=>{const action=new URL(u,'https://www.aivideomaker.live').searchParams.get('action');calls.push({action,body:o.body&&JSON.parse(o.body)});assert.ok(['batch_plan','batch_list','batch_create'].includes(action));return new Response(JSON.stringify(action==='batch_plan'?{scenes,concurrency:2}:{batches:[]}));};
 const box=document.createElement('div');document.body.append(box);const root=createRoot(box);const render=async open=>act(async()=>root.render(React.createElement(Component,{projectId:'proj_mock',open,onClose:()=>close++})));
 await render(true);await act(async()=>new Promise(r=>setImmediate(r)));
 t.after(async()=>{await act(async()=>root.unmount());box.remove();globalThis.fetch=old;});
 return{calls,render,close:()=>close};
}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const click=async el=>act(async()=>{assert.ok(el);el.click();});
test('real batch modal defaults eligible only, exact 1/3/5 selection, no requests on review or close',async t=>{
 const h=await mount(t);const checks=[...document.querySelectorAll('input[type=checkbox]')];assert.equal(checks.length,7);assert.equal(checks.filter(c=>c.checked).length,5);assert.equal(checks[5].disabled,true);assert.equal(checks[6].disabled,true);
 assert.ok(button('Generate 5 Videos'));assert.equal(document.querySelectorAll('select').length,0);
 await click(button('Bỏ chọn tất cả'));assert.equal(button('Generate 0 Videos').disabled,true);
 for(const i of [0,2,4])await click(checks[i]);assert.ok(button('Generate 3 Videos'));
 await click(button('Đóng'));assert.equal(h.close(),1);assert.equal(h.calls.filter(c=>c.action==='batch_create').length,0);
 await click(button('Chọn tất cả đủ điều kiện'));assert.ok(button('Generate 5 Videos'));
 assert.ok(h.calls.every(c=>['batch_plan','batch_list'].includes(c.action)));
});
test('one final double click creates exact selected set once with stable idempotency and explicit consent',async t=>{
 const h=await mount(t);await click(button('Bỏ chọn tất cả'));for(const n of [1,3,5])await click(document.querySelector('[aria-label="Chọn Scene '+n+'"]'));
 const generate=button('Generate 3 Videos');await act(async()=>{generate.click();generate.click();});
 const submitted=h.calls.filter(c=>c.action==='batch_create');assert.equal(submitted.length,1);assert.deepEqual(submitted[0].body.scenes.map(s=>s.scene_id),[1,3,5]);assert.equal(submitted[0].body.confirm,true);assert.equal(submitted[0].body.idempotency_key.length,36);assert.equal(h.close(),1);
});
test('existing Full AI sidebar opens the same panel and completed outputs use existing publisher callback',async()=>{
 const source=await fs.readFile(new URL('../src/Workspace/Workspace.jsx',import.meta.url),'utf8');assert.match(source,/setVideoBatchOpen\(true\)/);assert.match(source,/<VideoBatchPanel/);assert.match(source,/onOutputs=\{/);assert.match(source,/applySceneVideoOutput/);
});
