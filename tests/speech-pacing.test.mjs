import test from 'node:test';
import assert from 'node:assert/strict';
import {composeScene,MAX_PROMPT_CHARS} from '../src/lib/seedanceContract.js';
import {composeVideoPrompt,providerVideoPayload,VIDEO_MODES} from '../src/lib/cloudVideoOptions.js';
import {sceneVideoPlan} from '../src/lib/cloudVideoContract.js';
import {prepareQuote,sceneSnapshot} from '../api/_lib/cloud-video/core.js';

const scene={scene_n:1,Character:'elderly_man_gray_hair_white_beard_glasses_black_robe',
  Dialogue:'Let me get this straight... What happened?',Tone_of_Voice:'incredulous, disgusted',
  Action:'Looks toward counsel.',Camera:'Fixed camera.',Context:'Court.'};
test('generated speech gets a conditional pace default without changing dialogue, identity or emotion',()=>{
  for(const spokenKey of ['Dialogue','Voiceover']){
    const source={...scene,[spokenKey]:scene.Dialogue};if(spokenKey==='Voiceover')delete source.Dialogue;
    const before=structuredClone(source);
    const result=composeVideoPrompt(source);
    assert.equal(result.dialogue,scene.Dialogue);
    assert.ok(result.prompt.startsWith('VISUAL:'));
    assert.ok(result.prompt.includes('CHARACTER:\n'+scene.Character));
    assert.ok(result.prompt.includes('TONE:\n'+scene.Tone_of_Voice));
    assert.match(result.prompt,/brisk, fluent, natural conversational pace/);
    assert.deepEqual(source,before);
  }
});
test('explicit slow delivery and authored pauses remain higher priority than the default',()=>{
  for(const authored of ['Speak slowly and deliberately. Hold long pauses.','Nói chậm, gằn từng chữ; ngừng lâu để nhấn mạnh.']){
    const source={...scene,Action:authored},result=composeVideoPrompt(source,'Keep the original emotional intent.');
    assert.ok(result.prompt.includes('ACTION:\n'+authored));
    assert.match(result.prompt,/Respect the authored slow pace/);
    assert.equal(result.dialogue,scene.Dialogue);
  }
});
test('silent scenes get no speech direction; optional guidance never blocks an otherwise valid long prompt',()=>{
  const silent={...scene,Dialogue:''};assert.ok(composeVideoPrompt(silent).prompt.startsWith('VISUAL:'));assert.ok(!composeVideoPrompt(silent).prompt.includes('SPOKEN AUDIO'));assert.ok(!composeVideoPrompt(silent).prompt.includes('SPEECH DELIVERY'));
  const base={...scene,Context:''},space=MAX_PROMPT_CHARS-[...composeScene(base).prompt].length-20;
  const long={...base,Context:'x'.repeat(space)};
  assert.ok([...composeVideoPrompt(long).prompt].length<=MAX_PROMPT_CHARS);assert.ok(composeVideoPrompt(long).prompt.includes(long.Context));assert.ok(composeVideoPrompt(long).prompt.includes('No dialogue captions'));
  assert.throws(()=>composeVideoPrompt({...long,Context:'x'.repeat(MAX_PROMPT_CHARS)}));
});
test('legacy/overlong estimates stay usable in quote and payload, with no invented cadence parameters or source mutation',()=>{
  for(const mode of Object.keys(VIDEO_MODES))for(const duration of [undefined,8,25]){
    const source={...scene,...(duration===undefined?{}:{duration_seconds:duration})},before=structuredClone(source);
    const project={projectType:'full-ai',data:[source]},digest=sceneSnapshot(project,1);
    const settings=sceneVideoPlan(source,mode).settings;
    const image={mime:'image/png',size:100,width:32,height:32,sha256:'a'.repeat(64)};
    const q=prepareQuote(project,{project_id:'proj_test',scene_id:1,mode,settings,additional_prompt:'Use warm light.',
      ...(mode==='text_to_video'?{}:mode==='references_to_video'?{images:[image]}:{image})},Date.parse('2026-10-20'));
    const payload=providerVideoPayload({...q,downloadUrl:'https://media.example.org/ref.png',uploadedImages:[{url:'https://media.example.org/ref.png'}]});
    assert.equal(payload.duration,settings.duration);assert.equal(payload.prompt,q.prompt);
    assert.match(payload.prompt,/SPEECH DELIVERY/);assert.equal(payload.generate_audio,true);
    const keys=mode==='references_to_video'?['prompt','reference_images','duration','resolution','aspect_ratio','generate_audio','enable_web_search']:
      ['prompt',...Object.keys(settings),...(mode==='start_frame_to_video'?['image']:[])];
    assert.deepEqual(Object.keys(payload).sort(),keys.sort());
    assert.deepEqual(source,before);assert.equal(sceneSnapshot(project,1),digest);
  }
});
