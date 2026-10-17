import {id,hash,ownerOf,sessionOf,requireValue,rate} from './core.js';
import {API} from '../seedance/provider.js';
import {requestHttps,publicAddress} from '../seedance/transport.js';
export const AUDIO_MODELS={minimax:'minimax/speech-2.8-turbo',clone:'wavespeed-ai/qwen3-tts/voice-clone'};
export function validateAudio(mode,payload,r2Origin){
  requireValue(AUDIO_MODELS[mode]&&payload&&typeof payload.text==='string'&&payload.text.length>0&&payload.text.length<=12000);
  const fields=mode==='minimax'?['text','voice_id','language_boost','emotion','format','sample_rate','bitrate','enable_sync_mode']:['text','audio','language','enable_sync_mode',...(Object.hasOwn(payload,'reference_text')?['reference_text']:[])];
  requireValue(Object.keys(payload).sort().join(',')===fields.sort().join(',')&&payload.enable_sync_mode===true);
  if(mode==='minimax')requireValue(payload.voice_id==='Semicook'&&payload.language_boost==='auto'&&payload.emotion==='neutral'&&payload.format==='mp3'&&payload.sample_rate===32000&&payload.bitrate===128000);
  else{
    requireValue(payload.language==='auto');
    let url;try{url=new URL(payload.audio);}catch{requireValue(false,'INVALID_AUDIO_REFERENCE');}
    requireValue(url.protocol==='https:'&&url.origin===r2Origin&&!url.username&&!url.password&&!url.hash&&!url.search,'INVALID_AUDIO_REFERENCE');
    if(Object.hasOwn(payload,'reference_text'))requireValue(typeof payload.reference_text==='string'&&payload.reference_text.length>0&&payload.reference_text.length<=12000);
  }
  return structuredClone(payload);
}
export function createAudioService({config,store,request=requestHttps,checkUrl=publicAddress,now=Date.now}){
  const owner=s=>ownerOf(s,config.issuer);
  const authorize=s=>requireValue(config.allowedOwners.includes(owner(s)),'AUDIO_FORBIDDEN',403);
  const change=(session,fn)=>store.transact(owner(session),(l,team)=>{const value=fn(l,team);team.audio||={};for(const r of Object.values(l.audio||{}))team.audio[r.handle]={handle:r.handle,stage:r.stage,status:r.status||'',owner:owner(session)};return value;});
  const headers={Authorization:'Bearer '+config.audioKey,'Content-Type':'application/json'};
  async function result(raw,expectedModel,expectedId){
    requireValue(raw.status>=200&&raw.status<300,'AUDIO_PROVIDER_HTTP_'+raw.status,502);
    let parsed;try{parsed=JSON.parse(raw.body);}catch{requireValue(false,'AUDIO_RESPONSE',502);}
    const task=parsed.data;
    requireValue(parsed.code===200&&task&&typeof task.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(task.id)&&(!expectedId||task.id===expectedId)&&(!task.model||task.model===expectedModel),'AUDIO_RESPONSE',502);
    requireValue(['completed','success','created','processing','failed'].includes(task.status),'AUDIO_RESPONSE',502);
    const outputs=[];
    if(['completed','success'].includes(task.status)){requireValue(Array.isArray(task.outputs)&&task.outputs.length===1,'AUDIO_RESPONSE',502);await checkUrl(task.outputs[0]);outputs.push(task.outputs[0]);}
    return {id:task.id,status:task.status,outputs};
  }
  return {
    async submit(session,input){
      authorize(session);requireValue(config.audioEnabled&&config.audioKey,'AUDIO_DISABLED',503);
      requireValue(input&&Object.keys(input).sort().join(',')==='idempotency_key,mode,payload'&&/^[a-f0-9-]{36}$/.test(input.idempotency_key));
      const payload=validateAudio(input.mode,input.payload,config.r2Origin),key=input.idempotency_key,handle=id(),fingerprint=hash([input.mode,payload]);
      await change(session,(l,team)=>{
        rate(l,'audio',now(),40);rate(team,'audio',now(),60);team.audio||={};
        requireValue(Object.values(team.audio).filter(r=>['SUBMITTING','UNKNOWN'].includes(r.stage)||['created','processing'].includes(r.status)).length<3,'AUDIO_TEAM_BUSY',429);l.audio||={};requireValue(Object.keys(l.audio).length<200,'AUDIO_CAPACITY',429);
        requireValue(!Object.values(l.audio).some(r=>r.key===key),'AUDIO_ALREADY_USED');
        const day=new Date(now()).toISOString().slice(0,10);l.audioDays||={};requireValue((l.audioDays[day]||0)<100,'AUDIO_DAILY_LIMIT',429);
        requireValue(!Object.values(l.audio).some(r=>['SUBMITTING','UNKNOWN'].includes(r.stage)||['created','processing'].includes(r.status)),'AUDIO_ACTIVE_OR_UNKNOWN');
        team.audioDays||={};requireValue((team.audioDays[day]||0)<300,'AUDIO_TEAM_DAILY_LIMIT',429);team.audioDays[day]=(team.audioDays[day]||0)+1;
        l.audioDays[day]=(l.audioDays[day]||0)+1;l.audio[handle]={key,handle,fingerprint,model:AUDIO_MODELS[input.mode],sessionHash:sessionOf(session),createdAt:now(),stage:'SUBMITTING'};
      });
      try{
        const raw=await request(API+'/'+AUDIO_MODELS[input.mode],{method:'POST',headers,body:JSON.stringify(payload),timeoutMs:110000});
        // Save a known ID before validating other fields, including output URLs.
        let known;try{known=JSON.parse(raw.body).data?.id;}catch{/* uncertain POST */}
        if(typeof known==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(known))await change(session,l=>{l.audio[handle].predictionId=known;l.audio[handle].stage='ACCEPTED';});
        const task=await result(raw,AUDIO_MODELS[input.mode]);
        await change(session,l=>Object.assign(l.audio[handle],{stage:'ACCEPTED',...task}));
        return {code:200,data:task,handle};
      }catch(e){await change(session,l=>{const r=l.audio[handle];if(!r.predictionId)r.stage='UNKNOWN';});throw e;}
    },
    async poll(session,handle){
      authorize(session);requireValue(/^[a-f0-9]{48}$/.test(handle));
      const record=await change(session,l=>{rate(l,'audioPoll',now(),40);const r=l.audio?.[handle];requireValue(r&&r.sessionHash===sessionOf(session),'NOT_FOUND',404);return r;});
      if(['completed','success','failed'].includes(record.status))return {code:200,data:{status:record.status,outputs:record.outputs},handle};
      requireValue(record.predictionId,'AUDIO_SUBMISSION_UNKNOWN');
      const task=await result(await request(API+'/predictions/'+record.predictionId+'/result',{headers}),record.model,record.predictionId);
      await change(session,l=>Object.assign(l.audio[handle],task));return {code:200,data:task,handle};
    },
  };
}
