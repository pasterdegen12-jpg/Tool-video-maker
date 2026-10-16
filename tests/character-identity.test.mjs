// Synthetic proposals only. These tests never claim real Qwen inference.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {migrateCharacterIdentity,reconcileCharacterScenes,resolveCharacterReference,canonicalIdentity,validCharacterId} from '../src/lib/characterIdentity.js';
import {composeScene} from '../src/lib/seedanceContract.js';
const captured=JSON.parse(await fs.readFile(new URL('../docs/qwen-character-id/project-before.json',import.meta.url)));
const image=JSON.parse(await fs.readFile(new URL('./support/visual-fixture.json',import.meta.url)));
// Descriptive IDs reflecting the 8–16 segment contract (MOCK — not actual Qwen output).
const proposal={status:'detected',visual_id:'elderly_woman_blonde_hair_bun_dark_framed_glasses_black_robe_white_collar',visual_description:'MOCK description; not actual Qwen output.'};
const CONFIRMED_ID='Elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses';
const options={projectId:captured.id,ownerHash:'a'.repeat(64),characterId:'char_1',proposal,confirmedId:CONFIRMED_ID,
 referenceImage:{dataUrl:'data:'+image.mime_type+';base64,'+image.image_base64,sha256:createHash('sha256').update(Buffer.from(image.image_base64,'base64')).digest('hex')},confirmedAt:1,jobId:'b'.repeat(48),expectedPreviousId:null};
const migrate=(p=captured,o={})=>migrateCharacterIdentity(structuredClone(p),{...options,...o});
test('validCharacterId accepts descriptive 8-16 segment IDs and rejects short or malformed ones',()=>{
 // Accepted: 8-16 segments, letters + underscores, mixed case allowed for confirmed IDs
 assert.ok(validCharacterId('Elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses')); // 10 segments
 assert.ok(validCharacterId('elderly_woman_blonde_hair_bun_dark_framed_glasses_black_robe_white_collar')); // 11 segments
 assert.ok(validCharacterId('adult_male_dark_hair_short_beard_white_shirt_blue_jacket')); // 9 segments
 assert.ok(validCharacterId('young_woman_red_hair_wavy_freckles_green_eyes_floral_dress')); // 9 segments
 assert.ok(validCharacterId('woman_black_robe')); // 3 segments — structurally valid (existing IDs preserved)
 assert.ok(validCharacterId('judge_elderly')); // 2 segments — passes validator; rejected by PROMPT quality contract, not by the pattern
 // Rejected: single token, spaces, digits, non-alpha
 assert.ok(!validCharacterId('Judge')); // 1 segment
 assert.ok(!validCharacterId('Oliver Caldwell')); // space
 assert.ok(!validCharacterId('judge_01')); // digit
 assert.ok(!validCharacterId('')); // empty
 assert.ok(!validCharacterId('a'.repeat(101))); // too long
});
test('real saved project shape: only eight exact matching Character fields change under MOCK confirmation',()=>{
 const before=canonicalIdentity(captured),result=migrate();assert.deepEqual(result.changed.map(x=>x.sceneId),[1,3,8,11,15,17,20,21]);
 for(let i=0;i<captured.data.length;i++){const {Character:a,...restA}=captured.data[i],{Character:b,...restB}=result.data[i];assert.deepEqual(restB,restA);assert.equal(b,a==='Thẩm phán'?options.confirmedId:a);}
 assert.equal(canonicalIdentity(captured),before);assert.deepEqual(result.characters.slice(1),captured.characters.slice(1));
 const loaded=JSON.parse(JSON.stringify({...captured,...result}));assert.equal(resolveCharacterReference(options.confirmedId,loaded.characters,captured.id).id,'char_1');
 assert.equal(loaded.characters[0].characterIdentity.referenceImage.sha256,options.referenceImage.sha256);
});
test('shared prompt uses saved ID directly, preserves legacy dialogue and removes duplicate visual identity section',()=>{
 const result=migrate(),old=captured.data.find(s=>s.scene_n===3),scene=result.data.find(s=>s.scene_n===3);
 const a=composeScene(old),b=composeScene(scene);assert.ok(b.prompt.includes('CHARACTER:\n'+options.confirmedId));assert.ok(!b.prompt.includes('Thẩm phán'));
 assert.ok(!b.prompt.includes('ORIGINAL CHARACTER'));assert.ok(!b.prompt.includes('VISUAL PROFILE'));assert.equal(b.dialogue,old.Voiceover);
 assert.notEqual(createHash('sha256').update(a.prompt).digest('hex'),createHash('sha256').update(b.prompt).digest('hex'));
 for(const key of ['Action','Camera','Context','Tone_of_Voice'])assert.ok(b.prompt.includes(old[key]));
 assert.equal(composeScene(old,{visualId:proposal.visual_id,visualDescription:proposal.visual_description}).prompt,a.prompt);
});
test('multi-character references preserve order, separators and unrelated references; substring never matches',()=>{
 const p={...captured,data:[{scene_n:1,Character:'Thẩm phán, Oliver Caldwell | Chloe Harper',Dialogue:'Original.'},{scene_n:2,Character:['Chloe Harper','char_1']},{scene_n:3,Character:'Thẩm phán khác'}]};
 const r=migrate(p);assert.equal(r.data[0].Character,options.confirmedId+', Oliver Caldwell | Chloe Harper');assert.deepEqual(r.data[1].Character,['Chloe Harper',options.confirmedId]);assert.equal(r.data[2].Character,'Thẩm phán khác');
});
test('confirmed replacement requires exact previous ID; old aliases reconcile future imported scenes without raw script mutation',()=>{
 const SECOND_ID='elderly_woman_blonde_bun_black_robe_white_collar_glasses_formal';
 const p={...captured,...migrate()};assert.throws(()=>migrate(p));const q=migrate(p,{expectedPreviousId:options.confirmedId,confirmedId:SECOND_ID});
 assert.equal(q.changed.length,8);assert.deepEqual(q.characters[0].characterIdentity.previousIds,[options.confirmedId]);
 const source=[{scene_n:99,Character:'Thẩm phán',Dialogue:'No rewrite.'}];assert.equal(reconcileCharacterScenes(source,q.characters,captured.id)[0].Character,SECOND_ID);assert.equal(source[0].Character,'Thẩm phán');
 assert.equal(reconcileCharacterScenes(source,q.characters,captured.id,'semi'),source);
});
for(const [name,mutate] of [
 ['project',p=>p.id='other'],['semi',p=>p.projectType='semi'],['duplicate scene',p=>p.data[1].scene_n=p.data[0].scene_n],
 ['ambiguous name',p=>p.characters[1].name='Thẩm phán'],['duplicate character',p=>p.characters.push({...p.characters[0]})],
 ['foreign owner',p=>{p.characters=migrate().characters;p.characters[0].characterIdentity.ownerHash='c'.repeat(64);}]
])test('migration fails closed: '+name,()=>{const p=structuredClone(captured);mutate(p);assert.throws(()=>migrate(p));});
test('malformed/ambiguous Qwen output and invented single-token IDs cannot be confirmed',()=>{
 for(const bad of [{...proposal,status:'ambiguous'}, {...proposal,visual_id:'Thẩm phán'},{}])assert.throws(()=>migrate(captured,{proposal:bad}));
 assert.throws(()=>migrate(captured,{confirmedId:'Judge'}));assert.throws(()=>migrate(captured,{confirmedId:'Oliver Caldwell'}));
 assert.throws(()=>migrate(captured,{confirmedId:'judge_01'})); // digit — invalid per validCharacterId
});
