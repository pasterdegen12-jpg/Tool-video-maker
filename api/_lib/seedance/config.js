import {MAX_VIDEO_BODY_BYTES} from '../../../src/lib/seedanceImage.js';
import process from 'node:process';
import os from 'node:os';
import path from 'node:path';
import { VideoError } from './errors.js';
export function readVideoConfig(env=process.env){
  if(env.NODE_ENV!=='development'||env.VERCEL||env.LOCAL_VIDEO_ENABLED!=='true')throw new VideoError('INTEGRATION_DISABLED');
  try{
    const origin=new URL(env.LOCAL_AI_WEB_ORIGIN||'http://localhost:5173'),issuer=new URL(env.CLERK_ISSUER);
    const jwtKey=env.CLERK_JWT_KEY?.replace(/\\n/g,'\n');
    if(origin.protocol!=='http:'||!['localhost','127.0.0.1'].includes(origin.hostname)||origin.href!==origin.origin+'/'||
      issuer.protocol!=='https:'||issuer.href!==issuer.origin+'/'||!jwtKey?.includes('-----BEGIN PUBLIC KEY-----'))throw 0;
    const paidEnabled=env.LOCAL_VIDEO_PAID_ENABLED==='true',apiKey=env.WAVESPEED_API_KEY;
    if(paidEnabled&&(!apiKey||/\s/.test(apiKey)))throw 0;
    return Object.freeze({enabled:true,origin:origin.origin,issuer:issuer.origin,jwtKey,apiKey,paidEnabled,
      journalPath:path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'WebAI','VideoAttempts'),
      retentionMs:30*86400000,journalMaxRecords:256,
      quoteTtlMs:120000,jobTtlMs:30*86400000,pollIntervalMs:2000,maxPolls:180,maxRecords:64,maxPerUser:4,
      maxBodyBytes:MAX_VIDEO_BODY_BYTES,bodyTimeoutMs:10000});
  }catch{throw new VideoError('CONFIGURATION_ERROR');}
}
