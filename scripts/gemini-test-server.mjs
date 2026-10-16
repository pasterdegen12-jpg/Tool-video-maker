import http from 'node:http';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import handler from '../api/gemini-test/text.js';
import { GeminiTestError, publicError } from '../api/_lib/gemini-web/errors.js';

if (process.env.NODE_ENV !== 'development' || process.env.GEMINI_TEST_LOCAL !== 'true' || process.env.VERCEL) {
  throw new Error('Set NODE_ENV=development and GEMINI_TEST_LOCAL=true for this local-only server.');
}
const maxBytes = 64 * 1024;
const server = http.createServer(async (req, res) => {
  res.status = (status) => { res.statusCode = status; return res; };
  res.json = (body) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  res.setHeader('Cache-Control', 'no-store');
  let chunks = [];
  try {
    if (req.url !== '/api/gemini-test/text') throw new GeminiTestError('TEST_DISABLED', 404);
    if (req.method !== 'POST') throw new GeminiTestError('METHOD_NOT_ALLOWED', 405);
    if (req.headers.host !== '127.0.0.1:8788') throw new GeminiTestError('FORBIDDEN_ORIGIN', 403);
    if (req.headers.origin !== (process.env.GEMINI_TEST_ORIGIN || 'http://localhost:5173')) {
      throw new GeminiTestError('FORBIDDEN_ORIGIN', 403);
    }
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
      throw new GeminiTestError('UNSUPPORTED_MEDIA_TYPE', 415);
    }
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) {
        chunk.fill(0);
        throw new GeminiTestError('REQUEST_TOO_LARGE', 413);
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    try { req.body = JSON.parse(body.toString('utf8')); }
    catch { throw new GeminiTestError('INVALID_REQUEST', 400); }
    finally { body.fill(0); }
    await handler(req, res);
  } catch (error) {
    const result = publicError(error);
    if (!res.writableEnded) res.status(result.status).json(result.body);
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    chunks = [];
    req.body = undefined;
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(8788, '127.0.0.1');
