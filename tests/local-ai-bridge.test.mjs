import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import http from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { readConfig, integrationEnabled } from '../api/_lib/local-ai/config.js';
import defaultHandler from '../api/_lib/local-ai/bridge.js';
import { createGatewayClient } from '../api/_lib/local-ai/client.js';
import { config, session, serve, json, payload, admission, completed, upstreamId, sourceHash } from './support/local-ai-fixtures.mjs';

test('local opt-in and production hard disable, including deployed handler', async () => {
  assert.equal(integrationEnabled({}), false);
  assert.equal(integrationEnabled({ NODE_ENV: 'production', LOCAL_AI_BRIDGE_ENABLED: 'true' }), false);
  assert.equal(integrationEnabled({ NODE_ENV: 'development', VERCEL: '1', LOCAL_AI_BRIDGE_ENABLED: 'true' }), false);
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const res = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
    await defaultHandler({}, res);
    assert.equal(res.statusCode, 404); assert.equal(res.body.error.code, 'INTEGRATION_DISABLED');
  } finally { if (before === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before; }
});

test('configuration rejects remote, credential-bearing, DNS and path URLs; requires Clerk key', () => {
  const env = { NODE_ENV: 'development', LOCAL_AI_BRIDGE_ENABLED: 'true', LOCAL_AI_GATEWAY_URL: config.gatewayUrl,
    LOCAL_AI_GATEWAY_TOKEN: config.gatewayToken, CLERK_ISSUER: config.issuer, CLERK_JWT_KEY: config.jwtKey };
  assert.equal(readConfig(env).origin, config.origin);
  for (const url of ['https://example.com', 'http://localhost:8000', 'http://127.0.0.1:8000/v1',
    'http://user:secret@127.0.0.1:8000', 'http://127.0.0.1:8000/?x=1']) {
    assert.throws(() => readConfig({ ...env, LOCAL_AI_GATEWAY_URL: url }), { code: 'CONFIGURATION_ERROR' });
  }
  for (const key of ['CLERK_JWT_KEY', 'CLERK_ISSUER', 'LOCAL_AI_GATEWAY_TOKEN']) {
    assert.throws(() => readConfig({ ...env, [key]: '' }), { code: 'CONFIGURATION_ERROR' });
  }
});

test('SDK verifies signature, expiry, origin, issuer, session and pending status before upstream', async t => {
  let calls = 0;
  const web = await serve(t, async () => { calls++; return json(admission(), 202); });
  const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const bad = ['', 'not.a.jwt', session('user_owner', {}, otherKey), session('user_owner', { exp: 1 }),
    session('user_owner', { azp: 'https://evil.example' }), session('user_owner', { iss: 'https://wrong.clerk.accounts.dev' }),
    session('user_owner', { sid: undefined }), session('user_owner', { nbf: 9999999999 }),
    session('user_owner', { sts: 'pending' }), session('user_owner', { azp: undefined })];
  for (const token of bad) {
    const r = await web.call('/api/local-ai/analyze', { body: payload, token });
    assert.equal(r.status, 401); assert.equal(r.body.error.code, 'UNAUTHORIZED');
  }
  const origin = await web.call('/api/local-ai/analyze', { body: payload, headers: { Origin: 'https://evil.example' } });
  assert.equal(origin.status, 403); assert.equal(calls, 0);
  const ok = await web.call('/api/local-ai/analyze', { body: payload }); assert.equal(ok.status, 202);
  assert.equal(calls, 1);
  const unauthenticatedPoll = await web.call(ok.body.status_url, { token: '' });
  assert.equal(unauthenticatedPoll.status, 401); assert.equal(calls, 1);
});

