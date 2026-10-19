import {planDuration,DEFAULT_SETTINGS} from './seedanceContract.js';
import {readSpokenText} from './spokenText.js';
import {videoMode} from './cloudVideoOptions.js';

export const SPEECH_ASSUMPTIONS=Object.freeze({wordsPerMinute:150,pauseSeconds:.8});
export const MIN_PROVIDER_DURATION=4;

function invalid(code,message){throw Object.assign(new Error(message),{code,status:422});}

/**
 * Priority 1: scene.duration_seconds if valid finite number > 0
 * Priority 2: recover estimate from canonical dialogue/voiceover using 150wpm + 0.8s pause
 * Priority 3: fallback to provider default (DEFAULT_SETTINGS.duration = 5)
 */
export function estimateSceneDuration(scene){
  const saved=scene?.duration_seconds;
  if(typeof saved==='number'&&Number.isFinite(saved)&&saved>0){
    return saved;
  }
  if(scene&&typeof scene==='object'){
    try{
      const spoken=readSpokenText(scene,'full-ai');
      if(spoken&&!spoken.issue&&spoken.text&&spoken.text.trim()){
        const planned=planDuration(spoken.text,SPEECH_ASSUMPTIONS);
        if(Number.isFinite(planned.seconds)&&planned.seconds>0){
          return Math.max(MIN_PROVIDER_DURATION,Math.ceil(planned.seconds));
        }
      }
    }catch{
      // fallback
    }
  }
  return DEFAULT_SETTINGS.duration;
}

/**
 * Converts estimated scene duration to a provider-supported request duration.
 * Discrete supported durations for WaveSpeed Seedance:
 * - start_frame_to_video: integers 4–12 s
 * - text_to_video: integers 4–12 s
 * - references_to_video: integers 4–15 s
 *
 * Tie-breaking rule:
 * Math.round rounds half towards positive infinity.
 * Clamped between MIN_PROVIDER_DURATION (4) and maxDuration (12 or 15).
 * Never locks generation for being longer or shorter than provider limits.
 */
export function resolveProviderRequestDuration(sceneOrEstimate,modeOrMax=12){
  const maxDuration=typeof modeOrMax==='number'?modeOrMax:(videoMode(modeOrMax)?.maxDuration||12);
  const estimate=typeof sceneOrEstimate==='number'?sceneOrEstimate:estimateSceneDuration(sceneOrEstimate);
  const rounded=Number.isFinite(estimate)?Math.round(estimate):DEFAULT_SETTINGS.duration;
  return Math.min(maxDuration,Math.max(MIN_PROVIDER_DURATION,rounded));
}

// Read only: resolves valid provider request duration without locking generation
export function readSceneDuration(scene,maxDuration=12){
  return resolveProviderRequestDuration(scene,maxDuration);
}

// Run once after Full AI extraction and BEFORE saving a new project.
// Keep the established 150 wpm + 0.8s pause, whole-second/minimum-4s analysis rule.
// There is no provider maximum clamp: an overlong scene remains overlong in screenplay data.
export function analyzeFullAISceneDurations(scenes){
  return scenes.map(scene=>{
    const spoken=readSpokenText(scene,'full-ai');
    if(spoken.issue)throw Error(spoken.message);
    const required=Math.max(MIN_PROVIDER_DURATION,Math.ceil(planDuration(spoken.text,SPEECH_ASSUMPTIONS).seconds));
    const duration=Object.hasOwn(scene,'duration_seconds')&&Number.isFinite(scene.duration_seconds)&&scene.duration_seconds>0
      ? scene.duration_seconds
      : required;
    if(Object.hasOwn(scene,'duration_seconds')&&duration<required)invalid('DIALOGUE_DURATION','Thời lượng scene '+scene.scene_n+' đã lưu ngắn hơn lời thoại theo quy tắc phân tích. Cần sửa ở bước phân tích kịch bản.');
    return {...scene,duration_seconds:duration};
  });
}

