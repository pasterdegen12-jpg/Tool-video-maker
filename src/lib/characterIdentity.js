import {validVisualProposal} from './visualProfile.js';

export const validCharacterId = value => typeof value === 'string' && value.length <= 100 && /^[A-Za-z]+(?:_[A-Za-z]+){1,15}$/.test(value);
export function canonicalIdentity(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalIdentity).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonicalIdentity(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function confirmedIdentity(character, projectId, ownerHash) {
  const p=character?.characterIdentity;
  return p?.version===1 && p.status==='confirmed' && p.characterId===character.id && p.projectId===projectId &&
    (!ownerHash || p.ownerHash===ownerHash) && validCharacterId(p.confirmedId) && /^[a-f0-9]{64}$/.test(p.referenceImage?.sha256) ? p : null;
}
function aliases(c, projectId, ownerHash) {
  const p=confirmedIdentity(c,projectId,ownerHash);
  return [...new Set([c.id,c.name,p?.originalName,p?.confirmedId,...(p?.previousIds||[])].filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()))];
}
export function resolveCharacterReference(reference, characters, projectId, ownerHash) {
  if(typeof reference!=='string')return null;
  const matches=characters.filter(c=>aliases(c,projectId,ownerHash).includes(reference.trim()));
  if(matches.length>1 || matches.length===1&&characters.filter(c=>c.id===matches[0].id).length!==1)throw Error('Tham chiếu nhân vật trùng hoặc không rõ ràng.');
  return matches[0]||null;
}
export function displayCharacterReference(reference,characters,projectId){
  try{return resolveCharacterReference(reference,characters||[],projectId);}catch{return null;}
}
// Exact whole labels take priority. Multi-character strings preserve separators/order.
export function mapCharacterReferences(value, characters, projectId, replacement, ownerHash) {
  if(Array.isArray(value))return value.map(v=>mapCharacterReferences(v,characters,projectId,replacement,ownerHash));
  if(typeof value!=='string')throw Error('Character có cấu trúc chưa hỗ trợ; không sửa một phần.');
  const direct=resolveCharacterReference(value,characters,projectId,ownerHash);
  if(direct)return replacement(direct,value);
  const parts=value.split(/(\s*(?:,|;|\||\n|\s&\s|\s\/\s)\s*)/);
  if(parts.length===1)return value;
  return parts.map((part,i)=>i%2?part:mapCharacterReferences(part,characters,projectId,replacement,ownerHash)).join('');
}
export function reconcileCharacterScenes(scenes,characters,projectId,projectType='full-ai') {
  if(projectType!=='full-ai')return scenes;
  return scenes.map(s=>!Object.hasOwn(s,'Character')?s:{...s,Character:mapCharacterReferences(s.Character,characters,projectId,(c,original)=>confirmedIdentity(c,projectId)?.confirmedId||original)});
}
export function migrateCharacterIdentity(project,{projectId,ownerHash,characterId,proposal,confirmedId,referenceImage,confirmedAt,jobId,expectedPreviousId}) {
  if(project.projectType!=='full-ai'||project.id!==projectId||!Array.isArray(project.data)||!Array.isArray(project.characters))throw Error('Chỉ hỗ trợ project Full AI xác định.');
  if(!/^[a-f0-9]{64}$/.test(ownerHash)||!validCharacterId(confirmedId)||!validVisualProposal(proposal)||proposal.status!=='detected'||!Number.isSafeInteger(confirmedAt)||!jobId)throw Error('Đề xuất hoặc xác nhận ID không hợp lệ.');
  const candidates=project.characters.filter(c=>c.id===characterId);if(candidates.length!==1)throw Error('Nhân vật thiếu hoặc trùng.');
  const c=candidates[0],old=confirmedIdentity(c,projectId,ownerHash);
  if(c.characterIdentity&&!old)throw Error('Ánh xạ cũ không thuộc project/tài khoản này.');
  if((old?.confirmedId||null)!==expectedPreviousId)throw Error('ID đã đổi. Tải lại và xác nhận thay thế.');
  if(project.characters.some(other=>other.id!==c.id&&aliases(other,projectId,ownerHash).includes(confirmedId)))throw Error('ID trùng với nhân vật khác.');
  if(!referenceImage||!/^data:image\/(png|jpeg|webp);base64,/.test(referenceImage.dataUrl)||! /^[a-f0-9]{64}$/.test(referenceImage.sha256))throw Error('Ảnh tham chiếu không hợp lệ.');
  const seen=new Set(),changed=[];
  const data=project.data.map(scene=>{
    if(scene.scene_n===undefined||seen.has(String(scene.scene_n)))throw Error('Scene ID thiếu hoặc trùng.');seen.add(String(scene.scene_n));
    if(!Object.hasOwn(scene,'Character'))return scene;
    const next=mapCharacterReferences(scene.Character,project.characters,projectId,(match,original)=>match.id===characterId?confirmedId:original,ownerHash);
    if(canonicalIdentity(next)!==canonicalIdentity(scene.Character))changed.push({sceneId:scene.scene_n,before:scene.Character,after:next});
    return {...scene,Character:next};
  });
  if(!changed.length&&!old)throw Error('Không có scene liên kết chính xác với nhân vật.');
  const identity={version:1,status:'confirmed',projectId,ownerHash,characterId,originalName:old?.originalName||c.name,
    confirmedId,proposal:{...proposal},referenceImage:{...referenceImage},confirmedAt,jobId,
    previousIds:[...new Set([...(old?.previousIds||[]),...(old&&old.confirmedId!==confirmedId?[old.confirmedId]:[])])]};
  const characters=project.characters.map(other=>other.id===characterId?{...other,characterIdentity:identity}:other);
  return {data,characters,changed};
}
