import {requireValue,ownerOf} from './core.js';
export function mediaAuthConfig(env){
  const origin=env.VIDEO_WEB_ORIGIN,issuer=env.CLERK_ISSUER,jwtKey=env.CLERK_JWT_KEY?.replace(/\\n/g,'\n');
  const local=env.VERCEL!=='1'&&env.LOCAL_MEDIA_ENABLED==='true'&&['http://localhost:5173','http://127.0.0.1:5173'].includes(origin);
  requireValue(origin==='https://www.aivideomaker.live'||local,'CONFIGURATION',503);
  let u;try{u=new URL(issuer);}catch{requireValue(false,'CONFIGURATION',503);}
  requireValue(u.protocol==='https:'&&u.origin===issuer&&jwtKey?.includes('-----BEGIN PUBLIC KEY-----'),'CONFIGURATION',503);
  const allowedOwners=(env.MEDIA_ALLOWED_OWNER_HASHES||'').split(',').filter(Boolean);
  requireValue(allowedOwners.length>0&&allowedOwners.length<=30&&allowedOwners.every(x=>/^[a-f0-9]{64}$/.test(x)),'TEAM_CONFIGURATION',503);
  return {origin,issuer,jwtKey,allowedOwners};
}
export function authorizeTeam(session,config){requireValue(config.allowedOwners.includes(ownerOf(session,config.issuer)),'TEAM_FORBIDDEN',403);}
export function cloudConfig(env){
  requireValue(env.CLOUD_VIDEO_ENABLED==='true','VIDEO_DISABLED',503);
  const auth=mediaAuthConfig(env);
  const limits={concurrent:Number(env.VIDEO_MAX_CONCURRENT||1),daily:Number(env.VIDEO_DAILY_MICRO_USD||500000),perRequest:Number(env.VIDEO_MAX_REQUEST_MICRO_USD||500000)};
  requireValue(Object.values(limits).every(n=>Number.isSafeInteger(n)&&n>0)&&limits.concurrent<=2&&limits.daily<=10000000&&limits.perRequest<=500000,'CONFIGURATION',503);
  requireValue(env.WAVESPEED_VIDEO_API_KEY&&!/\s/.test(env.WAVESPEED_VIDEO_API_KEY),'CONFIGURATION',503);
  const teamLimits={...limits,concurrent:Number(env.VIDEO_TEAM_MAX_CONCURRENT||1),daily:Number(env.VIDEO_TEAM_DAILY_MICRO_USD||500000)};
  requireValue(Number.isSafeInteger(teamLimits.concurrent)&&teamLimits.concurrent>=1&&teamLimits.concurrent<=3&&Number.isSafeInteger(teamLimits.daily)&&teamLimits.daily>=1&&teamLimits.daily<=10000000,'CONFIGURATION',503);
  return {...auth,apiKey:env.WAVESPEED_VIDEO_API_KEY,paidEnabled:env.CLOUD_VIDEO_PAID_ENABLED==='true',limits,teamLimits};
}
