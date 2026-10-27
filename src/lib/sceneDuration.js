import {readSpokenText} from './spokenText.js';
import {videoMode} from './cloudVideoOptions.js';
import {speechEstimate} from './speechDelivery.js';
import {selectRequestDuration} from './generationDurationPolicy.js';
export const SPEECH_ASSUMPTIONS=Object.freeze({wordsPerMinute:200,pauseSeconds:.25});
export const MIN_PROVIDER_DURATION=4;
// New attempts re-estimate canonical speech; saved durations/history stay untouched.
export function estimateSceneDuration(scene){
 const speech=speechEstimate(scene||{});
 return speech.units?speech.seconds:(Number.isFinite(scene?.duration_seconds)&&scene.duration_seconds>0?scene.duration_seconds:4);
}
export function resolveProviderRequestDuration(sceneOrEstimate,modeOrMax=10){
 const provider=typeof modeOrMax==='number'?{min:4,max:modeOrMax}:videoMode(modeOrMax).durations;
 return selectRequestDuration(typeof sceneOrEstimate==='number'?sceneOrEstimate:estimateSceneDuration(sceneOrEstimate),provider);
}
export function readSceneDuration(scene,modeOrMax=10){return resolveProviderRequestDuration(scene,modeOrMax);}
export function analyzeFullAISceneDurations(scenes){
 return scenes.map(scene=>{
  const spoken=readSpokenText(scene,'full-ai');if(spoken.issue)throw Error(spoken.message);
  return {...scene,duration_seconds:Number.isFinite(scene.duration_seconds)&&scene.duration_seconds>0?scene.duration_seconds:Math.max(4,Math.ceil(estimateSceneDuration(scene)))};
 });
}
