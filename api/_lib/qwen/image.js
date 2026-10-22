import {requestHttps} from '../seedance/transport.js';
import {validateImage} from '../seedance/images.js';
import {imageDimensions} from '../../../src/lib/seedanceImage.js';
import {need} from './queue.js';
import {createHash} from 'node:crypto';
export function referenceUrl(character,projectId,origin){
 const value=character.imageUrl;let url,base;
 try{url=new URL(value);base=new URL(origin);}catch{need(false,'REFERENCE_IMAGE_MISSING',422);}
 need(base.protocol==='https:'&&base.pathname==='/'&&url.origin===base.origin&&!url.search&&!url.hash&&!url.username&&!url.password&&
 url.pathname.startsWith('/project_'+projectId+'/')&&!/%|\\|\.\./.test(url.pathname),'REFERENCE_IMAGE_FORBIDDEN',422);
 return url.href;
}
export function referenceReader(origin,request=requestHttps){return async(character,projectId)=>{
 const url=referenceUrl(character,projectId,origin);
 const raw=await request(url,{binary:true,maxBytes:25*1048576,timeoutMs:20000});
 need(raw.status===200,'REFERENCE_IMAGE_UNAVAILABLE',422);
 const mime=String(raw.headers?.['content-type']||'').split(';')[0].trim().toLowerCase();
 need(['image/png','image/jpeg','image/webp'].includes(mime)&&raw.body.length>0,'REFERENCE_IMAGE_INVALID',422);
 if(mime==='image/webp')need(raw.body.subarray(0,4).toString()==='RIFF'&&raw.body.subarray(8,12).toString()==='WEBP','REFERENCE_IMAGE_INVALID',422);
 else {const checked=validateImage(raw.body.toString('base64'),mime);checked.bytes.fill(0);}
 const sha256=createHash('sha256').update(raw.body).digest('hex');raw.body.fill(0);return{url,mime,sha256};
};}
export function checkedResult(input){
 need(input&&Object.keys(input).sort().join(',')==='image_base64,profile,sourceHash','INVALID_RESULT',422);
 need(typeof input.image_base64==='string'&&input.image_base64.length<690000&&/^[a-f0-9]{64}$/.test(input.sourceHash),'INVALID_RESULT',422);
 const image=validateImage(input.image_base64,'image/jpeg');
 const dims=imageDimensions(image.bytes,'image/jpeg');
 need(dims.width*dims.height<=4000000&&image.bytes.length<=512000,'INVALID_RESULT',422);
 const result={sourceHash:input.sourceHash,profile:input.profile,referenceImage:{sha256:image.sha256,dataUrl:'data:image/jpeg;base64,'+input.image_base64}};
 image.bytes.fill(0);return result;
}
