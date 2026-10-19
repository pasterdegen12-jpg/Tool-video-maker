export const MAX_EDIT_VIDEO_BYTES=100*1024*1024;
export async function readEditVideo(file){
  if(!file||!['video/mp4','video/webm'].includes(file.type)||file.size<=0||file.size>MAX_EDIT_VIDEO_BYTES)throw Error('Chọn MP4/WebM tối đa 100 MiB.');
  const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());
  const mp4=bytes.length>=12&&String.fromCharCode(...bytes.slice(4,8))==='ftyp';
  const webm=bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3;
  if(file.type==='video/mp4'?!mp4:!webm)throw Error('Nội dung file không khớp MP4/WebM.');
  return file;
}
export function trimArguments(start,end,duration){
  if(![start,end,duration].every(Number.isFinite)||start<0||end<=start||end>duration||duration>600||end-start<.1)throw Error('Chọn khoảng cắt hợp lệ trong video (tối đa 10 phút).');
  return ['-ss',String(start),'-i','input','-t',String(end-start),'-map','0:v:0','-map','0:a?','-c:v','libx264','-preset','ultrafast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','output.mp4'];
}
// Separate worker: never competes for the application's audio/merge FFmpeg instance.
export async function trimVideo(file,start,end,duration){
  await readEditVideo(file);const args=trimArguments(start,end,duration);
  const [{FFmpeg},{default:coreURL},{default:wasmURL}]=await Promise.all([import('@ffmpeg/ffmpeg'),import('../ffmpeg-core.js?url'),import('../ffmpeg-core.wasm?url')]);
  const ffmpeg=new FFmpeg();
  try{
    await ffmpeg.load({coreURL,wasmURL});await ffmpeg.writeFile('input',new Uint8Array(await file.arrayBuffer()));
    if(await ffmpeg.exec(args)!==0)throw Error('Không xuất được video cắt. File gốc được giữ nguyên.');
    const data=await ffmpeg.readFile('output.mp4');
    return new File([data],'edited-video.mp4',{type:'video/mp4'});
  }finally{ffmpeg.terminate();}
}
