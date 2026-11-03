import test from 'node:test';import assert from 'node:assert/strict';
import {molmoService} from '../api/_lib/molmo/service.js';
import {parseMolmoOutputs} from '../api/_lib/molmo/output.js';
import {molmoProvider} from '../api/_lib/molmo/provider.js';
import {MOLMO_MODEL,VISION_PROMPT} from '../api/_lib/molmo/prompt.js';
import {approvedAppearance} from '../src/lib/visualProfile.js';
import {composeVideoPrompt} from '../src/lib/cloudVideoOptions.js';
import {reconcileCharacterScenes} from '../src/lib/characterIdentity.js';
export const molmoOutput={subjectStatus:'clear',visualId:'person_short_black_hair_black_suit',visualDescription:'A person with short black hair wearing a black suit.',hair:'Short black hair',facialHair:'',clothing:'Black suit',accessories:[]};
const session={subject:'test',session:'mock'},issuer='https://clerk.example.org';
export function molmoHarness(){
 let clock=100000,state={jobs:{}},project={id:'proj_molmo',projectType:'full-ai',ownerId:'test',characters:[{id:'judge_1',name:'Judge',imageUrl:'https://media.example.org/project_proj_molmo/judge.jpg',voiceId:'voice_unchanged'}],data:[{scene_n:1,Character:'judge_1',Dialogue:'Exact words.',Camera:'Fixed.',Action:'Sits.',Context:'Court.',duration_seconds:4,videoUrl:'https://media.example.org/old.mp4'}]},chain=Promise.resolve(),posts=0,polls=0,fail=false,status='completed',output=molmoOutput;
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
 assert.deepEqual(JSON.parse(calls[0].options.body),{images:['https://media.example.org/profile.jpg'],text:VISION_PROMPT});assert.match(VISION_PROMPT,/Do not infer ethnicity/);
 await assert.rejects(molmoProvider('fake-test-key',async()=>({status:200,body:'{"data":{}}'})).submit('https://example.org/a'),/MOLMO_RESPONSE_INVALID/);
});
test('valid JSON/object/fenced JSON and deterministic punctuation normalization',()=>{
 for(const item of [molmoOutput,JSON.stringify(molmoOutput),'```json\n'+JSON.stringify(molmoOutput)+'\n```'])assert.equal(parseMolmoOutputs([item]).visual_id,molmoOutput.visualId);
 assert.equal(parseMolmoOutputs([{...molmoOutput,visualId:'Short Black Hair, Black Suit'}]).visual_id,'short_black_hair_black_suit');
});
test('malformed/plain text/missing attributes/unsupported identification never fabricated',()=>{
 for(const item of ['black hair','{"visualId":}',{...molmoOutput,accessories:'Glasses'},{...molmoOutput,visualId:'á_name'},{...molmoOutput,clothing:'',hair:''},{...molmoOutput,visualDescription:'His real name is John Smith.'},{...molmoOutput,extra:true}])assert.throws(()=>parseMolmoOutputs([item]));
});
for(const subjectStatus of ['ambiguous','no_subject'])test(subjectStatus+' yields no approvable ID',()=>assert.equal(parseMolmoOutputs([{...molmoOutput,subjectStatus,visualId:''}]).visual_id,''));
test('duplicate clicks across sessions create one prediction; resume polls only',async()=>{
 const h=molmoHarness(),jobs=await Promise.all([h.create(),h.create(),h.create()]);assert.equal(h.posts,1);assert.equal(new Set(jobs.map(j=>j.id)).size,1);
 const j=await h.statusJob();assert.equal(j.state,'proposal_ready');assert.equal(h.posts,1);assert.equal(h.polls,1);assert.ok(j.predictionId);
});
test('uncertain submit and crashed reservation are never automatically recharged',async()=>{
 const h=molmoHarness();h.fail(true);const first=await h.create();assert.equal(first.state,'unknown');await h.create();await h.statusJob();assert.equal(h.posts,1);
});
test('approval persists only character overlay; reload resolves every scene without remapping',async()=>{
 const h=molmoHarness(),before=structuredClone(h.project);await h.create();const j=await h.statusJob();assert.deepEqual(h.project,before);await h.confirm(j);
 assert.deepEqual(h.project.data,before.data);assert.equal(h.project.characters[0].id,'judge_1');assert.equal(h.project.characters[0].voiceId,'voice_unchanged');
 const p=JSON.parse(JSON.stringify(h.project)),appearance=approvedAppearance(p.data[0],p.characters,p.id);
 assert.equal(appearance.visualId,molmoOutput.visualId);assert.ok(composeVideoPrompt(p.data[0],'',appearance).prompt.includes(molmoOutput.visualId));assert.deepEqual(reconcileCharacterScenes(p.data,p.characters,p.id),p.data);
});
test('failed regeneration and changed reference preserve previously approved identity',async()=>{
 const h=molmoHarness();await h.create();await h.confirm(await h.statusJob());const saved=structuredClone(h.project.characters[0]);
 h.status('failed');await h.create();await h.statusJob();assert.deepEqual(h.project.characters[0],saved);
 h.project.characters[0].imageUrl+='new';assert.equal(approvedAppearance(h.project.data[0],h.project.characters,h.project.id),null);
});
for(const status of ['failed','cancelled','timeout','deleted'])test('terminal '+status+' stops polling and never saves candidate',async()=>{
 const h=molmoHarness();h.status(status);await h.create();assert.equal((await h.statusJob()).state,'failed');await h.statusJob();assert.equal(h.polls,1);assert.equal(h.project.characters[0].characterIdentity,undefined);
});
test('foreign owner, changed character and invalid confirm cannot write',async()=>{
 const h=molmoHarness();await assert.rejects(h.service.user({subject:'other'},'create',{...h.input,requestKey:crypto.randomUUID()}),/PROJECT_FORBIDDEN/);assert.equal(h.posts,0);
 await h.create();const j=await h.statusJob();h.project.characters[0].name='Changed';await assert.rejects(h.confirm(j),/CHARACTER_CHANGED/);assert.equal(h.project.characters[0].characterIdentity,undefined);
});
