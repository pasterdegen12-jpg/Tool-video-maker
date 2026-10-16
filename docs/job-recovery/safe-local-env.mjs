// Local acceptance only: load Clerk config, explicitly disable every provider key.
import fs from 'node:fs';
import process from 'node:process';
import {parseEnv} from 'node:util';
Object.assign(process.env,parseEnv(fs.readFileSync(new URL('../../.env.video.local',import.meta.url),'utf8')));
process.env.NODE_ENV='development';
process.env.LOCAL_VIDEO_PAID_ENABLED='false';
process.env.WAVESPEED_API_KEY='';
process.env.VITE_WAVESPEED_API_KEY='';
process.env.CHOKIDAR_USEPOLLING='true';
if(process.env.LOCAL_AI_WEB_ORIGIN!=='http://localhost:5173')throw Error('Unexpected local origin');
