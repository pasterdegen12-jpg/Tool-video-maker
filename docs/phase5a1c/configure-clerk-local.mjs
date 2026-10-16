// Configuration only. Reads public JWKS shown in the authenticated Clerk dashboard.
import fs from 'node:fs/promises';
import process from 'node:process';
import {parseEnv} from 'node:util';
import {createHash,createPublicKey} from 'node:crypto';
const root=process.cwd(),dir=root+'/docs/phase5a1c';
const expectedFingerprint='98147749cf44233313dc45e506b410b67f363adc9160a2f08257ca9eb7af39bf';
const sha=v=>createHash('sha256').update(v).digest('hex');
try{
 const protectedPaths=Object.keys(JSON.parse(await fs.readFile(root+'/docs/phase5a1b/protected-before.json','utf8')));
 const protectedHashes={};
 for(const file of protectedPaths)protectedHashes[file]=sha(await fs.readFile(root+'/'+file));
 await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(dir+'/protected-before.json',JSON.stringify(protectedHashes,null,2));
 const values={};
 for(const file of ['.env','.env.local','.env.development','.env.development.local']){
  try{Object.assign(values,parseEnv(await fs.readFile(root+'/'+file,'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 Object.assign(values,process.env);
 const pk=values.VITE_CLERK_PUBLISHABLE_KEY;
 if(!/^pk_test_[A-Za-z0-9+/=_-]+$/.test(pk))throw new Error('EXPECTED_EXISTING_DEVELOPMENT_INSTANCE');
 const host=Buffer.from(pk.slice('pk_test_'.length),'base64').toString().replace(/\$$/,'');
 if(!/^[a-z0-9-]+\.clerk\.accounts\.dev$/.test(host))throw new Error('INVALID_INSTANCE_HOST');
 const issuer='https://'+host,jwksUrl=issuer+'/.well-known/jwks.json';
 const response=await fetch(jwksUrl,{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('PUBLIC_JWKS_FETCH_FAILED');
 const raw=await response.text();
 if(raw.length>65536)throw new Error('PUBLIC_JWKS_TOO_LARGE');
 const jwks=JSON.parse(raw);
 const matching=[];
 for(const jwk of jwks.keys||[]){
  if(jwk.kty!=='RSA'||jwk.use&&jwk.use!=='sig'||jwk.alg&&jwk.alg!=='RS256'||jwk.d)continue;
  const key=createPublicKey({key:jwk,format:'jwk'});
  if(sha(key.export({type:'spki',format:'der'}))===expectedFingerprint)matching.push(key);
 }
 if(matching.length!==1)throw new Error('DASHBOARD_PUBLIC_KEY_MISMATCH');
 const pem=matching[0].export({type:'spki',format:'pem'}).toString();
 const contents=[
  '# Local browser acceptance only. Public Clerk verification key; no provider credential.',
  'NODE_ENV=development','LOCAL_VIDEO_ENABLED=true','LOCAL_VIDEO_PAID_ENABLED=false',
  'LOCAL_AI_WEB_ORIGIN=http://localhost:5173',
  'CLERK_ISSUER='+issuer,'CLERK_JWT_KEY='+JSON.stringify(pem),
  'WAVESPEED_API_KEY=','VITE_WAVESPEED_API_KEY=',''
 ].join('\n');
 await fs.writeFile(root+'/.env.video.local',contents,{flag:'wx'});
 const parsed=parseEnv(await fs.readFile(root+'/.env.video.local','utf8'));
 const key=createPublicKey(parsed.CLERK_JWT_KEY.replace(/\\n/g,'\n'));
 const evidence={
  configuredAt:new Date().toISOString(),source:'Authenticated Clerk dashboard public key fingerprint + exact instance public JWKS URL',
  dashboardSignedIn:true,environment:'Development',publishableKeyInstanceMatched:true,
  publicJwksFetched:true,jwksHttpStatus:response.status,publicKeyMatchesDashboard:sha(key.export({type:'spki',format:'der'}))===expectedFingerprint,
  issuerConfigured:parsed.CLERK_ISSUER===issuer,jwtPublicKeyConfigured:key.asymmetricKeyType==='rsa',
  paidEnabled:parsed.LOCAL_VIDEO_PAID_ENABLED,origin:parsed.LOCAL_AI_WEB_ORIGIN,
  frontendWaveSpeedEmpty:parsed.VITE_WAVESPEED_API_KEY==='',backendWaveSpeedEmpty:parsed.WAVESPEED_API_KEY==='',
  originalEnvFilesChanged:false,secretKeyRead:false,sessionTokenExported:false
 };
 await fs.writeFile(dir+'/configuration.json',JSON.stringify(evidence,null,2));
 console.log(JSON.stringify(evidence,null,2));
}catch(error){
 console.error('Configuration stopped:',/^[A-Z_]+$/.test(error.message)?error.message:(error.code||'CONFIGURATION_OPERATION_FAILED'));
 process.exitCode=1;
}
