import test from 'node:test';
import fs from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,deleteDoc,collection,getDocs} from 'firebase/firestore';
import assert from 'node:assert/strict';
import process from 'node:process';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createCloudStore} from '../../api/_lib/cloud-video/store.js';
import {sourceDigest} from '../../api/_lib/cloud-video/core.js';
import {queueStore} from '../../api/_lib/qwen/store.js';
import {blank,enqueue,claim} from '../../api/_lib/qwen/queue.js';
import {createVideoBatchService} from '../../api/_lib/cloud-video/batch.js';
import {ownerOf,sceneSnapshot,hash} from '../../api/_lib/cloud-video/core.js';
import {createCloudVideoService} from '../../api/_lib/cloud-video/service.js';
import {molmoService} from '../../api/_lib/molmo/service.js';
import {molmoStore} from '../../api/_lib/molmo/store.js';
const rules=await fs.readFile(new URL('./firestore.rules',import.meta.url),'utf8');
const env=await initializeTestEnvironment({projectId:'demo-webai-production',firestore:{host:'127.0.0.1',port:8187,rules}});
test('durable batch deduplicates concurrent creation across fresh Admin stores; concurrent outputs preserve neighbors and history',async()=>{
 const app=initializeApp({projectId:'demo-webai-production'},'batch-emulator'),db=getFirestore(app);
 try{
  const session={subject:'batch-admin',session:'browser-one'},config={issuer:'mock-emulator',paidEnabled:true,limits:{concurrent:2},teamLimits:{concurrent:2}},owner=ownerOf(session,config.issuer);
  const project={projectType:'full-ai',data:[1,2,3].map(n=>({scene_n:n,Character:'char_'+n,Dialogue:'Exact original '+n,Camera:'Fixed.',startFrameUrl:'https://media.example.org/'+n+'.png'}))};
  await db.doc('projects/proj_batch_emulator').set(project);await db.doc('_video_ledgers/'+owner).delete();
  const first=createCloudStore(db),second=createCloudStore(db),make=store=>createVideoBatchService({config,store,now:()=>Date.parse('2026-10-29')});
  const plan=await make(first).batch_plan(session,{project_id:'proj_batch_emulator'});
  const request={project_id:'proj_batch_emulator',confirm:true,idempotency_key:'c'.repeat(36),scenes:plan.scenes.slice(0,2).map(s=>({scene_id:s.scene_id,digest:s.digest}))};
  await Promise.all([make(first).batch_create(session,request),make(second).batch_create({...session,session:'browser-two'},request)]);
  const reloaded=await make(createCloudStore(db)).batch_list(session,{project_id:request.project_id});assert.equal(reloaded.batches.length,1);assert.equal(reloaded.batches[0].counts.queued,2);
  const records=[1,2].map(n=>({id:String(n).repeat(48),projectId:request.project_id,sceneId:n,stage:'COMPLETED',snapshotVersion:2,sceneDigest:sceneSnapshot(project,n),videoUrl:'https://media.example.org/result-'+n+'.mp4',predictionId:'mock-'+n,createdAt:20}));
  await Promise.all([second.publishVideo(owner,records[1]),first.publishVideo(owner,records[0])]);await first.publishVideo(owner,records[0]);
  const saved=(await db.doc('projects/'+request.project_id).get()).data();assert.equal(saved.data.filter(s=>s.videoUrl).length,2);assert.equal(saved.data[0].videoUrl,records[0].videoUrl);assert.equal(saved.data[1].videoUrl,records[1].videoUrl);assert.deepEqual(saved.data[2],project.data[2]);
  for(let n=0;n<3;n++){assert.equal(saved.data[n].Dialogue,project.data[n].Dialogue);assert.equal(saved.data[n].Character,project.data[n].Character);assert.equal(saved.data[n].startFrameUrl,project.data[n].startFrameUrl);}
  await assert.rejects(first.publishVideo(owner,{...records[0],id:'9'.repeat(48),createdAt:1,videoUrl:'https://media.example.org/older.mp4'}),/OUTPUT_SUPERSEDED/);assert.equal((await first.project(owner,request.project_id)).data[0].videoUrl,records[0].videoUrl);
 }finally{await db.terminate();await deleteApp(app);}
});
test.after(()=>env.cleanup());
test('hosted visual prediction survives new store and concurrent cloud video publication; approval never rewrites scenes',async()=>{
 const app=initializeApp({projectId:'demo-webai-production'},'molmo-emulator'),db=getFirestore(app);
 try{
  const session={subject:'molmo-user',session:'mock'},issuer='mock-issuer',owner=ownerOf(session,issuer),projectId='proj_molmo_emulator';
  const p={id:projectId,owner,projectType:'full-ai',characters:[{id:'judge_1',name:'Judge',imageUrl:'https://media.example.org/project_'+projectId+'/judge.png',voiceId:'preserved'}],data:[{scene_n:1,Character:'judge_1',Dialogue:'Exact words.',videoUrl:'https://media.example.org/old.mp4'}]};await db.doc('projects/'+projectId).set(p);
  let posts=0;const provider={submit:async()=>{posts++;return{id:'mock_molmo_prediction'};},get:async()=>({id:'mock_molmo_prediction',status:'completed',outputs:[{subjectStatus:'clear',visualId:'person_black_hair_glasses',visualDescription:'A person with black hair wearing glasses.',hair:'Black hair',facialHair:'',clothing:'',accessories:['Glasses']}]})};
  const make=()=>molmoService({store:molmoStore(db),issuer,provider,readImage:async()=>({url:p.characters[0].imageUrl,sha256:'c'.repeat(64),mime:'image/png'})});
  const base={projectId,characterId:'judge_1'},input={...base,requestKey:'d'.repeat(36)};
  await Promise.all([make().user(session,'create',input),make().user(session,'create',input)]);assert.equal(posts,1);
  const record={id:'e'.repeat(48),projectId,sceneId:1,stage:'COMPLETED',snapshotVersion:2,sceneDigest:sceneSnapshot(p,1),videoUrl:'https://media.example.org/new.mp4',predictionId:'mock_video',createdAt:1};
  const [proposal]=await Promise.all([make().user(session,'status',base),createCloudStore(db).publishVideo(owner,record)]);
  const saved=(await db.doc('projects/'+projectId).get()).data();assert.equal(saved.data[0].videoUrl,record.videoUrl);assert.equal(saved.data[0].Character,'judge_1');assert.equal(saved.data[0].Dialogue,p.data[0].Dialogue);assert.equal(saved.data[0].videoHistory[0].url,p.data[0].videoUrl);assert.equal(saved.characters[0].voiceId,'preserved');assert.equal(saved.characters[0].characterIdentity.confirmedId,proposal.profile.visual_id);
  assert.equal((await make().user(session,'status',base)).state,'confirmed');assert.equal(posts,1);
 }finally{await db.terminate();await deleteApp(app);}
});
test('paged ledger persists nested attempt and batch mutations through actual dispatch and output',async()=>{
 const app=initializeApp({projectId:'demo-webai-production'},'paged-dispatch'),db=getFirestore(app);
 try{
  let clock=Date.parse('2026-11-01'),posts=0;const s={subject:'paged-dispatch',session:'real-test-context'},config={issuer:'mock-emulator',paidEnabled:true,limits:{concurrent:1,daily:0,perRequest:500000},teamLimits:{concurrent:1,daily:0,perRequest:500000}},owner=ownerOf(s,config.issuer),store=createCloudStore(db);
  await db.doc('_video_ledgers/team-shared-v1').set({version:1,records:{},rates:{},spend:{}});
  await db.doc('projects/proj_paged_dispatch').set({projectType:'full-ai',data:[1,2].map(n=>({scene_n:n,Character:'Judge',Dialogue:'Exact words '+n,Camera:'Fixed.',startFrameUrl:'https://media.example.org/input.png',videoJob:{options:{mode:n===1?'text_to_video':'start_frame_to_video'}}}))});
  const sourceImage=async()=>({image:{mime:'image/png',size:5,sha256:hash(Buffer.from('image')),width:32,height:32},bytes:Buffer.from('image')});
  const upload={ticket:async()=>({download_url:'https://media.example.org/upload.png',upload:{expires_at:new Date(clock+600000).toISOString()}}),transfer:async()=>{},verify:async()=>{}};
  const dependencies={config,store,sourceImage,upload,now:()=>clock,provider:{submit:async(payload,accepted)=>{posts++;await accepted('mock-paged-'+posts);return{id:'mock-paged-'+posts,state:'queued'};},get:async id=>({id,state:'completed',url:'https://media.example.org/'+id+'.mp4'})},archive:async u=>u};
  const make=()=>{const video=createCloudVideoService(dependencies);return createVideoBatchService({...dependencies,video});};
  const plan=await make().batch_plan(s,{project_id:'proj_paged_dispatch'});await make().batch_create(s,{project_id:'proj_paged_dispatch',confirm:true,idempotency_key:'d'.repeat(36),scenes:plan.scenes.map(x=>({scene_id:x.scene_id,digest:x.digest}))});
  for(let n=0;n<10;n++){clock+=10000;await make().batch_tick(s,{project_id:'proj_paged_dispatch'});}
  const result=await make().batch_list(s,{project_id:'proj_paged_dispatch'});assert.equal(result.batches[0].counts.completed,2,JSON.stringify(result.batches[0].items.map(i=>({state:i.state,error:i.error,jobState:i.job?.state}))));assert.equal(posts,2);
  const saved=await store.read(owner);assert.ok(Object.values(saved.records).every(r=>r.stage==='COMPLETED'&&r.predictionId));assert.ok(Object.values((await store.read('team-shared-v1')).records).every(r=>r.stage==='COMPLETED'));
  const project=await store.project(owner,'proj_paged_dispatch');assert.equal(project.data.filter(x=>x.videoUrl).length,2);assert.equal(project.data[0].Dialogue,'Exact words 1');
 }finally{await db.terminate();await deleteApp(app);}
});
test('legacy near-full history migrates atomically without loss; new attempts exceed old aggregate ceiling safely',async()=>{
 const app=initializeApp({projectId:'demo-webai-production'},'ledger-size-emulator'),db=getFirestore(app);
 try{
  const owner='size-regression',ref=db.doc('_video_ledgers/'+owner),records={};for(let n=0;n<160;n++)records['r'+n]={id:'r'+n,stage:'COMPLETED',prompt:'x'.repeat(5200),predictionId:'prediction-'+n,paidConsent:{at:n}};
  const legacy={version:1,records,rates:{quote:{start:1,count:2}},spend:{day:123},batches:{old:{id:'old',items:[{sceneId:1,state:'completed'}]}}};await ref.set(legacy);
  const store=createCloudStore(db);assert.deepEqual(await store.read(owner),legacy);
  await store.transact(owner,l=>{l.records.new={id:'new',stage:'QUOTED',prompt:'y'.repeat(20000)};});
  const migrated=await store.read(owner);for(const [id,r]of Object.entries(records))assert.deepEqual(migrated.records[id],r);assert.deepEqual(migrated.batches,legacy.batches);assert.deepEqual(migrated.spend,legacy.spend);assert.ok(Buffer.byteLength(JSON.stringify(migrated))>850000);assert.ok(Buffer.byteLength(JSON.stringify((await ref.get()).data()))<2000);
  await Promise.all([store.transact(owner,l=>{l.records.a={id:'a'};}),createCloudStore(db).transact(owner,l=>{l.records.b={id:'b'};})]);const reread=await store.read(owner);assert.ok(reread.records.a&&reread.records.b);assert.equal(Object.keys(reread.records).length,163);
  await assert.rejects(store.transact(owner,l=>{delete l.records.r1;}),/LEDGER_HISTORY_REMOVAL/);assert.ok((await store.read(owner)).records.r1);
  await assert.rejects(store.transact(owner,l=>{l.records.huge={prompt:'z'.repeat(850001)};}),/LEDGER_ENTRY_TOO_LARGE/);assert.equal((await store.read(owner)).records.huge,undefined);
 }finally{await db.terminate();await deleteApp(app);}
});
test('Qwen Admin durable queue serializes competing claims and survives a fresh store instance',async()=>{
 const app=initializeApp({projectId:'demo-webai-production'},'qwen-emulator'),db=getFirestore(app);
 try{
  const first=queueStore(db),second=queueStore(db),now=Date.now(),project={id:'proj_queue',projectType:'full-ai',characters:[{id:'char_1',name:'Judge'}],data:[]};
  await db.doc('projects/proj_queue').set(project);await db.doc('_qwen_queue/state').set(blank());
  await first.transact({projectId:'proj_queue',now},(q,p)=>({value:enqueue(q,{project:p,projectId:'proj_queue',characterId:'char_1',owner:'a'.repeat(64),requestKey:'b'.repeat(36),image:{sha256:'c'.repeat(64),url:'https://example.org/image.jpg',mime:'image/jpeg'}},now)}));
  const claims=await Promise.all([first,second].map(s=>s.transact({now},q=>({value:claim(q,true,now)}))));assert.equal(claims.filter(Boolean).length,1);
  const reload=queueStore(db),q=await reload.read();assert.equal(Object.keys(q.jobs).length,1);assert.equal(Object.values(q.jobs)[0].state,'running');
  await assert.rejects(first.transact({now},q=>{q.worker.status='corrupted';throw Error('abort');}),/abort/);assert.notEqual((await reload.read()).worker.status,'corrupted');
 }finally{await db.terminate();await deleteApp(app);}
});
for(const identity of ['anonymous','unrelated','malicious-admin-claim'])test('effective rules deny all sensitive operations: '+identity,async()=>{
 const db=identity==='anonymous'?env.unauthenticatedContext().firestore():env.authenticatedContext(identity,{admin:true,owner:'forged',role:'admin'}).firestore();
 for(const name of ['_video_projects','_video_ledgers','_qwen_queue','_qwen_results']){
  await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),name,'existing'),{owner:'server-owner',enabled:true});await setDoc(doc(c.firestore(),name,'existing/nested/private'),{secret:'test'});});
  await assertFails(getDoc(doc(db,name,'existing')));await assertFails(getDocs(collection(db,name)));
  await assertFails(setDoc(doc(db,name,'new'),{owner:identity}));await assertFails(updateDoc(doc(db,name,'existing'),{enabled:false}));await assertFails(deleteDoc(doc(db,name,'existing')));
  await assertFails(getDoc(doc(db,name,'existing/nested/private')));await assertFails(setDoc(doc(db,name,'existing/nested/new'),{owner:identity}));
 }
});
test('legacy collection behavior remains unchanged (existing broad access risk)',async()=>{
 const db=env.unauthenticatedContext().firestore();
 for(const name of ['projects','voices','settings']){const ref=doc(db,name,'emulator-only');await assertSucceeds(setDoc(ref,{value:1}));await assertSucceeds(getDoc(ref));await assertSucceeds(updateDoc(ref,{value:2}));await assertSucceeds(deleteDoc(ref));}
});
test('trusted backend can store sensitive grant/ledger under rules-disabled context',async()=>env.withSecurityRulesDisabled(async c=>{
 for(const name of ['_video_projects','_video_ledgers'])await assertSucceeds(setDoc(doc(c.firestore(),name,'backend-test'),{owner:'server-only'}));
}));
test('actual Admin store commits user and team ledgers atomically under concurrent workers',async()=>{
 assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8187');
 const app=initializeApp({projectId:'demo-webai-production'},'store-emulator');const db=getFirestore(app);
 try{
  const first=createCloudStore(db),second=createCloudStore(db),owner='a'.repeat(64);
  await Promise.all([first.transact(owner,(user,team)=>{user.count=(user.count||0)+1;team.count=(team.count||0)+1;}),second.transact(owner,(user,team)=>{user.count=(user.count||0)+1;team.count=(team.count||0)+1;})]);
  assert.equal((await first.read(owner)).count,2);assert.equal((await db.doc('_video_ledgers/team-shared-v1').get()).data().count,2);
  const project={id:'proj_emulator',owner,projectType:'full-ai',data:[{scene_n:3,Character:'confirmed_character',Dialogue:'Original.'}],generatedAudios:{3:'https://media.example.org/old.mp3'}};
  await db.doc('projects/proj_emulator').set(project);
  await db.doc('_video_projects/proj_emulator').set({owner,enabled:true,sourceDigest:sourceDigest(project)});
  assert.deepEqual(await first.project(owner,'proj_emulator'),project);
  await assert.rejects(first.project('b'.repeat(64),'proj_emulator'),/PROJECT_FORBIDDEN/);
  await db.doc('projects/proj_emulator').update({data:[{scene_n:3,Character:'forged',Dialogue:'Altered.'}]});
  assert.equal((await first.project(owner,'proj_emulator')).data[0].Character,'forged');
  await assert.rejects(first.project('b'.repeat(64),'proj_emulator'),/PROJECT_FORBIDDEN/);
  // Unowned project without _video_projects is accessible to any team member
  const shared={id:'proj_shared',projectType:'full-ai',data:[{scene_n:1,Dialogue:'Shared.'}]};
  await db.doc('projects/proj_shared').set(shared);
  assert.deepEqual(await first.project('b'.repeat(64),'proj_shared'),shared);
  // Old grant with another owner does not block team member
  await db.doc('_video_projects/proj_shared').set({owner:'other-owner-hash',enabled:true});
  assert.deepEqual(await first.project(owner,'proj_shared'),shared);
  // Explicitly disabled project is forbidden
  await db.doc('_video_projects/proj_shared').update({enabled:false});
  await assert.rejects(first.project(owner,'proj_shared'),/PROJECT_FORBIDDEN/);
  // Confirmed ownership is separate from editable source; service pins each selected scene per quote.
  assert.equal((await first.project(owner,'proj_emulator',false)).data[0].Character,'forged');
  await assert.rejects(first.transact(owner,(user,team)=>{user.count=99;team.count=99;throw Error('abort');}),/abort/);
  assert.equal((await first.read(owner)).count,2);assert.equal((await db.doc('_video_ledgers/team-shared-v1').get()).data().count,2);
 }finally{await db.terminate();await deleteApp(app);}
});

