// A retry is a new, explicitly consented attempt, never a replay of a POST.
const id=value=>typeof value==='string'&&/^[a-f0-9]{48}$/.test(value);
const binding=['owner','user','scope','fingerprint','imageHash','promptHash','settingsHash','sceneId'];
export function prePredictionFailure(record){
  if(!record||record.stage!=='FAILED'||record.state!=='failed'||record.upstreamId!==null||record.url!==null||record.polls!==0||
    !Array.isArray(record.events)||!record.events.length)return false;
  let previous=-1;
  for(const event of record.events){
    if(!Number.isSafeInteger(event.at)||event.at<record.createdAt||event.at<previous||event.at>record.updatedAt)return false;
    previous=event.at;
  }
  const stages=record.events.map(e=>e.stage);
  while(stages.length>1&&stages[0]==='QUOTED'&&stages[1]==='QUOTED')stages.shift();
  return ['QUOTED,UPLOADING,FAILED','QUOTED,UPLOADING,UPLOADED,FAILED'].includes(stages.join())&&
    record.events[0].at===record.createdAt&&record.events.at(-1).at===record.updatedAt;
}
export function validRetry(retry,record){
  return retry&&Object.keys(retry).sort().join()==='authorizationId,authorizedAt,consumedAt,predecessorId'&&
    id(retry.authorizationId)&&id(retry.predecessorId)&&retry.predecessorId!==record.id&&
    Number.isSafeInteger(retry.authorizedAt)&&retry.authorizedAt>=record.createdAt&&retry.authorizedAt<=record.updatedAt&&
    (record.stage==='QUOTED'?retry.consumedAt===null:
      Number.isSafeInteger(retry.consumedAt)&&retry.consumedAt>=retry.authorizedAt&&retry.consumedAt<=record.updatedAt);
}
export function sameRetryBinding(a,b){return binding.every(key=>a?.[key]===b?.[key]);}
export function retryAncestors(records,predecessorId,quote){
  const seen=new Set();let current=predecessorId;
  while(current){
    if(seen.has(current)||seen.size>=records.length)return null;
    const parent=records.find(r=>r.id===current);
    if(!prePredictionFailure(parent)||!sameRetryBinding(parent,quote))return null;
    seen.add(current);current=parent.retry?.predecessorId;
  }
  return seen;
}
export function canAuthorizeRetry(records,predecessorId,quote,now){
  if(!quote||quote.stage!=='QUOTED'||quote.expiresAt<=now||records.some(r=>r.user===quote.user&&r.stage==='UNKNOWN'))return false;
  const ancestors=retryAncestors(records,predecessorId,quote);
  if(!ancestors)return false;
  return records.every(r=>{
    if(r.id===quote.id||r.user!==quote.user||r.fingerprint!==quote.fingerprint)return true;
    if(r.stage==='QUOTED')return !r.retry||r.expiresAt<=now;
    // A foreign branch/accepted/active record cannot be waived, even if expired.
    return ancestors.has(r.id);
  });
}
export function retryCandidate(records,quote,now){
  return records.find(r=>r.user===quote.user&&r.fingerprint===quote.fingerprint&&canAuthorizeRetry(records,r.id,quote,now))?.id??null;
}
