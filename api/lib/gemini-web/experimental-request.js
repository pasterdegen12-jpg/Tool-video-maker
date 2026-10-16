import { randomInt, randomUUID } from 'node:crypto';
import { GeminiTestError } from './errors.js';

// Numeric layout observed in the user's capture. No captured strings retained.
// Server acceptance without attestation and browser-specific headers is unverified.
const template = [["",0,null,null,null,null,0],["en"],null,null,null,null,[1],1,null,null,1,0,null,null,null,null,null,[[0]],0,null,null,null,null,null,null,null,null,1,null,null,[4,16],null,null,null,null,null,null,null,null,null,null,[1],null,null,null,null,null,null,null,0,null,null,null,0,null,null,null,null,null,null,null,[],null,null,null,null,null,null,2,null,null,null,null,null,null,null,null,null,null,3,1,null,null,null,null,null,null,null,null,null,null,0,null,null,null,null,0,null,1];
export function buildExperimentalRequest(prompt, tokens) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 16000) throw new GeminiTestError('INVALID_REQUEST', 400);
  const payload = structuredClone(template);
  payload[0][0] = prompt;
  payload[3] = null; // No BotGuard snapshot; no replayed attestation.
  payload[4] = null; // No content-bound nonce when attestation is absent.
  payload[59] = randomUUID().toUpperCase();
  const url = new URL('https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate');
  url.search = new URLSearchParams({ bl: tokens.build, 'f.sid': tokens.sid, hl: 'en', _reqid: String(randomInt(100000, 10000000)), rt: 'c' });
  return { url, body: new URLSearchParams({ 'f.req': JSON.stringify([null, JSON.stringify(payload)]), at: tokens.at }) };
}

export async function sendExperimentalRequest(session, prompt, tokens) {
  const { url, body } = buildExperimentalRequest(prompt, tokens);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Cookie: session, Origin: 'https://gemini.google.com', Referer: 'https://gemini.google.com/app', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: '*/*' },
      body, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(120000),
    });
  } catch { throw new GeminiTestError('NETWORK_ERROR'); }
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    const error = new GeminiTestError(response.status === 429 ? 'GEMINI_RATE_LIMITED' : 'GEMINI_REQUEST_FAILED', response.status === 429 ? 429 : 502);
    error.upstreamStatus = response.status;
    throw error;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16 * 1024 * 1024) throw new GeminiTestError('GEMINI_RESPONSE_PARSE_FAILED');
      raw += decoder.decode(value, { stream: true });
    }
    return { raw: raw + decoder.decode(), status: response.status };
  } catch (error) {
    const safeError = error instanceof GeminiTestError ? error : new GeminiTestError('NETWORK_ERROR');
    safeError.upstreamStatus = response.status;
    throw safeError;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
