export function applySceneVideoOutput(scene,output){
  const history=[...(scene.videoHistory||[])];
  if(scene.videoUrl&&scene.videoUrl!==output.url&&!history.some(v=>v.url===scene.videoUrl))history.push({url:scene.videoUrl,...(scene.videoJob?{job:scene.videoJob}:{})});
  return {...scene,videoUrl:output.url,videoHistory:history,videoJob:{id:output.id,predictionId:output.predictionId,state:'completed',createdAt:output.createdAt}};
}
