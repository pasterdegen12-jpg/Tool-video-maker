import {confirmedIdentity,resolveCharacterReference} from './characterIdentity.js';
// Legacy session profiles remain readable; durable identities are authoritative.
export const MAX_REFERENCE_BYTES = 1048576;
export function validVisualProposal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'status,visual_description,visual_id' ||
      !['detected', 'ambiguous', 'no_human'].includes(value.status) ||
      typeof value.visual_id !== 'string' || typeof value.visual_description !== 'string') return false;
  if (value.status !== 'detected') return value.visual_id === '' && value.visual_description === '';
  return value.visual_id.length <= 100 && /^[a-z]+(?:_[a-z]+){1,15}$/.test(value.visual_id) &&
    value.visual_description.length <= 600 && !!value.visual_description.trim() && ![...value.visual_description].some(c => c.charCodeAt(0) < 32);
}
export function visualProfilesVisible(env, location) {
  return env.DEV === true && env.VITE_ENABLE_LOCAL_VISUAL_ID === 'true' &&
    location?.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(location.hostname);
}
export function characterBinding(character) {
  return JSON.stringify([character?.id, character?.name, character?.imageUrl ?? '']);
}
export function resolveSceneCharacterProfile(scene, characters, projectType = 'full-ai', projectId) {
  if (projectType !== 'full-ai') return { status: 'not_applicable', profile: null };
  const reference = typeof scene?.Character === 'string' ? scene.Character.trim() : '';
  if (!reference || !Array.isArray(characters)) return { status: 'missing', profile: null };
  if(projectId){
    let match;try{match=resolveCharacterReference(reference,characters,projectId);}catch{return {status:'ambiguous',profile:null};}
    const identity=confirmedIdentity(match,projectId);
    if(identity)return {status:'confirmed',characterId:match.id,identity,profile:{visualId:identity.confirmedId,visualDescription:identity.proposal.visual_description,referenceImage:identity.referenceImage}};
  }
  const matches = characters.filter(c => typeof c.id === 'string' && c.id &&
    (c.id === reference || (typeof c.name === 'string' && c.name.trim() === reference)));
  if (!matches.length) return { status: 'missing', profile: null };
  const c = matches[0];
  if (matches.length !== 1 || characters.filter(other => other.id === c.id).length !== 1) return { status: 'ambiguous', profile: null };
  const p = c.visualProfile;
  if (p?.status !== 'approved' || p.characterId !== c.id || p.binding !== characterBinding(c) ||
      !validVisualProposal({ status: 'detected', visual_id: p.visualId, visual_description: p.visualDescription }) ||
      typeof p.referenceImage?.dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(p.referenceImage.dataUrl) ||
      !/^[a-f0-9]{64}$/.test(p.referenceImage?.sha256)) return { status: 'unapproved', profile: null };
  return { status: 'approved', characterId: c.id, profile: p };
}
export function approveVisualProfile(character, proposal, referenceImage) {
  if (!character?.id || !validVisualProposal(proposal) || proposal.status !== 'detected' ||
      !/^data:image\/(png|jpeg|webp);base64,/.test(referenceImage?.dataUrl || '') ||
      !/^[a-f0-9]{64}$/.test(referenceImage?.sha256 || '')) throw new Error('Invalid visual approval');
  return { status: 'approved', characterId: character.id, binding: characterBinding(character),
    visualId: proposal.visual_id, visualDescription: proposal.visual_description, referenceImage: { ...referenceImage } };
}
