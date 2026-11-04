import {MAX_SELECTED_IMAGE_BYTES,MAX_SELECTED_IMAGE_PIXELS,MAX_IMAGE_DIMENSION} from './seedanceImage.js';

export async function validateAvatar(file,decode=createImageBitmap){
  if(!file?.size||file.size>MAX_SELECTED_IMAGE_BYTES||!['image/jpeg','image/png','image/webp'].includes(file.type)){
    throw Error('Chọn ảnh PNG, JPEG hoặc WebP tối đa 25 MiB.');
  }
  const head=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const matches=prefix=>prefix.every((byte,index)=>head[index]===byte);
  const valid=file.type==='image/png'?matches([137,80,78,71,13,10,26,10]):
    file.type==='image/jpeg'?matches([255,216,255]):
    matches([82,73,70,70])&&String.fromCharCode(...head.slice(8,12))==='WEBP';
  if(!valid)throw Error('Định dạng ảnh không khớp nội dung file.');
  const bitmap=await decode(file);
  try{
    const {width,height}=bitmap;
    if(Math.min(width,height)<32||Math.max(width,height)>MAX_IMAGE_DIMENSION||width*height>MAX_SELECTED_IMAGE_PIXELS)throw Error('Kích thước ảnh không hợp lệ.');
  }finally{bitmap.close();}
}

// Called inside a Firestore transaction. Re-read on contention and merge only
// the selected profile. Refuse to replace an image changed in another tab.
export function replaceCharacterAvatar(characters,id,expectedUrl,url){
  const matches=characters?.filter(c=>c.id===id);
  if(matches?.length!==1||(matches[0].imageUrl||'')!==expectedUrl)throw Error('Ảnh nhân vật đã thay đổi. Hãy tải lại dự án.');
  const current=matches[0],next={...current,imageUrl:url};
  if(current.characterIdentity&&!current.characterIdentity.sourceImageUrl&&expectedUrl){
    next.characterIdentity={...current.characterIdentity,sourceImageUrl:expectedUrl};
  }
  return characters.map(c=>c===current?next:c);
}
