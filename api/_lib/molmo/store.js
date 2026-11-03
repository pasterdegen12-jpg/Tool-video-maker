import {Buffer} from 'node:buffer';
import {need} from '../qwen/queue.js';
// Existing backend-only collection; separate per-character documents avoid the
// local worker's queue/lease/sweep and never change Firebase access rules.
export function molmoStore(db){return {
 async project(id){need((await db.doc('_video_projects/'+id).get()).data()?.enabled!==false,'PROJECT_FORBIDDEN',403);return (await db.doc('projects/'+id).get()).data();},
 async read(key){return (await db.doc('_qwen_results/molmo_'+key).get()).data()||{jobs:{}};},
 async transact(key,projectId,change){return db.runTransaction(async tx=>{
  const ref=db.doc('_qwen_results/molmo_'+key),pRef=db.doc('projects/'+projectId);
  const [saved,p,grant]=await Promise.all([tx.get(ref),tx.get(pRef),tx.get(db.doc('_video_projects/'+projectId))]);
  need(grant.data()?.enabled!==false,'PROJECT_FORBIDDEN',403);
  const state=saved.data()||{jobs:{}},result=change(state,p.data());
  need(!result?.then,'ASYNC_TRANSACTION',500);
  need(Buffer.byteLength(JSON.stringify(state))<800000,'VISUAL_HISTORY_FULL',409);
  tx.set(ref,state);if(result.characters)tx.update(pRef,{characters:result.characters});
  return result.value;
 });}
};}
