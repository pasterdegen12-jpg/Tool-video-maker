import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Buffer } from 'node:buffer';
import { safeMediaUrl } from '../../../src/lib/seedanceContract.js';
import { VideoError } from './errors.js';
export function publicIPv4(ip){
  if(isIP(ip)!==4)return false;
  const [a,b]=ip.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||
    a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0);
}
export async function publicAddress(url, resolver=lookup){
  if(!safeMediaUrl(url))throw new VideoError('INVALID_PROVIDER_RESPONSE');
  const u=new URL(url);
  let timer;
  try{
    const addresses=await Promise.race([resolver(u.hostname,{all:true,family:4}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new VideoError('UPSTREAM_FAILED')),5000);})]);
    if(!addresses.length||addresses.some(x=>!publicIPv4(x.address)))throw new VideoError('INVALID_PROVIDER_RESPONSE');
    return addresses[0].address;
  }finally{clearTimeout(timer);}
}
// DNS-pinned TLS connection. Never follows redirects and never forwards cookies/ambient credentials.
export async function requestHttps(url,{method='GET',headers={},body,timeoutMs=20000,maxBytes=65536}={}, resolver=lookup){
  const address=await publicAddress(url,resolver),u=new URL(url);
  return await new Promise((resolve,reject)=>{
    let ended=false;
    const finish=(error,value)=>{if(ended)return;ended=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const req=https.request(u,{method,headers,agent:false,servername:u.hostname,
      lookup:(_hostname,options,callback)=>options?.all?callback(null,[{address,family:4}]):callback(null,address,4)},res=>{
      let size=0;const chunks=[];
      if(res.statusCode>=300&&res.statusCode<400){res.destroy();finish(new VideoError('INVALID_PROVIDER_RESPONSE'));return;}
      res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){res.destroy();finish(new VideoError('INVALID_PROVIDER_RESPONSE'));}else chunks.push(chunk);});
      res.on('end',()=>finish(null,{status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));
      res.on('error',()=>finish(new VideoError('UPSTREAM_FAILED')));
    });
    const timer=setTimeout(()=>{req.destroy();finish(new VideoError('UPSTREAM_FAILED'));},timeoutMs);
    req.on('socket',socket=>socket.once('secureConnect',()=>{
      if(socket.remoteAddress!==address&&socket.remoteAddress!=='::ffff:'+address){req.destroy();finish(new VideoError('INVALID_PROVIDER_RESPONSE'));}
    }));
    req.on('error',()=>finish(new VideoError('UPSTREAM_FAILED')));
    if(body!==undefined)req.write(body);
    req.end();
  });
}
