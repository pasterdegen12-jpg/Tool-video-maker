import test from 'node:test';import assert from 'node:assert/strict';
import {sceneCameraFixed} from '../src/lib/sceneCamera.js';import {composeVideoPrompt,providerVideoPayload} from '../src/lib/cloudVideoOptions.js';import {prepareQuote} from '../api/_lib/cloud-video/core.js';import {sceneVideoPlan} from '../src/lib/cloudVideoContract.js';import {createProvider} from '../api/_lib/seedance/provider.js';
const scene={scene_n:1,Character:'saved_character_id',Dialogue:'Exact words only.',Translate:'Bản dịch.',Camera:'Fixed camera. No pan, tilt or zoom.',Action:'Moves her head naturally.',duration_seconds:8};
test('negated camera movement list no longer flips fixed camera to false',()=>{
 for(const Camera of ['Fixed camera. No pan, tilt or zoom.','Fixed angle. No pan, tilt, dolly, orbit or zoom.'])assert.equal(sceneCameraFixed({...scene,Camera}),true);
 assert.equal(sceneCameraFixed({...scene,Camera:'Camera pans left.'}),false);
 assert.equal(sceneCameraFixed({...scene,Camera:'Fixed camera. No pan, then zoom in.'}),false);
});
test('one locked framing direction for fixed scenes only, authored conflict reported without rewriting',()=>{
 const p=composeVideoPrompt(scene);assert.match(p.prompt,/Preserve initial framing, viewing angle, subject scale and background/);assert.equal(p.prompt.split('FRAMING:').length-1,1);
 assert.ok(!composeVideoPrompt({...scene,Camera:'Dolly in.'}).prompt.includes('FRAMING:'));
 for(const changes of [{Camera:'Fixed camera. Dolly in.'},{Action:'Camera approaches the subject.'}]){const s={...scene,...changes},before=structuredClone(s),p=composeVideoPrompt(s);assert.ok(p.warnings.length);assert.deepEqual(s,before);}
 const custom=composeVideoPrompt(scene,'Slow zoom in.');assert.ok(custom.warnings.length);assert.ok(custom.prompt.endsWith('Slow zoom in.'));assert.ok(custom.prompt.includes(scene.Camera));
});
test('quote and exact HTTP serializer preserve camera and log only redacted correlated parameters',async()=>{
 for(const mode of ['start_frame_to_video','text_to_video','references_to_video']){
 const settings=sceneVideoPlan(scene,mode).settings,image={mime:'image/jpeg',size:100,width:32,height:32,sha256:'a'.repeat(64)};
 const q=prepareQuote({projectType:'full-ai',data:[scene]},{project_id:'p',scene_id:1,mode,settings:{...settings,camera_fixed:false},...(mode==='text_to_video'?{}:mode==='references_to_video'?{images:[image]}:{image})},Date.parse('2026-10-23'));
 const payload=providerVideoPayload({...q,downloadUrl:'https://example.org/private.jpg',uploadedImages:[{url:'https://example.org/private.jpg'}]}),events=[];let sent;
 const p=createProvider({apiKey:'DO_NOT_LOG_SECRET',paidEnabled:true},{diagnostics:e=>events.push(e),request:async(url,o)=>{sent=JSON.parse(o.body);return{status:200,body:JSON.stringify({code:200,data:{id:'test_prediction',model:q.model,status:'queued',outputs:[]}})};}});
 await p.submit(payload,()=>{},q.model);assert.equal(sent.camera_fixed,mode==='references_to_video'?undefined:true);assert.equal(sent.duration,q.settings.duration);assert.equal(sent.prompt,q.prompt);assert.equal(sent.generate_audio,true);assert.ok(!sent.prompt.includes(scene.Translate));assert.equal(sent.prompt.split(scene.Dialogue).length-1,1);
 assert.equal(events[0].cameraFixed,mode==='references_to_video'?null:true);assert.equal(events[0].requestId,events[1].requestId);assert.equal(events[1].predictionId,'test_prediction');for(const secret of ['DO_NOT_LOG_SECRET',scene.Dialogue,'private.jpg'])assert.ok(!JSON.stringify(events).includes(secret));
 }
});
