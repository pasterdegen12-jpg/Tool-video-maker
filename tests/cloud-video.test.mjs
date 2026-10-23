import test from 'node:test';
import assert from 'node:assert/strict';
import {completedSceneData} from '../api/_lib/cloud-video/publish.js';
import {createCloudVideoService,readCloudBody} from '../api/_lib/cloud-video/service.js';
import {createVideoHandler} from '../api/video.js';
import {newLedger,ownerOf,CloudError,hash,declaration} from '../api/_lib/cloud-video/core.js';
import {createCloudUpload} from '../api/_lib/cloud-video/upload.js';
import {DEFAULT_SETTINGS} from '../src/lib/seedanceContract.js';
import {readSceneDuration} from '../src/lib/sceneDuration.js';

// All provider/storage doubles in this file are synthetic automated tests.
const session={subject:'user_owner',session:'sess_one'},other={subject:'user_other',session:'sess_two'};
const config={issuer:'https://clerk.example.org',paidEnabled:true,origin:'https://www.aivideomaker.live',limits:{concurrent:1,daily:500000,perRequest:500000}};
config.teamLimits={...config.limits};
const scene={scene_n:3,duration_seconds:5,Character:'confirmed_character_id',Voiceover:'Exact original words.',Action:'Sits.',Camera:'Static.',Context:'Court.',videoUrl:'https://media.example.org/old.mp4'};
function harness(overrides={}){
  const projects={proj_test:{projectType:'full-ai',data:[structuredClone(scene)],characters:[]}},ledgers=new Map();let team=newLedger();let clock=Date.parse('2026-10-17T00:00:00Z'),tail=Promise.resolve(),posts=0,gets=0,tickets=0;

  const store={
    async project(owner,id){if(owner!==ownerOf(session,config.issuer)||id!=='proj_test')throw new CloudError('PROJECT_FORBIDDEN',403);return structuredClone(projects[id]);},
    async publishVideo(owner,record){await this.project(owner,record.projectId);const data=completedSceneData(projects[record.projectId],record);if(data)projects[record.projectId].data=data;},
    async read(owner){return structuredClone(ledgers.get(owner)||newLedger());},
    transact(owner,change){const work=tail.then(()=>{const draft=structuredClone(ledgers.get(owner)||newLedger()),teamDraft=structuredClone(team),value=change(draft,teamDraft);ledgers.set(owner,draft);team=teamDraft;return structuredClone(value);});tail=work.catch(()=>{});return work;},
  };
  const upload={ticket:async()=>{tickets++;return {download_url:'https://storage.example.org/image.jpg',upload:{method:'PUT',url:'https://storage.example.org/signed',headers:{'Content-Type':'image/jpeg','If-None-Match':'*'},expires_at:new Date(clock+600000).toISOString()}};},verify:async()=>true,...overrides.upload};
  const provider={submit:async(_p,accepted)=>{posts++;await accepted('prediction_one');return {id:'prediction_one',state:'queued',url:null};},get:async()=>{gets++;return {id:'prediction_one',state:'completed',url:'https://storage.example.org/result.mp4'};},...overrides.provider};
  const options={config:{...config,...overrides.config},store,upload,provider,archive:async()=> 'https://media.example.org/persisted.mp4',now:()=>clock,...overrides.options};
  const service=()=>createCloudVideoService(options);
  const input={project_id:'proj_test',scene_id:3,settings:{...DEFAULT_SETTINGS},assumptions:{wordsPerMinute:150,pauseSeconds:.8},image:{sha256:'a'.repeat(64),size:1234,mime:'image/jpeg',width:100,height:100}};
  const ledger=()=>ledgers.get(ownerOf(session,config.issuer));
  async function ready(s=service()){
    const quote=await s.quote(session,input);await s.ticket(session,{quote_id:quote.quote_id,request_hash:quote.request_hash,transfer_consent:true});await s.verify(session,{attempt_id:quote.quote_id,request_hash:quote.request_hash});
    return {s,quote,body:{attempt_id:quote.quote_id,request_hash:quote.request_hash,confirm:true,cost_micro_usd:quote.cost.microUsd}};
  }
  return {service,ready,input,ledger,projects,options,setTeam:value=>{team=structuredClone(value);},team:()=>structuredClone(team),advance:n=>clock+=n,calls:()=>({posts,gets,tickets})};
}
test('cloud quote uses saved Character, exact legacy dialogue and preserves complete scene',async()=>{
  const h=harness(),before=structuredClone(h.projects),q=await h.service().quote(session,h.input);
  assert.match(q.prompt,/CHARACTER:\nconfirmed_character_id/);assert.match(q.prompt,/Exact original words\./);assert.equal(q.cost.usd,'0.1200');assert.deepEqual(h.projects,before);assert.equal(h.calls().posts,0);
});
test('client-created prompt/scene/price and wrong project cannot be quoted',async()=>{
  const h=harness();for(const extra of [{prompt:'injected'},{scene:{Dialogue:'changed'}},{cost:1}])await assert.rejects(h.service().quote(session,{...h.input,...extra}),/INVALID_REQUEST/);
  await assert.rejects(h.service().quote(session,{...h.input,project_id:'proj_other'}),/PROJECT_FORBIDDEN/);
});
test('other user cannot quote, list, recover or submit owner records',async()=>{
  const h=harness(),{s,quote,body}=await h.ready();
  await assert.rejects(s.quote(other,h.input),/PROJECT_FORBIDDEN/);await assert.rejects(s.list(other,h.input),/PROJECT_FORBIDDEN/);await assert.rejects(s.poll(other,quote.quote_id),/NOT_FOUND/);await assert.rejects(s.submit(other,body),/NOT_FOUND/);assert.equal(h.calls().posts,0);
});
test('paid disabled denies before POST; missing consent denies before ticket',async()=>{
  const h=harness({config:{paidEnabled:false}}),q=await h.service().quote(session,h.input);
  await assert.rejects(h.service().ticket(session,{quote_id:q.quote_id,request_hash:q.request_hash,transfer_consent:false}),/INVALID_REQUEST/);
  const {s,body}=await h.ready();await assert.rejects(s.submit(session,body),/PAID_DISABLED/);assert.equal(h.calls().posts,0);
});
test('quote/session/hash/cost binding fail closed',async()=>{
  for(const [kind,mutate]of [['COST_MISMATCH',b=>({...b,cost_micro_usd:1})],['QUOTE_MISMATCH',b=>({...b,request_hash:'0'.repeat(64)})],['INVALID_REQUEST',b=>({...b,confirm:false})]]){
    const h=harness(),{s,body}=await h.ready();await assert.rejects(s.submit(session,mutate(body)),new RegExp(kind));assert.equal(h.calls().posts,0);
  }
  const h=harness(),{s,body}=await h.ready();await assert.rejects(s.submit({...session,session:'sess_new'},body),/SESSION_MISMATCH/);
  h.advance(120001);await assert.rejects(s.submit(session,body),/QUOTE_EXPIRED/);
});
test('source mutation invalidates quote, without rewriting original scene',async()=>{
  const h=harness(),{s,body}=await h.ready();h.projects.proj_test.data[0].Camera='Changed';await assert.rejects(s.submit(session,body),/PROJECT_CHANGED/);assert.equal(h.calls().posts,0);
});
test('ticket single use and signed URL never stored in ledger',async()=>{
  const h=harness(),s=h.service(),q=await s.quote(session,h.input),body={quote_id:q.quote_id,request_hash:q.request_hash,transfer_consent:true};await s.ticket(session,body);await assert.rejects(s.ticket(session,body),/ALREADY_USED/);assert.equal(h.calls().tickets,1);assert.ok(!JSON.stringify(h.ledger()).includes('/signed'));
});
test('failed hash verification never reaches prediction',async()=>{
  const h=harness({upload:{verify:async()=>{throw new CloudError('IMAGE_HASH_MISMATCH');}}}),s=h.service(),q=await s.quote(session,h.input);
  await s.ticket(session,{quote_id:q.quote_id,request_hash:q.request_hash,transfer_consent:true});await assert.rejects(s.verify(session,{attempt_id:q.quote_id,request_hash:q.request_hash}),/IMAGE_HASH_MISMATCH/);assert.equal(h.ledger().records[q.quote_id].stage,'FAILED');assert.equal(h.calls().posts,0);
});
test('two simultaneous submits across cold services produce exactly one provider POST',async()=>{
  const h=harness(),{body}=await h.ready();const r=await Promise.allSettled([h.service().submit(session,body),h.service().submit(session,body)]);
  assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(h.calls().posts,1);assert.equal(h.ledger().records[body.attempt_id].predictionId,'prediction_one');
});
test('cold-start polling archives output and refresh recovers without POST or screenplay mutation',async()=>{
  const h=harness(),before=structuredClone(h.projects),{s,body}=await h.ready();await s.submit(session,body);const result=await h.service().poll({...session,session:'sess_new'},body.attempt_id);
  assert.equal(result.state,'completed');assert.equal(result.video_url,'https://media.example.org/persisted.mp4');assert.equal((await h.service().list(session,h.input)).attempts[0].job_id,body.attempt_id);await h.service().poll(session,body.attempt_id);assert.equal(h.calls().posts,1);assert.equal(h.calls().gets,1);const saved=h.projects.proj_test.data[0];assert.equal(saved.videoUrl,'https://media.example.org/persisted.mp4');assert.equal(saved.videoJob.id,body.attempt_id);assert.deepEqual(saved.videoHistory,[{url:before.proj_test.data[0].videoUrl}]);for(const field of ['Character','Voiceover','Action','Camera','Context'])assert.equal(saved[field],before.proj_test.data[0][field]);
});
test('crash after durable SUBMITTING is ambiguous and never auto-retried',async()=>{
  let count=0;const h=harness({provider:{submit:async()=>{count++;throw Error('connection lost');}}}),{s,body}=await h.ready();
  assert.equal((await s.submit(session,body)).state,'admission_unknown');assert.equal((await h.service().poll(session,body.attempt_id)).state,'admission_unknown');await assert.rejects(h.service().quote(session,h.input),/UNRESOLVED_ATTEMPT/);await assert.rejects(s.submit(session,body),/NOT_READY/);assert.equal(count,1);
});
test('crash after accepted ID persists ID and cold-start GET recovers it',async()=>{
  let count=0;const h=harness({provider:{submit:async(_p,accepted)=>{count++;await accepted('prediction_one');throw Error('bad response');}}}),{s,body}=await h.ready();await s.submit(session,body);assert.equal(h.ledger().records[body.attempt_id].predictionId,'prediction_one');assert.equal((await h.service().poll(session,body.attempt_id)).state,'completed');assert.equal(count,1);
});
test('commit failure before provider submit results in zero POST',async()=>{
  const h=harness(),{s,body}=await h.ready();const original=h.options.store.transact;h.options.store.transact=async(owner,fn)=>original(owner,(l,team)=>{fn(l,team);throw new Error('durable unavailable');});await assert.rejects(s.submit(session,body),/durable unavailable/);assert.equal(h.calls().posts,0);
});
test('spend/concurrency reservations are durable and conservative',async()=>{
  const h=harness({config:{limits:{concurrent:1,daily:100000,perRequest:500000}}});await assert.rejects(h.service().quote(session,h.input),/SPENDING_LIMIT/);assert.equal(h.calls().posts,0);assert.equal(h.calls().tickets,0);
});
test('full admission stays at 25 MiB and 24 MP; request contains declaration only',()=>{
  assert.equal(declaration({sha256:'a'.repeat(64),size:25*1024*1024,mime:'image/png',width:6000,height:4000}).size,25*1024*1024);
  assert.throws(()=>declaration({sha256:'a'.repeat(64),size:25*1024*1024+1,mime:'image/png',width:6000,height:4000}));
});
test('body over 16 KB is rejected before service; no base64 request route',async()=>{
  await assert.rejects(readCloudBody({body:{image_base64:'a'.repeat(20000)}}),/BODY_TOO_LARGE/);
});
test('real upload transport uses fixed ticket endpoint, requires immutable PUT and rejects expired ticket',async()=>{
  const calls=[],now=Date.parse('2026-10-17');const image={size:100,mime:'image/jpeg'};
  const ticket={type:'image',filename:'reference.jpg',size:100,download_url:'https://storage.example.org/a.jpg',upload:{method:'PUT',url:'https://storage.example.org/signed',headers:{'Content-Type':'image/jpeg','If-None-Match':'*'},expires_at:new Date(now+10000).toISOString()}};
  const upload=createCloudUpload('server-secret',{now:()=>now,checkUrl:async()=>{},request:async(url,options)=>{calls.push({url,options});return {status:200,body:JSON.stringify({code:200,data:ticket})};}});
  await upload.ticket(image);assert.equal(calls[0].url,'https://api.wavespeed.ai/api/v3/media/uploads');assert.equal(JSON.parse(calls[0].options.body).size,100);
  ticket.upload.expires_at=new Date(now-1).toISOString();await assert.rejects(upload.ticket(image));ticket.upload.expires_at=new Date(now+10000).toISOString();delete ticket.upload.headers['If-None-Match'];await assert.rejects(upload.ticket(image),/UPLOAD_NOT_IMMUTABLE/);
});
test('invalid Clerk auth rejects handler before creating service or leaking config',async()=>{
  let called=false,body='';const handler=createVideoHandler({configure:()=>({...config,apiKey:'server-secret'}),authenticate:async()=>{throw new CloudError('UNAUTHORIZED',401);},createService:()=>{called=true;}});
  const res={setHeader(){},end(v){body=v;}};await handler({url:'/api/video?action=quote',method:'POST',headers:{}},res);assert.equal(res.statusCode,401);assert.equal(called,false);assert.ok(!body.includes('server-secret'));
});
test('binary hash uses original bytes rather than JSON serialization',()=>{assert.equal(hash(new Uint8Array([97,98,99])),hash('abc'));});

