import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExperimentalRequest } from '../api/_lib/gemini-web/experimental-request.js';

test('fresh requests omit attestation and isolate all dynamic state', () => {
  const a = buildExperimentalRequest('A & B = C + tiếng Việt', { at: 'test-token-a', sid: 'test-sid-a', build: 'test-build-a' });
  const b = buildExperimentalRequest('different prompt', { at: 'test-token-b', sid: 'test-sid-b', build: 'test-build-b' });
  const payload = JSON.parse(JSON.parse(a.body.get('f.req'))[1]);
  const other = JSON.parse(JSON.parse(b.body.get('f.req'))[1]);
  assert.equal(payload[0][0], 'A & B = C + tiếng Việt');
  assert.equal(payload[2], null);
  assert.equal(payload[3], null);
  assert.equal(payload[4], null);
  assert.match(payload[59], /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
  assert.notEqual(payload[59], other[59]);
  assert.equal(a.url.origin, 'https://gemini.google.com');
  assert.equal(a.url.searchParams.get('f.sid'), 'test-sid-a');
  assert.equal(b.url.searchParams.get('f.sid'), 'test-sid-b');
  assert.equal(a.body.get('at'), 'test-token-a');
  assert.equal(b.body.get('at'), 'test-token-b');
  assert.equal(a.url.searchParams.get('bl'), 'test-build-a');
  assert.ok(!a.url.href.includes('test-token-a'));
  assert.throws(() => buildExperimentalRequest('', {}), { code: 'INVALID_REQUEST' });
});
