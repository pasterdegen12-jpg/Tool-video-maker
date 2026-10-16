// CPU-only Phase 5A verification. No live provider requests or production configuration.
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {ESLint} from 'eslint';
import globals from 'globals';
import js from '@eslint/js';
const root=process.cwd(),dir=path.join(root,'docs/phase5a');
await fs.mkdir(dir,{recursive:true});
const commands=[];
async function run(command,log,extraEnv={}){
  const child=spawn('C:\\Windows\\System32\\cmd.exe',['/d','/s','/c',command],{
    cwd:root,windowsHide:true,env:{...process.env,...extraEnv},stdio:['ignore','pipe','pipe'],
  });
  let output='';child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{output+=b;});
  const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  await fs.writeFile(path.join(dir,log),output);
  commands.push({command,log,exitCode});
  console.log(command+': '+(exitCode===0?'PASS':'FAIL')+'\n'+output.slice(-1600));
  return exitCode;
}
const tests=await run('npm.cmd test','web-tests.log',{PHASE3A_EVIDENCE_DIR:dir});
const prior=process.argv.includes('--tests-only')?JSON.parse(await fs.readFile(path.join(dir,'verification.json'),'utf8')):null;
const build=prior?prior.commands.find(x=>x.command==='npm.cmd run build').exitCode:await run('npm.cmd run build','build.log');
if(prior)commands.push({...prior.commands.find(x=>x.command==='npm.cmd run build'),reusedBecause:'No production changes since this successful build.'});
const files=[
  'src/lib/seedanceContract.js','src/lib/seedanceClient.js','src/Workspace/SeedanceScenePanel.jsx',
  'api/lib/seedance/errors.js','api/lib/seedance/images.js','api/lib/seedance/config.js',
  'api/lib/seedance/provider.js','api/lib/seedance/service.js','api/lib/seedance/transport.js',
  'scripts/local-video-server.mjs','scripts/local-ai-loopback.mjs','api/lib/local-ai/auth.js',
  'src/Workspace/StoryboardTab.jsx','src/Workspace/VisualProfiles.jsx','src/Workspace/Workspace.jsx','vite.config.js',
  'tests/seedance-contract.test.mjs','tests/seedance-http.test.mjs','tests/seedance-ui.test.mjs',
  'tests/seedance-client.test.mjs','tests/seedance-transport.test.mjs','tests/support/seedance-fixtures.mjs',
  'tests/local-ai-real-http.test.mjs','tests/visual-real-http.test.mjs','tests/spoken-text-contract.test.mjs',
];
const eslint=new ESLint({overrideConfig:[{files:['**/*.mjs'],languageOptions:{globals:globals.node},rules:js.configs.recommended.rules}]});
const lint=[];
const signatures=messages=>messages.reduce((m,x)=>{const key=x.ruleId+':'+x.message;m[key]=(m[key]||0)+1;return m;},{});
for(const file of files){
  const [after]=await eslint.lintText(await fs.readFile(path.join(root,file),'utf8'),{filePath:path.join(root,file)});
  let before={messages:[],errorCount:0,warningCount:0};
  try{[before]=await eslint.lintText(await fs.readFile(path.join(dir,'before',file),'utf8'),{filePath:path.join(root,file)});}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const b=signatures(before.messages),a=signatures(after.messages);
  const introduced=Object.entries(a).filter(([key,count])=>count>(b[key]||0)).map(([message,count])=>({message,count:count-(b[message]||0)}));
  lint.push({file,errorCount:after.errorCount,warningCount:after.warningCount,baselineErrors:before.errorCount,
    baselineWarnings:before.warningCount,introduced,messages:after.messages});
}
await fs.writeFile(path.join(dir,'lint.json'),JSON.stringify(lint,null,2));
const introduced=lint.filter(x=>x.introduced.length);
console.log('Lint: '+lint.reduce((n,x)=>n+x.errorCount,0)+' errors, '+lint.reduce((n,x)=>n+x.warningCount,0)+' warnings; newly introduced diagnostics: '+introduced.length);
for(const x of introduced)console.log(JSON.stringify({file:x.file,introduced:x.introduced}));
const baseline=JSON.parse(await fs.readFile(path.join(dir,'before-hashes.json'),'utf8'));
const sourceChecks=[];
for(const[file,sha]of Object.entries(baseline)){
  const current=createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
  sourceChecks.push({file,before:sha,after:current,unchanged:sha===current});
}
const protectedFiles=['src/MainEditor.jsx','src/Workspace/SetupTab.jsx','src/firebase.js','src/lib/spokenText.js',
  'api/get-upload-url.js','api/proxy-audio.js','api/proxy-media.js','vercel.json'];
const protectedUnchanged=sourceChecks.filter(x=>protectedFiles.includes(x.file)).every(x=>x.unchanged);
await fs.writeFile(path.join(dir,'verification.json'),JSON.stringify({
  executed_at:new Date().toISOString(),commands,lintFiles:files,lintIntroduced:introduced.length,
  targetedLint:lint.some(x=>x.errorCount)?'FAIL_EXISTING_BASELINE':'PASS',protectedUnchanged,sourceChecks,
  liveClerk:'NOT RUN',realWaveSpeed:'NOT RUN',realQwen:'NOT RUN',
},null,2));
if(tests||build||introduced.length||!protectedUnchanged)process.exitCode=1;
