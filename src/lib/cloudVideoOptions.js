import {ASPECTS,MODEL,composeScene,validateSettings,MAX_PROMPT_CHARS} from './seedanceContract.js';

export const VIDEO_MODES=Object.freeze({
  start_frame_to_video:{label:'Start Frame → Video',model:MODEL,name:'Seedance 1.5 Pro',maxImages:1,maxDuration:12},
  text_to_video:{label:'Text → Video',model:'bytedance/seedance-v1.5-pro/text-to-video',name:'Seedance 1.5 Pro',maxImages:0,maxDuration:12},
  references_to_video:{label:'References → Video',model:'bytedance/seedance-2.0-mini/text-to-video',name:'Seedance 2.0 Mini · ảnh tham chiếu',maxImages:9,maxDuration:15},
});
export const VIDEO_RESOLUTIONS=['480p','720p','1080p'];
export {ASPECTS};
export function videoMode(mode='start_frame_to_video'){
  if(!Object.hasOwn(VIDEO_MODES,mode))throw Error('Chế độ video không được hỗ trợ.');
  return VIDEO_MODES[mode];
}
export function validateCloudSettings(settings,mode='start_frame_to_video'){
  const cap=videoMode(mode);
  if(!VIDEO_RESOLUTIONS.includes(settings?.resolution))throw Error('Độ phân giải không được hỗ trợ.');
  validateSettings({...settings,resolution:settings.resolution==='1080p'?'720p':settings.resolution},cap.maxDuration);
  if(mode==='references_to_video'&&(settings.camera_fixed!==false||settings.seed!==-1))throw Error('Chế độ References không hỗ trợ camera_fixed/seed; hướng camera lấy từ kịch bản.');
  return {...settings};
}
export function composeVideoPrompt(scene,additional=''){
  const composed=composeScene(scene);
  if(typeof additional!=='string'||additional.length>1000||[...additional].some(c=>{const n=c.charCodeAt(0);return n<32&&![9,10,13].includes(n)||n===127;}))throw Error('Custom prompt không hợp lệ (tối đa 1000 ký tự).');
  // A default for generated speech, not a rewrite of authored tempo or emotion.
  // Keep composeScene/snapshot semantics unchanged for existing durable attempts.
  const speech=composed.dialogue.trim()?'\n\nSPEECH DELIVERY (not spoken text):\nFollow explicit authored speech pace and pauses first, including slow or deliberate delivery. Otherwise use natural conversational pace, clear articulation and short natural pauses; avoid drawn-out words or excess silence. Preserve every word, language, emotion and character identity.':'';
  const extra=additional.trim()?'\n\nOPTIONAL ADDITIONAL DIRECTION (subordinate to the original scene; never change the original spoken dialogue or character identity):\n'+additional:'';
  const original=composed.prompt+extra;
  if([...original].length>MAX_PROMPT_CHARS)throw Error('Tổng prompt vượt '+MAX_PROMPT_CHARS+' ký tự; hãy rút ngắn phần bổ sung. Kịch bản gốc không bị cắt.');
  // Optional guidance must not make a previously valid authored prompt unusable.
  const prompt=[...original+speech].length<=MAX_PROMPT_CHARS?composed.prompt+speech+extra:original;
  return {...composed,prompt};
}
// Provider docs / public model pricing metadata verified 2026-10-19.
// No video references in this release: their input-duration pricing is distinct.
export function cloudVideoCost(settings,mode='start_frame_to_video',now=Date.now()){
  validateCloudSettings(settings,mode);
  const verifiedDate='2026-10-19';
  if(now<Date.parse(verifiedDate)||now>Date.parse(verifiedDate)+30*86400000)return null;
  const reference=mode==='references_to_video';
  const rate=reference?{ '480p':60000,'720p':120000,'1080p':300000 }[settings.resolution]:{'480p':12000,'720p':26000,'1080p':52000}[settings.resolution]*(settings.generate_audio?2:1);
  const microUsd=rate*settings.duration;
  return {microUsd,usd:(microUsd/1e6).toFixed(4),currency:'USD',version:'video-options-2026-10-19',
    source:'https://wavespeed.ai/docs/docs-api/bytedance/'+(reference?'bytedance-seedance-2.0-mini-text-to-video':mode==='text_to_video'?'bytedance-seedance-v1.5-pro-text-to-video':'bytedance-seedance-v1.5-pro-image-to-video'),verifiedDate,kind:'reference_estimate'};
}
export function providerVideoPayload(record){
  const mode=record.mode||'start_frame_to_video';videoMode(mode);
  const s=validateCloudSettings(record.settings,mode);
  if(mode==='text_to_video')return {prompt:record.prompt,...s};
  if(mode==='references_to_video')return {prompt:record.prompt,reference_images:record.uploadedImages.map(i=>i.url),duration:s.duration,resolution:s.resolution,aspect_ratio:s.aspect_ratio,generate_audio:s.generate_audio,enable_web_search:false};
  return {image:record.downloadUrl,prompt:record.prompt,...s};
}
