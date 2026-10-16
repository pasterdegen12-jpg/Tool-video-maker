import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {createHash,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {safeMediaUrl} from '../../../src/lib/seedanceContract.js';
import {VideoError} from './errors.js';
import {validFailure} from './diagnostics.js';
import {validRetry,retryAncestors} from './retry.js';

const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const id=x=>typeof x==='string'&&/^[a-f0-9]{48}$/.test(x);
const stages=['QUOTED','UPLOADING','UPLOADED','SUBMITTING','SUBMITTED','POLLING','COMPLETED','FAILED','UNKNOWN'];
const states=['quoted','uploading','submitting','queued','running','completed','failed','cancelled','timeout','deleted','admission_unknown'];
const stageStates={QUOTED:['quoted'],UPLOADING:['uploading'],UPLOADED:['uploading'],SUBMITTING:['submitting'],SUBMITTED:['queued','running'],POLLING:['queued','running'],COMPLETED:['completed'],FAILED:['failed','cancelled','timeout','deleted'],UNKNOWN:['admission_unknown']};
const keys=['id','owner','user','scope','fingerprint','imageHash','promptHash','settingsHash','sceneId','stage','state','createdAt','updatedAt','expiresAt','retainUntil','upstreamId','url','polls','nextPoll','events'];
const openDirectories=new Set();
let windowsSid;
function command(name,args){return execFileSync(name,args,{windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe']});}
function protect(directory){
  if(process.platform!=='win32'){fs.chmodSync(directory,0o700);return;}
  windowsSid ||= command('whoami',['/user','/fo','csv','/nh']).match(/S-1-5-21-(?:\d+-){3}\d+/)?.[0];
  if(!windowsSid)throw new Error('Cannot identify local owner');
  command('icacls',[directory,'/inheritance:r','/grant:r','*'+windowsSid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F']);
  const aclFile=path.join(directory,'.acl-check');
  try{
    command('icacls',[directory,'/save',aclFile,'/T','/Q']);
    const acl=fs.readFileSync(aclFile).toString('utf16le');
    // Refuse unexpected explicit grants, including on existing journal files.
    const aces=[...acl.matchAll(/\(([^()]*)\)/g)];
    if(!aces.length||aces.some(([,ace])=>{const a=ace.split(';');return a[0]!=='A'||![windowsSid,'SY','S-1-5-18'].includes(a[5]);}))throw new Error('Unexpected journal ACL');
  }finally{if(fs.existsSync(aclFile))fs.unlinkSync(aclFile);}
}
function regular(file){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>65536)throw new Error('Unsafe journal file');return s;}
function validate(r){
  if(!r||Object.keys(r).sort().join()!==[...keys,...['failure','retry'].filter(k=>Object.hasOwn(r,k))].sort().join()||
    (Object.hasOwn(r,'failure')&&!validFailure(r.failure))||!id(r.id)||
    (Object.hasOwn(r,'retry')&&!validRetry(r.retry,r))||
    !['owner','user','scope','fingerprint','imageHash','promptHash','settingsHash'].every(k=>hex(r[k]))||
    !(typeof r.sceneId==='number'&&Number.isSafeInteger(r.sceneId)||typeof r.sceneId==='string'&&r.sceneId.length<=128)||
    !stages.includes(r.stage)||!states.includes(r.state)||!stageStates[r.stage]?.includes(r.state)||
    !['createdAt','updatedAt','expiresAt','retainUntil','nextPoll'].every(k=>Number.isSafeInteger(r[k])&&r[k]>=0)||
    !Number.isSafeInteger(r.polls)||r.polls<0||r.polls>1000||
    !(r.upstreamId===null||typeof r.upstreamId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(r.upstreamId))||
    !(r.url===null||typeof r.url==='string'&&r.url.length<=4096&&safeMediaUrl(r.url))||
    !Array.isArray(r.events)||!r.events.length||r.events.length>400||
    r.events.some(e=>Object.keys(e).sort().join()!=='at,stage'||!stages.includes(e.stage)||!Number.isSafeInteger(e.at))||
    r.events.at(-1).stage!==r.stage||r.events.at(-1).at!==r.updatedAt||
    (['SUBMITTED','POLLING','COMPLETED'].includes(r.stage)&&!r.upstreamId)||
    (r.state==='completed'&&(!r.url||r.stage!=='COMPLETED'))||
    (r.stage==='UNKNOWN'&&r.state!=='admission_unknown'))throw new Error('Invalid journal record');
}
// One local backend owns this directory. Synchronous, fsynced metadata writes
// finish before the next external side effect. No images, prompts or credentials.
export function createAttemptJournal(directory,{now=Date.now,maxRecords=256}={}){
  directory=path.resolve(directory);
  let lockOwned=false,closed=false,broken=false;
  const records=new Map(),lock=path.join(directory,'writer.lock');
  function syncDirectory(){if(process.platform!=='win32'){const fd=fs.openSync(directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}}
  function write(record){
    if(closed||broken)throw new VideoError('JOURNAL_UNAVAILABLE');
    try{
      validate(record);
      const file=path.join(directory,record.id+'.json'),temp=file+'.tmp';
      const fd=fs.openSync(temp,'wx',0o600);
      try{fs.writeFileSync(fd,JSON.stringify({version:1,record,checksum:digest(record)}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      // Windows readers/antivirus can briefly hold the destination. Retry only
      // this local rename, never a provider operation; preserve .tmp on failure.
      for(let attempt=0;;attempt++){
        try{fs.renameSync(temp,file);break;}catch(error){
          if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt===9)throw error;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
        }
      }
      syncDirectory();records.set(record.id,structuredClone(record));
    }catch{broken=true;throw new VideoError('JOURNAL_UNAVAILABLE');}
    return structuredClone(record);
  }
  function close(){if(closed)return;closed=true;if(lockOwned){fs.unlinkSync(lock);openDirectories.delete(directory);lockOwned=false;}}
  try{
    for(let p=directory;;p=path.dirname(p)){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw new Error('Symlink journal');if(path.dirname(p)===p)break;}
    fs.mkdirSync(directory,{recursive:true,mode:0o700});
    if(openDirectories.has(directory))throw new Error('Journal already in use');
    if(fs.existsSync(lock)){
      regular(lock);const previous=JSON.parse(fs.readFileSync(lock,'utf8'));
      if(!Number.isSafeInteger(previous.pid)||previous.pid<=0)throw new Error('Invalid writer lock');
      try{process.kill(previous.pid,0);throw new Error('Writer still alive');}catch(e){if(e.code!=='ESRCH')throw e;}
      fs.unlinkSync(lock);
    }
    protect(directory);
    fs.writeFileSync(lock,JSON.stringify({pid:process.pid,nonce:randomBytes(16).toString('hex')}),{flag:'wx',mode:0o600});lockOwned=true;openDirectories.add(directory);
    const files=fs.readdirSync(directory).filter(f=>f!=='writer.lock');
    if(files.length>maxRecords||files.some(f=>!/^[a-f0-9]{48}\.json$/.test(f)))throw new Error('Corrupt or partial journal');
    for(const f of files){
      const file=path.join(directory,f);regular(file);
      if(process.platform!=='win32')fs.chmodSync(file,0o600);
      const envelope=JSON.parse(fs.readFileSync(file,'utf8'));
      if(Object.keys(envelope).sort().join()!=='checksum,record,version'||envelope.version!==1||envelope.checksum!==digest(envelope.record))throw new Error('Journal checksum mismatch');
      const r=envelope.record;validate(r);if(f!==r.id+'.json')throw new Error('Journal ID mismatch');records.set(r.id,r);
    }
    for(const r of records.values())if(r.retry&&!retryAncestors([...records.values()],r.retry.predecessorId,r))throw new Error('Invalid retry predecessor');
    for(const r of records.values()){
      if(['UPLOADING','UPLOADED','SUBMITTING'].includes(r.stage)){
        const stage=r.stage==='SUBMITTING'?'UNKNOWN':'FAILED';
        const at=now();
        write({...r,stage,state:stage==='UNKNOWN'?'admission_unknown':'failed',updatedAt:at,events:[...r.events,{stage,at}]});
      }
    }
  }catch{close();throw new VideoError('JOURNAL_UNAVAILABLE');}
  function prune(){
    for(const r of records.values()){
      // Unresolved/active jobs are retained, count-bounded, until manual review.
      if(r.retainUntil<=now()&&['QUOTED','COMPLETED','FAILED'].includes(r.stage)&&
        ![...records.values()].some(child=>child.retry?.predecessorId===r.id)){
        fs.unlinkSync(path.join(directory,r.id+'.json'));records.delete(r.id);
      }
    }
    syncDirectory();
  }
  return {
    close,
    list(){if(broken||closed)throw new VideoError('JOURNAL_UNAVAILABLE');return [...records.values()].map(r=>structuredClone(r));},
    get(id){if(broken||closed)throw new VideoError('JOURNAL_UNAVAILABLE');return records.has(id)?structuredClone(records.get(id)):null;},
    create(record){prune();if(records.size>=maxRecords)throw new VideoError('CAPACITY');if(records.has(record.id))throw new VideoError('ALREADY_USED');return write(record);},
    update(id,patch){const r=this.get(id);if(!r)throw new VideoError('NOT_FOUND');
      if([...records.values()].some(child=>child.retry?.predecessorId===id))throw new VideoError('JOURNAL_UNAVAILABLE');
      const at=now(),stage=patch.stage||r.stage;return write({...r,...patch,updatedAt:at,events:[...r.events,{at,stage}]});},
  };
}
