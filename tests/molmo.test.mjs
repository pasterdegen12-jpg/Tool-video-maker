import test from 'node:test';import assert from 'node:assert/strict';
import {molmoService} from '../api/_lib/molmo/service.js';
import {parseMolmoOutputs} from '../api/_lib/molmo/output.js';
import {molmoProvider} from '../api/_lib/molmo/provider.js';
import {MOLMO_MODEL,VISION_PROMPT} from '../api/_lib/molmo/prompt.js';
import {approvedAppearance} from '../src/lib/visualProfile.js';
import {composeVideoPrompt} from '../src/lib/cloudVideoOptions.js';
import {reconcileCharacterScenes} from '../src/lib/characterIdentity.js';
import {normalizeVisualId} from '../src/lib/visualIdText.js';
import {createMolmoController} from '../src/lib/molmoClient.js';
export const molmoOutput={subjectStatus:'clear',visualId:'person_short_black_hair_black_suit',visualDescription:'A person with short black hair wearing a black suit.',hair:'Short black hair',facialHair:'',clothing:'Black suit',accessories:[]};
const session={subject:'test',session:'mock'},issuer='https://clerk.example.org';
export function molmoHarness(){
 let clock=100000,state={jobs:{}},project={id:'proj_molmo',projectType:'full-ai',ownerId:'test',characters:[{id:'judge_1',name:'Judge',imageUrl:'https://media.example.org/project_proj_molmo/judge.jpg',voiceId:'voice_unchanged'}],data:[{scene_n:1,Character:'judge_1',Dialogue:'Exact words.',Camera:'Fixed.',Action:'Sits.',Context:'Court.',duration_seconds:4,videoUrl:'https://media.example.org/old.mp4'}]},chain=Promise.resolve(),posts=0,polls=0,fail=false,status='completed',output=molmoOutput.visualDescription;
 const store={project:async()=>structuredClone(project),read:async()=>structuredClone(state),transact:async(k,p,fn)=>{const task=chain.then(()=>{const next=structuredClone(state),out=fn(next,structuredClone(project));state=next;if(out.characters)project.characters=out.characters;return structuredClone(out.value);});chain=task.catch(()=>{});return task;}};
 const image={url:project.characters[0].imageUrl,sha256:'a'.repeat(64),mime:'image/jpeg'};
 const provider={submit:async()=>{posts++;if(fail)throw Error('connection lost');return{id:'actual_mock_prediction'};},get:async()=>{polls++;return{id:'actual_mock_prediction',status,outputs:[output]};}};
 const service=molmoService({store,issuer,provider,readImage:async()=>image,now:()=>clock});
 const input={projectId:'proj_molmo',characterId:'judge_1'};
 return{service,store,session,input,image,get project(){return project;},get state(){return state;},get posts(){return posts;},get polls(){return polls;},advance:n=>clock+=n,fail:v=>fail=v,status:v=>status=v,output:v=>output=v,create:()=>service.user(session,'create',{...input,requestKey:crypto.randomUUID()}),statusJob:id=>service.user(session,'status',{...input,...(id?{jobId:id}:{})}),confirm:j=>service.user(session,'confirm',{...input,jobId:j.id,confirm:true,confirmedId:j.profile.visual_id})};
}
test('Molmo strict prompt and exact provider request; response ID required, no POST retries',async()=>{
 const calls=[];const provider=molmoProvider('fake-test-key',async(url,options)=>{calls.push({url,options});return{status:200,body:JSON.stringify({data:{id:'p_mock',status:'created'}})};});
 await provider.submit('https://media.example.org/profile.jpg');assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.wavespeed.ai/api/v3/'+MOLMO_MODEL);
 assert.deepEqual(JSON.parse(calls[0].options.body),{images:['https://media.example.org/profile.jpg'],text:VISION_PROMPT});assert.equal(VISION_PROMPT,"Describe the main person's visible physical appearance in a short, accurate English phrase. Focus on hairstyle or baldness, facial hair, glasses, and clothing. Include only clearly visible details. Do not guess or invent features. Do not describe the background, actions, or identity.");
 await assert.rejects(molmoProvider('fake-test-key',async()=>({status:200,body:'{"data":{}}'})).submit('https://example.org/a'),/MOLMO_RESPONSE_INVALID/);
});
test('valid JSON/object/fenced JSON and deterministic punctuation normalization',()=>{
 for(const item of [molmoOutput,JSON.stringify(molmoOutput),'```json\n'+JSON.stringify(molmoOutput)+'\n```'])assert.equal(parseMolmoOutputs([item],true).visual_id,molmoOutput.visualId);
 assert.equal(parseMolmoOutputs([{...molmoOutput,visualId:'Short Black Hair, Black Suit'}],true).visual_id,'short_black_hair_black_suit');
});
test('malformed/plain text/missing attributes/unsupported identification never fabricated',()=>{
 for(const item of ['black hair','{"visualId":}',{...molmoOutput,accessories:'Glasses'},{...molmoOutput,visualId:'á_name'},{...molmoOutput,clothing:'',hair:''},{...molmoOutput,visualDescription:'His real name is John Smith.'},{...molmoOutput,extra:true}])assert.throws(()=>parseMolmoOutputs([item],true));
});
for(const subjectStatus of ['ambiguous','no_subject'])test(subjectStatus+' yields no approvable ID',()=>assert.equal(parseMolmoOutputs([{...molmoOutput,subjectStatus,visualId:''}],true).visual_id,''));
test('duplicate clicks across sessions create one prediction; resume polls only',async()=>{
 const h=molmoHarness(),jobs=await Promise.all([h.create(),h.create(),h.create()]);assert.equal(h.posts,1);assert.equal(new Set(jobs.map(j=>j.id)).size,1);
 const j=await h.statusJob();assert.equal(j.state,'confirmed');assert.equal(h.posts,1);assert.equal(h.polls,1);assert.ok(j.predictionId);
});
test('uncertain submit and crashed reservation are never automatically recharged',async()=>{
 const h=molmoHarness();h.fail(true);const first=await h.create();assert.equal(first.state,'unknown');await h.create();await h.statusJob();assert.equal(h.posts,1);
});
test('approval persists only character overlay; reload resolves every scene without remapping',async()=>{
 const h=molmoHarness(),before=structuredClone(h.project);await h.create();const j=await h.statusJob();assert.equal(j.identity.confirmedId,molmoOutput.visualId);
 assert.deepEqual(h.project.data,before.data);assert.equal(h.project.characters[0].id,'judge_1');assert.equal(h.project.characters[0].voiceId,'voice_unchanged');
 const p=JSON.parse(JSON.stringify(h.project)),appearance=approvedAppearance(p.data[0],p.characters,p.id);
 assert.equal(appearance.visualId,molmoOutput.visualId);assert.ok(composeVideoPrompt(p.data[0],'',appearance).prompt.includes(molmoOutput.visualId));assert.deepEqual(reconcileCharacterScenes(p.data,p.characters,p.id),p.data);
});
test('failed regeneration and changed reference preserve previously approved identity',async()=>{
 const h=molmoHarness();await h.create();await h.statusJob();const saved=structuredClone(h.project.characters[0]);
 h.status('failed');await h.create();await h.statusJob();assert.deepEqual(h.project.characters[0],saved);
 h.project.characters[0].imageUrl+='new';assert.equal(approvedAppearance(h.project.data[0],h.project.characters,h.project.id),null);
});
for(const status of ['failed','cancelled','timeout','deleted'])test('terminal '+status+' stops polling and never saves candidate',async()=>{
 const h=molmoHarness();h.status(status);await h.create();assert.equal((await h.statusJob()).state,'failed');await h.statusJob();assert.equal(h.polls,1);assert.equal(h.project.characters[0].characterIdentity,undefined);
});
test('foreign owner, changed character and invalid confirm cannot write',async()=>{
 const h=molmoHarness();await assert.rejects(h.service.user({subject:'other'},'create',{...h.input,requestKey:crypto.randomUUID()}),/PROJECT_FORBIDDEN/);assert.equal(h.posts,0);
 await h.create();h.project.characters[0].name='Changed';assert.equal((await h.statusJob()).state,'failed');assert.equal(h.project.characters[0].characterIdentity,undefined);
});
test('a fresh explicit click replaces saved appearance only after a valid result commits',async()=>{
 const h=molmoHarness();await h.create();await h.statusJob();const old=h.project.characters[0].characterIdentity;
 h.output('A person wearing a black suit.');await h.create();assert.deepEqual(h.project.characters[0].characterIdentity,old);
 const result=await h.statusJob();assert.equal(result.identity.confirmedId,'person_black_suit');assert.equal(h.posts,2);
});
test('expired image content, superseded request and invalid output never overwrite a saved identity',async()=>{
 for(const reason of ['bytes','superseded','malformed','ambiguous']){
  const h=molmoHarness();await h.create();await h.statusJob();const saved=structuredClone(h.project.characters[0]);
  const next=await h.create();
  if(reason==='bytes')h.image.sha256='b'.repeat(64);
  if(reason==='superseded'){h.image.sha256='b'.repeat(64);await h.create();h.image.sha256='a'.repeat(64);}
  if(reason==='malformed')h.output('bad json');
  if(reason==='ambiguous')h.output({...molmoOutput,subjectStatus:'ambiguous',visualId:''});
  assert.equal((await h.statusJob(next.id)).state,'failed');assert.deepEqual(h.project.characters[0],saved);
 }
});
test('deleted character cannot be restored by a late prediction',async()=>{
 const h=molmoHarness();await h.create();h.project.characters=[];await assert.rejects(h.statusJob(),/CHARACTER_NOT_FOUND/);assert.deepEqual(h.project.characters,[]);
});
test('failed Firestore commit exposes no new identity and status recovery uses same prediction',async()=>{
 const h=molmoHarness();await h.create();await h.statusJob();const old=structuredClone(h.project.characters[0]);await h.create();
 const original=h.store.transact;h.store.transact=(k,p,change)=>original(k,p,(s,project)=>{const out=change(s,project);if(out.characters)throw Error('WRITE_FAILED');return out;});
 await assert.rejects(h.statusJob(),/WRITE_FAILED/);assert.deepEqual(h.project.characters[0],old);
 h.store.transact=original;h.advance(31000);assert.equal((await h.statusJob()).state,'confirmed');assert.equal(h.posts,2);
});
test('plain appearance is normalized locally, description preserved, no guessed or truncated attributes',()=>{
 const text='A bald man with thin glasses, clean-shaven, wearing a black robe and blue tie.';
 assert.deepEqual(parseMolmoOutputs([text]),{status:'detected',visual_id:'bald_man_thin_glasses_clean_shaven_black_robe_blue_tie',visual_description:text});
 assert.equal(normalizeVisualId(' Bald Man--BLACK Robe '),'bald_man_black_robe');
 for(const item of ['', 'No person is visible.', 'A man without a beard.', 'Maybe a man with gray hair.', '{"visualId":"man"}', molmoOutput,'A man '+('black '.repeat(40))])assert.throws(()=>parseMolmoOutputs([item]));
});
test('actual operator screenshot description produces an attribute ID, preserving negation semantics',()=>{
 const text='Short gray hair, no facial hair, no glasses, wearing a burgundy jacket over a white shirt.';
 assert.equal(parseMolmoOutputs([text]).visual_id,'short_gray_hair_clean_shaven_burgundy_jacket_white_shirt');
 assert.equal(parseMolmoOutputs(['Bald, clean-shaven, glasses, in black robe over white shirt.']).visual_id,'bald_clean_shaven_glasses_black_robe_white_shirt');
 assert.equal(parseMolmoOutputs(['A man without glasses wearing a black robe.']).visual_id,'man_black_robe');
});
test('long existing import Character IDs are accepted unchanged',async()=>{
 const h=molmoHarness(),id='char_'+Array(70).fill('61').join('_');h.project.characters[0].id=id;
 const result=await h.service.user(h.session,'create',{projectId:h.input.projectId,characterId:id,requestKey:crypto.randomUUID()});
 assert.equal(result.characterId,id);assert.equal(h.posts,1);
});
test('old failed normalization recovers the existing prediction without a paid resubmit',async()=>{
 const h=molmoHarness(),job=await h.create();
 Object.assign(h.state.jobs[job.id],{state:'failed',error:'VISUAL_OUTPUT_UNSUPPORTED'});
 h.output('Short gray hair, no facial hair, no glasses, wearing a burgundy jacket over a white shirt.');
 assert.equal((await h.statusJob()).state,'running');
 assert.equal((await h.statusJob()).identity.confirmedId,'short_gray_hair_clean_shaven_burgundy_jacket_white_shirt');assert.equal(h.posts,1);
});
test('recovery of still invalid output is bounded and keeps saved ID',async()=>{
 const h=molmoHarness(),job=await h.create();Object.assign(h.state.jobs[job.id],{state:'failed',error:'VISUAL_OUTPUT_UNSUPPORTED'});h.output('Unknown');
 await h.statusJob();await h.statusJob();const polls=h.polls;assert.equal((await h.statusJob()).state,'failed');assert.equal(h.polls,polls);assert.equal(h.posts,1);
});
test('manual edit persists across reload, updates scene prompt and supersedes pending inference without a provider call',async()=>{
 const h=molmoHarness();await h.create();await h.statusJob();const before=structuredClone(h.project),old=h.project.characters[0].characterIdentity;
 const pending=await h.create(),posts=h.posts;
 const result=await h.service.user(h.session,'edit',{...h.input,expectedJobId:old.jobId,visualId:'Bald Man, Glasses Black Robe'});
 assert.equal(result.identity.confirmedId,'bald_man_glasses_black_robe');assert.equal(h.posts,posts);
 assert.deepEqual(h.project.data,before.data);
 const refreshed=JSON.parse(JSON.stringify(h.project));
 assert.equal(approvedAppearance(refreshed.data[0],refreshed.characters,refreshed.id).visualId,result.identity.confirmedId);
 assert.ok(!approvedAppearance(refreshed.data[0],refreshed.characters,refreshed.id).visualDescription.includes('hair'));
 await h.statusJob(pending.id);assert.equal(h.project.characters[0].characterIdentity.jobId,result.identity.jobId);
 assert.equal((await h.statusJob()).identity.confirmedId,result.identity.confirmedId);
 await assert.rejects(h.service.user(h.session,'edit',{...h.input,expectedJobId:old.jobId,visualId:'another_id'}),/CHARACTER_CHANGED/);
 assert.deepEqual(h.project.characters[0].imageUrl,before.characters[0].imageUrl);
});
test('late provider completion cannot overwrite a concurrent manual transaction',async()=>{
 const h=molmoHarness();await h.create();await h.statusJob();const old=h.project.characters[0].characterIdentity;await h.create();
 const original=h.store.transact;let edited=false;
 h.store.transact=async(k,p,fn)=>{if(!edited){edited=true;await h.service.user(h.session,'edit',{...h.input,expectedJobId:old.jobId,visualId:'man_blue_tie'});}return original(k,p,fn);};
 await h.statusJob();assert.equal(h.project.characters[0].characterIdentity.confirmedId,'man_blue_tie');
});
test('controller stops bounded polling, unlocks on failure and resume never posts a prediction',async()=>{
 let time=0;const states=[],actions=[];
 const controller=createMolmoController({projectId:'proj_client',characterId:'judge_1',getToken:async()=>'mock',now:()=>time,sleep:async()=>{time+=310000;},onChange:s=>states.push(s),fetchImpl:async(url)=>{
  actions.push(url);return new Response(JSON.stringify({id:'a'.repeat(64),projectId:'proj_client',characterId:'judge_1',state:'running'}));
 }});
 await controller.resume();assert.equal(states.at(-1).busy,false);assert.equal(states.at(-1).status,'error');assert.ok(actions.every(x=>x.endsWith('molmo_status')));
 await controller.submit();assert.equal(actions.filter(x=>x.endsWith('molmo_create')).length,1);assert.equal(states.at(-1).busy,false);
});
test('gateway reads the current selected character image, not client supplied imagery',async()=>{
 const h=molmoHarness(),images=[],submissions=[];
 h.project.characters.push({id:'second',name:'Second',imageUrl:'https://media.example.org/second.png'});
 const service=molmoService({store:h.store,issuer,readImage:async c=>{images.push(c.imageUrl);return {url:c.imageUrl,sha256:'b'.repeat(64)};},provider:{submit:async url=>{submissions.push(url);return{id:'mock'};}}});
 await service.user(h.session,'create',{projectId:h.input.projectId,characterId:'second',requestKey:crypto.randomUUID()});
 assert.deepEqual(images,['https://media.example.org/second.png']);assert.deepEqual(submissions,images);
 await assert.rejects(service.user(h.session,'create',{...h.input,requestKey:crypto.randomUUID(),imageUrl:'https://wrong.example.org'}),/INVALID_REQUEST/);
});
