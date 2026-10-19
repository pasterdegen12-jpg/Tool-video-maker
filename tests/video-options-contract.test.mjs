import test from 'node:test';
import assert from 'node:assert/strict';
import {VIDEO_MODES,composeVideoPrompt,cloudVideoCost,validateCloudSettings} from '../src/lib/cloudVideoOptions.js';
import {DEFAULT_SETTINGS,composeScene} from '../src/lib/seedanceContract.js';
import {createProvider} from '../api/_lib/seedance/provider.js';
import {readEditVideo,trimArguments} from '../src/lib/videoEditing.js';
const scene={scene_n:1,Character:'confirmed_judge_id',Dialogue:'Exact spoken text.',Camera:'Fixed.',Action:'Sits.',Context:'Court.',Tone_of_Voice:'Calm'};
test('additional direction is appended after exact canonical prompt; original screenplay untouched',()=>{
  const before=structuredClone(scene),base=composeScene(scene),extra='Warm lighting.';
  assert.ok(composeVideoPrompt(scene,extra).prompt.startsWith(base.prompt+'\n\n'));
  assert.ok(composeVideoPrompt(scene,extra).prompt.endsWith(extra));assert.deepEqual(scene,before);
  assert.throws(()=>composeVideoPrompt(scene,'x'.repeat(1001)));assert.throws(()=>composeVideoPrompt(scene,'\0'));
});
test('every allowed model uses its own provider endpoint and validates returned model on POST/GET',async()=>{
  for(const {model} of Object.values(VIDEO_MODES)){
    const calls=[];const provider=createProvider({apiKey:'test-only',paidEnabled:true},{checkUrl:async()=>{},request:async(url,options)=>{calls.push({url,options});return {status:200,body:JSON.stringify({code:200,data:{id:'prediction',model,status:'queued',outputs:[]}})};}});
    await provider.submit({prompt:'test'},()=>{},model);await provider.get('prediction',model);
    assert.equal(calls[0].url,'https://api.wavespeed.ai/api/v3/'+model);assert.match(calls[1].url,/predictions\/prediction\/result$/);
    await assert.rejects(provider.submit({},()=>{},'invented/model'),/INVALID_PROVIDER_MODEL/);assert.equal(calls.length,2);
  }
});
test('supported ratio/resolution validation and internal pricing are model-specific',()=>{
  const now=Date.parse('2026-10-19T12:00:00Z');
  assert.equal(cloudVideoCost(DEFAULT_SETTINGS,'text_to_video',now).microUsd,120000);
  assert.equal(cloudVideoCost({...DEFAULT_SETTINGS,resolution:'1080p'},'start_frame_to_video',now).microUsd,520000);
  assert.equal(cloudVideoCost(DEFAULT_SETTINGS,'references_to_video',now).microUsd,300000);
  for(const aspect_ratio of ['9:16','16:9','1:1'])assert.equal(validateCloudSettings({...DEFAULT_SETTINGS,aspect_ratio}).aspect_ratio,aspect_ratio);
  assert.throws(()=>validateCloudSettings({...DEFAULT_SETTINGS,aspect_ratio:'5:2'}));assert.throws(()=>validateCloudSettings({...DEFAULT_SETTINGS,seed:1},'references_to_video'));
  assert.equal(cloudVideoCost(DEFAULT_SETTINGS,'text_to_video',now+31*86400000),null);
});
test('editor validates original bytes and exports a separate MP4 with bounded trim',async()=>{
  const header=new Uint8Array(20);header.set(new TextEncoder().encode('ftyp'),4);
  const file=new File([header],'input.mp4',{type:'video/mp4'});await readEditVideo(file);
  await assert.rejects(readEditVideo(new File(['not video'],'input.mp4',{type:'video/mp4'})));
  const args=trimArguments(1,3,4);assert.equal(args.at(-1),'output.mp4');assert.ok(args.includes('libx264'));assert.equal(args[args.indexOf('-t')+1],'2');
  for(const range of [[-1,2,4],[3,2,4],[0,5,4],[0,10,601]])assert.throws(()=>trimArguments(...range));
});
