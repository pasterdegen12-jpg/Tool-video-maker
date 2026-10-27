import {countSpokenWords,readSpokenText} from './spokenText.js';
export function authoredSlowSpeech(scene){
 const tone=String(scene.Tone_of_Voice||'');
 return /\bslow(?:ly)?\b|chậm|long pause|dramatic pause/i.test(tone)||
 /speak(?:s|ing)? slowly|slow (?:speech|delivery)|long (?:dramatic )?pause|nói chậm|ngừng lâu|ngắt nghỉ dài/i.test(String(scene.Action||''));
}
export function speechEstimate(scene){
 const spoken=readSpokenText(scene,'full-ai');if(spoken.issue)throw Object.assign(Error(spoken.message),{code:spoken.issue});
 const text=spoken.text,words=countSpokenWords(text),slow=authoredSlowSpeech(scene);
 if(!text.trim())return {seconds:0,words:0,units:0,unit:'silent',rate:0,slow};
 const cjk=(text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)||[]).length;
 const vietnamese=/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉĩịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/iu.test(text);
 const unit=cjk?'cjk-character':vietnamese?'vi-syllable':'word';
 // Deterministic heuristics, not claims of measured speech. Vietnamese spaces
 // generally separate syllables; CJK characters must not count as one long word.
 const units=cjk?cjk+countSpokenWords(text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,' ').trim()):words;
 const rate=slow?(cjk?180:vietnamese?180:140):(cjk?300:vietnamese?270:200);
 const pause=slow?.8:Math.min(.6,.25+(text.match(/[,;:]/g)||[]).length*.04+(text.match(/[.!?](?:\s|$)/g)||[]).length*.08);
 return {seconds:Math.ceil((units*60/rate+pause)*100)/100,words,units,unit,rate,slow};
}
export function speechDelivery(scene,compact=false){
 if(!readSpokenText(scene,'full-ai').text.trim())return '';
 if(authoredSlowSpeech(scene))return '\n\nSPEECH DELIVERY: Respect the authored slow pace and meaningful pauses. Preserve every word, emotion, pronunciation and natural lip synchronization.';
 return compact?'\n\nSPEECH DELIVERY: Brisk, fluent, clear; brief pauses, no drawn-out words. Preserve exact words, emotion and lip sync; authored pace takes priority.':
 '\n\nSPEECH DELIVERY: Follow authored pace and meaningful pauses first. Otherwise speak the exact dialogue at a brisk, fluent, natural conversational pace with clear articulation. Keep pauses brief; avoid drawn-out syllables and slow theatrical delivery. Preserve emotion, pronunciation and natural lip synchronization. Deliver every authored word without additions or omissions.';
}
