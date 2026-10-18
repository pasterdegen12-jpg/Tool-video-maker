import test from 'node:test';import assert from 'node:assert/strict';
import {completedSceneData} from '../api/_lib/cloud-video/publish.js';
import {sceneSnapshot,checkAdmission,newLedger} from '../api/_lib/cloud-video/core.js';
const project={projectType:'full-ai',data:[{scene_n:1,Dialogue:'Exact.',Character:'Judge',videoUrl:'https://example.org/old.mp4'},{scene_n:2,Dialogue:'Other.',Character:'Defendant'}]};
const record={id:'a'.repeat(48),projectId:'proj_test',sceneId:1,snapshotVersion:2,sceneDigest:sceneSnapshot(project,1),stage:'COMPLETED',predictionId:'real-shaped-test-id',videoUrl:'https://example.org/new.mp4',createdAt:5};
test('completed result persists into existing OUTPUT field once, preserving prior media and all authored fields',()=>{
 const before=structuredClone(project),data=completedSceneData(project,record);assert.deepEqual(project,before);assert.deepEqual(data[1],project.data[1]);
 assert.equal(data[0].videoUrl,record.videoUrl);assert.equal(data[0].Dialogue,'Exact.');assert.equal(data[0].Character,'Judge');assert.deepEqual(data[0].videoHistory,[{url:project.data[0].videoUrl}]);assert.equal(completedSceneData({...project,data},record),null);
});
test('output cannot overwrite changed screenplay or newer completed video',()=>{
 assert.throws(()=>completedSceneData({...project,data:[{...project.data[0],Dialogue:'Edited.'}]},record),/OUTPUT_SOURCE_CHANGED/);
 assert.throws(()=>completedSceneData({...project,data:[{...project.data[0],videoJob:{id:'newer',createdAt:10}}]},record),/OUTPUT_SUPERSEDED/);
});
test('daily cap zero means no daily ceiling, keeps per-request and concurrency protection',()=>{
 const ledger=newLedger();ledger.spend['2026-10-18']=90000000;const limits={daily:0,perRequest:500000,concurrent:1},now=Date.parse('2026-10-18'),r={id:'new',requestHash:'new',cost:{microUsd:288000}};
 assert.doesNotThrow(()=>checkAdmission(ledger,r,now,limits));assert.throws(()=>checkAdmission(ledger,r,now,{...limits,daily:500000}),/SPENDING_LIMIT/);
 assert.throws(()=>checkAdmission(ledger,{...r,cost:{microUsd:600000}},now,limits),/SPENDING_LIMIT/);ledger.records.old={id:'old',stage:'RUNNING'};assert.throws(()=>checkAdmission(ledger,r,now,limits),/CONCURRENCY_LIMIT/);
});

test('frontend completion keeps old video history so later scene saves cannot erase it',async()=>{
 const {applySceneVideoOutput}=await import('../src/lib/sceneVideoOutput.js');const scene=project.data[0],output={url:record.videoUrl,id:record.id,predictionId:record.predictionId,createdAt:record.createdAt};
 const updated=applySceneVideoOutput(scene,output);assert.equal(updated.videoHistory[0].url,scene.videoUrl);assert.equal(updated.videoJob.createdAt,record.createdAt);assert.deepEqual(applySceneVideoOutput(updated,output),updated);
});
