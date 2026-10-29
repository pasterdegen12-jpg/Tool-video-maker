import {sceneVideoPlan} from './cloudVideoContract.js';
import {composeVideoPrompt,validateCloudSettings,cloudVideoCost} from './cloudVideoOptions.js';
import {sceneCameraFixed} from './sceneCamera.js';
import {safeMediaUrl} from './seedanceContract.js';

export const BATCH_TERMINAL=['completed','failed','skipped','cancelled'];
export function batchSceneOptions(scene,now=Date.now()){
 const saved=scene.videoJob?.options||{},mode=saved.mode||'start_frame_to_video';
 const defaults=sceneVideoPlan(scene,mode).settings;
 const settings={...defaults,...saved.settings,duration:defaults.duration};
 settings.camera_fixed=sceneCameraFixed(scene,mode,settings.camera_fixed);
 validateCloudSettings(settings,mode);
 const additional_prompt=saved.additional_prompt||'';
 const prompt=composeVideoPrompt(scene,additional_prompt).prompt;
 if(mode==='start_frame_to_video'&&!safeMediaUrl(scene.startFrameUrl||scene.imageUrl))throw Error('Thiếu ảnh INPUT đã lưu.');
 // The existing single-scene modal keeps References files only in memory.
 // Never replace its ordered references with a different Start Frame.
 if(mode==='references_to_video')throw Error('Ảnh References chưa được lưu bền vững. Hãy dùng modal từng scene để chọn đúng ảnh.');
 const cost=cloudVideoCost(settings,mode,now);if(!cost)throw Error('Bảng giá hiện tại chưa sẵn sàng.');
 return {mode,settings,additional_prompt,prompt,cost};
}
export function batchCounts(items){
 const counts={selected:items.length,queued:0,running:0,completed:0,failed:0,skipped:0,cancelled:0};
 for(const item of items){if(BATCH_TERMINAL.includes(item.state))counts[item.state]++;else if(['pending','preparing','ready'].includes(item.state))counts.queued++;else counts.running++;}
 const terminal=items.every(i=>BATCH_TERMINAL.includes(i.state));
 return {counts,status:terminal?(counts.failed?'finished_with_errors':counts.cancelled?'cancelled':counts.skipped?'finished_with_skips':'completed'):'running'};
}
export const BATCH_LABELS={pending:'Chờ tạo video',preparing:'Đang chuẩn bị',ready:'Chờ gửi',submitting:'Đang gửi yêu cầu',queued:'Đang tạo video',running:'Đang tạo video',completed:'Hoàn thành',failed:'Lỗi',skipped:'Đã bỏ qua',cancelled:'Đã dừng',admission_unknown:'Chưa rõ kết quả gửi — không tự gửi lại'};
