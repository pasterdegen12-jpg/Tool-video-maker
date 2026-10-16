import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createLocalParserController, localParserVisible, validateLocalInput, validPreviewResult } from '../src/lib/localParserClient.js';

// Replay recorded REAL CPU responses; transport/state/error responses below are explicitly mocked.
const captures = Object.fromEntries(await Promise.all(['full-ai', 'semi'].map(async workflow => {
  const capture = JSON.parse(await fs.readFile(new URL('../docs/phase3a/' + workflow + '.web-http.json', import.meta.url), 'utf8'));
  const original = await fs.readFile(capture.input);
  assert.equal(createHash('sha256').update(original).digest('hex'), capture.sha256);
  assert.equal(capture.request.script, original.toString('utf8'));
  return [workflow, capture];
})));
const id = 'a'.repeat(48);
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const admission = (time, extra = {}) => json({ job_id: id, state: 'queued', status_url: '/api/local-ai/jobs/' + id,
  expires_at: new Date(time + 300000).toISOString(), max_polls: 120, ...extra }, 202, { 'Retry-After': '1' });
const state = name => json({ job_id: id, state: name, result: null, error: null });
const completed = workflow => json({ ...captures[workflow].response, job_id: id });
function harness(responses, options = {}) {
  let time = Date.now(), tokens = 0;
  const calls = [], updates = [], waits = [];
  const controller = createLocalParserController({
    getToken: async () => { tokens++; return 'mock-clerk-session-only'; },
    fetchImpl: async (path, request) => {
      calls.push({ path, request });
      const next = responses.shift();
      if (typeof next === 'function') return await next(time, request);
      if (next instanceof Error) throw next;
      if (!next) throw Error('Unexpected fetch');
      return next;
    }, now: () => time, sleep: async ms => { waits.push(ms); time += ms; },
    onChange: value => updates.push(value), ...options,
  });
  return { controller, calls, updates, waits, tokenCount: () => tokens };
}

test('visibility requires dev, explicit opt-in and literal local browser origin', () => {
  const location = { protocol: 'http:', hostname: 'localhost' };
  assert.equal(localParserVisible({ DEV: true }, location), false);
  assert.equal(localParserVisible({ DEV: false, VITE_ENABLE_LOCAL_PARSER: 'true' }, location), false);
  assert.equal(localParserVisible({ DEV: true, VITE_ENABLE_LOCAL_PARSER: 'true' }, location), true);
  assert.equal(localParserVisible({ DEV: true, VITE_ENABLE_LOCAL_PARSER: 'true' }, { ...location, hostname: 'example.com' }), false);
});

test('obvious invalid/unstructured input never calls Clerk or sends POST', async () => {
  for (const script of ['', '   \r\n', 'Please create a courtroom story.', 'x'.repeat(40001)]) {
    const h = harness([]);
    await h.controller.submit({ projectType: 'full-ai', language: 'en', script });
    assert.equal(h.calls.length, 0); assert.equal(h.tokenCount(), 0); assert.equal(h.updates.at(-1).status, 'error');
  }
  assert.ok(validateLocalInput({ ...captures.semi.request, language: 'fr' }));
});

for (const workflow of ['full-ai', 'semi']) test('exact original ' + workflow + ' request, canonical response and complete metadata', async () => {
  const h = harness([admission, state('queued'), state('running'), completed(workflow)]);
  assert.equal(await h.controller.submit(captures[workflow].request), true);
  assert.deepEqual(h.updates.map(s => s.status), ['submitting', 'queued', 'queued', 'running', 'completed']);
  assert.deepEqual(JSON.parse(h.calls[0].request.body), captures[workflow].request);
  assert.deepEqual(h.updates.at(-1).result, captures[workflow].response.result);
  assert.deepEqual(h.waits, [1000, 1000, 1000]); assert.equal(h.tokenCount(), 4);
  for (const call of h.calls) {
    assert.match(call.path, /^\/api\/local-ai\/(?:analyze|jobs\/[a-f0-9]{48})$/);
    assert.equal(call.request.headers.Authorization, 'Bearer mock-clerk-session-only');
    assert.equal(call.request.redirect, 'error');
    assert.equal(call.request.referrerPolicy, 'same-origin');
    assert.equal(call.request.mode, 'same-origin');
    assert.equal(call.request.headers.Origin, undefined); // Browser-managed, not a forged header.
  }
  assert.equal(Object.hasOwn(JSON.parse(h.calls[0].request.body), 'userId'), false);
});