test('Admin publishes completed output transactionally, preserves original fields and refuses unrelated owner',async()=>{
 const app=initializeApp({projectId:'demo-webai-production'},'output-emulator'),db=getFirestore(app);
 try{const store=createCloudStore(db),owner='c'.repeat(64),project={id:'proj_output',owner,projectType:'full-ai',data:[{scene_n:1,Character:'Judge',Dialogue:'Exact.',videoUrl:'https://media.example.org/old.mp4'}],generatedAudios:{1:'keep.mp3'}};
 const {sceneSnapshot}=await import('../../api/_lib/cloud-video/core.js');const record={id:'a'.repeat(48),projectId:'proj_output',sceneId:1,stage:'COMPLETED',snapshotVersion:2,sceneDigest:sceneSnapshot(project,1),videoUrl:'https://media.example.org/new.mp4',predictionId:'test',createdAt:1};
 await db.doc('projects/proj_output').set(project);await db.doc('_video_projects/proj_output').set({owner,enabled:true});
 await assert.rejects(store.publishVideo('wrong',record),/PROJECT_FORBIDDEN/);await store.publishVideo(owner,record);await store.publishVideo(owner,record);
 const saved=(await db.doc('projects/proj_output').get()).data();assert.equal(saved.data[0].videoUrl,record.videoUrl);assert.equal(saved.data[0].Dialogue,'Exact.');assert.equal(saved.data[0].videoHistory.length,1);assert.deepEqual(saved.generatedAudios,project.generatedAudios);
 }finally{await db.terminate();await deleteApp(app);}
});
