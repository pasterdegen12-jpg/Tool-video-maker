import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudVideoService,readCloudBody} from '../api/_lib/cloud-video/service.js';
import {createVideoHandler} from '../api/video.js';
import {newLedger,ownerOf,sourceDigest,CloudError,hash,declaration} from '../api/_lib/cloud-video/core.js';
import {createCloudUpload} from '../api/_lib/cloud-video/upload.js';
import {DEFAULT_SETTINGS} from '../src/lib/seedanceContract.js';

// All provider/storage doubles in this file are synthetic automated tests.
const session={subject:'user_owner',session:'sess_one'},other={subject:'user_other',session:'sess_two'};
const config={issuer:'https://clerk.example.org',paidEnabled:true,origin:'https://www.aivideomaker.live',limits:{concurrent:1,daily:500000,perRequest:500000}};
config.teamLimits={...config.limits};
const scene={scene_n:3,Character:'confirmed_character_id',Voiceover:'Exact original words.',Action:'Sits.',Camera:'Static.',Context:'Court.',videoUrl:'https://media.example.org/old.mp4'};
function harness(overrides={}){
  const projects={proj_test:{projectType:'full-ai',data:[structuredClone(scene)],characters:[]}},ledgers=new Map();let team=newLedger();let clock=Date.parse('2026-10-17T00:00:00Z'),tail=Promise.resolve(),posts=0,gets=0,tickets=0;
  const grant=sourceDigest(projects.proj_test);
  const store={
    async project(owner,id,verify=true){if(owner!==ownerOf(session,config.issuer)||id!=='proj_test')throw new CloudError('PROJECT_FORBIDDEN',403);if(verify&&sourceDigest(projects[id])!==grant)throw new CloudError('PROJECT_CHANGED');return structuredClone(projects[id]);},
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
  assert.equal(result.state,'completed');assert.equal(result.video_url,'https://media.example.org/persisted.mp4');assert.equal((await h.service().list(session,h.input)).attempts[0].job_id,body.attempt_id);await h.service().poll(session,body.attempt_id);assert.equal(h.calls().posts,1);assert.equal(h.calls().gets,1);assert.deepEqual(h.projects,before);
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
  const h=harness({config:{limits:{concurrent:1,daily:100000,perRequest:500000}}}),{s,body}=await h.ready();await assert.rejects(s.submit(session,body),/SPENDING_LIMIT/);assert.equal(h.calls().posts,0);
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
