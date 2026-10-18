import {requestHttps} from '../seedance/transport.js';
import {validateImage} from '../seedance/images.js';
import {imageDimensions,MAX_SELECTED_IMAGE_BYTES} from '../../../src/lib/seedanceImage.js';
import {safeMediaUrl} from '../../../src/lib/seedanceContract.js';
import {requireValue,declaration} from './core.js';

export function storedImageUrl(project,projectId,sceneId,origin){
  const scenes=project.data?.filter(s=>String(s.scene_n)===String(sceneId));
  requireValue(project.projectType==='full-ai'&&scenes?.length===1,'SCENE_NOT_FOUND',404);
  const value=scenes[0].startFrameUrl||scenes[0].imageUrl;
  requireValue(typeof value==='string'&&value.length>0,'SOURCE_IMAGE_MISSING');
  requireValue(safeMediaUrl(value)&&safeMediaUrl(origin),'SOURCE_IMAGE_FORBIDDEN');
  const url=new URL(value),base=new URL(origin);
  // Only canonical media in this project's R2 namespace. No client URL, proxy,
  // alternate origin, signed query, redirect or private-network destination.
  requireValue(base.pathname==='/'&&url.origin===base.origin&&!url.search&&
    url.pathname.startsWith('/project_'+projectId+'/')&&!/%|\\|\.\./.test(url.pathname),'SOURCE_IMAGE_FORBIDDEN');
  return value;
}
export function createSourceImageReader(origin,{request=requestHttps}={}){
  return async(project,projectId,sceneId)=>{
    const url=storedImageUrl(project,projectId,sceneId,origin);
    let raw;
    try{raw=await request(url,{binary:true,maxBytes:MAX_SELECTED_IMAGE_BYTES,timeoutMs:45000});}
    catch{requireValue(false,'SOURCE_IMAGE_UNAVAILABLE',422);}
    requireValue(raw.status===200,'SOURCE_IMAGE_UNAVAILABLE',422);
    const mime=String(raw.headers?.['content-type']||'').split(';')[0].trim().toLowerCase();
    let checked;
    try{
      checked=validateImage(raw.body.toString('base64'),mime);
      const image=declaration({mime,size:checked.bytes.length,sha256:checked.sha256,...imageDimensions(checked.bytes,mime)});
      return {scene_id:sceneId,url,image};
    }catch{requireValue(false,'SOURCE_IMAGE_INVALID',422);}
    finally{checked?.bytes.fill(0);raw.body.fill(0);}
  };
}
