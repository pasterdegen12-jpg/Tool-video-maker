// Read-only readiness check: prints presence/validity only, never credential values.
import fs from 'node:fs/promises';
import process from 'node:process';
import path from 'node:path';
import net from 'node:net';
import {parseEnv} from 'node:util';
import {createHash,createPublicKey} from 'node:crypto';
import {readVideoConfig} from '../../api/lib/seedance/config.js';
const root=process.cwd(),dir=path.join(root,'docs/phase5a1');
const names=['NODE_ENV','LOCAL_VIDEO_ENABLED','LOCAL_VIDEO_PAID_ENABLED','CLERK_ISSUER','CLERK_JWT_KEY',
  'LOCAL_AI_WEB_ORIGIN','VITE_CLERK_PUBLISHABLE_KEY','WAVESPEED_API_KEY','VITE_WAVESPEED_API_KEY'];
const present=v=>v===undefined?'MISSING':v.trim()?'PRESENT':'EMPTY';
const fileValues={},files=[];
for(const file of ['.env','.env.local','.env.video.local']){
  try{
    const raw=await fs.readFile(path.join(root,file),'utf8'),values=parseEnv(raw);
    Object.assign(fileValues,values);
    files.push({file,sha256:createHash('sha256').update(raw).digest('hex'),
      variables:Object.fromEntries(names.map(k=>[k,present(values[k])]))});
  }catch(e){if(e.code!=='ENOENT')throw e;files.push({file,exists:false});}
}
const merged={...fileValues,...process.env};
const redacted=Object.fromEntries(names.map(k=>[k,present(merged[k])]));
let issuerValid=false,jwtKeyValid=false,publishableKeyValid=false,frontendInstanceMatchesIssuer=null;
try{const u=new URL(merged.CLERK_ISSUER);issuerValid=u.protocol==='https:'&&u.href===u.origin+'/';}catch{}
try{jwtKeyValid=createPublicKey(merged.CLERK_JWT_KEY?.replace(/\\n/g,'\n')).asymmetricKeyType==='rsa';}catch{}
try{
  const key=merged.VITE_CLERK_PUBLISHABLE_KEY;
  if(/^pk_(test|live)_[A-Za-z0-9+/=_-]+$/.test(key)){
    const host=Buffer.from(key.replace(/^pk_(test|live)_/,''),'base64').toString().replace(/\$$/,'');
    publishableKeyValid=/^[A-Za-z0-9.-]+$/.test(host)&&host.includes('.');
    if(issuerValid&&publishableKeyValid)frontendInstanceMatchesIssuer=new URL(merged.CLERK_ISSUER).hostname===host;
  }
}catch{}
let originalConfigError=null,noPaidConfigError=null;
try{readVideoConfig(merged);}catch(e){originalConfigError=e.code||'INVALID';}
try{readVideoConfig({...merged,NODE_ENV:'development',LOCAL_VIDEO_ENABLED:'true',LOCAL_VIDEO_PAID_ENABLED:'false',WAVESPEED_API_KEY:''});}
catch(e){noPaidConfigError=e.code||'INVALID';}
async function listening(port){
  return await new Promise(resolve=>{
    const socket=net.connect({host:'127.0.0.1',port});
    const done=value=>{socket.destroy();resolve(value);};
    socket.setTimeout(1200,()=>done('TIMEOUT'));
    socket.once('connect',()=>done('LISTENING'));socket.once('error',e=>done(e.code==='ECONNREFUSED'?'NOT_LISTENING':e.code));
  });
}
const ports={};for(const port of [5173,8790])ports[port]=await listening(port);
const safe={
  checked_at:new Date().toISOString(),files,processVariables:Object.fromEntries(names.map(k=>[k,present(process.env[k])])),
  effectivePresence:redacted,issuerValid,jwtKeyValid,publishableKeyValid,frontendInstanceMatchesIssuer,
  configuredPaidFlag:merged.LOCAL_VIDEO_PAID_ENABLED===undefined?'UNSET':merged.LOCAL_VIDEO_PAID_ENABLED==='false'?'false':merged.LOCAL_VIDEO_PAID_ENABLED==='true'?'true':'INVALID',
  paidDefaultInCode:false,readConfigError:originalConfigError,readConfigWithSafeDevelopmentFlagsError:noPaidConfigError,
  frontendWaveSpeedKeyNonempty:!!merged.VITE_WAVESPEED_API_KEY?.trim(),
  frontendWaveSpeedValueLooksPlaceholder:/^(?:your[_ -]|replace|example|placeholder|xxx|test[_ -])/i.test(merged.VITE_WAVESPEED_API_KEY||''),
  listening:ports,servicesStarted:false,providerRequests:0,
};
await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'readiness.json'),JSON.stringify(safe,null,2));
console.log(JSON.stringify(safe,null,2));
