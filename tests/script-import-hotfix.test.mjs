import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStructuredScript as parse} from '../src/lib/structuredScript.js';

export const dialogue='"Look at me and be completely honest right now—after all this back and forth, are you really going to leave him?"';
const scene=(name,n=1)=>`scene_${n}\nContext: hook\nCharacter: ${name}\nTone: (skeptical, gentle, knowing smirk)\nDialogue: ${dialogue}`;

test('incident screenshot excerpt imports exactly one Judge without visual identity',()=>{
 const script=scene('Judge — Judge'),result=parse(script,'full-ai');
 assert.equal(result.characters.length,1);assert.equal(result.characters[0].name,'Judge');
 assert.equal(result.characters[0].characterIdentity,undefined);
 assert.equal(result.scenes[0].Character,'Judge');assert.equal(result.scenes[0].Dialogue,dialogue);
 assert.equal(result.scenes[0].Context,'hook');assert.equal(result.scenes[0].Tone_of_Voice,'(skeptical, gentle, knowing smirk)');
 assert.equal(result.sourceMetadata[0].fields.character,'Judge — Judge');
});

test('equivalent labels reuse existing stable character ID across scenes',()=>{
 const names=['Judge','Judge — Judge','Judge - Judge','Judge – Judge','Judge—Judge','  judge — JUDGE  ','Judge-Judge','Judge -Judge','Judge- Judge'];
 const result=parse(names.map((name,i)=>scene(name,i+1)).join('\n'),'full-ai');
 assert.equal(result.characters.length,1);assert.equal(result.characters[0].id,parse(scene('Judge'),'full-ai').characters[0].id);
 assert.deepEqual(result.scenes.map(s=>s.Character),names.map(()=>'Judge'));
 assert.ok(result.scenes.every(s=>s.Dialogue===dialogue));
});

test('general names, internal hyphens, unicode and whitespace do not hardcode court roles',()=>{
 const result=parse(['Mary-Jane — MARY-JANE','  Alex   Chen – alex chen','Ánh—A\u0301nh','Judge','Judge Jr'].map((s,i)=>scene(s,i+1)).join('\n'),'full-ai');
 assert.deepEqual(result.characters.map(c=>c.name),['Mary-Jane','Alex Chen','Ánh','Judge','Judge Jr']);
 assert.equal(new Set(result.characters.map(c=>c.id)).size,5);
});

test('different speakers stay distinct; unsupported multi-speaker declarations remain actionable errors',()=>{
 assert.deepEqual(parse(scene('Judge')+'\n'+scene('Lawyer',2),'full-ai').characters.map(c=>c.name),['Judge','Lawyer']);
 for(const name of ['Judge — Lawyer','Judge - Lawyer','Judge -Lawyer','Judge- Lawyer','Judge – Lawyer','Judge and Lawyer','Judge / Lawyer','Camera','— Judge','Judge — —','Camera (Judge)','Judge (Lawyer and Defendant)']){
  assert.throws(()=>parse(scene(name),'full-ai'),e=>e.code==='AMBIGUOUS_CHARACTER'&&e.field==='Character'&&e.scene===1&&e.message.includes('tách lời thoại'));
 }
});

test('real recurring grammar: empty description suffix and role/name qualifier identify one character',()=>{
 const names=['Judge — ','Defendant (Mr. Kowalski) — ','Judge','Plaintiff (Miss Price) — ','Defendant (Mr. Kowalski)'];
 const result=parse(names.map((name,i)=>scene(name,i+1)).join('\n'),'full-ai');
 assert.deepEqual(result.characters.map(c=>c.name),['Judge','Defendant (Mr. Kowalski)','Plaintiff (Miss Price)']);
 assert.deepEqual(result.scenes.map(s=>s.Character),['Judge','Defendant (Mr. Kowalski)','Judge','Plaintiff (Miss Price)','Defendant (Mr. Kowalski)']);
 assert.ok(result.scenes.every(s=>s.Dialogue===dialogue));
 assert.equal(result.sourceMetadata[1].fields.character,names[1]);
 for(const value of ['Defendant (Mr. Kowalski) — Plaintiff (Miss Price)','Judge — Lawyer'])assert.throws(()=>parse(scene(value),'full-ai'),e=>e.code==='AMBIGUOUS_CHARACTER');
});

test('controlled 21-scene screenplay keeps all authored fields and three characters',()=>{
 const names=['Mira Vale','Ren Chen','Captain Noor'];
 const script=Array.from({length:21},(_,i)=>scene(`${names[i%3]} — ${names[i%3].toUpperCase()}`,i+1)+`\nDịch: "Bản dịch ${i+1}."\nAction: Action ${i+1}.\nCamera: Camera cố định.\nVoiceover: ${dialogue}`).join('\n');
 const result=parse(script,'full-ai');
 assert.deepEqual(result.characters.map(c=>c.name),names);
 result.scenes.forEach((s,i)=>{assert.equal(s.scene_n,i+1);assert.equal(s.Character,names[i%3]);assert.equal(s.Dialogue,dialogue);assert.equal(s.Translate,`"Bản dịch ${i+1}."`);assert.equal(s.Action,`Action ${i+1}.`);assert.equal(s.Camera,'Camera cố định.');assert.equal(result.sourceMetadata[i].fields.voiceover,dialogue);});
 assert.equal(result.scenes.length,21);
});

test('Semi metadata and unstructured Gemini fallback remain unchanged',()=>{
 assert.equal(parse('INT. ROOM\nMIRA: Hello.','full-ai'),null);
 const result=parse('scene_1\nTime_origin: 00:01 - 00:03\nCharacter: Judge — Lawyer\nVoiceover: Original narration.','semi');
 assert.deepEqual(result.characters,[]);assert.equal(result.scenes[0].Character,'Judge — Lawyer');assert.equal(result.scenes[0].Voiceover,'Original narration.');
});