test('team concurrency and budget reservations block another member before provider POST',async()=>{
 for(const mode of ['concurrent','budget']){const h=harness(),{s,body}=await h.ready();const team=newLedger();if(mode==='concurrent')team.records.other={id:'other',stage:'UNKNOWN',owner:'another-member'};else team.spend['2026-10-17']=499999;h.setTeam(team);await assert.rejects(s.submit(session,body),mode==='concurrent'?/CONCURRENCY_LIMIT/:/SPENDING_LIMIT/);assert.equal(h.calls().posts,0);assert.deepEqual(h.ledger().spend,{});}
});
test('completed video updates shared team state and retains daily cost reservation',async()=>{const h=harness(),{s,body}=await h.ready();await s.submit(session,body);assert.equal(h.team().records[body.attempt_id].stage,'ACCEPTED');await s.poll(session,body.attempt_id);assert.equal(h.team().records[body.attempt_id].stage,'COMPLETED');assert.equal(h.team().spend['2026-10-17'],120000);});

test('legitimate project media and another scene edit do not revoke grant or change selected attempt',async()=>{
 const h=harness(),{s,body}=await h.ready();h.projects.proj_test.generatedAudios={3:'new.mp3'};h.projects.proj_test.data[0].videoUrl='https://media.example.org/new.mp4';h.projects.proj_test.data.push({scene_n:9,Dialogue:'Other scene edit.'});
 await s.submit(session,body);assert.equal(h.calls().posts,1);
});
test('editing selected prompt or INPUT invalidates only old quote; fresh quote uses new canonical source',async()=>{
 for(const field of ['Dialogue','Character','startFrameUrl']){const h=harness(),{s,body}=await h.ready();if(field==='Dialogue'){delete h.projects.proj_test.data[0].Voiceover;h.projects.proj_test.data[0].Dialogue='New words.';}else h.projects.proj_test.data[0][field]=field==='startFrameUrl'?'https://media.example.org/new.png':'new_confirmed_character';
 await assert.rejects(s.submit(session,body),/PROJECT_CHANGED/);assert.equal(h.calls().posts,0);await s.quote(session,h.input);}
});
test('actual Scene 1 twelve-second speech is accepted; longer than provider limit is rejected without truncation',async()=>{
 const h=harness();h.projects.proj_test.data[0].Voiceover='Let me get this straight. Your school board spent thousands of taxpayer dollars on legal fees... to prosecute a cafeteria worker over thirty-five dollars worth of chicken nuggets?';
 h.projects.proj_test.data[0].duration_seconds=12;
 const q=await h.service().quote(session,{...h.input,settings:{...h.input.settings,duration:12}});assert.equal(q.cost.usd,'0.2880');assert.ok(q.prompt.includes(h.projects.proj_test.data[0].Voiceover));
 await assert.rejects(h.service().quote(session,h.input),/SCENE_DURATION_MISMATCH/);assert.equal(h.calls().posts,0);
});
test('source endpoint rejects browser-supplied URL and wrong project before fetching image',async()=>{
 let reads=0;const h=harness({options:{sourceImage:async()=>{reads++;return {};}}});
 await assert.rejects(h.service().source(session,{project_id:'proj_test',scene_id:3,url:'http://127.0.0.1'}),/INVALID_REQUEST/);
 await assert.rejects(h.service().source(other,{project_id:'proj_test',scene_id:3}),/PROJECT_FORBIDDEN/);assert.equal(reads,0);
});
test('stored image declaration must match independently validated canonical bytes',async()=>{
 const h=harness({options:{sourceImage:async()=>({image:{mime:'image/jpeg',size:1,sha256:'b'.repeat(64),width:32,height:32}})}});
 await assert.rejects(h.service().quote(session,{...h.input,stored_image:true}),/SOURCE_IMAGE_CHANGED/);assert.equal(h.calls().posts,0);assert.equal(h.calls().tickets,0);
});

