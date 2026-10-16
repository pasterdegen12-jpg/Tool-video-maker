import { GeminiTestError } from './errors.js';

const fail = () => { throw new GeminiTestError('GEMINI_RESPONSE_PARSE_FAILED'); };

// Decode the observed length-labelled JSON envelopes structurally. Do not split
// on newlines: JSON strings and pretty-printed envelopes can contain them.
function readEnvelopes(raw) {
  if (typeof raw !== 'string' || raw.length > 16 * 1024 * 1024) fail();
  const input = raw.trim();
  if (!input.startsWith(")]}'")) fail();
  const envelopes = [];
  let cursor = 4;
  while (cursor < input.length) {
    while (/\s/.test(input[cursor] || '') && cursor < input.length) cursor++;
    if (cursor === input.length) break;
    const label = /^\d+\s*/.exec(input.slice(cursor));
    if (!label) fail();
    cursor += label[0].length;
    if (input[cursor] !== '[' || envelopes.length >= 2048) fail();
    const start = cursor;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (; cursor < input.length; cursor++) {
      const char = input[cursor];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') inString = true;
      else if (char === '[' || char === '{') {
        if (++depth > 256) fail();
      } else if (char === ']' || char === '}') {
        if (--depth === 0) { cursor++; break; }
      }
    }
    if (depth !== 0 || inString) fail();
    envelopes.push(JSON.parse(input.slice(start, cursor)));
  }
  return envelopes;
}

// Observed capture: payload[4][0][1][0] contains cumulative answer text.
// Metadata/search/progress frames are not answers. Keep the latest snapshot,
// never concatenate snapshots or expose arbitrary upstream metadata.
export function parseGeminiResponse(raw) {
  try {
    let answer;
    let frameCount = 0;
    for (const envelope of readEnvelopes(raw)) {
      if (!Array.isArray(envelope)) fail();
      for (const row of envelope) {
        if (!Array.isArray(row)) fail();
        if (row[0] !== 'wrb.fr') continue;
        if (typeof row[2] !== 'string') fail();
        frameCount++;
        const payload = JSON.parse(row[2]);
        if (!Array.isArray(payload)) fail();
        const candidates = payload[4];
        if (candidates == null) continue;
        // Only one candidate was observed. Other layouts need verification.
        if (!Array.isArray(candidates) || candidates.length !== 1) fail();
        const text = candidates[0]?.[1]?.[0];
        if (typeof text !== 'string') fail();
        if (!text.trim()) continue;
        answer = { text };
        if (typeof payload[1]?.[0] === 'string') answer.conversationId = payload[1][0];
        if (typeof payload[1]?.[1] === 'string') answer.responseId = payload[1][1];
      }
    }
    if (!answer) fail();
    return { ...answer, rawMeta: { frameCount } };
  } catch {
    // JSON parse errors may quote credential-bearing input: never forward them.
    fail();
  }
}
