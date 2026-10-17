import {GEMINI_MODEL,geminiRequest,parseGeminiResponse} from '../../../src/lib/geminiContract.js';
import {requestHttps} from '../seedance/transport.js';
import {requireValue,ownerOf,rate,id,CloudError} from './core.js';
import {authorizeTeam} from './config.js';
export function createGeminiService({config,store,request=requestHttps,now=Date.now}){
  return async function generate(session,input){
    authorizeTeam(session,config);
    requireValue(config.geminiEnabled&&config.keys.length>0,'GEMINI_CONFIGURATION',503);
    requireValue(input&&Object.keys(input).sort().join(',')==='prompt,request_id'&&typeof input.prompt==='string'&&input.prompt.trim()&&input.prompt.length<=100000&&/^[a-f0-9-]{36}$/.test(input.request_id));
    const owner=ownerOf(session,config.issuer),lease=id();
    await store.transact(owner,(l,team)=>{
      rate(l,'gemini',now(),5);rate(team,'gemini',now(),15);
      team.geminiLeases=(team.geminiLeases||[]).filter(x=>x.until>now());
      requireValue(!team.geminiLeases.some(x=>x.owner===owner)&&team.geminiLeases.length<3,'GEMINI_BUSY',429);
      l.geminiRequests=(l.geminiRequests||[]).filter(x=>x.until>now());
      requireValue(!l.geminiRequests.some(x=>x.id===input.request_id),'GEMINI_ALREADY_USED');
      l.geminiRequests.push({id:input.request_id,until:now()+86400000});requireValue(l.geminiRequests.length<=100,'GEMINI_DAILY_LIMIT',429);
      team.geminiLeases.push({lease,owner,until:now()+125000});
    });
    try{
      // Preserve original ordered multi-key fallback, including malformed JSON.
      // Bounded to configured keys (maximum three); never loop indefinitely.
      for(const key of config.keys){
        try{
          const raw=await request('https://generativelanguage.googleapis.com/v1beta/models/'+GEMINI_MODEL+':generateContent',{
            method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(geminiRequest(input.prompt)),timeoutMs:30000,maxBytes:2*1024*1024});
          const data=JSON.parse(raw.body);
          if(data.error||raw.status<200||raw.status>=300)continue;
          parseGeminiResponse(data);
          // Only the content consumed by the existing parser crosses the boundary.
          return {candidates:[{content:{parts:[{text:data.candidates[0].content.parts[0].text}]}}]};
        }catch{/* Original next-key fallback; no raw upstream errors or keys in logs. */}
      }
      throw new CloudError('GEMINI_EXHAUSTED',502);
    }finally{await store.transact(owner,(_l,team)=>{team.geminiLeases=team.geminiLeases.filter(x=>x.lease!==lease);});}
  };
}
