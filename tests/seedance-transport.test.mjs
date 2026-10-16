// Transport policy unit tests with simulated TLS sockets; no network or paid provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {requestHttps} from '../api/lib/seedance/transport.js';
const url='https://storage.wavespeed.ai/file?temporary=REDACTED';
const resolver=async()=>[{address:'93.184.216.34',family:4}];
function fake(t,{mode='ok',body='ok'}={}){
  let observed;
  t.mock.method(https,'request',(u,options,onResponse)=>{
    const req=new EventEmitter();
    observed={u,options,req,written:[],destroyed:false};
    req.write=b=>observed.written.push(b);
    req.destroy=()=>{observed.destroyed=true;};
    req.end=()=>queueMicrotask(()=>{
      const socket=new EventEmitter();socket.remoteAddress=mode==='rebind'?'127.0.0.1':'93.184.216.34';
      req.emit('socket',socket);socket.emit('secureConnect');
      if(mode==='rebind'||mode==='timeout')return;
      const res=new EventEmitter();res.statusCode=mode==='redirect'?307:200;res.headers={};res.destroy=()=>{};
      onResponse(res);
      res.emit('data',Buffer.from(body));res.emit('end');
    });
    return req;
  });
  return()=>observed;
}
test('TLS uses original SNI, pinned public address, no pooled agent, exact upload bytes',async t=>{
  const get=fake(t),bytes=Buffer.from('exact upload bytes');
  const result=await requestHttps(url,{method:'PUT',headers:{'Content-Type':'image/png'},body:bytes},resolver);
  assert.equal(result.body,'ok');
  const {options,written}=get();
  assert.equal(options.servername,'storage.wavespeed.ai');assert.equal(options.agent,false);
  assert.deepEqual(written,[bytes]);assert.equal(options.headers.Authorization,undefined);
  assert.equal(options.headers['Content-Length'],String(bytes.length));
  assert.equal(options.headers['Transfer-Encoding'],undefined);
  options.lookup('storage.wavespeed.ai',{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'93.184.216.34');assert.equal(family,4);});
  options.lookup('storage.wavespeed.ai',{all:true},(error,addresses)=>{assert.equal(error,null);assert.deepEqual(addresses,[{address:'93.184.216.34',family:4}]);});
});
for(const mode of ['redirect','rebind','overflow','timeout'])test('transport rejects '+mode+' with bounded failure',async t=>{
  const get=fake(t,{mode,body:'oversized'});
  await assert.rejects(requestHttps(url,{maxBytes:mode==='overflow'?2:100,timeoutMs:10},resolver));
  if(['rebind','timeout'].includes(mode))assert.equal(get().destroyed,true);
});
test('private DNS fails before HTTPS connection',async t=>{
  let opened=false;t.mock.method(https,'request',()=>{opened=true;throw Error('must not connect');});
  await assert.rejects(requestHttps(url,{},async()=>[{address:'10.0.0.1',family:4}]));
  assert.equal(opened,false);
});
test('JSON length is measured as UTF-8 bytes; caller headers are not mutated',async t=>{
  const get=fake(t),body=JSON.stringify({name:'Ảnh scene 3'}),headers={'Content-Type':'application/json'};
  await requestHttps(url,{method:'POST',headers,body},resolver);
  assert.equal(get().options.headers['Content-Length'],String(Buffer.byteLength(body)));
  assert.deepEqual(headers,{'Content-Type':'application/json'});
});
test('matching content-length preserved; conflicting framing rejected before network',async t=>{
  const get=fake(t);await requestHttps(url,{method:'PUT',headers:{'content-length':'3'},body:Buffer.from('abc')},resolver);
  assert.equal(get().options.headers['content-length'],'3');assert.equal(get().options.headers['Content-Length'],undefined);
  for(const headers of [{'Content-Length':'2'},{'Transfer-Encoding':'chunked'},{'Content-Length':'3','content-length':'3'}]){
    await assert.rejects(requestHttps(url,{method:'PUT',headers,body:Buffer.from('abc')},async()=>{throw Error('Must not resolve');}),e=>e.reason==='REQUEST_FRAMING');
  }
});
