import test from 'node:test';
import assert from 'node:assert/strict';
import {createProvider} from '../api/_lib/seedance/provider.js';
import {prepareQuote} from '../api/_lib/cloud-video/core.js';
import {sceneVideoPlan} from '../src/lib/cloudVideoContract.js';
import {VIDEO_MODES,providerVideoPayload} from '../src/lib/cloudVideoOptions.js';

test('exact mocked HTTP bodies preserve every quote parameter in every enabled mode and duration',async()=>{
 for(const mode of Object.keys(VIDEO_MODES))for(const [words,expected] of [[2,4],[16,5],[20,6],[23,7],[26,8],[28,9],[32,10],[80,10]]){
  const scene={scene_n:1,Character:'confirmed_id',Dialogue:Array(words).fill('word').join(' '),Camera:'Fixed camera.',Action:'Sits.',Tone_of_Voice:'Confident',Translate:'Do not speak this.',duration_seconds:12};
  const settings=sceneVideoPlan(scene,mode).settings,image={mime:'image/jpeg',size:100,width:32,height:32,sha256:'a'.repeat(64)};
  const q=prepareQuote({projectType:'full-ai',data:[scene]},{project_id:'p',scene_id:1,mode,settings,...(mode==='text_to_video'?{}:mode==='references_to_video'?{images:[image]}:{image})},Date.parse('2026-10-27'));
  const payload=providerVideoPayload({...q,downloadUrl:'https://media.example.org/image.jpg',uploadedImages:[{url:'https://media.example.org/image.jpg'}]}),calls=[];
  const provider=createProvider({apiKey:'mock-only',paidEnabled:true},{diagnostics:()=>{},request:async(url,o)=>{calls.push({url,body:JSON.parse(o.body)});return{status:200,body:JSON.stringify({code:200,data:{id:'mock_id',model:q.model,status:'queued',outputs:[]}})};}});
  await provider.submit(payload,()=>{},q.model);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.wavespeed.ai/api/v3/'+q.model);assert.deepEqual(calls[0].body,payload);
  assert.equal(payload.duration,expected);assert.equal(payload.duration,q.settings.duration);assert.equal(payload.prompt,q.prompt);
  assert.equal(payload.prompt.split('SPEECH DELIVERY:').length-1,1);assert.ok(!payload.prompt.includes('Do not speak this.'));assert.ok(payload.prompt.includes(scene.Dialogue));
  for(const duration of [3,11,12,15,4.5])await assert.rejects(provider.submit({...payload,duration},()=>{},q.model),e=>e.code==='INVALID_PROVIDER_DURATION');
  assert.equal(calls.length,1);
 }
});
