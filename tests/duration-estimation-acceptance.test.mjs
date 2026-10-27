import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateSceneDuration,resolveProviderRequestDuration} from '../src/lib/sceneDuration.js';
import {sceneVideoPlan} from '../src/lib/cloudVideoContract.js';
import {prepareQuote} from '../api/_lib/cloud-video/core.js';
import {providerVideoPayload,cloudVideoCost} from '../src/lib/cloudVideoOptions.js';

const baseScene={scene_n:1,Character:'Judge',Dialogue:'Brief words.',Action:'Sits.',Camera:'Static.',Context:'Court.'};

// Real scene 1 from proj_1792167327214 (legacy scene without duration_seconds)
const legacyScene1={
  scene_n:1,
  Character:'Judge',
  Voiceover:'Let me get this straight. Your school board spent thousands of taxpayer dollars on legal fees... to prosecute a cafeteria worker over thirty-five dollars worth of chicken nuggets?',
  Action:'Giữ nguyên góc nhìn của nhân vật, không thay đổi hướng nhìn. Chau mày kinh tởm, nhặt tờ đơn khiếu nại lên rồi ném nó xuống bàn.',
  Camera:'Camera cố định, không được di chuyển camera, không được thay đổi góc hay độ zoom của camera. Không có nhạc nền',
  Context:'hook',
  Tone_of_Voice:'incredulous, disgusted',
  startFrameUrl:'https://pub-a8fcac683b704e1f9d7d1240947dfdcf.r2.dev/project_proj_1792167327214/avatar_1792257612202.jpeg',
  videoUrl:'https://www.w3schools.com/html/mov_bbb.mp4'
};

const now=Date.parse('2026-10-19T12:00:00Z');
const mockImage={mime:'image/png',size:100,width:32,height:32,sha256:'a'.repeat(64)};


test('integer endpoint mapping: estimates below minimum, every supported value, and long estimates',()=>{
 for(const mode of ['start_frame_to_video','text_to_video','references_to_video'])for(const estimate of [2,4,5,6,7,8,9,10,11,12,15,20,25]){
  assert.equal(resolveProviderRequestDuration(estimate,mode),Math.max(4,Math.min(10,estimate)));
 }
});
test('discrete contracts use only supported intersection, nearest rounding with longer tie',async()=>{
 const {selectRequestDuration,allowedRequestDurations}=await import('../src/lib/generationDurationPolicy.js');
 assert.deepEqual(allowedRequestDurations([3,5,8,12]),[5,8]);
 assert.equal(selectRequestDuration(12,[3,5,8,12]),8);assert.equal(selectRequestDuration(6,[4,8,12]),8);
 assert.throws(()=>selectRequestDuration(10,[12,15]));
});
test('all modes: quote, immutable attempt, cost and provider JSON use one new duration; original remains exact',()=>{
 for(const mode of ['start_frame_to_video','text_to_video','references_to_video'])for(const [words,expected] of [[2,4],[16,5],[20,6],[23,7],[26,8],[28,9],[32,10],[80,10]]){
  const scene={...baseScene,Dialogue:Array(words).fill('word').join(' '),duration_seconds:12},before=structuredClone(scene),plan=sceneVideoPlan(scene,mode);
  assert.equal(plan.settings.duration,expected);
  const input={project_id:'proj_test',scene_id:1,mode,settings:plan.settings,...(mode==='text_to_video'?{}:mode==='references_to_video'?{images:[mockImage]}:{image:mockImage})};
  const q=prepareQuote({projectType:'full-ai',data:[scene]},input,now),payload=providerVideoPayload({...q,downloadUrl:'https://storage.org/1.png',uploadedImages:[{url:'https://storage.org/1.png'}]});
  assert.equal(q.canonicalDuration,12);assert.equal(q.settings.duration,expected);assert.equal(payload.duration,expected);assert.equal(q.generationEstimate,estimateSceneDuration(scene));
  assert.deepEqual(q.cost,cloudVideoCost(plan.settings,mode,now));assert.ok(payload.prompt.includes(scene.Dialogue));assert.match(payload.prompt,/SPEECH DELIVERY:.*brisk/s);
  assert.equal(payload.speech_rate,undefined);assert.equal(payload.speaking_speed,undefined);assert.deepEqual(scene,before);
  for(const duration of [11,12,15])assert.throws(()=>prepareQuote({projectType:'full-ai',data:[scene]},{...input,settings:{...plan.settings,duration}},now));
 }
});
test('real legacy Scene 1 reaches nine-second quote with exact text, not old twelve seconds',()=>{
 const before=structuredClone(legacyScene1),plan=sceneVideoPlan(legacyScene1);
 assert.equal(plan.settings.duration,9);
 const q=prepareQuote({projectType:'full-ai',data:[legacyScene1]},{project_id:'proj_test',scene_id:1,settings:plan.settings,image:mockImage},now);
 assert.equal(q.settings.duration,9);assert.equal(q.cost.usd,'0.2160');assert.ok(q.prompt.includes(legacyScene1.Voiceover));assert.deepEqual(legacyScene1,before);
});
test('missing metadata, excessive saved duration, translations and Custom Prompt do not control speech estimate',()=>{
 for(const duration_seconds of [undefined,12,25]){
  const scene={...baseScene,duration_seconds,Translate:'translation '.repeat(80)},plan=sceneVideoPlan(scene);
  assert.equal(plan.settings.duration,4);
  const q=prepareQuote({projectType:'full-ai',data:[scene]},{project_id:'proj_test',scene_id:1,settings:plan.settings,image:mockImage,additional_prompt:'A long thirty-second cinematic shot.'},now);
  assert.equal(q.settings.duration,4);assert.ok(!q.prompt.includes(scene.Translate));
 }
});
test('Vietnamese syllables and CJK characters have separate deterministic rates; authored slow speech preserved',async()=>{
 const {speechEstimate,speechDelivery}=await import('../src/lib/speechDelivery.js');
 const vi=speechEstimate({...baseScene,Dialogue:'Tôi đang nói chuyện với mọi người.'});assert.equal(vi.unit,'vi-syllable');assert.equal(vi.rate,270);
 const cn=speechEstimate({...baseScene,Dialogue:'这是一个测试句子'});assert.equal(cn.units,8);assert.equal(cn.rate,300);
 const slow={...baseScene,Tone_of_Voice:'Speak slowly with long pauses.'};assert.equal(speechEstimate(slow).rate,140);assert.ok(!speechDelivery(slow).includes('brisk'));
 const silent={...baseScene,Dialogue:''};assert.equal(speechDelivery(silent),'');assert.equal(speechEstimate(silent).seconds,0);
});
