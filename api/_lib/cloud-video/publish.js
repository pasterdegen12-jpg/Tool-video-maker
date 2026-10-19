import {requireValue,sceneSnapshot} from './core.js';
export function completedSceneData(project,record){
  requireValue(record.stage==='COMPLETED'&&record.videoUrl&&record.predictionId,'OUTPUT_NOT_COMPLETED');
  const matches=project.data?.filter(s=>String(s.scene_n)===String(record.sceneId));
  requireValue(matches?.length===1,'SCENE_NOT_FOUND',404);
  const scene=matches[0];
  if(scene.videoJob?.id===record.id&&scene.videoUrl===record.videoUrl)return null;
  requireValue(record.snapshotVersion===2&&sceneSnapshot(project,record.sceneId)===record.sceneDigest,'OUTPUT_SOURCE_CHANGED');
  requireValue(!scene.videoJob?.createdAt||scene.videoJob.createdAt<=record.createdAt,'OUTPUT_SUPERSEDED');
  const history=[...(scene.videoHistory||[])];
  if(scene.videoUrl&&scene.videoUrl!==record.videoUrl&&!history.some(v=>v.url===scene.videoUrl))history.push({url:scene.videoUrl,...(scene.videoJob?{job:scene.videoJob}:{})});
  return project.data.map(s=>s===scene?{...s,videoUrl:record.videoUrl,videoHistory:history,videoJob:{id:record.id,predictionId:record.predictionId,state:'completed',createdAt:record.createdAt,...(record.mode?{options:{mode:record.mode,settings:record.settings,additional_prompt:record.additionalPrompt||''}}:{})}}:s);
}
