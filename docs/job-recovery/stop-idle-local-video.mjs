// Operator-assisted acceptance helper: stop only our verified idle backend.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const pid=Number(process.argv[2]);
if(!Number.isSafeInteger(pid)||pid<=0)throw Error('Explicit backend PID required');
const base=path.join(process.env.LOCALAPPDATA,'WebAI');
const directory=path.join(base,'VideoAttempts');
const lock=JSON.parse(fs.readFileSync(path.join(directory,'writer.lock'),'utf8'));
if(lock.pid!==pid)throw Error('Journal writer changed; no process stopped');
const services=path.join(base,'LocalServices');
const owned=fs.readdirSync(services).filter(n=>/^backend-\d+\.json$/.test(n)).some(n=>{
  const r=JSON.parse(fs.readFileSync(path.join(services,n),'utf8'));
  return r.pid===pid&&r.kind==='backend'&&r.host==='127.0.0.1'&&r.port===8790;
});
if(!owned)throw Error('Missing launcher ownership record');
const task=execFileSync('tasklist',['/FI','PID eq '+pid,'/FO','CSV','/NH'],{encoding:'utf8',windowsHide:true});
if(!task.startsWith('"node.exe","'+pid+'",'))throw Error('PID is not the launched Node backend');
const sockets=execFileSync('netstat',['-ano','-p','tcp'],{encoding:'utf8',windowsHide:true}).split(/\r?\n/);
if(!sockets.some(l=>new RegExp('^\\s*TCP\\s+127\\.0\\.0\\.1:8790\\s+0\\.0\\.0\\.0:0\\s+LISTENING\\s+'+pid+'\\s*$').test(l)))throw Error('Backend listener mismatch');
const before=new Map();
for(const name of fs.readdirSync(directory)){
  if(name==='writer.lock')continue;
  if(!/^[a-f0-9]{48}\.json$/.test(name))throw Error('Unexpected journal file');
  const bytes=fs.readFileSync(path.join(directory,name)),j=JSON.parse(bytes);
  if(j.checksum!==createHash('sha256').update(JSON.stringify(j.record)).digest('hex'))throw Error('Journal checksum mismatch');
  if(!['QUOTED','COMPLETED','FAILED'].includes(j.record.stage))throw Error('Active or unresolved attempt; do not stop');
  before.set(name,createHash('sha256').update(bytes).digest('hex'));
}
process.kill(pid,'SIGTERM');
for(let i=0;i<30;i++){
  try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')break;throw e;}
  if(i===29)throw Error('Backend remains alive; no further action');
  await new Promise(r=>setTimeout(r,100));
}
for(const [name,hash] of before){if(createHash('sha256').update(fs.readFileSync(path.join(directory,name))).digest('hex')!==hash)throw Error('Journal unexpectedly changed');}
console.log(JSON.stringify({stopped_pid:pid,journal_records_preserved:before.size,lock_not_manually_modified:true}));
