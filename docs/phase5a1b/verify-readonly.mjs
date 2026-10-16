// Read-only CPU comparison; no server, parser, model, browser or provider is started.
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {createHash} from 'node:crypto';
import {composeScene,validateSettings,planDuration,estimateCost} from '../../src/lib/seedanceContract.js';
const root=process.cwd(),dir=path.join(root,'docs/phase5a1b');
const read=p=>fs.readFile(path.join(root,p),'utf8');
const hash=v=>createHash('sha256').update(v).digest('hex');
const before=JSON.parse(await read('docs/phase5a1b/protected-before.json'));
const changes=[];
for(const [file,expected] of Object.entries(before)){
 try{if(hash(await fs.readFile(path.join(root,file)))!==expected)changes.push(file);}
 catch{changes.push(file);}
}
const previous=JSON.parse(await read('docs/phase5a1/integrity.json'));
const sourceResults={};
for(const [workflow,name] of [['full','full-ai'],['semi','semi']]){
 const baseline=previous[workflow],bytes=await fs.readFile(baseline.path),source=bytes.toString('utf8').replace(/\r\n/g,'\n');
 const ids=[...source.matchAll(/^scene_(\d+)\s*$/gm)].map(m=>'scene_'+m[1]);
 const capture=JSON.parse(await read('docs/phase5a1/'+name+'.web-http.json'));
 const aliases={Tone:'Tone_of_Voice','Dịch':'Translate',Time_origin:'time_origin'};
 const rows=capture.scene_comparisons.map(row=>{
  const i=source.indexOf(row.scene_id+'\n'),next=source.indexOf('\nscene_',i+row.scene_id.length);
  const block=source.slice(i,next<0?source.length:next);
  const fields=Object.entries(row.expected).map(([key,value])=>({
   field:key,sourceStillContainsExactFieldLine:block.split('\n').includes(key+': '+value),
   capturedAdapterValueStillMatchesExpected:(Object.hasOwn(row.actual,aliases[key]||key)?row.actual[aliases[key]||key]:Object.hasOwn(row.source_metadata||{},key)?row.source_metadata[key]:row.source_metadata?.metadata?.[key])===value
  }));
  return {scene_id:row.scene_id,fields};
 });
 sourceResults[workflow]={
  file:baseline.path,sha256:hash(bytes),matchesPhase5a1Hash:hash(bytes)===baseline.sha256,
  sceneIds:ids,sceneOrderMatchesCapture:JSON.stringify(ids)===JSON.stringify(capture.scene_comparisons.map(r=>r.scene_id)),
  comparison:'Direct original text lines against previously captured expected/actual; current parser NOT RUN',
  rows
 };
}
const proposal=JSON.parse(await read('docs/phase5a1/proposed-first-paid-test.json'));
const beforeScene=JSON.stringify(proposal.scene),composition=composeScene(proposal.scene,null,'full-ai');
const settings=validateSettings(proposal.settings),plan=planDuration(composition.dialogue),cost=estimateCost(settings);
const result={
 checkedAt:new Date().toISOString(),protectedFileCount:Object.keys(before).length,protectedChanges:changes,
 sourceResults,scene22:{
  compositionExecuted:true,promptMatchesPrevious:composition.prompt===proposal.prompt,
  promptSha256:hash(composition.prompt),inputUnchanged:JSON.stringify(proposal.scene)===beforeScene,
  settings,plan,cost,temporaryPromptFile:'docs/phase5a1/proposed-scene-22-prompt.txt',
  liveProjectComparison:'NOT RUN',referenceImage:'NOT RUN - operator-selected file missing'
 },webSuiteThisPhase:'NOT RUN - no production source changes',buildThisPhase:'NOT RUN',
 realClerk:'NOT RUN - configuration missing',browser:'NOT RUN',realProviderRequests:0
};
await fs.writeFile(path.join(dir,'integrity.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({
 protectedFileCount:result.protectedFileCount,protectedChanges:changes,
 sources:Object.fromEntries(Object.entries(sourceResults).map(([k,v])=>[k,{
  hashMatches:v.matchesPhase5a1Hash,scenes:v.sceneIds.length,orderMatches:v.sceneOrderMatchesCapture,
  directSourceFieldMismatches:v.rows.flatMap(r=>r.fields.filter(f=>!f.sourceStillContainsExactFieldLine).map(f=>r.scene_id+':'+f.field)),
  capturedAdapterMismatches:v.rows.flatMap(r=>r.fields.filter(f=>!f.capturedAdapterValueStillMatchesExpected).map(f=>r.scene_id+':'+f.field))
 }])),scene22:result.scene22
},null,2));

if(changes.length||Object.values(sourceResults).some(v=>!v.matchesPhase5a1Hash||!v.sceneOrderMatchesCapture||v.rows.some(r=>r.fields.some(f=>!f.sourceStillContainsExactFieldLine||!f.capturedAdapterValueStillMatchesExpected)))||!result.scene22.promptMatchesPrevious||!result.scene22.inputUnchanged)process.exitCode=1;
