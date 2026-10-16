import { Buffer } from 'node:buffer';
import { createHash,randomBytes } from 'node:crypto';
import { authenticateSession } from '../local-ai/auth.js';
import { BridgeError,sendError } from '../local-ai/errors.js';
import { composeScene,validateSettings,planDuration,estimateCost,exactKeys,MODEL } from '../../../src/lib/seedanceContract.js';
import { validateImage } from './images.js';
import { createProvider } from './provider.js';
import { createAttemptJournal } from './journal.js';
import { VideoError,send,sendVideoError } from './errors.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
async function body(req,config){
  if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new VideoError('INVALID_REQUEST');
  const length=req.headers['content-length'];
  if(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>config.maxBodyBytes))throw new VideoError('REQUEST_TOO_LARGE');
  return await new Promise((resolve,reject)=>{
    let size=0,finished=false;const chunks=[];
    const end=(error,result)=>{
      if(finished)return;finished=true;clearTimeout(timer);
      req.off('data',data);req.off('end',complete);req.off('error',failed);req.off('aborted',failed);
      chunks.forEach(x=>x.fill(0));
      if(error){req.resume();reject(error);}else resolve(result);
    };
    const data=chunk=>{size+=chunk.length;size>config.maxBodyBytes?end(new VideoError('REQUEST_TOO_LARGE')):chunks.push(chunk);};
    const failed=()=>end(new VideoError('INVALID_REQUEST'));
    const complete=()=>{
      const raw=Buffer.concat(chunks);
      try{end(null,JSON.parse(raw.toString('utf8')));}catch{failed();}finally{raw.fill(0);}
    };
    const timer=setTimeout(failed,config.bodyTimeoutMs);
    req.on('data',data);req.on('end',complete);req.on('error',failed);req.on('aborted',failed);
  });
}
function prepare(payload,now){
  if(!exactKeys(payload,['projectType','scene','profile','settings','assumptions','image_base64','mime_type',...(Object.hasOwn(payload,'project_id')?['project_id']:[])])||
    (payload.project_id!==undefined&&(typeof payload.project_id!=='string'||payload.project_id.length>128))||
    payload.projectType!=='full-ai')throw new VideoError('INVALID_REQUEST');
  let composition,settings,plan,cost;
  try{
    composition=composeScene(payload.scene,payload.profile??null,payload.projectType);
    settings=validateSettings(payload.settings);
    plan=planDuration(composition.dialogue,payload.assumptions);
    if(!plan.fits||settings.duration<Math.ceil(plan.seconds))throw 0;
    cost=estimateCost(settings,now);
  }catch{throw new VideoError('INVALID_REQUEST');}
  if(!cost)throw new VideoError('PRICE_UNAVAILABLE');
  const image=validateImage(payload.image_base64,payload.mime_type);
  const promptHash=hash(composition.prompt);
  const fingerprint=hash(canonical({scene:payload.scene,profile:payload.profile??null,settings,plan,
    imageHash:image.sha256,mime:image.mime,promptHash,cost}));
  const scope=hash(JSON.stringify([payload.project_id||'',composition.sceneId]));
  const dedupe=hash(canonical({scope,scene:payload.scene,profile:payload.profile??null,settings,imageHash:image.sha256,promptHash}));
  return {image,composition,settings,plan,cost,promptHash,fingerprint,scope,dedupe};
}
export function createVideoHandler(config,options={}){
  const now=options.now||Date.now,provider=createProvider(config,{...options,now});
  const journal=createAttemptJournal(config.journalPath,{now,maxRecords:config.journalMaxRecords});
  const quotes=new Map(),jobs=new Map(),tasks=new Set();
  for(const r of journal.list())if(r.stage!=='QUOTED')jobs.set(r.id,{...r,busy:false});
  let receiving=false,closing=false,closePromise;
  async function readPrepared(req,transform=value=>value){
    if(receiving)throw new VideoError('CAPACITY',2);receiving=true;
    try{return transform(await body(req,config));}finally{receiving=false;}
  }
  const identity=auth=>hash(JSON.stringify([config.issuer,auth.subject,auth.session]));
  const userIdentity=auth=>hash(JSON.stringify([config.issuer,auth.subject]));
  function sweep(){
    for(const [id,q]of quotes)if(q.expiresAt<=now())quotes.delete(id);
    for(const [id,j]of jobs)if(j.expiresAt<=now()&&!j.busy)jobs.delete(id);
  }
  function room(owner){
    sweep();
    const all=[...[...quotes.values()].map(q=>({...q,weight:q.used?1:2})),...[...jobs.values()].map(j=>({...j,weight:1}))];
    const total=items=>items.reduce((sum,item)=>sum+item.weight,0);
    if(total(all)+2>config.maxRecords||total(all.filter(x=>x.owner===owner))+2>config.maxPerUser)throw new VideoError('CAPACITY',30);
  }
  function view(id,j){
    let message=null;
    if(j.stage==='UNKNOWN')message='Trạng thái gửi chưa rõ. Có thể đã tính phí. Không tự gửi lại; kiểm tra WaveSpeed và phê duyệt mới.';
    else if(j.state==='failed')message='Lần tạo video không hoàn tất. Không tự gửi lại; kiểm tra nhật ký local.';
    return {job_id:id,state:j.state,stage:j.stage,scene_id:j.sceneId,video_url:j.url??null,
      expires_at:new Date(j.expiresAt).toISOString(),polls_remaining:config.maxPolls-j.polls,
      message,speech_review:'unverified'};
  }
  function save(j,patch){Object.assign(j,journal.update(j.id,patch));}
  function completedPatch(result){
    const stage=result.state==='completed'?'COMPLETED':['failed','cancelled','timeout','deleted'].includes(result.state)?'FAILED':'SUBMITTED';
    return {stage,state:result.state,url:result.url};
  }
  async function runSubmission(j,p){
    try{
      const image=await provider.upload(p.image);
      save(j,{stage:'UPLOADED'});
      // This fsynced state MUST precede the potentially charged POST.
      save(j,{stage:'SUBMITTING',state:'submitting'});
      const result=await provider.submit({prompt:p.composition.prompt,image,...p.settings},id=>{
        save(j,{upstreamId:id,stage:'SUBMITTED',state:'queued'});
      });
      save(j,{...completedPatch(result),nextPoll:now()+config.pollIntervalMs});
    }catch(error){
      // A returned ID stays recoverable even if the rest of the response fails.
      if(j.upstreamId){save(j,{stage:'SUBMITTED',state:'queued'});}
      else if(j.stage==='SUBMITTING'&&error.code!=='SUBMISSION_REJECTED')save(j,{stage:'UNKNOWN',state:'admission_unknown'});
      else save(j,{stage:'FAILED',state:'failed'});
    }finally{j.busy=false;p.image.bytes.fill(0);}
  }
  const handler=async(req,res)=>{
    try{
      if(closing||config.enabled!==true)throw new VideoError('INTEGRATION_DISABLED');
      const path=req.url?.split('?')[0];
      const match=/^\/api\/local-video\/(jobs|attempts)\/([a-f0-9]{48})$/.exec(path||'');
      const listing=path==='/api/local-video/attempts';
      const quote=path==='/api/local-video/quote',submit=path==='/api/local-video/submit';
      if(!quote&&!submit&&!match&&!listing)throw new VideoError('NOT_FOUND');
      if(req.method!==((match||listing)?'GET':'POST'))throw new VideoError('METHOD_NOT_ALLOWED');
      const auth=await authenticateSession(req,config),owner=identity(auth),user=userIdentity(auth);
      if(listing){
        const query=/^\/api\/local-video\/attempts\?scope=([a-f0-9]{64})$/.exec(req.url);
        if(!query)throw new VideoError('INVALID_REQUEST');
        const all=journal.list();
        const attempts=all.filter(j=>j.owner===owner&&j.scope===query[1]&&j.stage!=='QUOTED')
          .sort((a,b)=>b.createdAt-a.createdAt).slice(0,20).map(j=>({job_id:j.id,scene_id:j.sceneId,stage:j.stage,state:j.state,created_at:new Date(j.createdAt).toISOString()}));
        send(res,200,{attempts,unresolved:all.some(j=>j.user===user&&j.stage==='UNKNOWN')});return;
      }
      if(req.url.includes('?'))throw new VideoError('INVALID_REQUEST');
      if(quote){
        room(owner);
        const p=await readPrepared(req,input=>prepare(input,now()));
        try{
          room(owner);
          const id=randomBytes(24).toString('hex'),expiresAt=now()+config.quoteTtlMs,at=now();
          journal.create({id,owner,user,scope:p.scope,fingerprint:p.dedupe,imageHash:p.image.sha256,promptHash:p.promptHash,
            settingsHash:hash(canonical(p.settings)),sceneId:p.composition.sceneId,stage:'QUOTED',state:'quoted',createdAt:at,updatedAt:at,
            expiresAt,retainUntil:expiresAt,upstreamId:null,url:null,polls:0,nextPoll:0,events:[{stage:'QUOTED',at}]});
          quotes.set(id,{owner,expiresAt,fingerprint:p.fingerprint,used:false});
          send(res,200,{quote_id:id,attempt_id:id,expires_at:new Date(expiresAt).toISOString(),
            request_hash:p.fingerprint,image_sha256:p.image.sha256,prompt_sha256:p.promptHash,
            prompt:p.composition.prompt,scene_id:p.composition.sceneId,spoken_source:p.composition.spokenSource,
            settings:p.settings,plan:p.plan,cost:p.cost,model:MODEL,paid_enabled:config.paidEnabled===true});
        }finally{p.image.bytes.fill(0);}
      }else if(submit){
        if(!config.paidEnabled||!config.apiKey)throw new VideoError('PAID_DISABLED');
        if([...jobs.values()].filter(j=>j.busy&&['UPLOADING','UPLOADED','SUBMITTING'].includes(j.stage)).length>=2)throw new VideoError('CAPACITY',2);
        const input=await readPrepared(req);
        if(!exactKeys(input,['quote_id','request_hash','confirm','transfer_consent','payload'])||input.confirm!==true||input.transfer_consent!==true)throw new VideoError('INVALID_REQUEST');
        const q=quotes.get(input.quote_id);
        if(!q||q.owner!==owner)throw new VideoError('NOT_FOUND');
        if(q.expiresAt<=now())throw new VideoError('EXPIRED');
        if(q.used)throw new VideoError('ALREADY_USED');
        const p=prepare(input.payload,now());let started=false;
        try{
          if(input.request_hash!==q.fingerprint||p.fingerprint!==q.fingerprint)throw new VideoError('MISMATCH');
          const records=journal.list();
          if(records.some(j=>j.user===user&&j.stage==='UNKNOWN'))throw new VideoError('UNRESOLVED_ATTEMPT');
          if(records.some(j=>j.user===user&&j.fingerprint===p.dedupe&&j.stage!=='QUOTED'&&j.retainUntil>now()))throw new VideoError('ALREADY_USED');
          const j={...journal.get(input.quote_id),busy:true};
          save(j,{stage:'UPLOADING',state:'uploading',expiresAt:now()+config.jobTtlMs,retainUntil:now()+config.retentionMs});
          q.used=true;jobs.set(j.id,j);started=true;
          const task=runSubmission(j,p);tasks.add(task);
          // No unhandled rejection or fallback charged retry if disk I/O fails.
          void task.catch(()=>{}).finally(()=>tasks.delete(task));
          res.setHeader('Retry-After',String(Math.ceil(config.pollIntervalMs/1000)));
          send(res,202,{...view(j.id,j),status_url:'/api/local-video/jobs/'+j.id});
        }finally{if(!started)p.image.bytes.fill(0);}
      }else{
        const [,kind,id]=match;
        const stored=journal.get(id);
        if(!stored||stored.owner!==owner||stored.stage==='QUOTED')throw new VideoError('NOT_FOUND');
        const j=jobs.get(id)||{...stored,busy:false};jobs.set(id,j);
        if(kind==='attempts'){send(res,200,view(id,j));return;}
        if(j.expiresAt<=now()||j.polls>=config.maxPolls)throw new VideoError('EXPIRED');
        if(j.busy||!['queued','running'].includes(j.state)){send(res,200,view(id,j));return;}
        if(now()<j.nextPoll)throw new VideoError('TOO_FAST',Math.max(2,Math.ceil((j.nextPoll-now())/1000)));
        j.busy=true;
        try{
          save(j,{stage:'POLLING',polls:j.polls+1,nextPoll:now()+config.pollIntervalMs});
          const result=await provider.get(j.upstreamId);
          if(now()>=j.expiresAt)throw new VideoError('EXPIRED');
          save(j,completedPatch(result));
          res.setHeader('Retry-After',String(Math.ceil(config.pollIntervalMs/1000)));
          send(res,200,view(id,j));
        }catch(error){if(error.retryAfter)save(j,{nextPoll:now()+error.retryAfter*1000});throw error;}
        finally{j.busy=false;}
      }
    }catch(error){if(!res.destroyed)(error instanceof BridgeError?sendError(res,error):sendVideoError(res,error));}
  };
  handler.close=()=>closePromise||=(async()=>{closing=true;await Promise.allSettled([...tasks]);journal.close();})();
  return handler;
}
