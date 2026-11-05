// Deterministic formatting only: never infer or add appearance attributes.
export function normalizeVisualId(value) {
 if(typeof value!=='string'||value.length>600||!/^[\x20-\x7e]+$/.test(value))throw Error('VISUAL_OUTPUT_INVALID');
 const id=value.trim().toLowerCase().replace(/[\s,.;:_-]+/g,'_').replace(/^_|_$/g,'');
 if(id.length<3||id.length>100||! /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(id))throw Error('VISUAL_OUTPUT_INVALID');
 return id;
}
export function descriptionVisualId(description){
 if(typeof description!=='string'||description.length>600||!/^[\x20-\x7e]+$/.test(description)||!/\b(?:person|man|woman|hair|bald|glasses|wearing|shirt|robe|suit)\b/i.test(description))throw Error('VISUAL_OUTPUT_INVALID');
 if(/https?:|@|\b(?:not|no|without|unclear|cannot|maybe|possibly|background|named|identity|religion|ethnicity|judge|lawyer|plaintiff|defendant)\b/i.test(description))throw Error('VISUAL_OUTPUT_UNSUPPORTED');
 // Drop grammar only; retain all descriptive words, including negation compounds
 // such as clean-shaven. Never truncate an overlong ID to make it pass.
 return normalizeVisualId(description.replace(/\b(?:a|an|the|with|and|is|has|he|she|wearing|wears)\b/gi,' '));
}
