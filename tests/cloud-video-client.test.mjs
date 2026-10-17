import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCloudVideoController,videoMessage} from '../src/lib/cloudVideoClient.js';
import {prepareQuote,publicQuote} from '../api/_lib/cloud-video/core.js';
import {DEFAULT_SETTINGS,videoVisible} from '../src/lib/seedanceContract.js';
const fixture=JSON.parse(await fs.readFile(new URL('./support/visual-fixture.json',import.meta.url)));
const bytes=Buffer.from(fixture.image_base64,'base64'),now=Date.parse('2026-10-17T00:00:00Z'),id='c'.repeat(48);
const scene={scene_n:3,Character:'confirmed_character_id',Dialogue:'Exact original words.',Action:'Sits.',Camera:'Static.',Context:'Court.'};
const payload={project_id:'proj_test',scene,settings:{...DEFAULT_SETTINGS},assumptions:{wordsPerMinute:150,pauseSeconds:.8},image_base64:fixture.image_base64,mime_type:'image/png'};
function harness({paid=true,putStatus=200,mismatch=false}={}){
 const calls=[],states=[];let quote;
 const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 const job={job_id:id,scene_id:3,state:'completed',stage:'COMPLETED',prediction_id:'known',video_url:'https://media.example.org/persisted.mp4'};
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  if(url==='https://storage.example.org/signed')return new Response('',{status:putStatus});
  const action=new URL(url,'https://www.aivideomaker.live').searchParams.get('action');
  assert.equal(options.headers.Authorization,'Bearer mocked-clerk-session');
  const body=options.body?JSON.parse(options.body):null;
  if(action==='quote'){assert.ok(!JSON.stringify(body).includes(fixture.image_base64));quote=publicQuote({...prepareQuote({projectType:'full-ai',data:[scene]},body,now),id,quoteExpires:now+120000},paid);return json(mismatch?{...quote,prompt:'tampered'}:quote);}
  if(action==='ticket')return json({attempt_id:id,image_sha256:quote.image_sha256,upload:{method:'PUT',url:'https://storage.example.org/signed',headers:{'Content-Type':'image/png','If-None-Match':'*'},expires_at:new Date(now+600000).toISOString()}});
  if(action==='verify')return json({verified:true,attempt_id:id,image_sha256:quote.image_sha256});
  if(action==='submit'||action==='job')return json(job);
  if(action==='list')return json({attempts:[{...job,created_at:new Date(now).toISOString()}]});
  throw Error('Unexpected request');
 };
 const controller=createCloudVideoController({getToken:async()=>'mocked-clerk-session',fetchImpl,onChange:s=>states.push(s),now:()=>now});
 return {controller,calls,states};
}
test('browser cloud upload preserves exact bytes and assigned headers; one submit only',async()=>{
 const h=harness();await h.controller.quote(payload);await Promise.all([h.controller.submit(true,true),h.controller.submit(true,true)]);
 assert.equal(h.states.at(-1).status,'completed');const put=h.calls.find(c=>c.url.startsWith('https:'));
 assert.deepEqual(Buffer.from(put.options.body),bytes);assert.equal(createHash('sha256').update(put.options.body).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
 assert.deepEqual(put.options.headers,{'Content-Type':'image/png','If-None-Match':'*'});assert.equal(put.options.credentials,'omit');
 assert.equal(h.calls.filter(c=>c.url==='/api/video?action=submit').length,1);assert.equal(h.calls.filter(c=>c.url==='/api/video?action=verify').length,1);
});
test('paid false or missing consent never transfers reference or submits prediction',async()=>{
 for(const flags of [[false,true,true],[true,false,true],[true,true,false]]){const h=harness({paid:flags[0]});await h.controller.quote(payload);await h.controller.submit(flags[1],flags[2]);assert.equal(h.calls.length,1);}
});
test('failed upload never verifies or sends paid POST',async()=>{const h=harness({putStatus:403});await h.controller.quote(payload);await h.controller.submit(true,true);assert.equal(h.calls.length,3);assert.ok(h.calls.every(c=>!c.url.includes('action=submit')));});
test('settings/image invalidation clears consent and stale quote',async()=>{const h=harness();await h.controller.quote(payload);h.controller.cancel(false);await h.controller.submit(true,true);assert.equal(h.calls.length,1);});
test('different backend prompt is rejected before any image transfer',async()=>{const h=harness({mismatch:true});await h.controller.quote(payload);assert.equal(h.states.at(-1).status,'error');await h.controller.submit(true,true);assert.equal(h.calls.length,1);});
test('refresh recovery only uses GET and plays saved URL',async()=>{const h=harness();await h.controller.discover('proj_test',3);await h.controller.recover(id,3);assert.equal(h.states.at(-1).result,'https://media.example.org/persisted.mp4');assert.ok(h.calls.every(c=>c.options.method==='GET'));});
test('production route has explicit flag and exact host; Semi remains excluded',()=>{const env={VITE_CLOUD_VIDEO_ENABLED:'true'},loc={protocol:'https:',hostname:'www.aivideomaker.live'};assert.equal(videoVisible(env,loc,'full-ai'),true);assert.equal(videoVisible(env,loc,'semi'),false);assert.equal(videoVisible(env,{...loc,hostname:'evil.invalid'},'full-ai'),false);assert.match(videoMessage('PROJECT_CHANGED'),/Dự án đã thay đổi/);});

test('explicit non-billable image consent works with paid disabled and never submits',async()=>{const h=harness({paid:false});await h.controller.quote(payload);await h.controller.upload(false);assert.equal(h.calls.length,1);await Promise.all([h.controller.upload(true),h.controller.upload(true)]);assert.equal(h.states.at(-1).uploadVerified,true);assert.equal(h.calls.length,4);assert.ok(h.calls.every(c=>!c.url.includes('action=submit')));await h.controller.submit(true,true);assert.equal(h.calls.length,4);});
test('separately verified image is reused for one explicitly approved prediction',async()=>{const h=harness();await h.controller.quote(payload);await h.controller.upload(true);await h.controller.submit(true,true);assert.equal(h.calls.filter(c=>c.url==='https://storage.example.org/signed').length,1);assert.equal(h.calls.filter(c=>c.url.includes('action=submit')).length,1);assert.equal(h.states.at(-1).status,'completed');});
