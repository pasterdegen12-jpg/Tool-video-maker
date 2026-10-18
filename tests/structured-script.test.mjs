import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseStructuredScript as parse} from '../src/lib/structuredScript.js';
for(const workflow of ['full-ai','semi'])test('fast CPU extraction matches real '+workflow+' baseline scene by scene',async()=>{
 const capture=JSON.parse(await fs.readFile(new URL('../docs/phase3a/'+workflow+'.web-http.json',import.meta.url),'utf8'));
 const result=parse(capture.request.script,workflow),expected=capture.response.result.web_data;
 assert.deepEqual(result.scenes,expected.scenes);
 assert.deepEqual(result.characters.map(c=>c.name),expected.characters.map(c=>c.name));
 assert.equal(result.scenes.length,workflow==='full-ai'?23:22);
 for(const scene of result.scenes)assert.ok(capture.request.script.includes(scene[workflow==='full-ai'?'Dialogue':'Voiceover']));
 if(workflow==='semi'){assert.deepEqual(result.characters,[]);assert.ok(result.scenes.every(s=>!('Dialogue' in s)));}
 else{assert.ok(result.scenes.every(s=>!('Voiceover' in s)&&!('time_origin' in s)));assert.deepEqual(Object.fromEntries(result.characters.map(c=>[c.name,result.scenes.filter(s=>s.Character===c.name).length])),{Judge:10,Defendant:8,Plaintiff:5});}
});
test('multiline quoted speech keeps CRLF, blank lines and field-like text',()=>{
 const spoken='"First.\r\n\r\nCamera: this is spoken.\r\nLast."';const script='scene_1\r\nCharacter: Judge\r\nDialogue: '+spoken+'\r\nCamera: Fixed.';
 const result=parse(script,'full-ai');assert.equal(result.scenes[0].Dialogue,spoken);assert.equal(result.scenes[0].Camera,'Fixed.');
});
test('duplicate fields/scenes, metadata speaker, ambiguous continuation and competing speech fail explicitly',()=>{
 for(const [script,code]of [
 ['scene_1\nCharacter: Camera\nDialogue: Hello.','AMBIGUOUS_CHARACTER'],
 ['scene_1\nCharacter: Judge\nDialogue: A\nVoiceover: B','DIALOGUE_VOICEOVER_CONFLICT'],
 ['scene_1\nCharacter: Judge\nDialogue: A\nDialogue: B','DUPLICATE_FIELD'],
 ['scene_1\nCharacter: Judge\nDialogue: A\nscene_1\nCharacter: Judge\nDialogue: B','DUPLICATE_SCENE'],
 ['scene_1\nCharacter: Judge\nDialogue: A\nDefendant: B','AMBIGUOUS_FIELD'],
 ['scene_1\nCharacter: Judge\nDialogue: "unclosed','UNCLOSED_QUOTED_FIELD']])assert.throws(()=>parse(script,'full-ai'),e=>e.code===code);
});
test('Semi Time differs from Time_origin; no invented missing fields or entities',()=>{
 const result=parse('scene_1\nTime: 00:00 - 00:05\nTime_origin: 03:10 - 03:16\nVoiceover: Exact words.\nFootage: A separate view.','semi');
 assert.equal(result.scenes[0].time_origin,'03:10 - 03:16');assert.equal(result.scenes[0].Footage,'A separate view.');assert.equal(result.scenes[0].Voiceover,'Exact words.');assert.equal(result.scenes[0].Translate,'');assert.equal(result.scenes[0].Tone_of_Voice,'');assert.deepEqual(result.characters,[]);
 assert.throws(()=>parse('scene_1\nTime_origin: 00:20 - 00:10','semi'),/INVALID_TIME_ORIGIN/);
});
test('unstructured script retains AI fallback; structured invalid content never silently falls back',()=>{
 assert.equal(parse('INT. COURT\nJUDGE: Hello.','full-ai'),null);
 assert.throws(()=>parse('scene_1\nCharacter: Judge','full-ai'),/MISSING_DIALOGUE/);
});
