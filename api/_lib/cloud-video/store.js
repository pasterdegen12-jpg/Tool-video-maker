import {initializeApp,cert,getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {Buffer} from 'node:buffer';
import {CloudError,newLedger,requireValue} from './core.js';

export function cloudDatabase(env){
  let credential;
  try{credential=JSON.parse(env.VIDEO_FIREBASE_SERVICE_ACCOUNT_JSON);}catch{throw new CloudError('STORAGE_CONFIGURATION',503);}
  requireValue(credential.project_id===env.VIDEO_FIREBASE_PROJECT_ID,'STORAGE_CONFIGURATION',503);
  const app=getApps().find(a=>a.name==='production-video')||initializeApp({credential:cert(credential),projectId:credential.project_id},'production-video');
  return getFirestore(app);
}
import {completedSceneData} from './publish.js';
export function createCloudStore(db){
  return {
    async project(owner,projectId){
      requireValue(/^proj_[A-Za-z0-9_-]{1,100}$/.test(projectId),'INVALID_PROJECT');
      const grant=(await db.doc('_video_projects/'+projectId).get()).data();
      requireValue(grant?.owner===owner&&grant.enabled===true,'PROJECT_FORBIDDEN',403);
      const project=(await db.doc('projects/'+projectId).get()).data();
      requireValue(project,'PROJECT_NOT_FOUND',404);
      // The protected grant establishes ownership. Mutable scene/media data is
      // pinned per attempt, never used to revoke this confirmed ownership.
      return project;
    },
    async publishVideo(owner,record){
      const ref=db.doc('projects/'+record.projectId),grantRef=db.doc('_video_projects/'+record.projectId);
      return db.runTransaction(async tx=>{
        const grant=(await tx.get(grantRef)).data();
        requireValue(grant?.owner===owner&&grant.enabled===true,'PROJECT_FORBIDDEN',403);
        const project=(await tx.get(ref)).data();requireValue(project,'PROJECT_NOT_FOUND',404);
        const data=completedSceneData(project,record);
        if(data)tx.update(ref,{data});
      });
    },
    async read(owner){return (await db.doc('_video_ledgers/'+owner).get()).data()||newLedger();},
    async transact(owner,change){
      const ref=db.doc('_video_ledgers/'+owner),teamRef=db.doc('_video_ledgers/team-shared-v1');
      return db.runTransaction(async tx=>{
        const data=(await tx.get(ref)).data()||newLedger();
        const team=(await tx.get(teamRef)).data()||newLedger();
        const result=change(data,team);
        if(result&&typeof result.then==='function')throw new CloudError('INVALID_TRANSACTION',500);
        requireValue(Buffer.byteLength(JSON.stringify(data))<850000&&Buffer.byteLength(JSON.stringify(team))<850000,'LEDGER_CAPACITY',429);
        tx.set(ref,data);tx.set(teamRef,team);return result;
      });
    },
  };
}
