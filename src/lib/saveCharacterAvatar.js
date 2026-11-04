import {doc,runTransaction} from 'firebase/firestore';
import {replaceCharacterAvatar,validateAvatar} from './characterAvatar.js';

export async function saveCharacterAvatar({db,projectId,id,expected,file,upload,signal,decode}){
  await validateAvatar(file,decode);
  signal.throwIfAborted();
  const url=await upload(file,'avatar_'+crypto.randomUUID(),signal);
  const target=new URL(url);
  if(target.protocol!=='https:'||!target.pathname.startsWith('/project_'+projectId+'/avatar_'))throw Error('Đường dẫn ảnh không hợp lệ.');
  const ref=doc(db,'projects',projectId);
  return runTransaction(db,async tx=>{
    const project=(await tx.get(ref)).data();
    signal.throwIfAborted();
    const characters=replaceCharacterAvatar(project?.characters,id,expected,url);
    tx.update(ref,{characters});
    return characters.find(c=>c.id===id);
  });
}
