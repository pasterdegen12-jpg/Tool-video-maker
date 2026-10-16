// Emulated browser request headers over real Web HTTP, not live browser/Clerk acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { config, serve, session, json, admission, completed, payload } from './support/local-ai-fixtures.mjs';

test('browser-style same-origin GET without Origin works only with exact Referer and Fetch Metadata', async t => {
  let upstreamCalls = 0;
  const web = await serve(t, async (_url, options) => {
    upstreamCalls++; return options.method === 'POST' ? json(admission(), 202) : json(completed());
  });
  const admitted = await web.call('/api/local-ai/analyze', { body: payload });
  const browserHeaders = { Authorization: 'Bearer ' + session(), Referer: config.origin + '/', 'Sec-Fetch-Site': 'same-origin' };
  for (const headers of [
    { ...browserHeaders, Referer: 'https://evil.example/' },
    { ...browserHeaders, 'Sec-Fetch-Site': 'same-site' },
    { ...browserHeaders, Origin: 'https://evil.example' },
    { ...browserHeaders, Origin: 'null' },
    { Authorization: browserHeaders.Authorization, Referer: browserHeaders.Referer },
    { Authorization: browserHeaders.Authorization, 'Sec-Fetch-Site': 'same-origin' },
  ]) assert.equal((await fetch(web.base + admitted.body.status_url, { headers })).status, 403);
  assert.equal(upstreamCalls, 1);
  const success = await fetch(web.base + admitted.body.status_url, { headers: browserHeaders });
  assert.equal(success.status, 200); assert.equal((await success.json()).state, 'completed');
  assert.equal(upstreamCalls, 2);
  const post = await fetch(web.base + '/api/local-ai/analyze', { method: 'POST', headers: { ...browserHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(post.status, 403); assert.equal(upstreamCalls, 2);
});

test('browser GET header compatibility keeps Clerk issuer/azp/session and owner checks unchanged', async t => {
  let upstreamCalls = 0;
  const web = await serve(t, async () => { upstreamCalls++; return json(admission(), 202); });
  const admitted = await web.call('/api/local-ai/analyze', { body: payload });
  for (const changes of [{ iss: 'https://wrong.clerk.accounts.dev' }, { azp: 'https://evil.example' }, { sid: undefined }, { exp: 1 }]) {
    const r = await fetch(web.base + admitted.body.status_url, { headers: { Authorization: 'Bearer ' + session('user_owner', changes),
      Referer: config.origin + '/', 'Sec-Fetch-Site': 'same-origin' } });
    assert.equal(r.status, 401);
  }
  const foreign = await fetch(web.base + admitted.body.status_url, { headers: { Authorization: 'Bearer ' + session('user_other'),
    Referer: config.origin + '/', 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(foreign.status, 404); assert.equal(upstreamCalls, 1);
});
