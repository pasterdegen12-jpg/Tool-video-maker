import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {initializeApp} from 'firebase/app';
import {getFirestore,doc,getDoc,runTransaction} from 'firebase/firestore';
import {projectFingerprint} from './character-persistence.js';
export function createCharacterRepository(firebaseConfig,backupDirectory){
  const db=getFirestore(initializeApp(firebaseConfig,'local-character-'+randomBytes(4).toString('hex')));
  const read=async id=>{const snapshot=await getDoc(doc(db,'projects',id));if(!snapshot.exists())throw Error('Project không tồn tại.');return snapshot.data();};
  return {
    repository:{read,async commit(id,expected,patch){
      await runTransaction(db,async tx=>{const ref=doc(db,'projects',id),snapshot=await tx.get(ref);
        if(!snapshot.exists()||projectFingerprint(snapshot.data())!==expected)throw Error('Xung đột project. Không ghi đè.');
        tx.update(ref,patch);
      });return read(id);
    }},
    async backup(id,project,fingerprint){
      await fs.mkdir(backupDirectory,{recursive:true});
      const filename=path.join(backupDirectory,id+'-'+fingerprint+'.json');
      const value=JSON.stringify({projectId:id,fingerprint,project},null,2);
      try{await fs.writeFile(filename,value,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||await fs.readFile(filename,'utf8')!==value)throw e;}
    },
  };
}
