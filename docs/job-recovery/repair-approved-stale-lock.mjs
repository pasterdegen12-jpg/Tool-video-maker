// One-time operator-approved removal of the verified stale PID-2164 lock only.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const directory=path.resolve('C:/Users/Admin/AppData/Local/WebAI/VideoAttempts');const lock=path.join(directory,'writer.lock');
const backup=path.resolve('C:/Users/Admin/AppData/Local/WebAI/LocalServices/writer-lock-pid2164-stale-2026-10-15.json');
if(path.dirname(lock)!==directory||path.dirname(backup)!==path.resolve('C:/Users/Admin/AppData/Local/WebAI/LocalServices'))throw Error('Unexpected path');
const digest=b=>createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync(lock),original=JSON.parse(bytes);
if(original.pid!==2164||original.nonce!=='0b133f8b53cc4cd076d0bb432b9da223')throw Error('Lock changed');
const s=fs.lstatSync(lock);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)throw Error('Unsafe lock');
const tasks=execFileSync('tasklist',['/FI','PID eq 2164','/FO','CSV','/NH'],{encoding:'utf8',windowsHide:true});
if(!tasks.trim().startsWith('"svchost.exe","2164",'))throw Error('PID identity changed');
const sockets=execFileSync('netstat',['-ano','-p','tcp'],{encoding:'utf8',windowsHide:true});
if(sockets.split(/\r?\n/).some(l=>l.includes(':8790')&&l.includes('LISTENING')))throw Error('Backend port occupied');
const entries=fs.readdirSync(directory).filter(n=>n!=='writer.lock');const hashes={};
for(const name of entries){if(!/^[a-f0-9]{48}\.json$/.test(name))throw Error('Unexpected journal entry');const b=fs.readFileSync(path.join(directory,name));const j=JSON.parse(b);if(j.record.stage!=='QUOTED'||j.record.upstreamId!==null)throw Error('Active or unresolved record');if(j.checksum!==digest(JSON.stringify(j.record)))throw Error('Invalid checksum');hashes[name]=digest(b);}
fs.copyFileSync(lock,backup,fs.constants.COPYFILE_EXCL);
if(digest(fs.readFileSync(backup))!==digest(bytes)||digest(fs.readFileSync(lock))!==digest(bytes))throw Error('Lock backup/change check failed');
fs.unlinkSync(lock);
for(const [name,hash] of Object.entries(hashes))if(digest(fs.readFileSync(path.join(directory,name)))!==hash)throw Error('Journal changed');
const evidence={at:new Date().toISOString(),operator_approved:true,pid_identity:'svchost.exe',removed:lock,backup,job_hashes:hashes,all_jobs_unchanged:true,processes_terminated:0};
fs.writeFileSync(new URL('./stale-lock-repair.json',import.meta.url),JSON.stringify(evidence,null,2),{flag:'wx'});console.log(JSON.stringify(evidence));
