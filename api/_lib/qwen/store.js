import {blank,need,sweep} from './queue.js';
import {Buffer} from 'node:buffer';
export function queueStore(db){
 const state=db.doc('_qwen_queue/state');
 return {
  async read(){return (await state.get()).data()||blank();},
  async project(id){need((await db.doc('_video_projects/'+id).get()).data()?.enabled!==false,'PROJECT_FORBIDDEN',403);return (await db.doc('projects/'+id).get()).data();},
  async result(id){return (await db.doc('_qwen_results/'+id).get()).data();},
  async transact({projectId,resultId,now},change){return db.runTransaction(async tx=>{
   const q=(await tx.get(state)).data()||blank();
   const ref=projectId?db.doc('projects/'+projectId):null;
   const project=ref?(await tx.get(ref)).data():null;
   if(projectId)need((await tx.get(db.doc('_video_projects/'+projectId))).data()?.enabled!==false,'PROJECT_FORBIDDEN',403);
   const resultRef=resultId?db.doc('_qwen_results/'+resultId):null;
   const result=resultRef?(await tx.get(resultRef)).data():null;
   const removed=sweep(q,now),out=change(q,project,result);
   need(!out?.then,'ASYNC_TRANSACTION',500);
   need(Buffer.byteLength(JSON.stringify(q))<800000,'QUEUE_FULL',429);
   tx.set(state,q);
   if(out?.saveResult){need(resultRef&&Buffer.byteLength(JSON.stringify(out.saveResult))<700000,'RESULT_TOO_LARGE',422);tx.set(resultRef,out.saveResult);}
   if(out?.patchProject){need(ref,'INVALID_PROJECT',422);tx.update(ref,out.patchProject);}
   for(const id of removed)tx.delete(db.doc('_qwen_results/'+id));
   return out?.value;
  });},
 };
}
