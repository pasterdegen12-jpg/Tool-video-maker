import test from 'node:test';import assert from 'node:assert/strict';
import {createVideoBatchService} from '../api/_lib/cloud-video/batch.js';
import {createCloudVideoService} from '../api/_lib/cloud-video/service.js';
import {newLedger,ownerOf,CloudError,hash} from '../api/_lib/cloud-video/core.js';
import {completedSceneData} from '../api/_lib/cloud-video/publish.js';
import {batchCounts} from '../src/lib/videoBatchPlan.js';
import {createVideoHandler} from '../api/video.js';
const session={subject:'shared_admin',session:'browser_a'},otherBrowser={...session,session:'browser_b'};
export function batchHarness(size=5,options={}){
 let clock=Date.parse('2026-10-29'),tail=Promise.resolve(),ledger=newLedger(),team=newLedger(),maxActive=0;const calls=[],live=new Map();
 const config={issuer:'https://clerk.example.org',paidEnabled:true,limits:{concurrent:2,daily:0,perRequest:500000},teamLimits:{concurrent:2,daily:0,perRequest:500000},...options.config};
 const project={projectType:'full-ai',data:Array.from({length:size},(_,i)=>({scene_n:i+1,Character:'character_'+(i+1),Dialogue:'Scene '+(i+1)+' exact words.',Camera:'Fixed camera.',Action:'Sits.',Context:'Court.',startFrameUrl:'https://media.example.org/project_proj_batch/'+(i+1)+'.png',duration_seconds:12}))};
 const store={project:async(owner,id)=>{if(owner!==ownerOf(session,config.issuer)||id!=='proj_batch')throw new CloudError('PROJECT_FORBIDDEN',403);return structuredClone(project);},read:async()=>structuredClone(ledger),transact:async(owner,fn)=>{const run=tail.then(()=>{const l=structuredClone(ledger),t=structuredClone(team),v=fn(l,t);ledger=l;team=t;return structuredClone(v);});tail=run.catch(()=>{});return run;},publishVideo:async(owner,r)=>{const data=completedSceneData(project,r);if(data)project.data=data;}};
 const sourceImage=async(p,id,sceneId,{includeBytes=false}={})=>{const bytes=Buffer.from('image '+sceneId);return{image:{mime:'image/png',size:bytes.length,sha256:hash(bytes),width:32,height:32},...(includeBytes?{bytes}:{})};};
 const upload={ticket:async image=>{calls.push({kind:'ticket',hash:image.sha256});return{download_url:'https://media.example.org/'+image.sha256+'.png',upload:{method:'PUT',url:'https://media.example.org/put',headers:{'If-None-Match':'*'},expires_at:new Date(clock+600000).toISOString()}};},transfer:async(t,b,image)=>{assert.equal(hash(b),image.sha256);calls.push({kind:'transfer',hash:image.sha256});},verify:async()=>true};
 const provider={submit:async(payload,accepted,model)=>{const id='p'+(calls.filter(c=>c.kind==='post').length+1);calls.push({kind:'post',id,payload,model});if(options.unknown)throw Error('ambiguous connection');await accepted(id);live.set(id,{payload,polls:0});maxActive=Math.max(maxActive,live.size);return{id,state:'queued'};},get:async id=>{const item=live.get(id);item.polls++;if(options.hold||item.polls<(options.polls||1))return{id,state:'running'};live.delete(id);return{id,state:options.failScene&&item.payload.prompt.includes('character_'+options.failScene)?'failed':'completed',url:'https://media.example.org/'+id+'.mp4'};}};
 const deps={config,store,provider,upload,sourceImage,archive:async url=>url,now:()=>clock};
 const services=()=>{const video=createCloudVideoService(deps);return{video,batch:createVideoBatchService({...deps,video})};};
 const plan=()=>services().batch.batch_plan(session,{project_id:'proj_batch'});
 async function create(ids,key='a'.repeat(36)){const p=await plan();return services().batch.batch_create(session,{project_id:'proj_batch',scenes:p.scenes.filter(s=>ids.includes(Number(s.scene_id))).map(s=>({scene_id:s.scene_id,digest:s.digest})),idempotency_key:key,confirm:true});}
 async function tick(who=otherBrowser){clock+=10000;return services().batch.batch_tick(who,{project_id:'proj_batch'});}
 async function finish(){let result;for(let n=0;n<500;n++){result=await tick();if(result.batches.every(b=>b.status!=='running'))return result;}throw Error('Batch did not finish');}
 return{services,config,store,deps,project,calls,live,plan,create,tick,finish,advance:n=>clock+=n,ledger:()=>ledger,team:()=>team,maxActive:()=>maxActive};
}
for(const size of [1,2,5,21])test('durable batch '+size+' scenes: same service, bounded requests, exact inputs, cold-start and shared-session recovery',async()=>{
 const h=batchHarness(size),before=structuredClone(h.project),ids=Array.from({length:size},(_,i)=>i+1);
 await h.create(ids);assert.equal(h.calls.length,0);const result=await h.finish();assert.equal(result.batches[0].status,'completed');assert.equal(result.batches[0].counts.completed,size);
 const posts=h.calls.filter(c=>c.kind==='post');assert.equal(posts.length,size);assert.ok(h.maxActive()<=2);if(size>=2)assert.equal(h.maxActive(),2);
 for(const s of h.project.data){const post=posts.find(p=>p.payload.prompt.includes('character_'+s.scene_n+'\n'));assert.ok(post);assert.ok(post.payload.prompt.includes(s.Dialogue));assert.ok(post.payload.prompt.includes('brisk'));assert.ok(post.payload.prompt.includes('No dialogue captions'));assert.equal(post.payload.camera_fixed,true);assert.equal(post.payload.duration,4);assert.equal(post.payload.aspect_ratio,'9:16');assert.equal(post.payload.resolution,'480p');assert.equal(post.payload.generate_audio,true);
  const rec=Object.values(h.ledger().records).find(r=>r.sceneId===s.scene_n);assert.equal(rec.settings.duration,post.payload.duration);assert.equal(rec.cost.microUsd,96000);assert.equal(s.videoUrl,'https://media.example.org/'+post.id+'.mp4');for(const k of ['Dialogue','Character','Action','Camera','Context','startFrameUrl','duration_seconds'])assert.equal(s[k],before.data[s.scene_n-1][k]);}
 await h.tick();assert.equal(h.calls.filter(c=>c.kind==='post').length,size);
});
test('default eligibility skips completed, active and missing input; selection 1,3,5 only',async()=>{
 const h=batchHarness(7);h.project.data[1].videoUrl='https://media.example.org/old.mp4';delete h.project.data[3].startFrameUrl;
 await h.create([6]);const p=await h.plan();assert.equal(p.scenes[1].status,'completed');assert.equal(p.scenes[3].status,'invalid');assert.equal(p.scenes[5].status,'active');
 await h.create([1,3,5],'b'.repeat(36));await h.finish();assert.deepEqual(Object.values(h.ledger().records).map(r=>r.sceneId).sort(),[1,3,5,6]);assert.equal(h.project.data[1].videoUrl,'https://media.example.org/old.mp4');assert.equal(h.project.data[6].videoUrl,undefined);
});
test('duplicate batch key and simultaneous browser ticks never duplicate provider calls',async()=>{
 const h=batchHarness(2);await Promise.all([h.create([1,2]),h.create([1,2])]);assert.equal(Object.keys(h.ledger().batches).length,1);
 h.advance(10000);await Promise.all([h.services().batch.batch_tick(session,{project_id:'proj_batch'}),h.services().batch.batch_tick(otherBrowser,{project_id:'proj_batch'})]);await h.finish();assert.equal(h.calls.filter(c=>c.kind==='post').length,2);
 await assert.rejects(h.create([2]),/IDEMPOTENCY_CONFLICT/);
});
test('one invalid or changed scene does not remove valid selected work',async()=>{
 const h=batchHarness(3),p=await h.plan();h.project.data[1].Dialogue='Changed after review';
 await h.services().batch.batch_create(session,{project_id:'proj_batch',idempotency_key:'a'.repeat(36),confirm:true,scenes:p.scenes.map(s=>({scene_id:s.scene_id,digest:s.digest}))});
 h.project.data[2].startFrameUrl='https://media.example.org/replaced.png';const out=await h.finish();assert.equal(out.batches[0].counts.completed,1);assert.equal(out.batches[0].counts.skipped,1);assert.equal(out.batches[0].counts.failed,1);assert.equal(h.calls.filter(c=>c.kind==='post').length,1);
});
test('mixed provider failure isolates one scene and continues other valid scenes',async()=>{
 const h=batchHarness(5,{failScene:2});await h.create([1,2,3,4,5]);const out=await h.finish();assert.equal(out.batches[0].status,'finished_with_errors');assert.equal(out.batches[0].counts.completed,4);assert.equal(out.batches[0].counts.failed,1);assert.equal(h.calls.filter(c=>c.kind==='post').length,5);
});
test('unknown provider outcome is never retried or automatically recharged',async()=>{
 const h=batchHarness(2,{unknown:true,config:{limits:{concurrent:1,daily:0,perRequest:500000},teamLimits:{concurrent:1,daily:0,perRequest:500000}}});await h.create([1,2]);for(let i=0;i<20;i++)await h.tick();assert.equal(h.calls.filter(c=>c.kind==='post').length,1);const b=Object.values(h.ledger().batches)[0];assert.equal(b.items[0].state,'admission_unknown');assert.equal(b.items[1].state,'pending');
});
test('cancel before submission sends nothing; cancel after acceptance only stops pending work',async()=>{
 for(const accepted of [false,true]){const h=batchHarness(2,{hold:true});const created=await h.create([1,2]);if(accepted){for(let n=0;n<3;n++)await h.tick();}
 await h.services().batch.batch_cancel(otherBrowser,{project_id:'proj_batch',batch_id:created.batches[0].batch_id});for(let n=0;n<3;n++)await h.tick();assert.equal(h.calls.filter(c=>c.kind==='post').length,accepted?1:0);if(accepted)assert.equal(h.live.size,1);}
});
test('429 quote preparation honors Retry-After and stops after bounded retries',async()=>{
 const h=batchHarness(1);await h.create([1]);let calls=0;const video=h.services().video;video.quote=async()=>{calls++;throw Object.assign(new CloudError('RATE_LIMIT',429),{retryAfter:60});};const b=createVideoBatchService({...h.deps,video});
 for(let n=0;n<6;n++){h.advance(60001);await b.batch_tick(session,{project_id:'proj_batch'});await b.batch_tick(session,{project_id:'proj_batch'});}
 assert.equal(calls,6);assert.equal(Object.values(h.ledger().batches)[0].items[0].state,'failed');assert.equal(h.calls.length,0);
});
test('Text scene keeps saved ratio/resolution/custom prompt and needs no image; unavailable References explains skip',async()=>{
 const h=batchHarness(2);delete h.project.data[0].startFrameUrl;h.project.data[0].videoJob={options:{mode:'text_to_video',settings:{aspect_ratio:'1:1',resolution:'720p'},additional_prompt:'Warm light.'}};
 h.project.data[1].videoJob={options:{mode:'references_to_video'}};const p=await h.plan();assert.equal(p.scenes[0].eligible,true);assert.equal(p.scenes[1].eligible,false);assert.match(p.scenes[1].reason,/References/);
 await h.create([1]);await h.finish();const post=h.calls.find(c=>c.kind==='post');assert.equal(post.payload.aspect_ratio,'1:1');assert.equal(post.payload.resolution,'720p');assert.ok(post.payload.prompt.endsWith('Warm light.'));assert.equal(h.calls.filter(c=>c.kind==='ticket').length,0);
});
test('cross-user/project operations and missing final consent are rejected without side effects',async()=>{
 const h=batchHarness(1),b=h.services().batch;for(const method of ['batch_plan','batch_list','batch_tick'])await assert.rejects(b[method]({...session,subject:'other'},{project_id:'proj_batch'}),/PROJECT_FORBIDDEN/);
 await assert.rejects(b.batch_create(session,{project_id:'proj_batch',scenes:[],confirm:false,idempotency_key:'a'.repeat(36)}));assert.equal(h.calls.length,0);assert.equal(h.ledger().batches,undefined);
});
test('terminal counts never label mixed failures or pending scenes completed',()=>{
 assert.equal(batchCounts([{state:'completed'},{state:'failed'}]).status,'finished_with_errors');assert.equal(batchCounts([{state:'completed'},{state:'pending'}]).status,'running');
 assert.equal(batchCounts([{state:'queued'}]).counts.running,1);
});
test('all batch routes reject missing real authentication before service construction',async()=>{
 let constructed=0;const handler=createVideoHandler({configure:()=>({origin:'https://web.example.org'}),authenticate:async()=>{throw new CloudError('UNAUTHORIZED',401);},createService:()=>{constructed++;}});
 for(const action of ['batch_plan','batch_create','batch_list','batch_tick','batch_cancel']){const res={setHeader(){},end(body){this.body=JSON.parse(body);}};await handler({url:'/api/video?action='+action,method:action==='batch_list'?'GET':'POST'},res);assert.equal(res.statusCode,401);}assert.equal(constructed,0);
});
test('paid-disabled rejects final batch creation while read-only plan still works',async()=>{
 const h=batchHarness(1,{config:{paidEnabled:false}});assert.equal((await h.plan()).scenes[0].eligible,true);await assert.rejects(h.create([1]),/PAID_DISABLED/);assert.equal(h.calls.length,0);
});
