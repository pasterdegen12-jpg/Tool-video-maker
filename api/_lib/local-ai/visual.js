import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { BridgeError } from './errors.js';
import { MAX_REFERENCE_BYTES, validVisualProposal } from '../../../src/lib/visualProfile.js';

export const MAX_VISUAL_BODY = 1400000;
export function validateVisualInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).sort().join(',') !== 'image_base64,mime_type' ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(body.mime_type) ||
      typeof body.image_base64 !== 'string') throw new BridgeError('INVALID_REQUEST');
  if (body.image_base64.length > 1398104) throw new BridgeError('REQUEST_TOO_LARGE');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body.image_base64)) throw new BridgeError('INVALID_REQUEST');
  const bytes = Buffer.from(body.image_base64, 'base64');
  try {
    if (!bytes.length || bytes.length > MAX_REFERENCE_BYTES) throw new BridgeError('REQUEST_TOO_LARGE');
    if (bytes.toString('base64') !== body.image_base64) throw new BridgeError('INVALID_REQUEST');
    const type = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
      : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP' ? 'image/webp' : null;
    if (type !== body.mime_type) throw new BridgeError('INVALID_REQUEST');
    return { image_base64: body.image_base64, mime_type: body.mime_type };
  } finally { bytes.fill(0); }
}
export function imageHash(payload) { return createHash('sha256').update(Buffer.from(payload.image_base64, 'base64')).digest('hex'); }
export function validateVisualResult(result, expected) {
  if (!result || Object.keys(result).sort().join(',') !== 'image_sha256,operation,profile' ||
      result.operation !== 'visual_profile' || result.image_sha256 !== expected.sourceHash || !validVisualProposal(result.profile)) {
    throw new BridgeError('GATEWAY_INVALID_RESPONSE');
  }
  return result;
}
export function publicVisualError(error) {
  const code = ['REQUEST_TIMEOUT','CUDA_OOM','INVALID_VISUAL_OUTPUT','INVALID_MODEL_OUTPUT','INFERENCE_FAILED',
    'SERVICE_SHUTDOWN','WORKER_UNAVAILABLE','INPUT_TOKEN_LIMIT'].includes(error?.code) ? error.code : 'INFERENCE_FAILED';
  return { code, message: 'Visual detection could not complete. The approved profile was not changed.' };
}
