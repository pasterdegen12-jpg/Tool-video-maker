import { readSpokenText, countSpokenWords } from './spokenText.js';
export const MODEL = 'bytedance/seedance-v1.5-pro/image-to-video';
export const PRICING_SOURCE = 'https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-v1.5-pro-image-to-video';
export const VERIFIED_DATE = '2026-10-12';
export const PRICING_VERSION = 'seedance-standard-reference-2026-10-12';
export const MAX_PROMPT_CHARS = 2000; // Conservative application cap; docs publish no numeric prompt maximum.
export const ASPECTS = ['16:9','9:16','1:1','4:3','3:4','21:9'];
export const DEFAULT_SETTINGS = Object.freeze({duration:5,resolution:'480p',aspect_ratio:'16:9',generate_audio:true,camera_fixed:false,seed:-1});
export function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key=>keys.includes(key));
}
export function fail(message) { throw new Error(message); }
export function validateSettings(s, maxDuration=9) {
  if (!exactKeys(s,Object.keys(DEFAULT_SETTINGS)) || Object.keys(s).length!==Object.keys(DEFAULT_SETTINGS).length ||
      !Number.isInteger(s.duration)||s.duration<4||s.duration>maxDuration ||
      !['480p','720p'].includes(s.resolution)||!ASPECTS.includes(s.aspect_ratio) ||
      typeof s.generate_audio!=='boolean'||typeof s.camera_fixed!=='boolean' ||
      !Number.isSafeInteger(s.seed)||s.seed < -1||s.seed>2147483647) fail('Thông số video không được hỗ trợ.');
  return {...s};
}
export function planDuration(dialogue, assumptions={wordsPerMinute:150,pauseSeconds:.8}) {
  if(typeof dialogue!=='string'||!exactKeys(assumptions,['wordsPerMinute','pauseSeconds']) ||
    !Number.isFinite(assumptions.wordsPerMinute)||assumptions.wordsPerMinute<80||assumptions.wordsPerMinute>220 ||
    !Number.isFinite(assumptions.pauseSeconds)||assumptions.pauseSeconds<0||assumptions.pauseSeconds>3) fail('Giả định tốc độ nói không hợp lệ.');
  const words=countSpokenWords(dialogue);
  const seconds=words ? words*60/assumptions.wordsPerMinute+assumptions.pauseSeconds : 0;
  return {words,seconds:Math.ceil(seconds*100)/100,suggested:seconds>9?null:Math.max(4,Math.ceil(seconds)),
    fits:seconds<=9,...assumptions};
}
export function estimateCost(settings, now=Date.now(), maxDuration=9) {
  validateSettings(settings,maxDuration);
  // Never silently price a new model/resolution or reuse stale reference pricing.
  if(now<Date.parse(VERIFIED_DATE)||now>Date.parse(VERIFIED_DATE)+30*86400000) return null;
  const rate=settings.resolution==='480p' ? 12000 : 26000;
  const microUsd=rate*settings.duration*(settings.generate_audio?2:1);
  return {microUsd,usd:(microUsd/1e6).toFixed(4),currency:'USD',version:PRICING_VERSION,
    source:PRICING_SOURCE,verifiedDate:VERIFIED_DATE,kind:'reference_estimate'};
}
export function composeScene(scene, profile=null, projectType='full-ai') {
  if(projectType!=='full-ai'||!scene||Array.isArray(scene)||typeof scene!=='object') fail('Chỉ hỗ trợ một scene Full AI.');
  if(!((Number.isInteger(scene.scene_n)&&scene.scene_n>0)||(typeof scene.scene_n==='string'&&/^(?:scene_)?[1-9]\d{0,5}$/.test(scene.scene_n)))) fail('Scene ID không hợp lệ.');
  const spoken=readSpokenText(scene,'full-ai');
  if(spoken.issue) fail(spoken.message);
  const fields=[['Context','ORIGINAL CONTEXT'],['Character','CHARACTER'],['Action','ORIGINAL ACTION'],['Camera','ORIGINAL CAMERA']];
  const sections=[];
  for(const [key,label] of fields) {
    if(Object.hasOwn(scene,key)) {
      if(typeof scene[key]!=='string') fail('Field '+key+' phải là chuỗi.');
      if(scene[key]!=='') sections.push(label+':\n'+scene[key]);
    }
  }
  if(spoken.source && spoken.text!=='') sections.push('ORIGINAL SPOKEN DIALOGUE:\n'+spoken.text);
  if(Object.hasOwn(scene,'Tone_of_Voice')) {
    if(typeof scene.Tone_of_Voice!=='string') fail('Tone_of_Voice phải là chuỗi.');
    if(scene.Tone_of_Voice!=='') sections.push('ORIGINAL TONE:\n'+scene.Tone_of_Voice);
  }
  // Review unsupported authored extensions instead of silently incorporating creative instructions.
  const supported=['scene_n','Context','Character','Action','Camera','Dialogue','Voiceover','Translate','Tone_of_Voice',
    'Word_count','status','time_origin','Time','startFrameUrl','imageUrl','videoUrl','source_metadata'];
  if(Object.entries(scene).some(([key,value])=>!supported.includes(key)&&value!==''&&value!==null)) fail('Scene có field bổ sung chưa được hỗ trợ. Cần rà soát trước khi tạo video.');
  if(profile!==null) {
    if(!exactKeys(profile,['visualId','visualDescription'])||Object.keys(profile).length!==2 ||
      typeof profile.visualId!=='string'||!/^[a-z]+(?:_[a-z]+){1,15}$/.test(profile.visualId)||
      profile.visualId.length>100||typeof profile.visualDescription!=='string'||!profile.visualDescription.trim()||profile.visualDescription.length>600) fail('Visual Profile không hợp lệ.');
    // Old optional session profiles cannot override the saved Character field.
    // Confirmed identities are migrated atomically into scene.Character first.
  }
  if(!sections.length) fail('Scene không có nội dung để chuyển thành prompt.');
  const prompt='Use the original authored values below. Do not add or paraphrase spoken dialogue, actions or camera instructions. Only ORIGINAL SPOKEN DIALOGUE is spoken text.\n\n'+sections.join('\n\n');
  if([...prompt].length>MAX_PROMPT_CHARS) fail('Prompt vượt giới hạn ứng dụng '+MAX_PROMPT_CHARS+' ký tự; không tự cắt nội dung.');
  return {prompt,dialogue:spoken.text,spokenSource:spoken.source,sceneId:scene.scene_n};
}
export function safeMediaUrl(value) {
  try {
    if(typeof value!=='string'||value.length>8192||/[\s\\]/.test(value)) return false;
    const u=new URL(value);
    return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&(!u.port||u.port==='443') &&
      /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(u.hostname) && u.hostname.includes('.') &&
      !/^[\d.]+$/.test(u.hostname)&&!/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(u.hostname)&&!u.hostname.endsWith('.');
  } catch {return false;}
}
export function videoVisible(env, location, projectType) {
  return projectType==='full-ai'&&((env?.DEV===true&&location?.protocol==='http:'&&['localhost','127.0.0.1'].includes(location?.hostname)) ||
    (env?.VITE_CLOUD_VIDEO_ENABLED==='true'&&location?.protocol==='https:'&&location?.hostname==='www.aivideomaker.live'));
}
