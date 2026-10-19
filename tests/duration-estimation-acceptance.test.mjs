import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateSceneDuration,resolveProviderRequestDuration,readSceneDuration} from '../src/lib/sceneDuration.js';
import {sceneVideoPlan} from '../src/lib/cloudVideoContract.js';
import {prepareQuote,publicQuote} from '../api/_lib/cloud-video/core.js';
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

test('A. Scene estimated at 5 seconds: generation works with valid supported duration',()=>{
  const scene={...baseScene,duration_seconds:5};
  const plan=sceneVideoPlan(scene);
  assert.equal(plan.settings.duration,5);
  const q=prepareQuote({projectType:'full-ai',data:[scene]},{project_id:'proj_test',scene_id:1,settings:plan.settings,image:mockImage},now);
  assert.equal(q.settings.duration,5);
  assert.equal(providerVideoPayload({...q,downloadUrl:'https://storage.org/1.png'}).duration,5);
});

test('B. Scene estimated at 12 seconds: generation works with valid supported duration',()=>{
  const scene={...baseScene,duration_seconds:12};
  const plan=sceneVideoPlan(scene);
  assert.equal(plan.settings.duration,12);
  const q=prepareQuote({projectType:'full-ai',data:[scene]},{project_id:'proj_test',scene_id:1,settings:plan.settings,image:mockImage},now);
  assert.equal(q.settings.duration,12);
  assert.equal(providerVideoPayload({...q,downloadUrl:'https://storage.org/1.png'}).duration,12);
});

test('C. Scene estimated at 15 seconds: generation is NOT locked, converts to provider max 12s',()=>{
  const scene={...baseScene,duration_seconds:15};
  assert.equal(estimateSceneDuration(scene),15);
  assert.equal(resolveProviderRequestDuration(scene,'start_frame_to_video'),12);
  assert.equal(resolveProviderRequestDuration(scene,'text_to_video'),12);
  assert.equal(resolveProviderRequestDuration(scene,'references_to_video'),15);
  const plan=sceneVideoPlan(scene,'start_frame_to_video');
  assert.equal(plan.settings.duration,12);
  const q=prepareQuote({projectType:'full-ai',data:[scene]},{project_id:'proj_test',scene_id:1,settings:plan.settings,image:mockImage},now);
  assert.equal(q.settings.duration,12);
  assert.equal(q.canonicalDuration,15); // Canonical estimate preserved
  assert.equal(providerVideoPayload({...q,downloadUrl:'https://storage.org/1.png'}).duration,12);
});

test('D. Scene estimated at 25 seconds: generation is NOT locked, converts to provider max 12s',()=>{
  const scene={...baseScene,duration_seconds:25};
  assert.equal(estimateSceneDuration(scene),25);
  assert.equal(resolveProviderRequestDuration(scene,'start_frame_to_video'),12);
  assert.equal(resolveProviderRequestDuration(scene,'references_to_video'),15);
  const plan=sceneVideoPlan(scene,'start_frame_to_video');
  assert.equal(plan.settings.duration,12);
  const q=prepareQuote({projectType:'full-ai',data:[scene]},{project_id:'proj_test',scene_id:1,settings:plan.settings,image:mockImage},now);
  assert.equal(q.settings.duration,12);
  assert.equal(q.canonicalDuration,25); // Canonical estimate preserved
  assert.equal(providerVideoPayload({...q,downloadUrl:'https://storage.org/1.png'}).duration,12);
});

test('E. Scene estimated below provider minimum: converts to 4s without locking',()=>{
  const scene2={...baseScene,duration_seconds:2};
  const scene3={...baseScene,duration_seconds:3};
  assert.equal(resolveProviderRequestDuration(scene2,'start_frame_to_video'),4);
  assert.equal(resolveProviderRequestDuration(scene3,'start_frame_to_video'),4);
  const plan=sceneVideoPlan(scene3);
  assert.equal(plan.settings.duration,4);
  const q=prepareQuote({projectType:'full-ai',data:[scene3]},{project_id:'proj_test',scene_id:1,settings:plan.settings,image:mockImage},now);
  assert.equal(q.settings.duration,4);
  assert.equal(providerVideoPayload({...q,downloadUrl:'https://storage.org/1.png'}).duration,4);
});

