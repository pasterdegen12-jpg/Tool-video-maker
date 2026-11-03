import {requestHttps} from '../seedance/transport.js';
import {need} from '../qwen/queue.js';
import {MOLMO_MODEL,VISION_PROMPT} from './prompt.js';
export function molmoProvider(key,request=requestHttps){
 async function call(path,body){
  need(typeof key==='string'&&key.length>10,'MOLMO_UNAVAILABLE',503);
  const response=await request('https://api.wavespeed.ai/api/v3/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),timeoutMs:20000,maxBytes:32000});
  need(response.status===200,'MOLMO_PROVIDER_UNAVAILABLE',503);
  let data;try{data=JSON.parse(response.body).data;}catch{need(false,'MOLMO_RESPONSE_INVALID',502);}
  need(data&&typeof data.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(data.id),'MOLMO_RESPONSE_INVALID',502);
  return data;
 }
 return {submit:url=>call(MOLMO_MODEL,{images:[url],text:VISION_PROMPT}),get:async id=>{
  need(/^[A-Za-z0-9_-]{1,128}$/.test(id),'INVALID_PREDICTION',422);
  const data=await call('predictions/'+id+'/result');need(data.id===id,'MOLMO_RESPONSE_INVALID',502);return data;
 }};
}
