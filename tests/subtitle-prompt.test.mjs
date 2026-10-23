import test from 'node:test';
import assert from 'node:assert/strict';
import {composeVideoPrompt,videoPromptWarnings,providerVideoPayload,cloudVideoCost} from '../src/lib/cloudVideoOptions.js';
import {prepareQuote,sceneSnapshot} from '../api/_lib/cloud-video/core.js';
import {sceneVideoPlan} from '../src/lib/cloudVideoContract.js';
import {composeScene,MAX_PROMPT_CHARS} from '../src/lib/seedanceContract.js';
const base={scene_n:1,Character:'elderly_man_gray_hair_white_beard_glasses_black_robe',Dialogue:'"Look at me and be completely honest right now."',Translate:'"Hãy nhìn tôi và trả lời thật lòng ngay bây giờ."',Context:'Courtroom.',Action:'Holds a physical document marked EVIDENCE.',Camera:'Fixed camera.',Tone_of_Voice:'skeptical',duration_seconds:8};
test('one verbatim spoken section, translation stays project metadata, props preserved',()=>{
 const before=structuredClone(base),p=composeVideoPrompt(base).prompt;
 assert.equal(p.split(base.Dialogue).length-1,1);assert.equal(p.split('SPOKEN AUDIO (').length-1,1);
 assert.ok(!p.includes(base.Translate));assert.ok(p.includes(base.Action));assert.ok(p.includes('Preserve physical writing'));
 assert.deepEqual(base,before);
});
test('Vietnamese and explicitly bilingual dialogue remain exact with no English-only direction',()=>{
 for(const Dialogue of ['Xin chào, tôi cần nói rõ chuyện này.','Hello. Xin chào.']){
 const p=composeVideoPrompt({...base,Dialogue}).prompt;assert.equal(p.split(Dialogue).length-1,1);assert.ok(!p.includes('English'));}
});
test('controlled 21-scene fixture keeps separate identities and dialogue; not real inference',()=>{
 const ids=['judge_confirmed_id','lawyer_confirmed_id','defendant_confirmed_id'];
 const scenes=Array.from({length:21},(_,i)=>({...base,scene_n:i+1,Character:ids[i%3],Dialogue:`Exact unique speech [${i+1}].`,Translate:`Bản dịch riêng [${i+1}].`}));
 for(const s of scenes){const p=composeVideoPrompt(s).prompt;for(const value of [s.Character,s.Dialogue,s.Tone_of_Voice,s.Camera,'No dialogue captions'])assert.ok(p.includes(value));assert.equal(p.split(s.Dialogue).length-1,1);assert.ok(!p.includes(s.Translate));for(const other of scenes.filter(x=>x!==s))assert.ok(!p.includes(other.Dialogue));}
});
test('mandatory picture constraint survives cap pressure without truncating authored text',()=>{
 const empty={...base,Context:''};const room=MAX_PROMPT_CHARS-[...composeScene(empty).prompt].length-20;
 const s={...empty,Context:'字'.repeat(room)},p=composeVideoPrompt(s).prompt;
 assert.ok(p.includes(s.Context));assert.ok(p.includes(s.Dialogue));assert.ok(p.includes('No dialogue captions'));assert.ok([...p].length<=MAX_PROMPT_CHARS);
});
test('explicit caption additions report conflict without deleting text or gating generation',()=>{
 for(const request of ['Add subtitles.','Show English captions.','Thêm phụ đề tiếng Việt.','Hiển thị phụ đề.']){
 const p=composeVideoPrompt(base,request);assert.equal(p.warnings.length,1);assert.ok(p.prompt.endsWith(request));}
 for(const request of ['No subtitles.','Do not add captions.','Không thêm phụ đề.','Show the physical sign EXIT.'])assert.deepEqual(videoPromptWarnings(request),[]);
});
test('all three final payloads equal server snapshot and preserve duration, audio, cost and source digest',()=>{
 const project={projectType:'full-ai',data:[base]},digest=sceneSnapshot(project,1),before=structuredClone(project),image={mime:'image/jpeg',size:100,width:32,height:32,sha256:'a'.repeat(64)},now=Date.parse('2026-10-23');
 for(const mode of ['start_frame_to_video','text_to_video','references_to_video']){
 const settings=sceneVideoPlan(base,mode).settings,q=prepareQuote(project,{project_id:'p',scene_id:1,mode,settings,...(mode==='text_to_video'?{}:mode==='references_to_video'?{images:[image]}:{image})},now);
 const p=providerVideoPayload({...q,downloadUrl:'https://example.org/a.jpg',uploadedImages:[{url:'https://example.org/a.jpg'}]});
 assert.equal(p.prompt,q.prompt);assert.equal(p.prompt,composeVideoPrompt(base).prompt);assert.equal(p.duration,8);assert.equal(p.generate_audio,true);assert.equal(p.aspect_ratio,settings.aspect_ratio);assert.equal(p.resolution,settings.resolution);assert.equal(p.camera_fixed,mode==='references_to_video'?undefined:true);assert.deepEqual(q.cost,cloudVideoCost(settings,mode,now));
 for(const key of ['negative_prompt','subtitles','disable_subtitles'])assert.ok(!(key in p));}
 assert.equal(sceneSnapshot(project,1),digest);assert.deepEqual(project,before);
});
