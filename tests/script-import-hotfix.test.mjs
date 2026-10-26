import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStructuredScript as parse} from '../src/lib/structuredScript.js';
const values=['abcxyz','judge_1 — Judge','Judge — Judge','Nguyễn Văn A','person_123','bất kỳ nội dung gì','elderly_man_white_beard','Camera','Judge — Lawyer','Judge and Lawyer','—','Judge: "A – B"','Judge','judge','Judge  Judge','Judge Judge','Ánh','A\u0301nh'];
const speech='"Listen: yes—this is unchanged."';
const block=(name,n)=>`scene_${n}\nContext: hook: original\nCharacter: ${name}\nTone: skeptical, serious\nCamera: Camera cố định, không zoom: giữ nguyên\nAction: Ngồi, nói chuyện\nGiữ nguyên cử chỉ — không cắt\nDialogue: ${speech}\nDịch: "Nghe này: đúng—giữ nguyên."`;
for(const value of values)test('Character is complete authored text: '+value,()=>{
 const result=parse(block(value,1),'full-ai');
 assert.equal(result.scenes[0].Character,value);assert.equal(result.characters[0].name,value);
 assert.equal(result.characters[0].characterIdentity,undefined);assert.equal(result.characters[0].imageUrl,undefined);
 assert.equal(result.scenes[0].Dialogue,speech);
});
test('21 scenes preserve fields, exact repeats reuse local ID, distinct raw values never merge',()=>{
 const names=[...values,'abcxyz','judge_1 — Judge','abcxyz'];
 const result=parse(names.map((name,i)=>block(name,i+1)).join('\n\n'),'full-ai');
 assert.equal(result.scenes.length,21);assert.equal(result.characters.length,new Set(names).size);
 assert.equal(new Set(result.characters.map(c=>c.id)).size,new Set(names).size);
 result.scenes.forEach((s,i)=>{
  assert.equal(s.scene_n,i+1);assert.equal(s.Character,names[i]);assert.equal(s.Dialogue,speech);
  assert.equal(s.Translate,'"Nghe này: đúng—giữ nguyên."');assert.equal(s.Context,'hook: original');
  assert.equal(s.Camera,'Camera cố định, không zoom: giữ nguyên');assert.equal(s.Action,'Ngồi, nói chuyện\nGiữ nguyên cử chỉ — không cắt');assert.equal(s.Tone_of_Voice,'skeptical, serious');
 });
 assert.equal(result.characters[0].id,parse(block('abcxyz',1),'full-ai').characters[0].id);
});
test('multiline Character and quoted dialogue preserve punctuation and Unicode',()=>{
 const result=parse(block('judge_1 — Judge\nNguyễn Văn A',1).replace(speech,'"First:\nCamera: spoken — words\nLast."'),'full-ai');
 assert.equal(result.scenes[0].Character,'judge_1 — Judge\nNguyễn Văn A');
 assert.equal(result.scenes[0].Dialogue,'"First:\nCamera: spoken — words\nLast."');
});
test('Semi narration and unstructured fallback remain unchanged',()=>{
 assert.equal(parse('INT. ROOM\nMIRA: Hello.','full-ai'),null);
 const result=parse('scene_1\nTime_origin: 00:01 - 00:03\nCharacter: Judge — Lawyer\nVoiceover: Original narration.','semi');
 assert.deepEqual(result.characters,[]);assert.equal(result.scenes[0].Character,'Judge — Lawyer');assert.equal(result.scenes[0].Voiceover,'Original narration.');
});
