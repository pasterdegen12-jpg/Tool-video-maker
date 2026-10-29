import {API,validateTicket} from '../seedance/provider.js';
import {requestHttps,publicAddress} from '../seedance/transport.js';
import {validateImage} from '../seedance/images.js';
import {imageDimensions,MAX_SELECTED_IMAGE_BYTES} from '../../../src/lib/seedanceImage.js';
import {requireValue} from './core.js';
import {hash} from './core.js';

export function createCloudUpload(apiKey,{request=requestHttps,checkUrl=publicAddress,now=Date.now}={}){
  return {
    async transfer(ticket,bytes,image){
      requireValue(bytes&&bytes.length===image.size&&hash(bytes)===image.sha256,'IMAGE_HASH_MISMATCH');
      requireValue(ticket.upload.method==='PUT'&&Date.parse(ticket.upload.expires_at)>now(),'UPLOAD_EXPIRED');
      await checkUrl(ticket.upload.url);
      const result=await request(ticket.upload.url,{method:'PUT',headers:ticket.upload.headers,body:bytes,timeoutMs:45000});
      requireValue(result.status>=200&&result.status<300,'UPLOAD_FAILED',502);
    },
    async ticket(image){
      const raw=await request(API+'/media/uploads',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
        body:JSON.stringify({filename:image.mime==='image/png'?'reference.png':'reference.jpg',size:image.size,content_type:image.mime})});
      requireValue(raw.status===200,'UPLOAD_TICKET_HTTP_'+raw.status,502);
      let parsed;try{parsed=JSON.parse(raw.body);}catch{requireValue(false,'UPLOAD_TICKET_INVALID',502);}
      requireValue(parsed.code===200,'UPLOAD_TICKET_INVALID',502);
      const ticket=validateTicket(parsed.data,{bytes:{length:image.size},mime:image.mime},now());
      // Prevent a browser from replacing the verified object before prediction.
      requireValue(Object.entries(ticket.upload.headers).some(([k,v])=>k.toLowerCase()==='if-none-match'&&v==='*'),'UPLOAD_NOT_IMMUTABLE',502);
      await checkUrl(ticket.upload.url);await checkUrl(ticket.download_url);
      return ticket;
    },
    async verify(downloadUrl,image){
      // URL is read exclusively from the durable, authenticated ticket response.
      const result=await request(downloadUrl,{binary:true,maxBytes:MAX_SELECTED_IMAGE_BYTES,timeoutMs:45000});
      requireValue(result.status===200,'UPLOAD_NOT_READABLE',422);
      requireValue(result.body.length===image.size,'IMAGE_SIZE_MISMATCH');
      const checked=validateImage(result.body.toString('base64'),image.mime);
      const dimensions=imageDimensions(checked.bytes,image.mime);
      requireValue(checked.sha256===image.sha256&&dimensions.width===image.width&&dimensions.height===image.height,'IMAGE_HASH_MISMATCH');
      checked.bytes.fill(0);result.body.fill(0);
      return true;
    },
  };
}
