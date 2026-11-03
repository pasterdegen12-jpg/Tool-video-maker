import {need} from '../qwen/queue.js';
const controls=value=>[...value].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127);
export const normalizeVisualId=value=>value.trim().toLowerCase().replace(/[\s,.-]+/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
export function parseMolmoOutputs(outputs){
 need(Array.isArray(outputs)&&outputs.length===1,'VISUAL_OUTPUT_INVALID',422);
 let value=outputs[0];
 if(typeof value==='string'){
  need(value.length<=8000,'VISUAL_OUTPUT_INVALID',422);
  const raw=value.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1');
  try{value=JSON.parse(raw);}catch{need(false,'VISUAL_OUTPUT_INVALID',422);}
 }
 need(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')==='accessories,clothing,facialHair,hair,subjectStatus,visualDescription,visualId','VISUAL_OUTPUT_INVALID',422);
 need(['clear','ambiguous','no_subject'].includes(value.subjectStatus),'VISUAL_OUTPUT_INVALID',422);
 for(const key of ['visualId','visualDescription','hair','facialHair','clothing'])need(typeof value[key]==='string'&&value[key].length<=(key==='visualDescription'?600:120)&&!controls(value[key]),'VISUAL_OUTPUT_INVALID',422);
 need(Array.isArray(value.accessories)&&value.accessories.length<=12&&value.accessories.every(x=>typeof x==='string'&&x.length<=100&&!controls(x)),'VISUAL_OUTPUT_INVALID',422);
 // These checks reject obvious sensitive/identity claims, not prove visual truth.
 // Attribute accuracy still requires the existing human review step.
 const text=[value.visualId,value.visualDescription,value.hair,value.facialHair,value.clothing,...value.accessories].join(' ');
 need(!/https?:|@|\b(?:ethnicity|religion|muslim|christian|jewish|diabetic|diagnosed|named|identity is|real name|judge|lawyer|plaintiff|defendant|courtroom|background|dialogue|camera|angry|smiling)\b/i.test(text.replaceAll('_',' ')),'VISUAL_OUTPUT_UNSUPPORTED',422);
 if(value.subjectStatus!=='clear'){
  need(value.visualId==='','VISUAL_OUTPUT_INVALID',422);
  return {status:value.subjectStatus==='ambiguous'?'ambiguous':'no_human',visual_id:'',visual_description:''};
 }
 const id=normalizeVisualId(value.visualId);
 need(id.length>=3&&id.length<=100&&/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(id),'VISUAL_OUTPUT_INVALID',422);
 need(value.visualDescription.trim().length>=8&&/^[\x20-\x7e]+$/.test(value.visualDescription)&&/\b(?:hair|wearing|wears|clothing|robe|shirt|suit|dress|person|man|woman|glasses|beard|jacket|top)\b/i.test(value.visualDescription),'VISUAL_OUTPUT_INVALID',422);
 need(!![value.hair,value.facialHair,value.clothing,...value.accessories].join('').trim(),'VISUAL_OUTPUT_INVALID',422);
 return {status:'detected',visual_id:id,visual_description:value.visualDescription.trim()};
}
