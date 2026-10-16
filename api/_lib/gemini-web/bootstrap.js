import { GeminiTestError } from './errors.js';

// Field mappings verified against the same-load Gemini document and request.
// Parse data only. Never evaluate scripts from the upstream document.
export function parseBootstrap(html) {
  try {
    if (typeof html !== 'string' || html.length > 8 * 1024 * 1024) throw new Error();
    const assignment = /(?:window\.)?WIZ_global_data\s*=\s*\{/.exec(html);
    if (!assignment) throw new Error();
    const start = assignment.index + assignment[0].lastIndexOf('{');
    let depth = 0;
    let quoted = false;
    let escaped = false;
    let end;
    for (let i = start; i < html.length; i++) {
      const char = html[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) { end = i + 1; break; }
    }
    if (!end) throw new Error();
    const data = JSON.parse(html.slice(start, end));
    const fields = [data.SNlM0e, data.FdrFJe, data.cfb2h];
    if (fields.some(value => typeof value !== 'string' || !value || value.length > 4096 || /[\r\n\0]/.test(value))) throw new Error();
    return { at: data.SNlM0e, sid: data.FdrFJe, build: data.cfb2h };
  } catch {
    throw new GeminiTestError('TOKEN_PARSE_FAILED');
  }
}

export async function loadBootstrap(session) {
  let response;
  try {
    response = await fetch('https://gemini.google.com/app', {
      headers: { Cookie: session, Accept: 'text/html' },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new GeminiTestError('NETWORK_ERROR');
  }
  if (!response.ok) {
    await response.body?.cancel();
    // A redirect or 403 alone does not prove expiration.
    const error = new GeminiTestError(response.status === 429 ? 'GEMINI_RATE_LIMITED' : 'GEMINI_BOOTSTRAP_FAILED', response.status === 429 ? 429 : 502);
    error.upstreamStatus = response.status;
    throw error;
  }
  if (!response.headers.get('content-type')?.includes('text/html') || !response.body) {
    await response.body?.cancel();
    throw new GeminiTestError('GEMINI_BOOTSTRAP_FAILED');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8 * 1024 * 1024) throw new GeminiTestError('GEMINI_BOOTSTRAP_FAILED');
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
    return parseBootstrap(html);
  } catch (error) {
    if (error instanceof GeminiTestError) { error.upstreamStatus = response.status; throw error; }
    throw new GeminiTestError('NETWORK_ERROR');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
