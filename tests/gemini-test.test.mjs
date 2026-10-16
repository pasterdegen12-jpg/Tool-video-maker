import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import handler from '../api/gemini-test/text.js';
import { GeminiWebAdapter } from '../api/lib/gemini-web/adapter.js';
import { publicError } from '../api/lib/gemini-web/errors.js';
import { parseGeminiResponse } from '../api/lib/gemini-web/parse-response.js';

// These tests exercise only the blocked scaffold; no Gemini response is mocked.
function response() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}
function request(body = { session: 'test_cookie=synthetic-not-a-credential', prompt: 'test' }) {
  return { method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' }, body };
}

test('request isolation, gates and safe errors', async (t) => {
  const keys = ['NODE_ENV', 'GEMINI_TEST_LOCAL', 'GEMINI_TEST_ORIGIN', 'VERCEL', 'GEMINI_TEST_OMIT_BOTGUARD'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  } });
  process.env.NODE_ENV = 'development';
  process.env.GEMINI_TEST_LOCAL = 'true';
  delete process.env.GEMINI_TEST_ORIGIN;
  delete process.env.VERCEL;
  delete process.env.GEMINI_TEST_OMIT_BOTGUARD;

  for (const [name, mutate, code, status] of [
    ['unverified protocol', () => {}, 'GEMINI_PROTOCOL_CHANGED', 501],
    ['body opt-in cannot enable server flag', req => { req.body.experiment = 'omit-botguard'; }, 'GEMINI_PROTOCOL_CHANGED', 501],
    ['wrong method', req => { req.method = 'GET'; }, 'METHOD_NOT_ALLOWED', 405],
    ['foreign origin', req => { req.headers.origin = 'https://untrusted.invalid'; }, 'FORBIDDEN_ORIGIN', 403],
    ['missing origin', req => { delete req.headers.origin; }, 'FORBIDDEN_ORIGIN', 403],
    ['wrong type', req => { req.headers['content-type'] = 'text/plain'; }, 'UNSUPPORTED_MEDIA_TYPE', 415],
    ['bad body', req => { req.body.prompt = 42; }, 'INVALID_REQUEST', 400],
    ['empty session', req => { req.body.session = ''; }, 'INVALID_SESSION', 400],
    ['header injection', req => { req.body.session = 'a=b\r\nInjected: value'; }, 'INVALID_SESSION', 400],
  ]) {
    await t.test(name, async () => {
      const req = request(); const res = response(); mutate(req);
      await handler(req, res);
      assert.equal(res.statusCode, status);
      assert.equal(res.body.code, code);
      assert.equal(res.body.ok, false);
      assert.equal(req.body.session, undefined);
      assert.equal(res.headers['Cache-Control'], 'no-store');
      assert.ok(!JSON.stringify(res.body).includes('synthetic-not-a-credential'));
    });
  }
  for (const [key, value] of [['NODE_ENV', 'production'], ['VERCEL', '1'], ['GEMINI_TEST_LOCAL', 'false']]) {
    const before = process.env[key]; process.env[key] = value;
    const req = request(); const res = response(); await handler(req, res);
    assert.equal(res.statusCode, 404);
    assert.equal(req.body.session, undefined);
    if (before === undefined) delete process.env[key]; else process.env[key] = before;
  }
});

test('adapter disposal and parser fail closed', () => {
  const adapter = new GeminiWebAdapter('test_cookie=synthetic');
  adapter.validateSession(); adapter.dispose();
  assert.throws(() => adapter.validateSession(), { code: 'INVALID_SESSION' });
  assert.throws(() => parseGeminiResponse('arbitrary response'), { code: 'GEMINI_RESPONSE_PARSE_FAILED' });
  assert.equal(publicError(new Error('private secret')).body.message.includes('private secret'), false);
});

