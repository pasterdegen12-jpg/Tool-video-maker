// Phase 5A.1: regression after the narrow deleted-tombstone contract correction.
// This does not launch live services, sign in, or make real provider requests.
import fs from 'node:fs/promises';
import process from 'node:process';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import {ESLint} from 'eslint';
import globals from 'globals';
import js from '@eslint/js';
const root=process.cwd(),dir=path.join(root,'docs/phase5a1'),commands=[];
async function run(command,log){
  const child=spawn('C:\\Windows\\System32\\cmd.exe',['/d','/s','/c',command],{
    cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],
    env:{...process.env,PHASE3A_EVIDENCE_DIR:dir,LOCAL_VIDEO_PAID_ENABLED:'false',
      WAVESPEED_API_KEY:'',VITE_WAVESPEED_API_KEY:''},
  });
  let output='';child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{output+=b;});
  const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  await fs.writeFile(path.join(dir,log),output);
  commands.push({command,exitCode,log});console.log(command+': '+(exitCode===0?'PASS':'FAIL')+'\n'+output.slice(-1100));
  return exitCode;
}
await fs.mkdir(dir,{recursive:true});
const tests=await run('npm.cmd test','web-tests.log');
const build=await run('npm.cmd run build','build.log');
const lint=new ESLint({overrideConfig:[{files:['**/*.mjs'],languageOptions:{globals:globals.node},rules:js.configs.recommended.rules}]});
const files=['api/lib/seedance/provider.js','tests/seedance-http.test.mjs'];
const results=await lint.lintFiles(files);
await fs.writeFile(path.join(dir,'lint.json'),JSON.stringify(results,null,2));
const errors=results.reduce((n,r)=>n+r.errorCount,0),warnings=results.reduce((n,r)=>n+r.warningCount,0);
console.log('Changed-module lint: '+errors+' errors, '+warnings+' warnings');
const known=parseEnv(await fs.readFile(path.join(root,'.env'),'utf8')).VITE_WAVESPEED_API_KEY;
let knownFrontendSecretInNewBundle=false;
for(const entry of await fs.readdir(path.join(root,'dist/assets'))){
  if(entry.endsWith('.js')&&known&&
    (await fs.readFile(path.join(root,'dist/assets',entry),'utf8')).includes(known))knownFrontendSecretInNewBundle=true;
}
const prior=JSON.parse(await fs.readFile(path.join(root,'docs/phase5a/verification.json'),'utf8'));
const protectedDiff=[];
for(const item of prior.sourceChecks){
  const current=createHash('sha256').update(await fs.readFile(path.join(root,item.file))).digest('hex');
  if(current!==item.after)protectedDiff.push(item.file);
}
const readiness=JSON.parse(await fs.readFile(path.join(dir,'readiness.json'),'utf8'));
const envUnchanged=[];
for(const item of readiness.files.filter(x=>x.sha256)){
  envUnchanged.push({file:item.file,unchanged:createHash('sha256').update(await fs.readFile(path.join(root,item.file))).digest('hex')===item.sha256});
}
const evidence={executed_at:new Date().toISOString(),commands,lint:{files,errors,warnings},
  buildEnvironment:{LOCAL_VIDEO_PAID_ENABLED:'false',WAVESPEED_API_KEY:'EMPTY',VITE_WAVESPEED_API_KEY:'EMPTY'},
  knownFrontendSecretInNewBundle,environmentFilesUnchanged:envUnchanged,phase5aTrackedSourceDifferences:protectedDiff,
  changedProviderSha256:createHash('sha256').update(await fs.readFile(path.join(root,'api/lib/seedance/provider.js'))).digest('hex'),
  liveClerk:'NOT RUN - missing backend issuer/JWT key',realProvider:'NOT RUN',realQwen:'NOT RUN'};
await fs.writeFile(path.join(dir,'verification.json'),JSON.stringify(evidence,null,2));
console.log('Known WaveSpeed value in sanitized build: '+knownFrontendSecretInNewBundle);
if(tests||build||errors||warnings||knownFrontendSecretInNewBundle||protectedDiff.length||envUnchanged.some(x=>!x.unchanged))process.exitCode=1;
