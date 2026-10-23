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
  const extra=additional.trim()?'\n\nOPTIONAL ADDITIONAL DIRECTION (subordinate to original Dialogue, Character, Camera and Action; never override them):\n'+additional:'';
  // composeScene remains the validator and legacy snapshot contract. Construct only
  // the outbound presentation here; never parse its text or mutate saved fields.
  const visual=[['Context','CONTEXT'],['Character','CHARACTER'],['Action','ACTION'],['Camera','CAMERA'],['Tone_of_Voice','TONE']]
    .filter(([key])=>scene[key]).map(([key,label])=>label+':\n'+scene[key]).join('\n\n');
  const spoken=composed.dialogue!==''?'\n\nSPOKEN AUDIO (exact words, original language, synchronized lips):\n'+composed.dialogue:'';
  const constraint='\n\nPICTURE: No dialogue captions, subtitles or overlays unless explicitly authored. Preserve physical writing.';
  const original='VISUAL:\n'+visual+spoken+constraint+extra;
  if([...original].length>MAX_PROMPT_CHARS)throw Error('Tổng prompt vượt '+MAX_PROMPT_CHARS+' ký tự; hãy rút ngắn phần bổ sung. Kịch bản gốc không bị cắt.');
  const delivery=composed.dialogue.trim()?'\n\nPERFORMANCE: Follow authored pace and pauses first. Otherwise speak naturally with clear articulation and short pauses; preserve words, language and emotion. Camera constraints do not freeze acting.':'';
  const prompt=[...original+delivery].length<=MAX_PROMPT_CHARS?'VISUAL:\n'+visual+spoken+constraint+delivery+extra:original;
  return {...composed,prompt,warnings:videoPromptWarnings(additional)};
}
// Report explicit additive requests without deleting user direction or adding a
// confirmation gate. This narrow language check is not a semantic classifier.
export function videoPromptWarnings(additional=''){
  const clauses=additional.normalize('NFC').toLowerCase().split(/[.!?;\n]/);
  const requested=clauses.some(s=>!/(?:\bno\b|\bnot\b|\bwithout\b|\bavoid\b|\bnever\b|không|đừng)/u.test(s)&&
    /(?:add|show|include|render|display|enable|burn.?in|thêm|hiển thị|chèn|bật).{0,50}(?:subtitles?|captions?|phụ đề)/u.test(s));
  return requested?['Custom prompt đang yêu cầu phụ đề, trái với mục tiêu hình ảnh không phụ đề. Nội dung bạn nhập vẫn được giữ nguyên; hãy sửa nếu đây không phải chủ ý.']:[];
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