test('F. Legacy scene missing duration_seconds: resolves estimate and remains usable',()=>{
  const legacy={...baseScene};
  delete legacy.duration_seconds;
  const estimate=estimateSceneDuration(legacy);
  assert.ok(Number.isInteger(estimate)&&estimate>=4);
  const plan=sceneVideoPlan(legacy);
  assert.equal(plan.settings.duration,4);
  const q=prepareQuote({projectType:'full-ai',data:[legacy]},{project_id:'proj_test',scene_id:1,settings:plan.settings,image:mockImage},now);
  assert.equal(q.settings.duration,4);
  assert.equal(q.canonicalDuration,undefined);
  assert.equal(providerVideoPayload({...q,downloadUrl:'https://storage.org/1.png'}).duration,4);
});

test('G. Scene 1 of project proj_1792167327214: resolves duration and reaches valid quote state',()=>{
  const estimate=estimateSceneDuration(legacyScene1);
  assert.equal(estimate,12); // 28 words -> 12s
  const requestDuration=resolveProviderRequestDuration(legacyScene1,'start_frame_to_video');
  assert.equal(requestDuration,12);
  const plan=sceneVideoPlan(legacyScene1,'start_frame_to_video');
  assert.equal(plan.settings.duration,12);
  const q=prepareQuote({projectType:'full-ai',data:[legacyScene1]},{project_id:'proj_1792167327214',scene_id:1,settings:plan.settings,image:mockImage},now);
  assert.equal(q.settings.duration,12);
  assert.equal(q.canonicalDuration,undefined); // Legacy scene has no stored duration_seconds
  assert.ok(q.prompt.includes('Let me get this straight'));
  assert.equal(providerVideoPayload({...q,downloadUrl:'https://storage.org/1.png'}).duration,12);
});

test('H. Each scene resolves its own estimate and provider request duration',()=>{
  const sceneA={...baseScene,scene_n:1,duration_seconds:5};
  const sceneB={...baseScene,scene_n:2,duration_seconds:18};
  const sceneC={...baseScene,scene_n:3,duration_seconds:3};
  assert.equal(resolveProviderRequestDuration(sceneA),5);
  assert.equal(resolveProviderRequestDuration(sceneB),12);
  assert.equal(resolveProviderRequestDuration(sceneC),4);
});

test('I. The quote and prediction request use the SAME valid duration',()=>{
  const scene={...baseScene,duration_seconds:20};
  const requestDuration=resolveProviderRequestDuration(scene);
  assert.equal(requestDuration,12);
  const plan=sceneVideoPlan(scene);
  const q=prepareQuote({projectType:'full-ai',data:[scene]},{project_id:'proj_test',scene_id:1,settings:plan.settings,image:mockImage},now);
  assert.equal(q.settings.duration,12);
  const payload=providerVideoPayload({...q,downloadUrl:'https://storage.org/1.png'});
  assert.equal(payload.duration,q.settings.duration);
  assert.equal(cloudVideoCost(plan.settings,'start_frame_to_video',now).microUsd,q.cost.microUsd);
});

test('P. Custom Prompt does not modify scene duration',()=>{
  const scene={...baseScene,duration_seconds:8};
  const plan=sceneVideoPlan(scene);
  const q1=prepareQuote({projectType:'full-ai',data:[scene]},{project_id:'proj_test',scene_id:1,settings:plan.settings,image:mockImage},now);
  const q2=prepareQuote({projectType:'full-ai',data:[scene]},{project_id:'proj_test',scene_id:1,settings:plan.settings,image:mockImage,additional_prompt:'Cinematic lighting, 8k, slow motion.'},now);
  assert.equal(q1.settings.duration,8);
  assert.equal(q2.settings.duration,8);
  assert.equal(q1.settings.duration,q2.settings.duration);
  assert.ok(q2.prompt.includes('Cinematic lighting'));
});
