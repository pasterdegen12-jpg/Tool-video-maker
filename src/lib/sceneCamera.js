// Derive only from canonical Camera, never from custom prompt or character action.
export function sceneCameraFixed(scene,mode='start_frame_to_video',fallback=false){
  if(mode==='references_to_video')return false;
  const text=String(scene?.Camera||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
  // Remove negated movement before looking for positive movement instructions.
  const positive=text.replace(/(?:no|without|do not|don't|never)\s+(?:camera\s+)?(?:movement|move|pan|tilt|zoom|dolly|track|orbit)[^,;.]*|khong[^,;.]*(?:di chuyen|thay doi|zoom|lia|quay|camera)[^,;.]*/g,'');
  const moving=/\b(?:pan(?:ning)?|tilt(?:ing)?|dolly|track(?:ing)?|orbit(?:ing)?|handheld|zoom(?:ing)?|moving camera|camera moves?)\b|(?:may quay|camera|goc may)\s+(?:di chuyen|lia|xoay)|(?:lia|di chuyen|xoay)\s+(?:may quay|camera)/.test(positive);
  const negatedFixed=/\b(?:not|no|without)\s+(?:a\s+)?(?:fixed|static|locked[- ]off)|khong\s+co dinh/.test(text);
  if(moving||negatedFixed)return false;
  const fixed=/\b(?:fixed (?:camera|angle|shot)|static camera|locked[- ]off(?: shot| camera)?|no camera movement|camera (?:is )?(?:fixed|static))\b|^(?:static|fixed)\.?$|(?:camera|goc may|may quay)\s+co dinh|khong\s+(?:duoc\s+)?di chuyen\s+(?:may quay|camera)/.test(text);
  return fixed?true:fallback;
}