// New modal contract; provider calls below remain test doubles.
test('Text mode reaches its own provider without image ticket/verification',async()=>{
 let captured;const h=harness({provider:{submit:async(p,accepted,model)=>{captured={p,model};await accepted('text_prediction');return {id:'text_prediction',state:'queued'};}}});h.advance(2*86400000);
 const input={...h.input,mode:'text_to_video',additional_prompt:'Warm natural light.',attempt_key:'a'.repeat(36)};delete input.image;
 const before=structuredClone(h.projects),s=h.service(),q=await s.quote(session,input);
 assert.equal(q.model,'bytedance/seedance-v1.5-pro/text-to-video');assert.equal(q.image_sha256,null);assert.match(q.prompt,/Exact original words/);assert.ok(q.prompt.endsWith('Warm natural light.'));
 await s.submit(session,{attempt_id:q.quote_id,request_hash:q.request_hash,confirm:true,cost_micro_usd:q.cost.microUsd});
 assert.equal(captured.model,q.model);assert.equal(captured.p.image,undefined);assert.equal(captured.p.aspect_ratio,input.settings.aspect_ratio);assert.deepEqual(h.projects,before);assert.equal(h.calls().tickets,0);
});
test('References mode requires ordered verified images and submits reference_images to Mini, never I2V',async()=>{
 let captured;const h=harness({provider:{submit:async(p,accepted,model)=>{captured={p,model};await accepted('ref_prediction');return {id:'ref_prediction',state:'queued'};}}});h.advance(2*86400000);
 const input={...h.input,mode:'references_to_video',additional_prompt:'@Image 1 is the room; @Image 2 is the character.',images:[h.input.image,{...h.input.image,sha256:'b'.repeat(64)}]};delete input.image;
 const s=h.service(),q=await s.quote(session,input),body={attempt_id:q.quote_id,request_hash:q.request_hash,confirm:true,cost_micro_usd:q.cost.microUsd};
 await assert.rejects(s.submit(session,body),/NOT_READY/);
 await assert.rejects(s.ticket(session,{quote_id:q.quote_id,request_hash:q.request_hash,transfer_consent:true,image_index:1}),/INVALID_IMAGE_INDEX/);
 for(let i=0;i<2;i++){await s.ticket(session,{quote_id:q.quote_id,request_hash:q.request_hash,transfer_consent:true,image_index:i});const verified=await s.verify(session,{attempt_id:q.quote_id,request_hash:q.request_hash,image_index:i});assert.equal(verified.image_sha256,input.images[i].sha256);if(i===0)await assert.rejects(s.submit(session,body),/NOT_READY/);}
 await Promise.allSettled([s.submit(session,body),s.submit(session,body)]);
 assert.equal(captured.model,'bytedance/seedance-2.0-mini/text-to-video');assert.equal(captured.p.reference_images.length,2);assert.equal(captured.p.image,undefined);assert.equal(captured.p.camera_fixed,undefined);assert.equal(captured.p.seed,undefined);assert.equal(captured.p.enable_web_search,false);
 assert.equal(h.ledger().records[q.quote_id].stage,'ACCEPTED');assert.equal(h.ledger().records[q.quote_id].images[1].sha256,'b'.repeat(64));
});
test('mode/options/custom text affect idempotency; no authored source mutation',async()=>{
 const h=harness();h.advance(2*86400000);const s=h.service(),before=structuredClone(h.projects),base={...h.input,mode:'start_frame_to_video'};
 const a=await s.quote(session,base),b=await s.quote(session,{...base,additional_prompt:'Warm light.'}),c=await s.quote(session,{...base,settings:{...base.settings,aspect_ratio:'9:16'}});
 assert.notEqual(a.request_hash,b.request_hash);assert.notEqual(a.request_hash,c.request_hash);assert.deepEqual(h.projects,before);
 for(const changes of [{mode:'invented_mode'},{mode:''},{mode:null},{additional_prompt:false},{additional_prompt:0},{settings:{...base.settings,resolution:'4k'}},{additional_prompt:'x'.repeat(1001)},{images:[base.image]}])await assert.rejects(s.quote(session,{...base,...changes}));
});
test('current per-request ceiling still rejects high cost before image transfer or prediction; no invented daily limit',async()=>{
 const h=harness({config:{limits:{concurrent:1,daily:0,perRequest:500000},teamLimits:{concurrent:1,daily:0,perRequest:500000}}});h.advance(2*86400000);
 await assert.rejects(h.service().quote(session,{...h.input,mode:'start_frame_to_video',settings:{...h.input.settings,resolution:'1080p',duration:5}}),/SPENDING_LIMIT/);assert.deepEqual(h.calls(),{posts:0,gets:0,tickets:0});
});

