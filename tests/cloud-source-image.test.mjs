import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSourceImageReader,storedImageUrl} from '../api/_lib/cloud-video/source-image.js';
import {hash} from '../api/_lib/cloud-video/core.js';
const origin='https://media.example.org',url=origin+'/project_proj_test/start.png';
const source=value=>({projectType:'full-ai',data:[{scene_n:1,startFrameUrl:value}]});
test('canonical R2 image requires project namespace and exact configured origin; no SSRF or shared unrelated image',()=>{
  assert.equal(storedImageUrl(source(url),'proj_test',1,origin),url);
  for(const value of ['http://127.0.0.1/a','https://other.example.org/project_proj_test/a',origin+'/project_proj_other/a',origin+'/project_proj_test/%2e%2e/a',url+'?token=x','data:image/png;base64,AA==',origin+'/api/proxy?url=x'])
    assert.throws(()=>storedImageUrl(source(value),'proj_test',1,origin));
  assert.throws(()=>storedImageUrl(source(url),'proj_test',2,origin));
});
test('source reader decodes image and returns exact bytes hash/dimensions, never bytes or re-encoding',async()=>{
  const fixture=JSON.parse(await fs.readFile(new URL('./support/visual-fixture.json',import.meta.url))),bytes=Buffer.from(fixture.image_base64,'base64'),calls=[];
  const reader=createSourceImageReader(origin,{request:async(u,o)=>{calls.push({u,o});return {status:200,headers:{'content-type':'image/png'},body:Buffer.from(bytes)};}});
  const result=await reader(source(url),'proj_test',1);
  assert.equal(result.url,url);assert.equal(result.image.sha256,hash(bytes));assert.equal(result.image.size,bytes.length);
  assert.ok(!JSON.stringify(result).includes(fixture.image_base64));assert.equal(calls[0].u,url);assert.equal(calls[0].o.maxBytes,25*1024*1024);
});
test('unreadable, mislabeled or corrupt canonical image fails without provider activity',async()=>{
  for(const status of [200,403,302]){const reader=createSourceImageReader(origin,{request:async()=>({status,headers:{'content-type':'image/jpeg'},body:Buffer.from('not jpeg')})});await assert.rejects(reader(source(url),'proj_test',1));}
});
