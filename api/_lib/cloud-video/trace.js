// Allowlisted correlation metadata only: never payloads, tokens or media URLs.
export function videoTrace(stage,context={},sink=event=>console.info(JSON.stringify(event))){
 const event={event:'video_trace',stage,at:new Date().toISOString()};
 for(const key of ['projectId','sceneId','attemptId','batchId','action','state','code','httpStatus','predictionId']){
  const value=context[key];if(typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&/^[A-Za-z0-9_:. -]{1,160}$/.test(value))event[key]=value;
 }
 try{sink(event);}catch{/* Diagnostics must not affect submission. */}
}
export const recordTrace=r=>({projectId:r.projectId,sceneId:r.sceneId,attemptId:r.id,batchId:r.batchId,state:r.stage,predictionId:r.predictionId});