test('missing duration_seconds quotes with estimated duration; changing saved duration invalidates attempt',async()=>{
 const missing=harness();delete missing.projects.proj_test.data[0].duration_seconds;
 const expected=readSceneDuration(missing.projects.proj_test.data[0],12);
 const q=await missing.service().quote(session,{...missing.input,settings:{...missing.input.settings,duration:expected}});
 assert.equal(q.settings.duration,expected);assert.equal(missing.calls().posts,0);
 const h=harness(),{s,body}=await h.ready();h.projects.proj_test.data[0].duration_seconds=6;await assert.rejects(s.submit(session,body),/PROJECT_CHANGED/);assert.equal(h.calls().posts,0);
});

test('authenticated user not on allowlist can access video handler without TEAM_FORBIDDEN',async()=>{
 let called=false;
 const teamConfig={...config,allowedOwners:['other-hash-only'],apiKey:'server-secret'};
 const handler=createVideoHandler({
  configure:()=>teamConfig,
  authenticate:async()=>session,
  createService:()=>({
   quote:async()=>{called=true;return {quote_id:'q1'};}
  })
 });
 const res={statusCode:200,setHeader(){},end(){}};
 await handler({url:'/api/video?action=quote',method:'POST',headers:{},body:{}},res);
 assert.equal(res.statusCode,200);
 assert.equal(called,true);
});

