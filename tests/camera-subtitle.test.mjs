import test from 'node:test';import assert from 'node:assert/strict';
import {sceneCameraFixed} from '../src/lib/sceneCamera.js';import {sceneVideoPlan} from '../src/lib/cloudVideoContract.js';import {composeVideoPrompt,providerVideoPayload} from '../src/lib/cloudVideoOptions.js';import {prepareQuote} from '../api/_lib/cloud-video/core.js';
const base={scene_n:1,Character:'approved_id',Dialogue:'Do not change a single word.',Context:'The physical sign reads OPEN.',Action:'Waves naturally.',Camera:'Camera cố định, không được di chuyển camera, không được thay đổi góc hay độ zoom của camera.'};
test('canonical fixed camera phrases map to true; motion and negation remain false',()=>{
 for(const Camera of [base.Camera,'fixed camera','fixed angle','static camera','locked-off shot','no camera movement','góc máy cố định','máy quay cố định','không di chuyển máy quay'])assert.equal(sceneCameraFixed({Camera}),true,Camera);
 for(const Camera of ['Pan left','Camera moves forward','not a fixed camera','không cố định','Máy quay di chuyển','fixed camera then dolly in'])assert.equal(sceneCameraFixed({Camera},'text_to_video',true),false,Camera);
 assert.equal(sceneCameraFixed({Camera:'No zoom. Fixed camera.'}),true);
});
test('server overrides stale or custom camera choice before quote snapshot and final payload',()=>{
 for(const mode of ['start_frame_to_video','text_to_video','references_to_video'])for(const duration_seconds of [undefined,15,20,30]){
 const scene={...base,...(duration_seconds?{duration_seconds}:{} )},before=structuredClone(scene),settings=sceneVideoPlan(scene,mode).settings;
 const image={mime:'image/jpeg',size:100,width:32,height:32,sha256:'a'.repeat(64)};
 const q=prepareQuote({projectType:'full-ai',data:[scene]},{project_id:'p',scene_id:1,mode,settings:{...settings,camera_fixed:false},additional_prompt:'Move the camera instead.',...(mode==='text_to_video'?{}:mode==='references_to_video'?{images:[image]}:{image})},Date.parse('2026-10-21'));
 const payload=providerVideoPayload({...q,downloadUrl:'https://example.org/a.jpg',uploadedImages:[{url:'https://example.org/a.jpg'}]});
 assert.equal(q.settings.camera_fixed,mode!=='references_to_video');assert.equal(payload.camera_fixed,mode==='references_to_video'?undefined:true);assert.equal(payload.duration,q.settings.duration);assert.equal(q.settings.duration,settings.duration);assert.ok(q.prompt.includes(base.Camera));assert.ok(q.prompt.includes('Camera and Action'));assert.deepEqual(scene,before);
 assert.equal(payload.subtitles,undefined);assert.equal(payload.negative_prompt,undefined);
 }
});
test('visual instruction preserves exact dialogue, physical writing, custom addition and source',()=>{
 const before=structuredClone(base),p=composeVideoPrompt(base,'Warm light.').prompt;
 for(const text of [base.Dialogue,base.Camera,base.Action,base.Context,'No dialogue captions, subtitles or overlays','Preserve physical writing','natural character performance'])assert.ok(p.includes(text),text);
 assert.ok(p.endsWith('Warm light.'));assert.deepEqual(base,before);
});
