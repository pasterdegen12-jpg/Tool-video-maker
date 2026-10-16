import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomFillSync} from 'node:crypto';
import {PNG} from 'pngjs';
import jpeg from 'jpeg-js';
import {validateImage} from '../api/lib/seedance/images.js';
import {readVideoImage} from '../src/lib/seedanceImageClient.js';
import {readReferenceFile} from '../src/lib/visualProfileClient.js';
import {MAX_SELECTED_IMAGE_BYTES as MAX,MAX_VIDEO_BODY_BYTES,checkImageSize} from '../src/lib/seedanceImage.js';
import {serveVideo,payload,session} from './support/seedance-fixtures.mjs';
function png(width,height,noise=false){const data=Buffer.alloc(width*height*4,255);if(noise)randomFillSync(data);return PNG.sync.write({width,height,data},{deflateLevel:noise?0:9});}
const hash=b=>createHash('sha256').update(b).digest('hex');
function paddedPNG(b,size){
  const body=Buffer.alloc(size-b.length-12,65);body[1]=0;
  const chunk=Buffer.alloc(body.length+12);chunk.writeUInt32BE(body.length);chunk.write('tEXt',4);body.copy(chunk,8);
  let crc=0xffffffff;for(const byte of chunk.subarray(4,-4)){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  chunk.writeUInt32BE((crc^0xffffffff)>>>0,chunk.length-4);return Buffer.concat([b.subarray(0,-12),chunk,b.subarray(-12)]);
}
test('actual noisy PNG >10 MiB decodes, preserves bytes/hash; real HTTP quote accepts it without provider',async t=>{
  const b=png(1900,1900,true),before=hash(b);assert.ok(b.length>10*1024*1024&&b.length<MAX);
  const selected=await readVideoImage(new File([b],'noise.png',{type:'image/png'}));assert.equal(selected.image_sha256,before);assert.equal(selected.width,1900);
  const validated=validateImage(selected.image_base64,selected.mime_type);assert.deepEqual(validated.bytes,b);
  await assert.rejects(readReferenceFile(new File([b],'noise.png',{type:'image/png'})),/1 MiB/);
  const s=await serveVideo(t,{}, {paidEnabled:false});
  const result=await s.call('/api/local-video/quote',{...payload(),image_base64:selected.image_base64});
  assert.equal(result.status,200);assert.equal(result.body.image_sha256,before);assert.equal(result.body.paid_enabled,false);assert.equal(s.calls.length,0);assert.equal(hash(b),before);
});
test('exactly 25 MiB valid PNG decodes unchanged; plus one byte rejected clearly',async()=>{
  const b=paddedPNG(png(32,32),MAX);const before=hash(b);assert.equal(b.length,MAX);checkImageSize(MAX);
  const out=validateImage(b.toString('base64'),'image/png');assert.equal(out.sha256,before);assert.deepEqual(out.bytes,b);
  const selected=await readVideoImage(new File([b],'boundary.png',{type:'image/png'}));assert.equal(selected.image_sha256,before);
  assert.throws(()=>checkImageSize(MAX+1),{code:'IMAGE_TOO_LARGE'});
  assert.throws(()=>validateImage(paddedPNG(png(32,32),MAX+1).toString('base64'),'image/png'),{code:'IMAGE_TOO_LARGE'});
});
test('6000x4000 =24MP PNG decodes; larger image fails with detected dimensions',async()=>{
  const b=png(6000,4000);assert.deepEqual(validateImage(b.toString('base64'),'image/png').bytes,b);
  assert.equal((await readVideoImage(new File([b],'24mp.png',{type:'image/png'}))).width,6000);
  const tooLarge=png(6001,4000);assert.throws(()=>validateImage(tooLarge.toString('base64'),'image/png'),{code:'IMAGE_DIMENSIONS'});
  await assert.rejects(readVideoImage(new File([tooLarge],'over.png',{type:'image/png'})),/6001×4000/);
});
test('ordinary 1536x2752 JPEG above old 4MP limit is accepted with unchanged hash',async()=>{
  const b=jpeg.encode({width:1536,height:2752,data:Buffer.alloc(1536*2752*4,255)},85).data;
  const out=validateImage(b.toString('base64'),'image/jpeg');assert.equal(out.sha256,hash(b));assert.deepEqual(out.bytes,b);
  assert.equal((await readVideoImage(new File([b],'portrait.jpeg',{type:'image/jpeg'}))).height,2752);
  assert.throws(()=>validateImage(b.subarray(0,-2).toString('base64'),'image/jpeg'),{code:'IMAGE_INVALID'});
});
test('unsupported MIME, mismatched magic, CRC damage and truncation remain rejected',async()=>{
  const b=png(64,64),bad=Buffer.from(b);bad[bad.length-1]^=1;
  for(const x of [bad,b.subarray(0,-5)])assert.throws(()=>validateImage(x.toString('base64'),'image/png'),{code:'IMAGE_INVALID'});
  assert.throws(()=>validateImage(b.toString('base64'),'image/jpeg'),{code:'IMAGE_INVALID'});
  assert.throws(()=>validateImage(b.toString('base64'),'image/webp'),{code:'IMAGE_TYPE'});
  await assert.rejects(readVideoImage(new File([b],'x.webp',{type:'image/webp'})),/PNG hoặc JPEG/);
});
test('actual configured transport limit rejects excess and authentication still runs first',async t=>{
  const s=await serveVideo(t,{}, {paidEnabled:false});
  const response=await fetch(s.base+'/api/local-video/quote',{method:'POST',headers:{Origin:'http://localhost:5173',Authorization:'Bearer '+session(),'Content-Type':'application/json'},body:' '.repeat(MAX_VIDEO_BODY_BYTES+1)});
  assert.equal(response.status,413);assert.equal((await response.json()).error.code,'REQUEST_TOO_LARGE');
  assert.equal((await s.call('/api/local-video/quote',payload(),'invalid')).status,401);assert.equal(s.calls.length,0);
});

// Actual Adam7 streams: validate bounded inflation, not just a size-only buffer.
import {deflateSync,crc32} from 'node:zlib';
function chunk(type,data){const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(type,4);data.copy(out,8);out.writeUInt32BE(crc32(out.subarray(4,-4)),out.length-4);return out;}
function interlaced(extra=0){
  const header=Buffer.alloc(13);header.writeUInt32BE(32);header.writeUInt32BE(32,4);header[8]=8;header[9]=6;header[12]=1;
  const passes=[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]];
  let size=extra;for(const [x,y,dx,dy]of passes)size+=(Math.ceil((32-x)/dx)*4+1)*Math.ceil((32-y)/dy);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc(size))),chunk('IEND',Buffer.alloc(0))]);
}
test('Adam7 PNG decodes; excess inflation, duplicate IHDR and invalid ancillary CRC rejected',()=>{
  const b=interlaced();assert.deepEqual(validateImage(b.toString('base64'),'image/png').bytes,b);
  assert.throws(()=>validateImage(interlaced(1000000).toString('base64'),'image/png'),{code:'IMAGE_INVALID'});
  const duplicate=Buffer.concat([b.subarray(0,33),b.subarray(8,33),b.subarray(33)]);
  assert.throws(()=>validateImage(duplicate.toString('base64'),'image/png'),{code:'IMAGE_INVALID'});
  const corrupt=paddedPNG(png(32,32),1000);corrupt[corrupt.length-13]^=1;
  assert.throws(()=>validateImage(corrupt.toString('base64'),'image/png'),{code:'IMAGE_INVALID'});
});
test('6000x4000 JPEG decodes under explicit decoder memory ceiling',()=>{
  const b=jpeg.encode({width:6000,height:4000,data:Buffer.alloc(6000*4000*4,255)},75).data;
  assert.equal(validateImage(b.toString('base64'),'image/jpeg').sha256,hash(b));
});
