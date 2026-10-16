import fs from 'node:fs/promises';
import jpeg from 'jpeg-js';
import {createHash} from 'node:crypto';
const root='F:/tool-ai-dh/web-ai/docs/phase5a1c/storyboard';
const source='C:/Users/Admin/Downloads/scene_bg_1791903431294.jpeg';
const original=await fs.readFile(source),hash=b=>createHash('sha256').update(b).digest('hex');
const decoded=jpeg.decode(original,{useTArray:true,tolerantDecoding:false,maxResolutionInMP:5,maxMemoryUsageInMB:96});
let copy,quality;
for(const q of [90,85,80,75,70]){const candidate=jpeg.encode({width:decoded.width,height:decoded.height,data:decoded.data},q).data;if(candidate.length<=1048576){copy=candidate;quality=q;break;}}
if(!copy)throw new Error('No permitted-size copy produced');
await fs.writeFile(root+'/operator-reference-compressed.jpg',copy,{flag:'wx'});
const result={checkedAt:new Date().toISOString(),source:'Operator-selected scene_3 OpenFrame, downloaded through observed UI image',originalBytes:original.length,originalSha256:hash(original),width:decoded.width,height:decoded.height,pixels:decoded.width*decoded.height,compressedBytes:copy.length,compressedSha256:hash(copy),jpegQuality:quality,dimensionsUnchanged:true,originalUnmodified:hash(await fs.readFile(source))===hash(original),cpuLibrary:'jpeg-js (existing dependency)',reencodedPixelValuesMayDiffer:true,metadataCopied:false,backendMaxPixels:4000000};
await fs.writeFile(root+'/reference-preparation.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
