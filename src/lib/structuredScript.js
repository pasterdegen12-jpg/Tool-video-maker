// Fast, source-preserving extraction for explicitly labelled scene_N scripts.
// No model, network, inferred speakers, translations or invented descriptions.
import {countSpokenWords} from './spokenText.js';
const full=new Set(['context','character','tone','tone_of_voice','dialogue','voiceover','translate','camera','action']);
const semi=new Set(['time','time_origin','scene_duration','footage','voiceover','effect','character','translate','tone_of_voice','vo_token_count','vo_target_range','audio_mode','content_function','review_angle']);
const key=s=>s.normalize('NFC').toLowerCase()==='dịch'?'translate':s.normalize('NFC').toLowerCase();
const fail=(code,scene,line)=>{throw Object.assign(new Error('Kịch bản '+(scene?'scene_'+scene+': ':'')+code+(line?' (dòng '+line+')':'')),{code});};
export function parseStructuredScript(script,projectType){
  if(!['full-ai','semi'].includes(projectType))throw Error('Unsupported project type');
  if(!/^\s*scene_/im.test(script))return null; // Other formats keep the explicit AI path.
  const blocks=[],ids=new Set(),known=projectType==='semi'?semi:full;
  let current=null,active=null,offset=0,lineNo=0;
  const open=()=>{if(!active||!['dialogue','voiceover','translate'].includes(active.key))return false;const value=script.slice(active.start,active.end);const closing={'"':'"','“':'”'}[value[0]];return !!closing&&(value.length===1||!value.endsWith(closing));};
  const flush=()=>{if(open())fail('UNCLOSED_QUOTED_FIELD',current?.number,active.line);if(active){current.fields[active.key]=script.slice(active.start,active.end);active=null;}};
  for(const raw of script.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)||[]){
    if(!raw)continue;lineNo++;const body=raw.replace(/[\r\n]+$/,'');const heading=/^[ \t]*scene_([1-9][0-9]*)[ \t]*$/i.exec(body);
    if(open()&&!heading){active.end=offset+body.length;offset+=raw.length;continue;}
    if(heading){flush();const number=Number(heading[1]);if(ids.has(number))fail('DUPLICATE_SCENE',number,lineNo);ids.add(number);current={number,fields:Object.create(null)};blocks.push(current);}
    else if(!current){if(/^\s*scene_/i.test(body)&&!body.includes(':'))fail('INVALID_SCENE',null,lineNo);}
    else if(!body.trim()){ /* structural blank */ } // Keep internal blank lines in source slices.
    else if(/^=+$/.test(body.trim()))flush();
    else{
      if((/^\s*(?:scene_|SCENE\s|INT\.|EXT\.)/i.test(body)&&!body.includes(':'))||body.startsWith('#'))fail('UNSUPPORTED_SCENE_CONTENT',current.number,lineNo);
      const field=/^([\p{L}_][\p{L}\p{N}_ -]*):[ \t]*(.*)$/u.exec(body);
      if(field){const name=key(field[1]);
        if(active&&['dialogue','voiceover'].includes(active.key)&&!known.has(name)&&script.slice(active.end,offset).split('\n').length<=2)fail('AMBIGUOUS_FIELD',current.number,lineNo);
        flush();if(Object.hasOwn(current.fields,name))fail('DUPLICATE_FIELD',current.number,lineNo);
        active={key:name,start:offset+body.length-field[2].length,end:offset+body.length,line:lineNo};
      }else if(active)active.end=offset+body.length;
      else fail('UNNAMED_FIELD',current.number,lineNo);
    }
    offset+=raw.length;
  }
  flush();if(!blocks.length)fail('INVALID_SCENE');
  const characters=[],seen=new Map(),scenes=[];
  for(const {number,fields:f}of blocks){
    const get=k=>f[k]??'';
    if(projectType==='full-ai'){
      // Character is authored text, not a semantic identity or visual ID.
      const name=get('character').trim();
      if(!get('dialogue').trim()||['""',"''",'“”'].includes(get('dialogue').trim()))fail('MISSING_DIALOGUE',number);
      if(Object.hasOwn(f,'voiceover')&&get('voiceover')!==get('dialogue'))fail('DIALOGUE_VOICEOVER_CONFLICT',number);
      const id='char_'+Array.from(name).map(c=>c.codePointAt(0).toString(16)).join('_');
      if(name&&!seen.has(id)){seen.set(id,name);characters.push({id,name,description:'',voiceTone:''});}
      scenes.push({scene_n:number,Context:get('context'),Camera:get('camera'),Action:get('action'),Character:name,Dialogue:get('dialogue'),Translate:get('translate'),Tone_of_Voice:get('tone_of_voice')||get('tone'),Word_count:countSpokenWords(get('dialogue')),status:'pending'});
    }else{
      validateTime(get('time_origin'),number);if(get('time'))validateTime(get('time'),number);
      scenes.push({scene_n:number,time_origin:get('time_origin'),Footage:get('footage'),Effect:get('effect'),Character:get('character'),Voiceover:get('voiceover'),Translate:get('translate'),Tone_of_Voice:get('tone_of_voice'),Word_count:countSpokenWords(get('voiceover')),status:'pending'});
    }
  }
  return {characters,scenes,sourceMetadata:blocks.map(b=>({scene_n:b.number,fields:{...b.fields}}))};
}
function validateTime(value,scene){
  const match=/^\s*([\d:.]+)\s*-\s*([\d:.]+)\s*$/.exec(value);if(!match)fail('INVALID_TIME_ORIGIN',scene);
  const seconds=text=>{const p=text.split(':');if(p.length>3||p.some((v,i)=>!(i===p.length-1?/^\d+(?:\.\d+)?$/:/^\d+$/).test(v))||(p.length>1&&Number(p.at(-1))>=60)||(p.length===3&&Number(p[1])>=60))return NaN;return p.reduce((n,v)=>n*60+Number(v),0);};
  const a=seconds(match[1]),b=seconds(match[2]);if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)fail('INVALID_TIME_ORIGIN',scene);
}
