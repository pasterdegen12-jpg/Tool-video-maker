// Synthetic test projects/Clerk transport only. No network, GPU, or paid provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import {blank,digest,sweep,TTL,LEASE,RETENTION,authorize,enqueue,claim,lease,finish} from '../api/_lib/qwen/queue.js';
import {qwenService} from '../api/_lib/qwen/service.js';
import {authenticateWorker,createQwenHandler} from '../api/qwen.js';
import {referenceUrl,checkedResult} from '../api/_lib/qwen/image.js';
import {createRemoteQwenController,remoteQwenVisible} from '../src/lib/remoteQwenClient.js';
const issuer='https://clerk.example.com',session={subject:'user_test',session:'sess_test'},owner=digest(JSON.stringify([issuer,session.subject]));
const image={url:'https://media.example.com/project_proj_test/avatar.jpg',mime:'image/jpeg',sha256:'a'.repeat(64)};
const picture=jpeg.encode({width:32,height:32,data:Buffer.alloc(32*32*4,128)},70).data.toString('base64');
const output={sourceHash:image.sha256,profile:{status:'detected',visual_id:'man_dark_robe',visual_description:'A man wearing a dark robe.'},image_base64:picture};
const request={projectId:'proj_test',characterId:'char_1',requestKey:'a'.repeat(36)};
const initial=()=>({id:'proj_test',projectType:'full-ai',owner,characters:[{id:'char_1',name:'Judge',imageUrl:image.url},{id:'char_2',name:'Lawyer',imageUrl:image.url}],data:[{scene_n:1,Character:'Judge',Dialogue:'Preserve me.',videoUrl:'https://media.example.com/old.mp4'},{scene_n:2,Character:'Lawyer',Dialogue:'Original.'}]});
function harness(){let q=blank(),project=initial(),results={},time=100000,chain=Promise.resolve(),reads=0;
 const store={read:async()=>structuredClone(q),project:async()=>structuredClone(project),transact(opts,fn){const task=chain.then(()=>{const next=structuredClone(q),p=structuredClone(project),removed=sweep(next,opts.now),out=fn(next,p,results[opts.resultId]);q=next;if(out.patchProject)project={...project,...out.patchProject};if(out.saveResult)results[opts.resultId]=structuredClone(out.saveResult);for(const id of removed)delete results[id];return structuredClone(out.value);});chain=task.catch(()=>{});return task;}};
 const service=qwenService({store,issuer,readImage:async()=>{reads++;return image;},now:()=>time});
 return{service,store,get q(){return q;},get project(){return project;},get reads(){return reads;},advance(ms){time+=ms;},time:()=>time};
}
test('shared account double click/independent request keys deduplicate one character; distinct characters remain separate',async()=>{
 const h=harness(),jobs=await Promise.all(Array.from({length:6},(_,i)=>h.service.user(session,'create',{...request,requestKey:String(i).repeat(36)})));
 assert.equal(new Set(jobs.map(j=>j.id)).size,1);
 const second=await h.service.user(session,'create',{...request,characterId:'char_2',requestKey:'b'.repeat(36)});assert.notEqual(second.id,jobs[0].id);
 const [a,b]=await Promise.all([h.service.worker('claim',{ready:true}),h.service.worker('claim',{ready:true})]);assert.equal([a,b].filter(x=>x.job).length,1);
});
test('private-project authorization rejects another account and forged client ownership',async()=>{
 const h=harness();await assert.rejects(h.service.user({subject:'user_other'},'create',request),/PROJECT_FORBIDDEN/);
 await assert.rejects(h.service.user(session,'create',{...request,owner}),/INVALID_REQUEST/);assert.equal(h.reads,0);
});
test('unowned shared projects follow existing policy; explicit ownership remains enforced',()=>{
 const p=initial();delete p.owner;assert.equal(authorize(p,session,issuer),owner);p.ownerId='user_other';assert.throws(()=>authorize(p,session,issuer),/PROJECT_FORBIDDEN/);
});
test('worker bearer is separate, constant-time verified, rejects browser origins and wrong keys',()=>{
 const key='c'.repeat(64),expected=digest(key);authenticateWorker({headers:{authorization:'Bearer '+key}},expected);
 for(const headers of [{},{authorization:'Bearer user_session'},{authorization:'Bearer '+'d'.repeat(64)},{authorization:'Bearer '+key,origin:'https://www.aivideomaker.live'}])assert.throws(()=>authenticateWorker({headers},expected));
});
test('canonical image restricts origin/project/path/query and ignores arbitrary client image URL',()=>{
 assert.equal(referenceUrl({imageUrl:image.url},'proj_test','https://media.example.com'),image.url);
 for(const url of ['http://127.0.0.1/x','file:///secret',image.url+'?token=x',image.url.replace('proj_test','proj_other'),image.url.replace('media.example.com','evil.example.com')])assert.throws(()=>referenceUrl({imageUrl:url},'proj_test','https://media.example.com'));
});
test('queue survives offline, lease renewal/crash recovery bounded to three attempts, old lease cannot complete',async()=>{
 const h=harness();const j=await h.service.user(session,'create',request);
 assert.equal((await h.service.worker('claim',{ready:false})).job,null);assert.equal(h.q.jobs[j.id].state,'queued');
 let previous;
 for(let i=0;i<3;i++){
  const {job}=await h.service.worker('claim',{ready:true});assert.ok(job);previous=job;
  await h.service.worker('renew',{jobId:job.id,lease:job.lease});h.advance(LEASE+1);
  await h.service.worker('claim',{ready:true});h.advance(15001);
 }
 assert.equal(h.q.jobs[j.id].state,'failed');
 await assert.rejects(h.service.worker('result',{jobId:previous.id,lease:previous.lease,result:output}),/LEASE_LOST/);
});
test('real functions: proposal does not save; explicit confirmation preserves screenplay/media and is idempotent',async()=>{
 const h=harness(),before=structuredClone(h.project);const j=await h.service.user(session,'create',request),{job}=await h.service.worker('claim',{ready:true});
 await h.service.worker('result',{jobId:job.id,lease:job.lease,result:output});assert.deepEqual(h.project,before);
 await h.service.worker('result',{jobId:job.id,lease:job.lease,result:output});
 const status=await h.service.user(session,'status',{...request,jobId:j.id});assert.equal(status.state,'proposal_ready');assert.equal(status.profile.visual_id,output.profile.visual_id);assert.ok(!('lease' in status));assert.ok(!('imageUrl' in status));
 const confirm={projectId:request.projectId,characterId:request.characterId,jobId:j.id,confirm:true,confirmedId:'man_dark_robe'};
 await assert.rejects(h.service.user(session,'confirm',{...confirm,confirm:false}),/PROPOSAL_REQUIRED/);
 await h.service.user(session,'confirm',confirm);await h.service.user(session,'confirm',confirm);
 assert.equal(h.project.data[0].Character,'man_dark_robe');assert.deepEqual({...h.project.data[0],Character:'Judge'},before.data[0]);assert.deepEqual(h.project.data[1],before.data[1]);assert.equal(h.project.characters[0].name,'Judge');assert.equal(h.project.characters[0].imageUrl,image.url);
});
test('result tamper, foreign lease, unrelated job read and stale image rejected',async()=>{
 const h=harness();const j=await h.service.user(session,'create',request),{job}=await h.service.worker('claim',{ready:true});
 await assert.rejects(h.service.worker('result',{jobId:job.id,lease:'f'.repeat(64),result:output}),/LEASE_LOST/);
 await assert.rejects(h.service.worker('result',{jobId:job.id,lease:job.lease,result:{...output,sourceHash:'b'.repeat(64)}}),/INVALID_RESULT/);
 await assert.rejects(h.service.user(session,'status',{...request,characterId:'char_2',jobId:j.id}),/JOB_NOT_FOUND/);
 h.project.characters[0].imageUrl+='new';
 await assert.rejects(h.service.worker('result',{jobId:job.id,lease:job.lease,result:output}),/CHARACTER_CHANGED/);
 assert.equal((await h.service.user(session,'status',{...request,jobId:j.id})).state,'cancelled');
});
test('cancellation and expiry survive controller restart and prevent late results',async()=>{
 for(const cancel of [true,false]){const h=harness();const j=await h.service.user(session,'create',request),{job}=await h.service.worker('claim',{ready:true});
 if(cancel)await h.service.user(session,'cancel',{...request,jobId:j.id});else h.advance(TTL+1);
 const status=await h.service.user(session,'status',{...request,jobId:j.id});assert.equal(status.state,cancel?'cancelled':'expired');
 await assert.rejects(h.service.worker('result',{jobId:job.id,lease:job.lease,result:output}),/LEASE_LOST/);
 h.advance(RETENTION+1);await h.service.worker('claim',{ready:false});assert.equal(Object.keys(h.q.jobs).length,0);}
});
test('completed result duplication must be identical; no overwrite with alternate proposal',async()=>{
 const h=harness();await h.service.user(session,'create',request);const {job}=await h.service.worker('claim',{ready:true});const ticket={jobId:job.id,lease:job.lease};await h.service.worker('result',{...ticket,result:output});
 await assert.rejects(h.service.worker('result',{...ticket,result:{...output,profile:{...output.profile,visual_id:'different_person'}}}),/RESULT_CONFLICT/);
});
test('malformed or excessive normalized images rejected before save',()=>{
 assert.ok(checkedResult(output));for(const data of [{...output,image_base64:'bad'},{...output,image_base64:'a'.repeat(700000)},{...output,arbitraryUrl:'http://localhost'}])assert.throws(()=>checkedResult(data));
});
test('queue capacity and rate bounds are operational, not account privilege gates',()=>{
 const q=blank();for(let i=0;i<20;i++)enqueue(q,{project:{...initial(),characters:[{id:'c'+i}]},projectId:'proj_test',characterId:'c'+i,owner,requestKey:String(i).padStart(36,'0'),image},100000);
 assert.throws(()=>enqueue(q,{project:initial(),projectId:'proj_test',characterId:'char_1',owner,requestKey:'f'.repeat(36),image},100000),/RATE_LIMIT/);
});
test('client uses HTTPS same-origin queue only and recovers a job after remount; render never creates inference',async()=>{
 const h=harness();const admitted=await h.service.user(session,'create',request);const calls=[],states=[];
 const controller=createRemoteQwenController({getToken:async()=>'mock_clerk',projectId:request.projectId,characterId:request.characterId,onChange:s=>states.push(s),sleep:async()=>{const {job}=await h.service.worker('claim',{ready:true});await h.service.worker('result',{jobId:job.id,lease:job.lease,result:output});},fetchImpl:async(url,options)=>{assert.ok(url.startsWith('/api/qwen?'));calls.push(url);const body=JSON.parse(options.body),action=new URL(url,'https://www.aivideomaker.live').searchParams.get('action');return new Response(JSON.stringify(await h.service.user(session,action,body)),{headers:{'Content-Type':'application/json'}});}});
 assert.equal(calls.length,0);await controller.resume();assert.ok(calls.every(c=>c.endsWith('status')));assert.equal(states.at(-1).jobId,admitted.id);assert.equal(states.at(-1).status,'detected');assert.equal(h.project.data[0].Character,'Judge');
 assert.equal(remoteQwenVisible({VITE_ENABLE_REMOTE_QWEN:'true'},{origin:'https://www.aivideomaker.live'}),true);assert.equal(remoteQwenVisible({VITE_ENABLE_REMOTE_QWEN:'true'},{origin:'http://localhost:5173'}),false);
});
test('route rejects unauthenticated browser and browser use of worker protocol before touching queue',async()=>{
 const env={QWEN_REMOTE_ENABLED:'true',VIDEO_WEB_ORIGIN:'https://www.aivideomaker.live',CLERK_ISSUER:issuer,CLERK_JWT_KEY:'-----BEGIN PUBLIC KEY-----mock',QWEN_WORKER_TOKEN_SHA256:digest('c'.repeat(64))};let calls=0;
 const handler=createQwenHandler({env,authenticate:async()=>{throw Object.assign(Error('UNAUTHORIZED'),{code:'UNAUTHORIZED'});},service:{user:()=>{calls++;},worker:()=>{calls++;}}});
 for(const action of ['create','worker_claim']){let value;const res={setHeader(){},end(s){value=JSON.parse(s);}};await handler({url:'/api/qwen?action='+action,method:'POST',headers:{origin:env.VIDEO_WEB_ORIGIN},body:{}},res);assert.equal(res.statusCode,401);assert.equal(value.error.code,'UNAUTHORIZED');}assert.equal(calls,0);
});
