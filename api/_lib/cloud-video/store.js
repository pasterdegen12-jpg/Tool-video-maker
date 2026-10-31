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
const persistedPages=new WeakMap();
// Bounded private pages avoid both the single-document ceiling and one Firestore
// read per historical attempt on every poll. The root remains the lock/manifest.
function ledgerPages(entries={}){
  const pages=[];let page={},size=2;
  for(const [key,value]of Object.entries(entries)){
    requireValue(/^[A-Za-z0-9_-]{1,150}$/.test(key),'INVALID_LEDGER_KEY',500);
    const bytes=Buffer.byteLength(JSON.stringify({[key]:value}));
    requireValue(bytes<850000,'LEDGER_ENTRY_TOO_LARGE',503);
    if(size+bytes>200000&&Object.keys(page).length){pages.push(page);page={};size=2;}
    page[key]=value;size+=bytes;
  }
  if(Object.keys(page).length)pages.push(page);return pages;
}
async function loadLedger(tx,ref){
  const root=(await tx.get(ref)).data()||newLedger();
  if(root.storageVersion!==2)return root;
  const data={...root,records:{},batches:{}};
  const stored={records:[],batches:[]};
  for(const kind of ['records','batches']){
    const count=root.storagePages?.[kind]||0;
    for(let n=0;n<count;n++){
      const page=(await tx.get(ref.collection(kind+'Pages').doc(String(n).padStart(6,'0')))).data();
      requireValue(page?.entries,'LEDGER_PAGE_MISSING',503);stored[kind].push(page.entries);Object.assign(data[kind],page.entries);
    }
  }
  persistedPages.set(data,stored);return data;
}
function saveLedger(tx,ref,data,before){
  const root={...data,storageVersion:2,storagePages:{}};delete root.records;delete root.batches;
  const bounded=value=>requireValue(Buffer.byteLength(JSON.stringify(value))<850000,'LEDGER_ENTRY_TOO_LARGE',503);
  bounded(root);
  for(const kind of ['records','batches']){
    // Never prune paid history as a side effect of admission or migration.
    for(const key of Object.keys(before[kind]||{}))requireValue(Object.hasOwn(data[kind]||{},key),'LEDGER_HISTORY_REMOVAL',500);
    const pages=ledgerPages(data[kind]),previous=persistedPages.get(data)?.[kind]||[];root.storagePages[kind]=pages.length;
    for(let n=0;n<pages.length;n++){
      if(JSON.stringify(pages[n])!==JSON.stringify(previous[n]))tx.set(ref.collection(kind+'Pages').doc(String(n).padStart(6,'0')),{entries:pages[n]});
    }
  }
  tx.set(ref,root);
}
export function createCloudStore(db){
  return {
    async project(owner,projectId){
      requireValue(/^proj_[A-Za-z0-9_-]{1,100}$/.test(projectId),'INVALID_PROJECT');
      const project=(await db.doc('projects/'+projectId).get()).data();
      requireValue(project,'PROJECT_NOT_FOUND',404);
      const grant=(await db.doc('_video_projects/'+projectId).get()).data();
      if(grant&&grant.enabled===false)throw new CloudError('PROJECT_FORBIDDEN',403);
      if(project.owner&&project.owner!==owner)throw new CloudError('PROJECT_FORBIDDEN',403);
      if(project.userId&&project.userId!==owner)throw new CloudError('PROJECT_FORBIDDEN',403);
      if(project.ownerId&&project.ownerId!==owner)throw new CloudError('PROJECT_FORBIDDEN',403);
      return project;
    },
    async publishVideo(owner,record){
      const ref=db.doc('projects/'+record.projectId),grantRef=db.doc('_video_projects/'+record.projectId);
      return db.runTransaction(async tx=>{
        const grant=(await tx.get(grantRef)).data();
        if(grant&&grant.enabled===false)throw new CloudError('PROJECT_FORBIDDEN',403);
        const project=(await tx.get(ref)).data();requireValue(project,'PROJECT_NOT_FOUND',404);
        if(project.owner&&project.owner!==owner)throw new CloudError('PROJECT_FORBIDDEN',403);
        if(project.userId&&project.userId!==owner)throw new CloudError('PROJECT_FORBIDDEN',403);
        if(project.ownerId&&project.ownerId!==owner)throw new CloudError('PROJECT_FORBIDDEN',403);
        const data=completedSceneData(project,record);
        if(data)tx.update(ref,{data});
      });
    },
    async read(owner){return db.runTransaction(tx=>loadLedger(tx,db.doc('_video_ledgers/'+owner)),{readOnly:true});},
    async transact(owner,change){
      const ref=db.doc('_video_ledgers/'+owner),teamRef=db.doc('_video_ledgers/team-shared-v1');
      return db.runTransaction(async tx=>{
        const data=await loadLedger(tx,ref);
        const team=await loadLedger(tx,teamRef);
        const before=structuredClone(data),teamBefore=structuredClone(team);
        const result=change(data,team);
        if(result&&typeof result.then==='function')throw new CloudError('INVALID_TRANSACTION',500);
        saveLedger(tx,ref,data,before);saveLedger(tx,teamRef,team,teamBefore);return result;
      });
    },
  };
}
