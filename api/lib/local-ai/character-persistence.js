import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {authenticateSession} from './auth.js';
import {canonicalIdentity,migrateCharacterIdentity} from '../../../src/lib/characterIdentity.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const projectFingerprint=project=>hash(canonicalIdentity(project));

// Local-only, explicit project grant. No trust in browser-supplied user IDs.
export function createCharacterPersistence({config,grants,repository,evidence,backup,now=Date.now}){
  return async(req,res)=>{
    const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    try{
      const session=await authenticateSession(req,config),ownerHash=hash(JSON.stringify([config.issuer,session.subject]));
      const path=/^\/api\/local-ai\/character-project\/([A-Za-z0-9_-]{1,128})$/.exec(req.url||'');
      if(!path||!['GET','POST'].includes(req.method))return reply(404,{error:'Không tìm thấy thao tác.'});
      const projectId=path[1],grant=grants[projectId];
      if(!grant||grant.ownerHash!==ownerHash)return reply(403,{error:'Project chưa được cấp quyền local cho tài khoản này.'});
      const check=p=>{
        if(p.id!==projectId||p.projectType!=='full-ai'||(p.userId&&p.userId!==session.subject)||(p.ownerId&&p.ownerId!==session.subject))throw Error('Project không thuộc phạm vi cho phép.');
        if(p.characters?.some(c=>c.characterIdentity&&(c.characterIdentity.ownerHash!==ownerHash||c.characterIdentity.projectId!==projectId)))throw Error('Ánh xạ thuộc tài khoản/project khác.');
      };
      if(req.method==='GET'){
        const project=await repository.read(projectId);check(project);
        return reply(200,{project,fingerprint:projectFingerprint(project)});
      }
      if(req.headers['content-type']?.split(';')[0]!=='application/json')return reply(400,{error:'Cần JSON.'});
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>1450000)return reply(413,{error:'Ảnh quá lớn.'});chunks.push(chunk);}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(Object.keys(input).sort().join()!=='characterId,confirm,confirmedId,expectedPreviousId,fingerprint,image,jobId'||input.confirm!==true)throw Error('Cần xác nhận rõ ID cuối.');
      const result=evidence(input.jobId,session);
      if(result.operation!=='visual_profile'||result.profile?.status!=='detected')throw Error('Chưa có đề xuất Qwen hợp lệ.');
      const image=input.image;
      if(!image||Object.keys(image).sort().join()!=='dataUrl,sha256'||typeof image.dataUrl!=='string')throw Error('Ảnh không hợp lệ.');
      const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image.dataUrl);
      if(!match||hash(Buffer.from(match[2],'base64'))!==image.sha256||image.sha256!==result.image_sha256)throw Error('Ảnh không khớp inference.');
      const before=await repository.read(projectId);check(before);
      if(projectFingerprint(before)!==input.fingerprint)return reply(409,{error:'Project đã thay đổi. Tải lại trước khi xác nhận.'});
      await backup(projectId,before,input.fingerprint);
      const migration=migrateCharacterIdentity(before,{projectId,ownerHash,characterId:input.characterId,proposal:result.profile,
        confirmedId:input.confirmedId,referenceImage:image,confirmedAt:now(),jobId:input.jobId,expectedPreviousId:input.expectedPreviousId});
      // Repository transaction compares the ENTIRE original document, then only changes these two fields.
      const saved=await repository.commit(projectId,input.fingerprint,{data:migration.data,characters:migration.characters});
      const expected={...before,data:migration.data,characters:migration.characters};
      if(projectFingerprint(saved)!==projectFingerprint(expected))throw Error('Lưu chưa được xác minh. Tải lại project; không tự ghi lần nữa.');
      reply(200,{project:saved,fingerprint:projectFingerprint(saved),changed:migration.changed});
    }catch(error){reply(error.code==='UNAUTHORIZED'?401:error.code==='FORBIDDEN_ORIGIN'?403:409,{error:error.code||error.message||'Không lưu được ID. Tải lại để kiểm tra.'});}
  };
}
