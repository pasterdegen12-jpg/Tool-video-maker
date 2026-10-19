import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFullAISceneDurations,readSceneDuration} from '../src/lib/sceneDuration.js';
import {prepareNewProjectScenes} from '../src/lib/spokenText.js';
import {sceneVideoPlan} from '../src/lib/cloudVideoContract.js';
import {prepareQuote} from '../api/_lib/cloud-video/core.js';
import {providerVideoPayload,cloudVideoCost} from '../src/lib/cloudVideoOptions.js';
const base={scene_n:1,Character:'Judge',Dialogue:'Exact words.',Action:'Sits.',Camera:'Static.',Context:'Court.'};
test('analysis assigns per-scene canonical durations once and creation preserves them',()=>{
 const input=[base,{...base,scene_n:2,Dialogue:Array(20).fill('word').join(' ')}],before=structuredClone(input);
 const analyzed=analyzeFullAISceneDurations(input);assert.deepEqual(analyzed.map(s=>s.duration_seconds),[4,9]);assert.deepEqual(input,before);
 assert.deepEqual(prepareNewProjectScenes(analyzed,'full-ai').map(s=>s.duration_seconds),[4,9]);
 assert.equal(analyzeFullAISceneDurations([{...base,duration_seconds:8}])[0].duration_seconds,8);
 assert.equal(analyzeFullAISceneDurations([{...base,Dialogue:Array(40).fill('word').join(' ')}])[0].duration_seconds,17);
});
test('generation reads saved duration without replanning or reading media/Time_origin/history settings',()=>{
 const scene={...base,duration_seconds:8,time_origin:'00:00 - 00:04',videoJob:{options:{settings:{duration:12}}}};
 assert.equal(sceneVideoPlan(scene).settings.duration,8);assert.equal(sceneVideoPlan({...scene,Dialogue:'Different text.'}).settings.duration,8);
 for(const duration_seconds of [null,0,3,4.5,'5',NaN])assert.throws(()=>readSceneDuration({...base,duration_seconds}),e=>e.code==='SCENE_DURATION_INVALID');
 assert.throws(()=>readSceneDuration(base),e=>e.code==='SCENE_DURATION_MISSING');assert.throws(()=>sceneVideoPlan({...base,duration_seconds:13}),e=>e.code==='SCENE_DURATION_INCOMPATIBLE');
 assert.equal(sceneVideoPlan({...base,duration_seconds:13},'references_to_video').settings.duration,13);
});
test('quote, cost and each model payload use exactly the saved duration; custom text cannot change it',()=>{
 const now=Date.parse('2026-10-19T12:00:00Z');
 for(const mode of ['start_frame_to_video','text_to_video','references_to_video'])for(const duration_seconds of [4,8]){
  const scene={...base,duration_seconds},project={projectType:'full-ai',data:[scene]},settings=sceneVideoPlan(scene,mode).settings;
  const image={mime:'image/png',size:100,width:32,height:32,sha256:'a'.repeat(64)};
  const input={project_id:'proj_test',scene_id:1,mode,settings,additional_prompt:'Make it thirty seconds.',...(mode==='text_to_video'?{}:mode==='references_to_video'?{images:[image]}:{image})};
  const q=prepareQuote(project,input,now);assert.equal(q.settings.duration,duration_seconds);assert.equal(q.canonicalDuration,duration_seconds);
  assert.deepEqual(q.cost,cloudVideoCost(settings,mode,now));assert.equal(providerVideoPayload({...q,downloadUrl:'https://media.example.org/ref.png',uploadedImages:[{url:'https://media.example.org/ref.png'}]}).duration,duration_seconds);
  assert.throws(()=>prepareQuote(project,{...input,settings:{...settings,duration:duration_seconds+1}},now),e=>e.code==='SCENE_DURATION_MISMATCH');
 }
});
test('analysis rejects a saved duration too short for dialogue and never edits existing input',()=>{
 const scene={...base,Dialogue:Array(30).fill('word').join(' '),duration_seconds:4},before=structuredClone(scene);
 assert.throws(()=>analyzeFullAISceneDurations([scene]),e=>e.code==='DIALOGUE_DURATION');assert.deepEqual(scene,before);
});
