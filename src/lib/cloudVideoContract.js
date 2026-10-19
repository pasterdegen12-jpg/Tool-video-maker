import {videoMode} from './cloudVideoOptions.js';
import {composeScene,DEFAULT_SETTINGS} from './seedanceContract.js';
import {readSceneDuration} from './sceneDuration.js';
export {SPEECH_ASSUMPTIONS} from './sceneDuration.js';

// Cloud model documentation verified 2026-10-18: integer durations 4–12 s.
// The existing local workflow retains its 4–9 s contract.
export const CLOUD_MAX_DURATION=12;
export function sceneVideoPlan(scene,mode='start_frame_to_video'){
  const maxDuration=videoMode(mode).maxDuration;
  return {composed:composeScene(scene),settings:{...DEFAULT_SETTINGS,aspect_ratio:'9:16',duration:readSceneDuration(scene,maxDuration)}};
}