test('cloudConfig does not require MEDIA_ALLOWED_OWNER_HASHES to be present',async()=>{
 const {cloudConfig}=await import('../api/_lib/cloud-video/config.js');
 const env={
  CLOUD_VIDEO_ENABLED:'true',
  VIDEO_WEB_ORIGIN:'https://www.aivideomaker.live',
  CLERK_ISSUER:'https://clerk.example.org',
  CLERK_JWT_KEY:'-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0\n-----END PUBLIC KEY-----',
  WAVESPEED_VIDEO_API_KEY:'test-api-key',
  CLOUD_VIDEO_PAID_ENABLED:'true',
 };
 const cfg=cloudConfig(env);
 assert.equal(cfg.origin,'https://www.aivideomaker.live');
 assert.equal(cfg.apiKey,'test-api-key');
 assert.deepEqual(cfg.allowedOwners,[]);
});



test('canonical Camera reaches actual provider submit despite stale false client setting',async()=>{
 let payload;const h=harness({provider:{submit:async(p,accepted)=>{payload=p;await accepted('camera_test');return{id:'camera_test',state:'queued'};}}});
 h.projects.proj_test.data[0].Camera='Máy quay cố định. Không di chuyển máy quay.';const before=structuredClone(h.projects);
 const {s,quote,body}=await h.ready();assert.equal(quote.settings.camera_fixed,true);assert.equal(payload,undefined);
 await s.submit(session,body);assert.equal(payload.camera_fixed,true);assert.equal(payload.duration,quote.settings.duration);assert.equal(payload.prompt,quote.prompt);assert.deepEqual(h.projects,before);
});

test('real service submit boundary sends one spoken block, no translation and exact durable quote',async()=>{
 let payload;const h=harness({provider:{submit:async(p,accepted)=>{payload=p;await accepted('subtitle_mock');return{id:'subtitle_mock',state:'queued'};}}});
 h.projects.proj_test.data[0].Translate='Bản dịch chỉ dành cho trình biên tập.';
 const before=structuredClone(h.projects),{s,quote,body}=await h.ready();assert.equal(payload,undefined);
 await s.submit(session,body);assert.equal(payload.prompt,quote.prompt);assert.equal(payload.prompt,h.ledger().records[quote.quote_id].prompt);
 assert.equal(payload.prompt.split('Exact original words.').length-1,1);assert.ok(payload.prompt.includes('SPOKEN AUDIO'));assert.ok(payload.prompt.includes('No dialogue captions'));assert.ok(!payload.prompt.includes('Bản dịch'));
 assert.equal(payload.generate_audio,true);assert.equal(payload.duration,quote.settings.duration);assert.deepEqual(h.projects,before);
});
