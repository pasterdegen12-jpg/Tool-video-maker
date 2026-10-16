import { Buffer } from 'node:buffer';
import { inflateSync,crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { VideoError } from './errors.js';
import {MAX_SELECTED_IMAGE_BYTES,MAX_IMAGE_BASE64,imageDimensions,ImageAdmissionError} from '../../../src/lib/seedanceImage.js';
export const MAX_IMAGE_BYTES=MAX_SELECTED_IMAGE_BYTES;
export function validateImage(base64,mime){
  if(!['image/png','image/jpeg'].includes(mime))throw new VideoError('IMAGE_TYPE');
  if(typeof base64==='string'&&base64.length>MAX_IMAGE_BASE64)throw new VideoError('IMAGE_TOO_LARGE');
  if(typeof base64!=='string'||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw new VideoError('IMAGE_INVALID');
  const bytes=Buffer.from(base64,'base64');
  try{
    const {width,height}=imageDimensions(bytes,mime);
    if(!bytes.length||bytes.toString('base64')!==base64)throw 0;
    let decoded;
    if(mime==='image/png'){
      if(bytes.length<33||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||
         bytes.toString('ascii',12,16)!=='IHDR')throw 0;
      
      // pngjs uses an unbounded inflater for Adam7. Preflight every IDAT stream
      // with an exact scanline bound before allowing its decoder to allocate.
      let offset=8,ended=false,headers=0;const idat=[];
      while(offset+12<=bytes.length){
        const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);
        if(length>bytes.length-offset-12||type==='acTL')throw 0;
        if(crc32(bytes.subarray(offset+4,offset+8+length))!==bytes.readUInt32BE(offset+8+length))throw 0;
        if(type==='IHDR'&&(++headers!==1||length!==13))throw 0;
        if(type==='PLTE'&&(length>768||length%3))throw 0;
        if(type==='tRNS'&&length>256)throw 0;
        if(type==='IDAT')idat.push(bytes.subarray(offset+8,offset+8+length));
        offset+=length+12;
        if(type==='IEND'){if(length!==0)throw 0;ended=true;break;}
      }
      if(!ended||offset!==bytes.length||headers!==1)throw 0;
      const depth=bytes[24],color=bytes[25],interlace=bytes[28];
      const allowed={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      if(!allowed[color]?.includes(depth)||bytes[26]!==0||bytes[27]!==0||interlace>1)throw 0;
      const channels={0:1,2:3,3:1,4:2,6:4}[color];
      const passes=interlace?[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]]:[[0,0,1,1]];
      let expected=0;
      for(const [x,y,dx,dy]of passes){
        const w=Math.max(0,Math.ceil((width-x)/dx)),h=Math.max(0,Math.ceil((height-y)/dy));
        if(w&&h)expected+=(Math.ceil(w*channels*depth/8)+1)*h;
      }
      const inflated=inflateSync(Buffer.concat(idat),{maxOutputLength:expected});
      if(inflated.length!==expected)throw 0;
      inflated.fill(0);
      decoded=PNG.sync.read(bytes,{checkCRC:true});
    }else{
      if(bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw 0;
      decoded=jpeg.decode(bytes,{useTArray:true,tolerantDecoding:false,maxResolutionInMP:24,maxMemoryUsageInMB:512});
    }
    if(decoded.width!==width||decoded.height!==height)throw 0;
    decoded.data.fill(0);
    return {bytes,mime,sha256:createHash('sha256').update(bytes).digest('hex'),filename:mime==='image/png'?'reference.png':'reference.jpg'};
  }catch(error){bytes.fill(0);if(error instanceof ImageAdmissionError){const failure=new VideoError(error.code);failure.imageMessage=error.message;throw failure;}throw new VideoError('IMAGE_INVALID');}
}
