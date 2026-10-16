import {VideoError} from './errors.js';

// Only these application-owned enums and HTTP numbers may cross the journal/UI
// boundary. Never retain provider bodies, URLs, headers, messages or causes.
const steps=['TICKET_REQUEST','TICKET_VALIDATE','UPLOAD_URL_CHECK','DOWNLOAD_URL_CHECK','IMAGE_PUT','UPLOAD_COMPLETE_WRITE','PREDICTION_SUBMIT','POLL_REQUEST','JOURNAL_WRITE'];
const codes=['CONFIGURATION_ERROR','PAID_DISABLED','UPSTREAM_FAILED','INVALID_PROVIDER_RESPONSE','UPLOAD_FAILED','SUBMISSION_REJECTED','JOURNAL_UNAVAILABLE','INTERNAL'];
const reasons=['UNSPECIFIED','HTTP_STATUS','RESPONSE_SCHEMA','TICKET_TYPE','TICKET_SIZE','TICKET_FILENAME','TICKET_DOWNLOAD_URL','TICKET_UPLOAD','TICKET_EXPIRY','TICKET_HEADERS','TICKET_CONTENT_TYPE','UNSAFE_URL','DNS_LOOKUP','DNS_TIMEOUT','PRIVATE_ADDRESS','REDIRECT','RESPONSE_TOO_LARGE','REMOTE_ADDRESS','REQUEST_TIMEOUT','REQUEST_ERROR','RESPONSE_ERROR','REQUEST_FRAMING','STORAGE_SIGNATURE_MISMATCH','STORAGE_ACCESS_DENIED','STORAGE_EXPIRED','STORAGE_TIME_SKEW','STORAGE_LENGTH_REQUIRED','STORAGE_INVALID_REQUEST','STORAGE_PRECONDITION','STORAGE_BAD_DIGEST','STORAGE_UNSUPPORTED','STORAGE_RATE_LIMIT'];
const status=value=>Number.isInteger(value)&&value>=100&&value<=599?value:null;
export function failureInfo(error,step){
  const source=error?.diagnostic||{};
  return {step:steps.includes(source.step)?source.step:steps.includes(step)?step:'JOURNAL_WRITE',
    code:codes.includes(error?.code)?error.code:'INTERNAL',
    http_status:status(source.http_status??error?.httpStatus),
    reason:reasons.includes(source.reason??error?.reason)?(source.reason??error.reason):'UNSPECIFIED'};
}
export function annotateFailure(error,step,httpStatus){
  const info=failureInfo(error,step);
  if(info.http_status===null)info.http_status=status(httpStatus);
  const safe=new VideoError(info.code,Number.isInteger(error?.retryAfter)?Math.min(600,Math.max(0,error.retryAfter)):0);
  safe.diagnostic=info;
  return safe;
}
export function diagnosticError(code,reason,httpStatus){
  const error=new VideoError(code);error.reason=reason;error.httpStatus=status(httpStatus);return error;
}
export function storageFailureReason(body){
  // Exact allowlist only. The surrounding XML can contain signed URLs, request
  // strings and credentials and must never enter a log or persisted error.
  const known={SignatureDoesNotMatch:'STORAGE_SIGNATURE_MISMATCH',AccessDenied:'STORAGE_ACCESS_DENIED',
    RequestExpired:'STORAGE_EXPIRED',RequestTimeTooSkewed:'STORAGE_TIME_SKEW',MissingContentLength:'STORAGE_LENGTH_REQUIRED',
    InvalidRequest:'STORAGE_INVALID_REQUEST',PreconditionFailed:'STORAGE_PRECONDITION',BadDigest:'STORAGE_BAD_DIGEST',
    NotImplemented:'STORAGE_UNSUPPORTED',SlowDown:'STORAGE_RATE_LIMIT'};
  const code=typeof body==='string'&&body.length<=8192?/<Code>\s*([A-Za-z]{1,64})\s*<\/Code>/.exec(body)?.[1]:null;
  return Object.hasOwn(known,code)?known[code]:'HTTP_STATUS';
}
export function validFailure(value){
  return value&&Object.keys(value).sort().join()==='at,code,http_status,reason,step'&&
    steps.includes(value.step)&&codes.includes(value.code)&&reasons.includes(value.reason)&&
    (value.http_status===null||status(value.http_status)===value.http_status)&&
    Number.isSafeInteger(value.at)&&value.at>=0;
}