test('does not repair canonical aliases or cross-workflow/missing metadata responses', () => {
  for (const workflow of ['full-ai', 'semi']) {
    const result = structuredClone(captures[workflow].response.result);
    assert.equal(validPreviewResult(result, workflow), true);
    result.web_data.scenes[0][workflow === 'full-ai' ? 'Voiceover' : 'Dialogue'] = 'competing alias';
    assert.equal(validPreviewResult(result, workflow), false);
  }
  const invalid = structuredClone(captures.semi.response.result); delete invalid.source_metadata;
  assert.equal(validPreviewResult(invalid, 'semi'), false);
});

test('expired/missing Clerk token stops with no POST; SDK errors are never echoed', async () => {
  for (const getToken of [async () => null, async () => { throw Error('PRIVATE_TOKEN'); }]) {
    const h = harness([], { getToken }); await h.controller.submit(captures.semi.request);
    assert.equal(h.calls.length, 0); assert.equal(h.updates.at(-1).status, 'auth_required');
    assert.equal(JSON.stringify(h.updates).includes('PRIVATE'), false);
  }
});

for (const method of ['POST', 'GET']) test(method + ' 401 expired session stops without retry', async () => {
  const responses = [json({ error: { code: 'UNAUTHORIZED' } }, 401)];
  if (method === 'GET') responses.unshift(admission);
  const h = harness(responses); await h.controller.submit(captures.semi.request);
  assert.equal(h.updates.at(-1).status, 'auth_required');
  assert.equal(h.calls.length, method === 'GET' ? 2 : 1);
});

for (const status of [404, 410]) test('poll ' + status + ' ends as expired', async () => {
  const h = harness([admission, json({ error: {} }, status)]); await h.controller.submit(captures.semi.request);
  assert.equal(h.updates.at(-1).status, 'expired'); assert.equal(h.calls.length, 2);
});

test('429/503 Retry-After is honored before next GET and recovery completes', async () => {
  const h = harness([admission,
    json({ error: { retryable: true } }, 429, { 'Retry-After': '4' }),
    time => json({ error: { retryable: true } }, 503, { 'Retry-After': new Date(time + 6000).toUTCString() }), completed('semi')]);
  await h.controller.submit(captures.semi.request);
  assert.deepEqual(h.waits.slice(0, 2), [1000, 4000]);
  assert.ok(h.waits[2] >= 5000 && h.waits[2] <= 6000);
  assert.equal(h.updates.at(-1).status, 'completed');
});

test('transient network errors stop after three; non-retryable 503 stops immediately', async () => {
  const h = harness([admission, Error('private endpoint'), Error('private endpoint'), Error('private endpoint')]);
  await h.controller.submit(captures.semi.request);
  assert.equal(h.calls.length, 4); assert.equal(h.updates.at(-1).status, 'unavailable');
  assert.equal(JSON.stringify(h.updates).includes('private endpoint'), false);
  const configFailure = harness([admission, json({ error: { retryable: false, code: 'GATEWAY_AUTH_FAILED' } }, 503)]);
  await configFailure.controller.submit(captures.semi.request); assert.equal(configFailure.calls.length, 2);
});