test('untrusted user/project/url fields and unsupported workflows cannot reach gateway', async t => {
  let calls = 0;
  const web = await serve(t, async () => { calls++; return json(admission(), 202); });
  for (const body of [null, [], { script: payload.script }, { ...payload, projectType: null }, { ...payload, projectType: 'legacy' },
    { ...payload, script: '' }, { ...payload, script: 1 }, { ...payload, language: null },
    ...['userId', 'projectId', 'url', 'status_url'].map(k => ({ ...payload, [k]: 'private' }))]) {
    assert.equal((await web.call('/api/local-ai/analyze', { body })).status, 422);
  }
  assert.equal((await web.call('/api/local-ai/analyze?url=private', { body: payload })).status, 422);
  assert.equal((await web.call('/api/local-ai/analyze', { body: { ...payload, script: 'a'.repeat(40001) } })).status, 413);
  assert.equal((await web.call('/api/local-ai/analyze', { body: payload, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await web.call('/api/local-ai/analyze')).status, 405);
  assert.equal(calls, 0);
});

test('owner-only opaque polling, canonical envelope preserved, no upstream secrets or URLs', async t => {
  const calls = [];
  const upstream = completed();
  const web = await serve(t, async (url, options) => {
    calls.push({ url, options }); return options.method === 'POST' ? json(admission(), 202) : json(upstream);
  });
  const created = await web.call('/api/local-ai/analyze', { body: payload });
  assert.equal(created.status, 202); assert.match(created.body.job_id, /^[a-f0-9]{48}$/);
  assert.equal(created.headers.get('location'), created.body.status_url);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  assert.equal(created.body.max_polls, 120);
  const foreign = await web.call(created.body.status_url, { token: session('user_other') });
  assert.equal(foreign.status, 404); assert.equal(calls.length, 1);
  assert.equal((await web.call('/api/local-ai/jobs/' + upstreamId)).status, 404);
  const own = await web.call(created.body.status_url);
  assert.equal(own.status, 200); assert.deepEqual(own.body.result, upstream.result);
  assert.equal(own.body.job_id, created.body.job_id);
  const wire = JSON.stringify([created.body, own.body]);
  for (const secret of [config.gatewayToken, config.gatewayUrl, upstreamId]) assert.equal(wire.includes(secret), false);
  for (const c of calls) {
    assert.equal(c.options.headers.Authorization, 'Bearer ' + config.gatewayToken);
    assert.equal(c.options.redirect, 'error');
    assert.equal(c.options.headers.Origin, undefined);
  }
});

test('queued, running and failed responses with sanitized source validation details', async t => {
  const states = ['queued', 'running', 'failed'];
  const web = await serve(t, async (_, options) => options.method === 'POST' ? json(admission(), 202) : json({
    job_id: upstreamId, state: states.shift(), result: null, metrics: {},
    error: states.length ? null : { code: 'DUPLICATE_FIELD', projectType: 'full-ai', message: 'PRIVATE_SCRIPT',
      details: { scene_id: 'scene_1', field: 'Dialogue', line: 4, path: 'PRIVATE_PATH' } },
  }));
  const created = await web.call('/api/local-ai/analyze', { body: payload });
  for (const state of ['queued', 'running', 'failed']) {
    const r = await web.call(created.body.status_url); assert.equal(r.status, 200); assert.equal(r.body.state, state);
    assert.equal(JSON.stringify(r.body).includes('PRIVATE_'), false);
    if (state === 'failed') assert.deepEqual(r.body.error.details, { scene_id: 'scene_1', field: 'Dialogue', line: 4 });
    else assert.equal(r.headers.get('retry-after'), '1');
  }
});

for (const [status, code, actual] of [[401, 'GATEWAY_AUTH_FAILED', 503], [429, 'GATEWAY_CAPACITY', 429],
  [503, 'GATEWAY_UNAVAILABLE', 503], [404, 'JOB_NOT_FOUND', 404], [500, 'GATEWAY_INVALID_RESPONSE', 502]]) {
  test('poll upstream HTTP ' + status + ' is sanitized and actionable', async t => {
    const web = await serve(t, async (_, o) => o.method === 'POST' ? json(admission(), 202)
      : json({ message: 'PRIVATE_GATEWAY_TOKEN' }, status, { 'Retry-After': '4' }));
    const created = await web.call('/api/local-ai/analyze', { body: payload });
    const r = await web.call(created.body.status_url);
    assert.equal(r.status, actual); assert.equal(r.body.error.code, code);
    assert.equal(JSON.stringify(r.body).includes('PRIVATE'), false);
    assert.equal(r.body.error.retryable, [429, 503].includes(status));
    if ([429, 503].includes(status)) assert.equal(r.headers.get('retry-after'), '4');
  });
}

test('POST is never retried, including ambiguous timeout/network/malformed admissions', async () => {
  for (const mode of ['timeout', 'network', 'bad-json', 'bad-id', 'bad-status-url', '429', '401', '503']) {
    let calls = 0;
    const client = createGatewayClient({ ...config, requestTimeoutMs: 25 }, async () => {
      calls++;
      if (mode === 'timeout') return new Promise(() => {});
      if (mode === 'network') throw new Error('PRIVATE_PATH');
      if (mode === 'bad-json') return new Response('PRIVATE_HTML', { status: 202, headers: { 'Content-Type': 'application/json' } });
      if (mode === 'bad-id') return json({ ...admission(), job_id: '../private' }, 202);
      if (mode === 'bad-status-url') return json({ ...admission(), status_url: 'https://evil.example' }, 202);
      return json({ secret: 'PRIVATE' }, Number(mode));
    });
    await assert.rejects(() => client.submit(payload), e => {
      assert.equal(e.retryable, false); assert.equal(e.submission, ['429', '401', '503'].includes(mode) ? 'rejected' : 'unknown');
      assert.equal(e.message.includes('PRIVATE'), false); return true;
    });
    assert.equal(calls, 1);
  }
});

test('GET network and body timeouts are bounded and retryable', async () => {
  for (const mode of ['network', 'timeout', 'body-timeout']) {
    const client = createGatewayClient({ ...config, requestTimeoutMs: 25 }, async () => {
      if (mode === 'network') throw new Error('private endpoint');
      if (mode === 'timeout') return new Promise(() => {});
      return new Response(new ReadableStream({ start() {} }), { headers: { 'Content-Type': 'application/json' } });
    });
    await assert.rejects(() => client.get(upstreamId, { projectType: 'full-ai', sourceHash }), e => {
      assert.equal(e.code, mode === 'network' ? 'GATEWAY_NETWORK_ERROR' : 'GATEWAY_TIMEOUT');
      assert.equal(e.retryable, true); return true;
    });
  }
});

test('malformed completed responses, cross-workflow results and source mismatches fail closed', async () => {
  for (const mutate of [b => { b.job_id = 'b'.repeat(32); }, b => { b.state = 'unknown'; }, b => { b.result.execution = 'qwen'; },
    b => { b.result.projectType = 'semi'; }, b => { b.result.source_metadata.source_sha256 = 'wrong'; },
    b => { b.result.web_data.scenes[0].Voiceover = 'competing'; }, b => { delete b.result.web_data.scenes[0].Dialogue; },
    b => { b.result.web_data.scenes[0].Character = 'Metadata'; }, b => { b.result.source_metadata.scenes = []; },
    b => { b.result.web_data.scenes[0].scene_n = '1'; }, b => { b.metrics = null; }]) {
    const body = completed(); mutate(body);
    const client = createGatewayClient(config, async () => json(body));
    await assert.rejects(() => client.get(upstreamId, { projectType: 'full-ai', sourceHash }), { code: 'GATEWAY_INVALID_RESPONSE' });
  }
  const oversized = createGatewayClient({ ...config, maxResponseBytes: 20 }, async () => json(completed()));
  await assert.rejects(() => oversized.get(upstreamId, { projectType: 'full-ai', sourceHash }), { code: 'GATEWAY_INVALID_RESPONSE' });
});

test('poll pace, concurrent polls, retry backoff, attempt budget and expiry are enforced server-side', async t => {
  let time = Date.now(); let resolveGet; let gets = 0;
  const web = await serve(t, async (_, o) => {
    if (o.method === 'POST') return json(admission(), 202);
    gets++; return new Promise(resolve => { resolveGet = resolve; });
  }, { maxPolls: 2, pollIntervalMs: 1000, jobTtlMs: 10000 }, () => time);
  const created = await web.call('/api/local-ai/analyze', { body: payload });
  const first = web.call(created.body.status_url);
  while (!resolveGet) await new Promise(r => setTimeout(r, 1));
  assert.equal((await web.call(created.body.status_url)).body.error.code, 'POLL_TOO_FAST');
  resolveGet(json({}, 503, { 'Retry-After': '4' })); await first;
  time += 3999; assert.equal((await web.call(created.body.status_url)).status, 429); assert.equal(gets, 1);
  time += 1; resolveGet = null;
  const second = web.call(created.body.status_url);
  while (!resolveGet) await new Promise(r => setTimeout(r, 1));
  resolveGet(json(completed())); assert.equal((await second).status, 200);
  assert.equal((await web.call(created.body.status_url)).body.error.code, 'POLL_LIMIT');
  const expiring = await web.call('/api/local-ai/analyze', { body: payload }); time += 10001;
  assert.equal((await web.call(expiring.body.status_url)).body.error.code, 'POLL_EXPIRED');
  assert.equal(gets, 2);
});

test('ownership is lost safely on bridge restart; local capacity is bounded', async t => {
  let calls = 0;
  const upstream = async () => { calls++; return json(admission(), 202); };
  const first = await serve(t, upstream, { maxJobs: 2, maxJobsPerUser: 1 });
  const created = await first.call('/api/local-ai/analyze', { body: payload });
  assert.equal((await first.call('/api/local-ai/analyze', { body: payload })).body.error.code, 'BRIDGE_CAPACITY');
  assert.equal((await first.call('/api/local-ai/analyze', { body: payload, token: session('user_other') })).status, 202);
  assert.equal((await first.call('/api/local-ai/analyze', { body: payload, token: session('user_third') })).status, 429);
  const restarted = await serve(t, upstream);
  assert.equal((await restarted.call(created.body.status_url)).status, 404); assert.equal(calls, 2);
});

test('JSON body size and local Host protection', async t => {
  const web = await serve(t, async () => { throw Error('must not call upstream'); }, { maxBodyBytes: 128 });
  assert.equal((await web.call('/api/local-ai/analyze', { body: { ...payload, script: 'x'.repeat(256) } })).status, 413);
  // Node fetch rewrites Host; use an actual HTTP request to exercise the rebinding guard.
  const hostStatus = await new Promise((resolve, reject) => {
    const req = http.request(web.base + '/api/local-ai/analyze', { method: 'POST', headers: { Host: 'evil.example' } }, res => {
      res.resume(); resolve(res.statusCode);
    }); req.on('error', reject); req.end();
  });
  assert.equal(hostStatus, 403);
  const bad = await fetch(web.base + '/api/local-ai/analyze', { method: 'POST', body: '{not json',
    headers: { Origin: config.origin, Authorization: 'Bearer ' + session(), 'Content-Type': 'application/json' } });
  assert.equal(bad.status, 422);
});

test('streamed body limits and body deadline apply without Content-Length', async t => {
  const web = await serve(t, async () => { throw Error('must not reach gateway'); }, { maxBodyBytes: 128, bodyTimeoutMs: 30 });
  for (const mode of ['oversized', 'slow']) {
    const status = await new Promise((resolve, reject) => {
      const req = http.request(web.base + '/api/local-ai/analyze', { method: 'POST', headers: {
        Origin: config.origin, Authorization: 'Bearer ' + session(), 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked',
      } }, res => { res.resume(); resolve(res.statusCode); req.destroy(); });
      req.on('error', reject); req.write(mode === 'oversized' ? 'x'.repeat(256) : '{');
    });
    assert.equal(status, mode === 'oversized' ? 413 : 408);
  }
});

test('concurrent POSTs reserve capacity before contacting upstream and failed admission releases it', async t => {
  let release; let calls = 0;
  const web = await serve(t, async () => { calls++; return new Promise(resolve => { release = resolve; }); }, { maxJobsPerUser: 1 });
  const first = web.call('/api/local-ai/analyze', { body: payload });
  const deadline = Date.now() + 2000;
  while (!release && Date.now() < deadline) await new Promise(r => setTimeout(r, 1));
  assert.ok(release);
  assert.equal((await web.call('/api/local-ai/analyze', { body: payload })).status, 429); assert.equal(calls, 1);
  release(json({}, 503)); assert.equal((await first).status, 503);
  release = null;
  const retryExplicit = web.call('/api/local-ai/analyze', { body: payload });
  while (!release && Date.now() < deadline) await new Promise(r => setTimeout(r, 1));
  assert.ok(release); release(json(admission(), 202)); assert.equal((await retryExplicit).status, 202);
});

test('upstream redirects are not followed with the gateway bearer', async t => {
  let destinationCalls = 0;
  const destination = http.createServer((req, res) => { destinationCalls++; res.end(); });
  const redirect = http.createServer((req, res) => { res.writeHead(307, { Location: 'http://127.0.0.1:' + destination.address().port }); res.end(); });
  for (const server of [destination, redirect]) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => { server.close(); server.closeAllConnections(); });
  }
  const client = createGatewayClient({ ...config, gatewayUrl: 'http://127.0.0.1:' + redirect.address().port });
  await assert.rejects(() => client.submit(payload), { code: 'GATEWAY_NETWORK_ERROR', submission: 'unknown' });
  assert.equal(destinationCalls, 0);
});
