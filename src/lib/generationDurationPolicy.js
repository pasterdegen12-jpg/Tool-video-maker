// Application policy, distinct from provider maxima and historical snapshots.
export const GENERATION_DURATION_VERSION='brisk-4-10-v1';
export const MIN_GENERATION_DURATION=4;
export const MAX_GENERATION_DURATION=10;
export function allowedRequestDurations(provider={min:4,max:12}){
  const values=Array.isArray(provider)?provider:Array.from({length:Math.max(0,provider.max-provider.min+1)},(_,i)=>provider.min+i);
  return [...new Set(values)].filter(n=>Number.isInteger(n)&&n>=4&&n<=10).sort((a,b)=>a-b);
}
export function selectRequestDuration(estimate,provider){
  const values=allowedRequestDurations(provider);if(!values.length)throw Error('Provider không có thời lượng được hỗ trợ trong 4–10 giây.');
  const target=Number.isFinite(estimate)?Math.round(estimate):4;
  // Nearest supported duration; ties choose the longer supported value.
  return values.reduce((best,n)=>Math.abs(n-target)<=Math.abs(best-target)?n:best,values[0]);
}
export function validNewRequestDuration(value){return Number.isInteger(value)&&value>=4&&value<=10;}
