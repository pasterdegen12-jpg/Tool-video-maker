const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
export function cameraIntent(value){
  const text=normalized(value);
  // Remove negated movement before looking for positive movement instructions.
  const positive=text.replace(/(?:no|without|do not|don't|never)\s+(?:camera\s+)?(?:movement|move|pan|tilt|zoom|dolly|track|orbit)(?:\s+(?:in|out))?(?:\s*(?:,\s*(?:or\s+|and\s+)?|or\s+|and\s+)(?:pan|tilt|zoom|dolly|track|orbit)\b(?:\s+(?:in|out))?)*|khong[^,;.]*(?:di chuyen|thay doi|zoom|lia|quay|camera)[^,;.]*/g,'');
  const moving=/\b(?:pan(?:ning)?|tilt(?:ing)?|dolly|push[- ]in|track(?:ing)?|orbit(?:ing)?|handheld|zoom(?:ing)?|moving camera|camera (?:moves?|approaches|follows)|tighten(?:ing)? (?:the )?framing|close[- ]up transition)\b|(?:may quay|camera|goc may)\s+(?:di chuyen|lia|xoay)|(?:lia|di chuyen|xoay)\s+(?:may quay|camera)/.test(positive);
  const negatedFixed=/\b(?:not|no|without)\s+(?:a\s+)?(?:fixed|static|locked[- ]off)|khong\s+co dinh/.test(text);
  const fixed=/\b(?:fixed (?:camera|angle|shot)|static camera|locked[- ]off(?: shot| camera)?|no camera movement|camera (?:is )?(?:fixed|static))\b|^(?:static|fixed)\.?$|(?:camera|goc may|may quay)\s+co dinh|khong\s+(?:duoc\s+)?di chuyen\s+(?:may quay|camera)/.test(text);
  return {fixed:fixed&&!negatedFixed,moving,negatedFixed};
}
// Derive only from canonical Camera, never from custom prompt or character action.
export function sceneCameraFixed(scene,mode='start_frame_to_video',fallback=false){
  if(mode==='references_to_video')return false;
  const intent=cameraIntent(scene?.Camera);
  return intent.moving||intent.negatedFixed?false:intent.fixed?true:fallback;
}
