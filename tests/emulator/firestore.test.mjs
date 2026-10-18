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
const rules=await fs.readFile(new URL('./firestore.rules',import.meta.url),'utf8');
const env=await initializeTestEnvironment({projectId:'demo-webai-production',firestore:{host:'127.0.0.1',port:8187,rules}});
test.after(()=>env.cleanup());
for(const identity of ['anonymous','unrelated','malicious-admin-claim'])test('effective rules deny all sensitive operations: '+identity,async()=>{
 const db=identity==='anonymous'?env.unauthenticatedContext().firestore():env.authenticatedContext(identity,{admin:true,owner:'forged',role:'admin'}).firestore();
 for(const name of ['_video_projects','_video_ledgers']){
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
  const project={id:'proj_emulator',projectType:'full-ai',data:[{scene_n:3,Character:'confirmed_character',Dialogue:'Original.'}],generatedAudios:{3:'https://media.example.org/old.mp3'}};
  await db.doc('projects/proj_emulator').set(project);
  await db.doc('_video_projects/proj_emulator').set({owner,enabled:true,sourceDigest:sourceDigest(project)});
  assert.deepEqual(await first.project(owner,'proj_emulator'),project);
  await assert.rejects(first.project('b'.repeat(64),'proj_emulator'),/PROJECT_FORBIDDEN/);
  await db.doc('projects/proj_emulator').update({data:[{scene_n:3,Character:'forged',Dialogue:'Altered.'}]});
  assert.equal((await first.project(owner,'proj_emulator')).data[0].Character,'forged');
  await assert.rejects(first.project('b'.repeat(64),'proj_emulator'),/PROJECT_FORBIDDEN/);
  // Confirmed ownership is separate from editable source; service pins each selected scene per quote.
  assert.equal((await first.project(owner,'proj_emulator',false)).data[0].Character,'forged');
  await assert.rejects(first.transact(owner,(user,team)=>{user.count=99;team.count=99;throw Error('abort');}),/abort/);
  assert.equal((await first.read(owner)).count,2);assert.equal((await db.doc('_video_ledgers/team-shared-v1').get()).data().count,2);
 }finally{await db.terminate();await deleteApp(app);}
});

test('Admin publishes completed output transactionally, preserves original fields and refuses unrelated owner',async()=>{
 const app=initializeApp({projectId:'demo-webai-production'},'output-emulator'),db=getFirestore(app);
 try{const store=createCloudStore(db),owner='c'.repeat(64),project={projectType:'full-ai',data:[{scene_n:1,Character:'Judge',Dialogue:'Exact.',videoUrl:'https://media.example.org/old.mp4'}],generatedAudios:{1:'keep.mp3'}};
 const {sceneSnapshot}=await import('../../api/_lib/cloud-video/core.js');const record={id:'a'.repeat(48),projectId:'proj_output',sceneId:1,stage:'COMPLETED',snapshotVersion:2,sceneDigest:sceneSnapshot(project,1),videoUrl:'https://media.example.org/new.mp4',predictionId:'test',createdAt:1};
 await db.doc('projects/proj_output').set(project);await db.doc('_video_projects/proj_output').set({owner,enabled:true});
 await assert.rejects(store.publishVideo('wrong',record),/PROJECT_FORBIDDEN/);await store.publishVideo(owner,record);await store.publishVideo(owner,record);
 const saved=(await db.doc('projects/proj_output').get()).data();assert.equal(saved.data[0].videoUrl,record.videoUrl);assert.equal(saved.data[0].Dialogue,'Exact.');assert.equal(saved.data[0].videoHistory.length,1);assert.deepEqual(saved.generatedAudios,project.generatedAudios);
 }finally{await db.terminate();await deleteApp(app);}
});
