export const GEMINI_MODEL='gemini-2.5-flash';
export function geminiRequest(promptText){
  return {contents:[{parts:[{text:promptText}]}],generationConfig:{response_mime_type:'application/json',temperature:0}};
}
// This is the original MainEditor extraction and normalization, unchanged.
export function parseGeminiResponse(data){
  const rawText=data.candidates[0].content.parts[0].text;
  const jsonMatch=rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if(!jsonMatch)throw new Error('Lỗi cấu trúc trả về từ AI.');
  let parsedJson=JSON.parse(jsonMatch[0]);
  if(Array.isArray(parsedJson))parsedJson={characters:[],scenes:parsedJson};
  if(!parsedJson.scenes)parsedJson.scenes=[];
  if(!parsedJson.characters)parsedJson.characters=[];
  return parsedJson;
}
