// No credentials are logged; only localhost route diagnostics and redacted environment checks.
import fs from 'node:fs/promises';
import process from 'node:process';
import {parseEnv} from 'node:util';
import {execFileSync} from 'node:child_process';
import {readVideoConfig} from '../../api/lib/seedance/config.js';
const root=process.cwd(),dir=root+'/docs/phase5a2';
const env=parseEnv(await fs.readFile(root+'/.env','utf8'));
const config=readVideoConfig();
const checks=[];
for(const [name,url,origin,authorization] of [
 ['backend_missing_session','http://127.0.0.1:8790/api/local-video/quote',config.origin,null],
 ['proxy_missing_session','http://localhost:5173/api/local-video/quote',config.origin,null],
 ['proxy_invalid_session','http://localhost:5173/api/local-video/quote',config.origin,'Bearer invalid'],
 ['proxy_wrong_origin','http://localhost:5173/api/local-video/quote','http://127.0.0.1:5173',null]
]){
 const headers={'Content-Type':'application/json',Origin:origin};if(authorization)headers.Authorization=authorization;
 const r=await fetch(url,{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(10000)});
 const body=await r.json();checks.push({name,status:r.status,code:body.error?.code||'UNKNOWN'});
}
const module=await fetch('http://localhost:5173/src/Workspace/Workspace.jsx');
const moduleText=await module.text();
const dotenvVideo=parseEnv(await fs.readFile(root+'/.env.video.local','utf8'));
const localScan={
 servedModuleHttpStatus:module.status,
 knownWaveSpeedSecretPresent:!!env.VITE_WAVESPEED_API_KEY&&moduleText.includes(env.VITE_WAVESPEED_API_KEY),
 servedFrontendWaveSpeedVariableEmpty:/"VITE_WAVESPEED_API_KEY"\s*:\s*""/.test(moduleText),
 clerkPublicPemPresent:moduleText.includes(dotenvVideo.CLERK_JWT_KEY)||moduleText.includes('-----BEGIN PUBLIC KEY-----')
};
let listeners='NOT CHECKED';
try{
 const rows=execFileSync('netstat',['-ano','-p','tcp'],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).split(/\r?\n/);
 listeners=rows.map(r=>r.trim().split(/\s+/)).filter(p=>p[0]==='TCP'&&/(?:^|:)(5173|8790)$/.test(p[1])&&p[3]==='LISTENING')
 .map(p=>({localAddress:p[1],state:p[3],pid:Number(p[4])}));
}catch{listeners='INSPECTION_FAILED';}
const result={checkedAt:new Date().toISOString(),process:{
 paidEnabled:config.paidEnabled,origin:config.origin,backendWaveSpeedEmpty:process.env.WAVESPEED_API_KEY==='',
 frontendWaveSpeedEmpty:process.env.VITE_WAVESPEED_API_KEY===''
},routes:checks,frontendIsolation:localScan,listeners,realSessionValidation:'NOT RUN YET',
 note:'Missing/invalid-session requests contain no real or synthetic signed JWT; no images or submit requests.'};
await fs.writeFile(dir+'/local-routes.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(checks.some((r,i)=>r.status!==(i===3?403:401))||config.paidEnabled||localScan.knownWaveSpeedSecretPresent||!localScan.servedFrontendWaveSpeedVariableEmpty||localScan.clerkPublicPemPresent)process.exitCode=1;