test('server and client poll budgets/deadlines stop even when gateway never completes', async () => {
  const h = harness([time => admission(time, { max_polls: 2 }), state('queued'), state('running')]);
  await h.controller.submit(captures.semi.request);
  assert.equal(h.calls.length, 3); assert.equal(h.updates.at(-1).status, 'expired');
  const expired = harness([time => admission(time, { expires_at: new Date(time + 500).toISOString() })]);
  await expired.controller.submit(captures.semi.request);
  assert.equal(expired.calls.length, 1); assert.equal(expired.updates.at(-1).status, 'expired');
  const capped = harness([time => admission(time, { max_polls: 10000 }), ...Array.from({ length: 120 }, () => state('running'))]);
  await capped.controller.submit(captures.semi.request); assert.equal(capped.calls.length, 121);
});

test('failed CPU job is terminal; no partial preview, save or Gemini fallback', async () => {
  const h = harness([admission, json({ job_id: id, state: 'failed', result: null,
    error: { code: 'MISSING_DIALOGUE', message: 'PRIVATE', details: { scene_id: 'scene_1' } } })]);
  await h.controller.submit(captures['full-ai'].request);
  assert.equal(h.updates.at(-1).status, 'failed'); assert.equal(h.updates.at(-1).result, null);
  assert.match(h.updates.at(-1).message, /scene_1/); assert.equal(h.calls.length, 2);
});

test('ambiguous POST network/timeout/malformed admission never retries or follows external URLs', async () => {
  for (const response of [Error('PRIVATE'), time => admission(time, { status_url: 'https://private.example' }),
    new Response('<html>error</html>', { status: 202 }), () => new Promise(() => {})]) {
    const h = harness([response], { requestTimeoutMs: 20 }); await h.controller.submit(captures.semi.request);
    assert.equal(h.calls.length, 1); assert.match(h.updates.at(-1).message, /có thể đã tạo job/);
    assert.equal(JSON.stringify(h.updates).includes('private.example'), false);
  }
});

test('POST capacity/unavailable errors never silently retry', async () => {
  for (const status of [429, 503, 404]) {
    const h = harness([json({ error: { retryable: true } }, status, { 'Retry-After': '7' })]);
    await h.controller.submit(captures.semi.request); assert.equal(h.calls.length, 1);
    assert.equal(h.updates.at(-1).status, 'unavailable');
    if (status === 429) assert.match(h.updates.at(-1).message, /7 giây/);
  }
});

test('duplicate click prevented during token acquisition; cancel blocks a late token from POSTing', async () => {
  let release; const h = harness([], { getToken: () => new Promise(resolve => { release = resolve; }) });
  const first = h.controller.submit(captures.semi.request);
  assert.equal(await h.controller.submit(captures.semi.request), false);
  h.controller.cancel(); release('late-token'); await first;
  assert.equal(h.calls.length, 0); assert.equal(h.updates.at(-1).status, 'cancelled');
});

test('cancel or unmount aborts pending fetch and rejects late results despite transport ignoring signal', async () => {
  for (const notify of [true, false]) {
    let release, signal;
    const h = harness([admission, (_time, options) => { signal = options.signal; return new Promise(resolve => { release = resolve; }); }]);
    const run = h.controller.submit(captures.semi.request);
    while (!release) await new Promise(resolve => setImmediate(resolve));
    h.controller.cancel(notify); const count = h.updates.length;
    assert.equal(signal.aborted, true); release(completed('semi')); await run;
    assert.equal(h.updates.length, count); assert.equal(h.updates.some(s => s.status === 'completed'), false);
  }
});

test('cancel interrupts the actual polling timer and prevents GET', async () => {
  let queued;
  const ready = new Promise(resolve => { queued = resolve; });
  const calls = [];
  const controller = createLocalParserController({ getToken: async () => 'mock-session',
    fetchImpl: async path => { calls.push(path); return admission(Date.now()); },
    onChange: s => { if (s.status === 'queued') queued(); } });
  const run = controller.submit(captures.semi.request); await ready; controller.cancel(); await run;
  assert.deepEqual(calls, ['/api/local-ai/analyze']);
});
