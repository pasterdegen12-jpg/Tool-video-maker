import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Buffer } from 'node:buffer';
import { safeMediaUrl } from '../../../src/lib/seedanceContract.js';
import {diagnosticError} from './diagnostics.js';
export function publicIPv4(ip){
  if(isIP(ip)!==4)return false;
  const [a,b]=ip.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||
    a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0);
}
export async function publicAddress(url, resolver=lookup){
  if(!safeMediaUrl(url))throw diagnosticError('INVALID_PROVIDER_RESPONSE','UNSAFE_URL');
  const u=new URL(url);
  let timer;
  try{
    const addresses=await Promise.race([Promise.resolve().then(()=>resolver(u.hostname,{all:true,family:4})).catch(()=>{throw diagnosticError('UPSTREAM_FAILED','DNS_LOOKUP');}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(diagnosticError('UPSTREAM_FAILED','DNS_TIMEOUT')),5000);})]);
    if(!addresses.length||addresses.some(x=>!publicIPv4(x.address)))throw diagnosticError('INVALID_PROVIDER_RESPONSE','PRIVATE_ADDRESS');
    return addresses[0].address;
  }finally{clearTimeout(timer);}
}
// DNS-pinned TLS connection. Never follows redirects and never forwards cookies/ambient credentials.
export async function requestHttps(url,{method='GET',headers={},body,timeoutMs=20000,maxBytes=65536,binary=false}={}, resolver=lookup){
  if(body!==undefined){
    if(typeof body!=='string'&&!Buffer.isBuffer(body))throw diagnosticError('INVALID_PROVIDER_RESPONSE','REQUEST_FRAMING');
    const length=String(Buffer.byteLength(body)),lengthKeys=Object.keys(headers).filter(k=>k.toLowerCase()==='content-length');
    if(lengthKeys.length>1||Object.keys(headers).some(k=>k.toLowerCase()==='transfer-encoding')||
      lengthKeys.length===1&&String(headers[lengthKeys[0]])!==length)throw diagnosticError('INVALID_PROVIDER_RESPONSE','REQUEST_FRAMING');
    // Signed object uploads require fixed framing. req.write() without this
    // would use chunked transfer encoding, unlike the documented file upload.
    headers={...headers,[lengthKeys[0]||'Content-Length']:length};
  }
  const address=await publicAddress(url,resolver),u=new URL(url);
  return await new Promise((resolve,reject)=>{
    let ended=false;
    const finish=(error,value)=>{if(ended)return;ended=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const req=https.request(u,{method,headers,agent:false,servername:u.hostname,
      lookup:(_hostname,options,callback)=>options?.all?callback(null,[{address,family:4}]):callback(null,address,4)},res=>{
      let size=0;const chunks=[];
      if(res.statusCode>=300&&res.statusCode<400){res.destroy();finish(diagnosticError('INVALID_PROVIDER_RESPONSE','REDIRECT',res.statusCode));return;}
      res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){res.destroy();finish(diagnosticError('INVALID_PROVIDER_RESPONSE','RESPONSE_TOO_LARGE',res.statusCode));}else chunks.push(chunk);});
      res.on('end',()=>finish(null,{status:res.statusCode,headers:res.headers,body:binary?Buffer.concat(chunks):Buffer.concat(chunks).toString('utf8')}));
      res.on('error',()=>finish(diagnosticError('UPSTREAM_FAILED','RESPONSE_ERROR',res.statusCode)));
    });
    const timer=setTimeout(()=>{req.destroy();finish(diagnosticError('UPSTREAM_FAILED','REQUEST_TIMEOUT'));},timeoutMs);
    req.on('socket',socket=>socket.once('secureConnect',()=>{
      if(socket.remoteAddress!==address&&socket.remoteAddress!=='::ffff:'+address){req.destroy();finish(diagnosticError('INVALID_PROVIDER_RESPONSE','REMOTE_ADDRESS'));}
    }));
    req.on('error',()=>finish(diagnosticError('UPSTREAM_FAILED','REQUEST_ERROR')));
    if(body!==undefined)req.write(body);
    req.end();
  });
}
