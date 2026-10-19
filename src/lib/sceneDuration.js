import {planDuration} from './seedanceContract.js';
import {readSpokenText} from './spokenText.js';

export const SPEECH_ASSUMPTIONS=Object.freeze({wordsPerMinute:150,pauseSeconds:.8});
function invalid(code,message){throw Object.assign(new Error(message),{code,status:422});}

// Read only: neither modal options nor historical provider settings are a source.
export function readSceneDuration(scene,maxDuration=Infinity){
  const value=scene?.duration_seconds;
  if(value===undefined)invalid('SCENE_DURATION_MISSING','Scene chưa lưu thời lượng từ phân tích kịch bản. Cần phân tích lại ở MainEditor; hệ thống không tự đoán thời lượng cho dự án cũ.');
  if(!Number.isSafeInteger(value)||value<4)invalid('SCENE_DURATION_INVALID','Thời lượng scene đã lưu không hợp lệ: cần số giây nguyên từ 4 giây. Kiểm tra lại phân tích kịch bản, không tự làm tròn hoặc rút ngắn.');
  if(value>maxDuration)invalid('SCENE_DURATION_INCOMPATIBLE','Thời lượng scene đã lưu là '+value+' giây, vượt giới hạn '+maxDuration+' giây của chế độ này. Chọn chế độ tương thích hoặc phân tích/chia lại scene ở MainEditor; không tự cắt lời thoại.');
  return value;
}

// Run once after Full AI extraction and BEFORE saving a new project.
// Keep the established 150 wpm + 0.8s pause, whole-second/minimum-4s analysis rule.
// There is no provider maximum clamp: an overlong scene remains overlong.
export function analyzeFullAISceneDurations(scenes){
  return scenes.map(scene=>{
    const spoken=readSpokenText(scene,'full-ai');
    if(spoken.issue)throw Error(spoken.message);
    const required=Math.max(4,Math.ceil(planDuration(spoken.text,SPEECH_ASSUMPTIONS).seconds));
    const duration=Object.hasOwn(scene,'duration_seconds')?readSceneDuration(scene):required;
    if(duration<required)invalid('DIALOGUE_DURATION','Thời lượng scene '+scene.scene_n+' đã lưu ngắn hơn lời thoại theo quy tắc phân tích. Cần sửa ở bước phân tích kịch bản.');
    return {...scene,duration_seconds:duration};
  });
}
