import {sceneCameraFixed} from './sceneCamera.js';
import {videoMode} from './cloudVideoOptions.js';
import {composeScene,DEFAULT_SETTINGS} from './seedanceContract.js';
import {readSceneDuration} from './sceneDuration.js';
export {SPEECH_ASSUMPTIONS} from './sceneDuration.js';

// Application request policy: 4–10 s; historical metadata is unchanged.
// The existing local workflow retains its 4–9 s contract.
export const CLOUD_MAX_DURATION=10;
export function sceneVideoPlan(scene,mode='start_frame_to_video'){
  videoMode(mode);
  return {composed:composeScene(scene),settings:{...DEFAULT_SETTINGS,aspect_ratio:'9:16',camera_fixed:sceneCameraFixed(scene,mode),duration:readSceneDuration(scene,mode)}};
}
