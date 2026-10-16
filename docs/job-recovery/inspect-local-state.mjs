import fs from 'node:fs';import process from 'node:process';import {parseEnv} from 'node:util';import {readVideoConfig} from '../../api/lib/seedance/config.js';
const e={...process.env,...parseEnv(fs.readFileSync(new URL('../../.env.video.local',import.meta.url),'utf8')),NODE_ENV:'development'};
try{const c=readVideoConfig(e);console.log(JSON.stringify({config:'PASS',paid:c.paidEnabled,journal:c.journalPath,keyPresent:!!c.apiKey}));}catch(x){console.log(JSON.stringify({config:'FAIL',code:x.code}));}
for(const pid of [2164,13776,17280]){try{process.kill(pid,0);console.log(JSON.stringify({pid,alive:true}));}catch(x){console.log(JSON.stringify({pid,alive:false,code:x.code}));}}
