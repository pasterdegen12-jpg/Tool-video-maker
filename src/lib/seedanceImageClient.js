import {checkImageSize,imageDimensions} from './seedanceImage.js';
// Separate from Qwen's unchanged 1 MiB reader. No re-encoding of image data.
export async function readVideoImage(file){
  if(!file||!['image/png','image/jpeg'].includes(file.type))throw new Error('Chỉ hỗ trợ ảnh PNG hoặc JPEG.');
  checkImageSize(file.size);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const dimensions=imageDimensions(bytes,file.type);
  const sha=await crypto.subtle.digest('SHA-256',bytes);
  const chunks=[];
  for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
  const image_base64=btoa(chunks.join(''));
  return {...dimensions,name:file.name,size:bytes.length,image_base64,mime_type:file.type,
    image_sha256:Array.from(new Uint8Array(sha),x=>x.toString(16).padStart(2,'0')).join(''),
    dataUrl:'data:'+file.type+';base64,'+image_base64};
}
