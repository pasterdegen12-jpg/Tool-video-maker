import {S3Client,PutObjectCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
import {requestHttps} from '../seedance/transport.js';
import {requireValue,hash} from './core.js';

export function createVideoArchive(env){
  const bucket=env.R2_BUCKET_NAME,origin=env.R2_PUBLIC_ORIGIN;
  const client=new S3Client({region:'auto',endpoint:env.R2_ENDPOINT,forcePathStyle:true,
    credentials:{accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY}});
  return async function archive(providerUrl,owner,record){
    requireValue(bucket&&origin?.startsWith('https://'),'ARCHIVE_CONFIGURATION',503);
    const raw=await requestHttps(providerUrl,{binary:true,maxBytes:100*1024*1024,timeoutMs:60000});
    requireValue(raw.status===200&&raw.body.length>12&&raw.body.toString('ascii',4,8)==='ftyp','VIDEO_ARCHIVE_INVALID',502);
    const key='_video_results/'+owner+'/'+record.id+'.mp4',sha256=hash(raw.body);
    const metadata={sha256,prediction:record.predictionId};
    try{await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:raw.body,ContentType:'video/mp4',Metadata:metadata,IfNoneMatch:'*'}));}
    catch(e){
      if(e.$metadata?.httpStatusCode!==412)throw e;
      const old=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
      requireValue(old.Metadata?.sha256===sha256&&old.Metadata?.prediction===record.predictionId&&old.ContentLength===raw.body.length,'ARCHIVE_CONFLICT',503);
    }finally{raw.body.fill(0);}
    return origin.replace(/\/$/,'')+'/'+key;
  };
}
