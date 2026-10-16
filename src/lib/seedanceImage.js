// Full AI input admission only. This is not a provider compatibility guarantee.
export const MAX_SELECTED_IMAGE_BYTES=25*1024*1024;
export const MAX_SELECTED_IMAGE_PIXELS=24_000_000;
export const MAX_IMAGE_DIMENSION=16384;
export const MAX_IMAGE_BASE64=4*Math.ceil(MAX_SELECTED_IMAGE_BYTES/3);
export const MAX_VIDEO_BODY_BYTES=MAX_IMAGE_BASE64+1024*1024;
export class ImageAdmissionError extends Error {
  constructor(code,message){super(message);this.code=code;}
}
export function checkImageSize(size){
  if(size>MAX_SELECTED_IMAGE_BYTES)throw new ImageAdmissionError('IMAGE_TOO_LARGE','Ảnh '+size+' byte vượt giới hạn 25 MiB (26.214.400 byte).');
  if(!size)throw new ImageAdmissionError('IMAGE_INVALID','File ảnh rỗng hoặc không đọc được.');
}
export function imageDimensions(bytes,mime){
  checkImageSize(bytes.length);
  const fail=()=>{throw new ImageAdmissionError('IMAGE_INVALID','Dữ liệu ảnh PNG/JPEG bị hỏng hoặc không đọc được.');};
  const u16=i=>(bytes[i]<<8)|bytes[i+1];
  const u32=i=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(i);
  let width,height;
  if(mime==='image/png'){
    if(bytes.length<33||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)||u32(8)!==13||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')fail();
    width=u32(16);height=u32(20);
  }else if(mime==='image/jpeg'){
    if(bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)fail();
    let pos=2;
    while(pos+4<=bytes.length){
      if(bytes[pos++]!==255)fail();
      while(bytes[pos]===255)pos++;
      const marker=bytes[pos++];
      if(marker===218||marker===217)break;
      const length=u16(pos);
      if(length<2||pos+length>bytes.length)fail();
      if([192,193,194].includes(marker)){
        if(length<8)fail();height=u16(pos+3);width=u16(pos+5);break;
      }
      pos+=length;
    }
    if(!width||!height)fail();
  }else throw new ImageAdmissionError('IMAGE_TYPE','Chỉ hỗ trợ ảnh PNG hoặc JPEG.');
  if(width<32||height<32||width>MAX_IMAGE_DIMENSION||height>MAX_IMAGE_DIMENSION||width*height>MAX_SELECTED_IMAGE_PIXELS)
    throw new ImageAdmissionError('IMAGE_DIMENSIONS','Ảnh '+width+'×'+height+' ('+(width*height)+' pixel) vượt giới hạn: 32–16.384 px mỗi chiều, tối đa 24.000.000 pixel.');
  return {width,height};
}
