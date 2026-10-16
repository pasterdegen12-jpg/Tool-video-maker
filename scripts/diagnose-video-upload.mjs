// Explicit, upload-only operator diagnostic. No server route, JWT, prediction,
// journal mutation, automatic retry, or change to the web paid gate.
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import {createImageUploader,API} from '../api/lib/seedance/provider.js';
import {requestHttps} from '../api/lib/seedance/transport.js';
import {validateImage,MAX_IMAGE_BYTES} from '../api/lib/seedance/images.js';
import {failureInfo} from '../api/lib/seedance/diagnostics.js';

export async function diagnoseUpload(input,{env,request=requestHttps,checkUrl}={}){
  if(env?.LOCAL_VIDEO_PAID_ENABLED!=='false'||env.VITE_WAVESPEED_API_KEY||!env.WAVESPEED_API_KEY)throw Error('Require paid=false, empty frontend key and backend credential');
  if(!input||Object.keys(input).sort().join()!=='expectedSha256,imagePath,reportPath'||!path.isAbsolute(input.imagePath)||!path.isAbsolute(input.reportPath)||!/^[a-f0-9]{64}$/.test(input.expectedSha256))throw Error('Explicit image, hash and report paths required');
  const stat=await fs.stat(input.imagePath);if(!stat.isFile()||stat.size>MAX_IMAGE_BYTES)throw Error('Image admission failed');
  const original=await fs.readFile(input.imagePath);
  if(createHash('sha256').update(original).digest('hex')!==input.expectedSha256)throw Error('Image hash mismatch; no upload');
  const mime=original[0]===255&&original[1]===216?'image/jpeg':'image/png';
  const image=validateImage(original.toString('base64'),mime);original.fill(0);
  const report={label:'REAL UPLOAD ONLY — NO VIDEO PREDICTION',started_at:new Date().toISOString(),paid_enabled:false,
    image_sha256:image.sha256,image_bytes:image.bytes.length,mime_type:mime,state:'RUNNING',requests:[],prediction_requests:0};
  // A unique report is also a one-shot guard. Rerunning the same input file fails
  // before any network call; a crashed RUNNING report must be reviewed manually.
  const output=await fs.open(input.reportPath,'wx',0o600);
  try{
    await output.writeFile(JSON.stringify(report,null,2));await output.sync();
    let ticketSeen=false,putSeen=false;
    const limitedRequest=async(url,options={})=>{
      let step;
      if(url===API+'/media/uploads'&&options.method==='POST'&&!ticketSeen&&!putSeen){ticketSeen=true;step='TICKET_REQUEST';}
      else if(ticketSeen&&!putSeen&&options.method==='PUT'&&!Object.keys(options.headers||{}).some(k=>k.toLowerCase()==='authorization')){
        putSeen=true;step='IMAGE_PUT';
        if(!image.bytes.equals(options.body))throw Error('Upload bytes changed');
      }else throw Error('Upload-only request boundary violated');
      const event={step,started_at:new Date().toISOString(),http_status:null};report.requests.push(event);
      try{
        const result=await request(url,options);event.http_status=result.status;
        if(step==='TICKET_REQUEST'){
          try{
            const ticket=JSON.parse(result.body)?.data;
            report.ticket_checks={filename_matches_request:ticket?.filename===image.filename,
              filename_is_string:typeof ticket?.filename==='string',size_matches:ticket?.size===image.bytes.length,
              type_is_image:ticket?.type==='image',method_is_put:ticket?.upload?.method==='PUT'};
          }catch{/* Malformed responses are diagnosed by the shared uploader. */}
        }
        return result;
      }
      finally{event.finished_at=new Date().toISOString();}
    };
    try{
      await createImageUploader(env.WAVESPEED_API_KEY,{request:limitedRequest,...(checkUrl?{checkUrl}:{})}).upload(image);
      report.state='PASS';
    }catch(error){report.state='FAIL';report.failure={...failureInfo(error,'TICKET_REQUEST'),at:Date.now()};}
    report.finished_at=new Date().toISOString();
    await output.truncate(0);await output.write(JSON.stringify(report,null,2),0,'utf8');await output.sync();
    return report;
  }finally{image.bytes.fill(0);await output.close();}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==4||process.argv[2]!=='--run')throw Error('Explicit --run and input JSON required');
    const root=fileURLToPath(new URL('../',import.meta.url));
    const env=parseEnv(await fs.readFile(path.join(root,'.env.video.local'),'utf8'));
    const input=JSON.parse(await fs.readFile(process.argv[3],'utf8'));
    const result=await diagnoseUpload(input,{env});
    console.log(JSON.stringify(result,null,2));if(result.state!=='PASS')process.exitCode=1;
  }catch{console.error('Upload diagnostic refused or could not safely record its result. No automatic retry.');process.exitCode=1;}
}
