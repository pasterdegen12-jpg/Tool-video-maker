import {composeScene,planDuration,DEFAULT_SETTINGS} from './seedanceContract.js';

// Cloud model documentation verified 2026-10-18: integer durations 4–12 s.
// The existing local workflow retains its 4–9 s contract.
export const CLOUD_MAX_DURATION=12;
export const SPEECH_ASSUMPTIONS=Object.freeze({wordsPerMinute:150,pauseSeconds:.8});
export function sceneVideoPlan(scene){
  const composed=composeScene(scene),plan=planDuration(composed.dialogue,SPEECH_ASSUMPTIONS);
  if(plan.seconds>CLOUD_MAX_DURATION)throw new Error('Lời thoại ước tính cần '+plan.seconds+' giây, vượt giới hạn 12 giây mỗi video. Hãy chia lời thoại bằng Sửa Scene; hệ thống không tự cắt nội dung.');
  return {composed,plan,settings:{...DEFAULT_SETTINGS,duration:Math.max(4,Math.ceil(plan.seconds))},assumptions:{...SPEECH_ASSUMPTIONS}};
}
