import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import { composeScene,planDuration,estimateCost,DEFAULT_SETTINGS,MAX_PROMPT_CHARS } from '../src/lib/seedanceContract.js';
import { validateImage } from '../api/lib/seedance/images.js';
import { payload } from './support/seedance-fixtures.mjs';
const time=Date.parse('2026-10-12T12:00:00Z');
test('faithful prompt includes original strings once; no translation or scene mutation',()=>{
  const p=payload(),before=JSON.stringify(p.scene),out=composeScene(p.scene);
  for(const field of ['Context','Character','Action','Camera','Dialogue'])assert.ok(out.prompt.includes(p.scene[field]));
  assert.ok(!out.prompt.includes(p.scene.Translate));
  assert.equal(JSON.stringify(p.scene),before);
  assert.ok(!out.prompt.includes('ORIGINAL TONE'));
  assert.ok(!composeScene({scene_n:1,Dialogue:'Only speech.'}).prompt.includes('ORIGINAL CAMERA'));
});
test('Visual ID supplements Character; legacy read and conflict remain explicit',()=>{
  const scene={scene_n:1,Character:'Judge',Voiceover:'Old exact words.'};
  const before=JSON.stringify(scene),out=composeScene(scene,{visualId:'man_black_coat',visualDescription:'Approved test description.'});
  assert.match(out.prompt,/ORIGINAL CHARACTER:\nJudge/);assert.equal(out.spokenSource,'Voiceover');
  assert.equal(JSON.stringify(scene),before);
  assert.throws(()=>composeScene({...scene,Dialogue:'Different.'}));
  assert.throws(()=>composeScene({...scene,AdditionalPrompt:'Unreviewed expansion.'}));
  assert.throws(()=>composeScene(scene,null,'semi'));
});
test('overflow rejects without truncation; deterministic duration and excessive dialogue blocker',()=>{
  assert.throws(()=>composeScene({scene_n:1,Dialogue:'X'.repeat(MAX_PROMPT_CHARS)}));
  assert.deepEqual(planDuration('one two three'),planDuration('one two three'));
  assert.equal(planDuration('one two three').suggested,4);
  assert.equal(planDuration('word '.repeat(40)).suggested,null);
  assert.equal(planDuration('').seconds,0);
  assert.throws(()=>planDuration('x',{wordsPerMinute:1000,pauseSeconds:0}));
});
for(const [res,audio,usd]of [['480p',false,'0.0600'],['480p',true,'0.1200'],['720p',false,'0.1300'],['720p',true,'0.2600']]){
  test('documented reference price '+res+' audio '+audio,()=>assert.equal(estimateCost({...DEFAULT_SETTINGS,resolution:res,generate_audio:audio},time).usd,usd));
}
test('unsupported and stale pricing cannot invent charge',()=>{
  assert.throws(()=>estimateCost({...DEFAULT_SETTINGS,resolution:'1080p'},time));
  assert.throws(()=>estimateCost({...DEFAULT_SETTINGS,duration:10},time));
  assert.equal(estimateCost(DEFAULT_SETTINGS,time+31*86400000),null);
  assert.equal(estimateCost({...DEFAULT_SETTINGS,duration:4,generate_audio:false},time).usd,'0.0480');
});
test('PNG decoded with CRC, bounded image data and no changes to uploaded bytes',()=>{
  const p=payload(),image=validateImage(p.image_base64,p.mime_type);
  assert.equal(image.bytes.toString('base64'),p.image_base64);
  for(const [b,m]of [[p.image_base64,'image/webp'],['a'.repeat(1398108),'image/png'],[Buffer.from('corrupt').toString('base64'),'image/png']])assert.throws(()=>validateImage(b,m));
  const corrupt=Buffer.from(p.image_base64,'base64');corrupt[corrupt.length-1]^=1;assert.throws(()=>validateImage(corrupt.toString('base64'),'image/png'));
});
test('23 Full AI and 22 Semi real-source regression; immutable scene strings and original files',async()=>{
  const cases=[
    ['full-ai','C:/Users/Admin/Downloads/kịch bản gen video AI.txt','e24725a239b5084dfa4dfd57192cf636e2ebf423ee953ada760bce29d15ca74b',23],
    ['semi','C:/Users/Admin/Downloads/kịch bản semi-content.txt','600431973c83c7c74603fcc1d347a0231c19a310a2a902669d3d8c99f12f9050',22],
  ];
  const evidence=[];
  for(const [type,path,sha,n]of cases){
    const original=await fs.readFile(path);assert.equal(createHash('sha256').update(original).digest('hex'),sha);
    const old=JSON.parse(await fs.readFile(new URL('../docs/phase4b2/'+type+'.http.json',import.meta.url)));
    assert.equal(old.sha256,sha);assert.equal(old.request.script,original.toString('utf8'));
    const scenes=old.completed.result.web_data.scenes,baseline=JSON.stringify(scenes);
    assert.equal(scenes.length,n);
    const rows=[];
    for(const [index,scene]of scenes.entries()){
      const expected=old.scene_comparisons[index].expected;
      assert.equal(scene[type==='full-ai'?'Dialogue':'Voiceover'],expected[type==='full-ai'?'Dialogue':'Voiceover']);
      let prompt=null;
      if(type==='full-ai'){
        const result=composeScene(scene);prompt=result.prompt;assert.ok(prompt.includes(scene.Dialogue));
        for(const key of ['Character','Context','Action','Camera'])assert.equal(scene[key],expected[key]);
        assert.ok(!prompt.includes(scene.Translate));
      }else{assert.throws(()=>composeScene(scene,null,'semi'));assert.equal(scene.time_origin,expected.Time_origin);assert.equal(scene.Footage,expected.Footage);}
      rows.push({scene_id:'scene_'+scene.scene_n,status:'PASS',prompt});
    }
    assert.equal(JSON.stringify(scenes),baseline);assert.deepEqual(await fs.readFile(path),original);
    evidence.push({type,path,sha256:sha,scene_count:n,rows});
  }
  await fs.mkdir(new URL('../docs/phase5a/',import.meta.url),{recursive:true});
  await fs.writeFile(new URL('../docs/phase5a/script-integrity.json',import.meta.url),JSON.stringify(evidence,null,2));
});

