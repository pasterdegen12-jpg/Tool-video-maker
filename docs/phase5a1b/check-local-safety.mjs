// CPU-only, read-only inspection. Never print credential values or Git blob contents.
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import net from 'node:net';
import {parseEnv} from 'node:util';
import {createHash,createPublicKey} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readVideoConfig} from '../../api/lib/seedance/config.js';
const root=process.cwd(),dir=path.join(root,'docs/phase5a1b');
const names=['NODE_ENV','LOCAL_VIDEO_ENABLED','LOCAL_VIDEO_PAID_ENABLED','LOCAL_AI_WEB_ORIGIN',
'CLERK_ISSUER','CLERK_JWT_KEY','VITE_CLERK_PUBLISHABLE_KEY','WAVESPEED_API_KEY','VITE_WAVESPEED_API_KEY'];
const state=v=>v===undefined?'MISSING':v.trim()?'PRESENT':'EMPTY';
const hash=v=>createHash('sha256').update(v).digest('hex');
const files=[],valuesByFile={},knownSecrets=new Set();
const credentialName=/^(?:VITE_)?(?:WAVESPEED_API_KEY|CLERK_SECRET_KEY|R2_SECRET_ACCESS_KEY|AWS_SECRET_ACCESS_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY)$|(?:^|_)(?:SECRET|PASSWORD|PRIVATE_KEY|ACCESS_TOKEN|REFRESH_TOKEN)(?:_|$)/i;
const placeholder=v=>/^(?:your[_ -]|replace|example|placeholder|xxx|test[_ -]|fake[_ -]|dummy|\$\{|<)/i.test(v)||/^[a-z]$/i.test(v);
for(const file of (await fs.readdir(root)).filter(n=>n==='.env'||n.startsWith('.env.')).sort()){
 const raw=await fs.readFile(path.join(root,file),'utf8'),values=parseEnv(raw);
 valuesByFile[file]=values;
 files.push({file,variables:Object.fromEntries(names.map(k=>[k,state(values[k])]))});
 for(const [k,v] of Object.entries(values))if(credentialName.test(k)&&v.length>=16&&!placeholder(v))knownSecrets.add(v);
}
for(const [k,v] of Object.entries(process.env))if(credentialName.test(k)&&v.length>=16&&!placeholder(v))knownSecrets.add(v);
const envFile=valuesByFile['.env.video.local']||{};
const backend={...envFile,...process.env};
const frontend={...valuesByFile['.env'],...valuesByFile['.env.local'],...valuesByFile['.env.development'],
 ...valuesByFile['.env.development.local'],...envFile,...process.env};
const any={};for(const v of Object.values(valuesByFile))Object.assign(any,v);Object.assign(any,process.env);
let issuerValid=false,keyValid=false,pkValid=false,sameInstance=null,keyMatchesInstance='NOT RUN - no network key lookup/session verification';
try{const u=new URL(backend.CLERK_ISSUER);issuerValid=u.protocol==='https:'&&u.href===u.origin+'/';}catch{}
try{keyValid=createPublicKey(backend.CLERK_JWT_KEY?.replace(/\\n/g,'\n')).asymmetricKeyType==='rsa';}catch{}
try{
 const key=frontend.VITE_CLERK_PUBLISHABLE_KEY;
 if(/^pk_(test|live)_[A-Za-z0-9+/=_-]+$/.test(key)){
  const host=Buffer.from(key.replace(/^pk_(test|live)_/,''),'base64').toString().replace(/\$$/,'');
  pkValid=/^[A-Za-z0-9.-]+$/.test(host)&&host.includes('.');
  if(issuerValid&&pkValid)sameInstance=new URL(backend.CLERK_ISSUER).hostname===host;
 }
}catch{}
let configError=null,safeFlagsError=null;
try{readVideoConfig(backend);}catch(e){configError=e.code||'INVALID';}
try{readVideoConfig({...backend,NODE_ENV:'development',LOCAL_VIDEO_ENABLED:'true',
 LOCAL_VIDEO_PAID_ENABLED:'false',WAVESPEED_API_KEY:''});}catch(e){safeFlagsError=e.code||'INVALID';}
const git=(args,encoding='utf8')=>execFileSync('git',args,{cwd:root,encoding,stdio:['pipe','pipe','pipe'],maxBuffer:64*1024*1024});
const tracked=git(['ls-files','-z']).split('\0').filter(Boolean);
const ignoredRule=git(['check-ignore','-v','--no-index','.env.video.local']).trim();
const scopeFiles=[],skipped=[];
async function walk(base=''){
 for(const ent of await fs.readdir(path.join(root,base),{withFileTypes:true})){
  const rel=(base?base+'/':'')+ent.name;
  if(ent.isSymbolicLink()){skipped.push({file:rel,reason:'SYMLINK_NOT_FOLLOWED'});continue;}
  if(ent.isDirectory()){
   if(['.git','node_modules','.vercel','.aws','.codex','.agents'].includes(ent.name)){skipped.push({file:rel,reason:'EXCLUDED_TOOL_OR_DEPENDENCY_DIRECTORY'});continue;}
   await walk(rel);
  }else if(ent.isFile())scopeFiles.push(rel);
 }
}
await walk();
const textFile=f=>/(?:^|\/)\.env(?:\.|$)/.test(f)||/\.(?:js|jsx|mjs|cjs|ts|tsx|json|map|md|txt|log|yml|yaml|toml|html|css|xml|pem|key|ini|config|sh|cmd|bat|ps1)$/i.test(f)||['.gitignore','.firebaserc'].includes(f);
function detect(raw){
 const risks=[];
 if([...knownSecrets].some(v=>raw.includes(v)))risks.push('MATCHES_NONPLACEHOLDER_LOCAL_SECRET_VALUE');
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(raw))risks.push('PRIVATE_KEY_MATERIAL_OR_FIXTURE_REQUIRES_REVIEW');
 if(/\b(?:sk_(?:live|test)_[A-Za-z0-9]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}|AIza[0-9A-Za-z_-]{35})\b/.test(raw))risks.push('KEY_SHAPED_LITERAL_REQUIRES_REVIEW');
 if(/(?:api[_-]?key|secret(?:[_-]?(?:key|access[_-]?key))?|access[_-]?token|password)\s*[:=]\s*["'][A-Za-z0-9+/_=-]{24,}["']/i.test(raw))risks.push('CREDENTIAL_LIKE_LITERAL_REQUIRES_REVIEW');
 return [...new Set(risks)];
}
const workingFindings=[],workingScanned=[];
const protectedBefore={};
for(const file of scopeFiles){
 const stat=await fs.stat(path.join(root,file));
 if(!textFile(file))continue;
 if(stat.size>16*1024*1024){skipped.push({file,reason:'TEXT_OVER_16_MIB'});continue;}
 const raw=await fs.readFile(path.join(root,file));
 workingScanned.push(file);
 if(/^(?:src|api|scripts|tests)\//.test(file)||/^(?:\.env.*|package(?:-lock)?\.json|vite\.config\.js|\.gitignore)$/.test(file))protectedBefore[file]=hash(raw);
 const risks=detect(raw.toString('utf8'));
 if(risks.length)workingFindings.push({file,tracked:tracked.includes(file),risks});
}
const index=git(['ls-files','--stage','-z']).split('\0').filter(Boolean).map(row=>{
 const [meta,file]=row.split('\t');const [mode,oid,stage]=meta.split(' ');return {file,oid,stage,mode};
});
const head=git(['ls-tree','-r','-z','HEAD']).split('\0').filter(Boolean).map(row=>{
 const [meta,file]=row.split('\t');const [mode,type,oid]=meta.split(' ');return {file,oid,type,mode};
}).filter(x=>x.type==='blob');
const blobCache=new Map();
function scanGit(entries){
 const findings=[];let checked=0;
 for(const e of entries){
  if(!textFile(e.file))continue;
  if(!blobCache.has(e.oid))blobCache.set(e.oid,detect(git(['cat-file','blob',e.oid])));
  checked++;const risks=blobCache.get(e.oid);if(risks.length)findings.push({file:e.file,risks});
 }
 return {checkedTextFiles:checked,findings};
}
const gitIndex=scanGit(index),gitHead=scanGit(head);
async function listening(port){
 return await new Promise(resolve=>{
  const socket=net.connect({host:'127.0.0.1',port});
  const done=value=>{socket.destroy();resolve(value);};
  socket.setTimeout(1200,()=>done('TIMEOUT'));socket.once('connect',()=>done('LISTENING'));
  socket.once('error',e=>done(e.code==='ECONNREFUSED'?'NOT_LISTENING':e.code));
 });
}
const ports={};for(const port of [5173,8790])ports[port]=await listening(port);
const readiness={
 checkedAt:new Date().toISOString(),files,envVideoFileExists:!!valuesByFile['.env.video.local'],
 envVideoIgnored:!!ignoredRule,ignoreRule:ignoredRule,envVideoTracked:tracked.includes('.env.video.local'),
 processVariables:Object.fromEntries(names.map(k=>[k,state(process.env[k])])),
 backendAcceptancePresence:Object.fromEntries(names.map(k=>[k,state(backend[k])])),
 frontendAcceptancePresence:Object.fromEntries(names.map(k=>[k,state(frontend[k])])),
 clerkMissingEveryInspectedSource:['CLERK_ISSUER','CLERK_JWT_KEY'].filter(k=>!any[k]),
 issuerSyntaxValid:issuerValid,publicKeySyntaxValid:keyValid,publishableKeySyntaxValid:pkValid,
 frontendInstanceMatchesIssuer:sameInstance,publicKeyMatchesInstance:keyMatchesInstance,
 configuredOrigin:backend.LOCAL_AI_WEB_ORIGIN==='http://localhost:5173'?'http://localhost:5173':
 backend.LOCAL_AI_WEB_ORIGIN===undefined?'UNSET':'OTHER_NOT_PRINTED',
 paidFlag:backend.LOCAL_VIDEO_PAID_ENABLED===undefined?'UNSET':backend.LOCAL_VIDEO_PAID_ENABLED==='false'?'false':'NOT_FALSE',
 paidDefaultInCode:false,configError,safeFlagsOnlyConfigError:safeFlagsError,ports,
 servicesStarted:false,browserAcceptance:'NOT RUN',providerRequests:0
};
const audit={
 checkedAt:readiness.checkedAt,method:'Exact local non-placeholder secret matching + credential-shape heuristics; values never output',
 scope:'Current working tree text, selected ignored local dotenv/backups/dist, current index blobs and HEAD blobs; not complete Git history or deployed bundles',
 inspectedWorkingTextFiles:workingScanned.length,workingFindings,gitIndex,gitHead,skipped,
 note:'Key-shaped and private-key candidates may be test fixtures/public identifiers; manually classify. Provider validity not tested.'
};
await fs.mkdir(dir,{recursive:true});
await fs.writeFile(path.join(dir,'readiness.json'),JSON.stringify(readiness,null,2));
await fs.writeFile(path.join(dir,'credential-audit.json'),JSON.stringify(audit,null,2));
await fs.writeFile(path.join(dir,'protected-before.json'),JSON.stringify(protectedBefore,null,2));
console.log(JSON.stringify({readiness,credentialAudit:audit},null,2));
