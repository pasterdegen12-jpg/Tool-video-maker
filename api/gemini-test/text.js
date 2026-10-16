import process from 'node:process';
import { GeminiWebAdapter } from '../_lib/gemini-web/adapter.js';
import { GeminiTestError, publicError } from '../_lib/gemini-web/errors.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  let adapter;
  let stage = 'validation';
  try {
    // Vite's public flag is not backend authorization. Deny every deployment.
    if (process.env.NODE_ENV !== 'development' || process.env.VERCEL ||
        process.env.GEMINI_TEST_LOCAL !== 'true') {
      throw new GeminiTestError('TEST_DISABLED', 404);
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      throw new GeminiTestError('METHOD_NOT_ALLOWED', 405);
    }
    if (req.headers.origin !== (process.env.GEMINI_TEST_ORIGIN || 'http://localhost:5173')) {
      throw new GeminiTestError('FORBIDDEN_ORIGIN', 403);
    }
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
      throw new GeminiTestError('UNSUPPORTED_MEDIA_TYPE', 415);
    }
    if (!req.body || typeof req.body.prompt !== 'string' || !req.body.prompt.trim() ||
        req.body.prompt.length > 16000) {
      throw new GeminiTestError('INVALID_REQUEST', 400);
    }
    adapter = new GeminiWebAdapter(req.body.session);
    delete req.body.session;
    adapter.validateSession();
    if (process.env.GEMINI_TEST_OMIT_BOTGUARD !== 'true' || req.body.experiment !== 'omit-botguard') adapter.assertGenerationSupported();
    stage = 'bootstrap';
    await adapter.initialize();
    stage = 'generation';
    const result = await adapter.sendTextPrompt(req.body.prompt, { omitBotGuard: true });
    return res.status(200).json({ ok: true, code: 'DIRECT_GEMINI_SUCCESS', text: result.text,
      markerMatch: result.text.trim() === 'DIRECT_REQUEST_TEST_92831',
      debug: { stage: 'complete', experiment: 'omit-botguard', frameCount: result.rawMeta.frameCount } });
  } catch (error) {
    const result = publicError(error);
    return res.status(result.status).json({ ...result.body, debug: {
      stage, experiment: 'omit-botguard',
      ...(error instanceof GeminiTestError && Number.isInteger(error.upstreamStatus) ? { upstreamStatus: error.upstreamStatus } : {}),
    } });
  } finally {
    adapter?.dispose();
    if (req.body && typeof req.body === 'object') delete req.body.session;
  }
}