test('JPEG decoder validates exact bytes, dimensions and corrupt input',async()=>{
  const jpeg=(await import('jpeg-js')).default;
  const bytes=jpeg.encode({width:32,height:32,data:Buffer.alloc(32*32*4,255)},80).data;
  assert.deepEqual(validateImage(bytes.toString('base64'),'image/jpeg').bytes,bytes);
  assert.throws(()=>validateImage(bytes.subarray(0,bytes.length-2).toString('base64'),'image/jpeg'));
  const tiny=jpeg.encode({width:1,height:1,data:Buffer.alloc(4,255)},80).data;
  assert.throws(()=>validateImage(tiny.toString('base64'),'image/jpeg'));
});
test('video UI visible only in Full AI HTTP loopback development',async()=>{
  const {videoVisible}=await import('../src/lib/seedanceContract.js');
  assert.equal(videoVisible({DEV:true},{hostname:'localhost',protocol:'http:'},'full-ai'),true);
  for(const [env,loc,type]of [
    [{DEV:false},{hostname:'localhost',protocol:'http:'},'full-ai'],
    [{DEV:true},{hostname:'localhost',protocol:'https:'},'full-ai'],
    [{DEV:true},{hostname:'192.168.1.5',protocol:'http:'},'full-ai'],
    [{DEV:true},{hostname:'localhost',protocol:'http:'},'semi'],
  ])assert.equal(videoVisible(env,loc,type),false);
});
test('Vite local-video namespace refuses LAN clients',async()=>{
  const {localAiLoopbackGuard}=await import('../scripts/local-ai-loopback.mjs');
  for(const address of ['10.0.0.1','192.168.1.1','127.0.0.1']){
    let next=false,body='';const res={setHeader(){},end(value){body=value;}};
    localAiLoopbackGuard({url:'/api/local-video/submit',socket:{remoteAddress:address}},res,()=>{next=true;});
    assert.equal(next,address==='127.0.0.1');
    if(!next){assert.equal(res.statusCode,403);assert.ok(body.includes('LOCAL_ONLY'));}
  }
});
