import { validateVisualResult, publicVisualError } from './visual.js';
import { Buffer } from 'node:buffer';
import { BridgeError } from './errors.js';

const idPattern = /^[a-f0-9]{32}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = () => { throw new BridgeError('GATEWAY_INVALID_RESPONSE'); };
const retrySeconds = value => {
  const seconds = /^\d+$/.test(value || '') ? Number(value) : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isFinite(seconds) ? Math.max(1, Math.min(60, seconds)) : 2;
};
const sourceErrors = new Set([
  'EMPTY_SCRIPT', 'UNCLOSED_QUOTED_FIELD', 'DUPLICATE_SCENE_ID', 'INVALID_SCENE_ID',
  'UNSUPPORTED_SCENE_BOUNDARY', 'UNSUPPORTED_SCENE_CONTENT', 'AMBIGUOUS_FIELD',
  'DUPLICATE_FIELD', 'UNSUPPORTED_WORKFLOW_FORMAT', 'DUPLICATE_HEADER_FIELD',
  'MISSING_CHARACTER', 'MISSING_DIALOGUE', 'UNSUPPORTED_CHARACTER_REFERENCE',
  'AMBIGUOUS_CHARACTER_REFERENCE', 'MISSING_TIME_ORIGIN', 'INVALID_TIMESTAMP',
  'SOURCE_MISMATCH', 'INVALID_WORKFLOW_RESULT', 'UNSUPPORTED_PROJECT_TYPE',
  'EMPTY_DIALOGUE', 'INVALID_SCENE_DURATION',
]);
const safeFields = new Set('context character tone dialogue dịch translate camera action time time_origin scene_duration footage voiceover effect tone_of_voice vo_token_count vo_target_range audio_mode content_function review_angle <unrecognized>'.split(' '));

function publicJobError(error, projectType) {
  if (!object(error) || typeof error.code !== 'string' ||
      (error.projectType !== undefined && error.projectType !== projectType)) fail();
  const code = sourceErrors.has(error.code) || ['REQUEST_TIMEOUT', 'WORKFLOW_FAILED', 'SERVICE_SHUTDOWN', 'CPU_WORKER_UNAVAILABLE'].includes(error.code)
    ? error.code : 'WORKFLOW_FAILED';
  const details = {};
  if (object(error.details)) {
    if (/^scene_[1-9][0-9]{0,30}$/.test(error.details.scene_id)) details.scene_id = error.details.scene_id;
    if (typeof error.details.field === 'string' && safeFields.has(error.details.field.toLowerCase())) details.field = error.details.field;
    if (Number.isSafeInteger(error.details.line) && error.details.line > 0) details.line = error.details.line;
  }
  return { code, projectType, message: sourceErrors.has(code)
    ? 'The source script failed validation. Correct the indicated scene/field and submit explicitly.'
    : code === 'REQUEST_TIMEOUT' ? 'The CPU job exceeded its execution deadline.' : 'The CPU job could not complete.', details };
}

function validateResult(result, expected) {
  if (!object(result) || result.execution !== 'deterministic_cpu' || result.projectType !== expected.projectType ||
      !object(result.web_data) || !object(result.source_metadata)) fail();
  const { scenes, characters } = result.web_data;
  const metadata = result.source_metadata;
  if (!Array.isArray(scenes) || scenes.length === 0 || !Array.isArray(characters) ||
      metadata.source_sha256 !== expected.sourceHash || typeof metadata.header_raw !== 'string' ||
      !object(metadata.header_metadata) || !Array.isArray(metadata.scenes) || metadata.scenes.length !== scenes.length) fail();
  const full = expected.projectType === 'full-ai';
  if (!full && characters.length !== 0) fail();
  if (characters.some(c => !object(c) || ['id', 'name', 'description', 'voiceTone'].some(k => typeof c[k] !== 'string'))) fail();
  const names = new Set(characters.map(c => c.name));
  const seen = new Set();
  for (const [index, scene] of scenes.entries()) {
    const fields = full ? ['Context', 'Camera', 'Action', 'Character', 'Dialogue', 'Translate', 'Tone_of_Voice']
      : ['time_origin', 'Footage', 'Effect', 'Character', 'Voiceover', 'Translate', 'Tone_of_Voice'];
    const extra = metadata.scenes[index];
    if (!object(scene) || !Number.isSafeInteger(scene.scene_n) || scene.scene_n < 1 || seen.has(scene.scene_n) ||
        fields.some(k => typeof scene[k] !== 'string') ||
        !Number.isSafeInteger(scene.Word_count) || scene.Word_count < 0 || scene.status !== 'pending' ||
        (full ? 'Voiceover' in scene || 'time_origin' in scene || !names.has(scene.Character) : 'Dialogue' in scene) ||
        !object(extra) || extra.scene_id !== 'scene_' + scene.scene_n || !object(extra.metadata) ||
        (!full && (typeof extra.Time !== 'string' || typeof extra.Scene_Duration !== 'string'))) fail();
    seen.add(scene.scene_n);
  }
  return result; // Preserve the complete canonical envelope and sidecar; no enrichment or aliasing.
}

async function readJson(response, maxBytes) {
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail();
  if (Number(response.headers.get('content-length')) > maxBytes || !response.body) fail();
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) fail();
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    if (error.name === 'AbortError' || error.name === 'TimeoutError') throw error;
    fail();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createGatewayClient(config, fetchImpl = fetch) {
  async function request(path, method, body, visual = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    // Race also bounds custom transports that ignore AbortSignal. Native fetch is aborted as well.
    let deadline;
    const timeout = new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new BridgeError('GATEWAY_TIMEOUT')), config.requestTimeoutMs);
    });
    try {
      return await Promise.race([timeout, (async () => {
        const response = await fetchImpl(config.gatewayUrl + path, {
          method, redirect: 'error', signal: controller.signal,
          headers: { Authorization: 'Bearer ' + config.gatewayToken, Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (response.status !== (method === 'POST' ? 202 : 200)) {
          await response.body?.cancel().catch(() => {});
          const code = response.status === 401 || response.status === 403 ? 'GATEWAY_AUTH_FAILED'
            : response.status === 429 ? 'GATEWAY_CAPACITY'
            : response.status === 503 ? 'GATEWAY_UNAVAILABLE'
            : response.status === 404 && method === 'GET' ? 'JOB_NOT_FOUND'
            : response.status === 413 ? 'REQUEST_TOO_LARGE'
            : response.status === 422 ? 'INVALID_REQUEST' : 'GATEWAY_INVALID_RESPONSE';
          throw new BridgeError(code, { retryAfter: [429, 503].includes(response.status) ? retrySeconds(response.headers.get('retry-after')) : undefined });
        }
        return await readJson(response, visual ? 8192 : config.maxResponseBytes);
      })()]);
    } catch (error) {
      const safe = error instanceof BridgeError ? error
        : new BridgeError(controller.signal.aborted ? 'GATEWAY_TIMEOUT' : 'GATEWAY_NETWORK_ERROR');
      safe.retryable = method === 'GET' && ['GATEWAY_TIMEOUT', 'GATEWAY_NETWORK_ERROR', 'GATEWAY_CAPACITY', 'GATEWAY_UNAVAILABLE'].includes(safe.code);
      if (method === 'POST') {
        safe.submission = ['GATEWAY_TIMEOUT', 'GATEWAY_NETWORK_ERROR', 'GATEWAY_INVALID_RESPONSE'].includes(safe.code) ? 'unknown' : 'rejected';
      }
      throw safe;
    } finally { clearTimeout(timer); clearTimeout(deadline); }
  }
  return {
    async submit(payload, visual = false) {
      const data = await request(visual ? '/v1/visual/profile' : '/v1/script/analyze', 'POST', payload, visual);
      if (!object(data) || typeof data.job_id !== 'string' || !idPattern.test(data.job_id) || data.state !== 'queued' || data.status_url !== '/v1/jobs/' + data.job_id) {
        throw new BridgeError('GATEWAY_INVALID_RESPONSE', { submission: 'unknown' });
      }
      return data.job_id;
    },
    async get(jobId, expected) {
      if (!idPattern.test(jobId)) fail();
      const visual = expected.operation === 'visual_profile';
      const data = await request('/v1/jobs/' + jobId, 'GET', undefined, visual);
      if (!object(data) || data.job_id !== jobId || !['queued', 'running', 'completed', 'failed'].includes(data.state) || (!object(data.metrics) && !(visual && data.metrics === null))) fail();
      let result = null, error = null;
      if (data.state === 'completed') {
        if (data.error !== null) fail();
        result = visual ? validateVisualResult(data.result, expected) : validateResult(data.result, expected);
      } else if (data.state === 'failed') {
        if (data.result !== null) fail();
        error = visual ? publicVisualError(data.error) : publicJobError(data.error, expected.projectType);
      } else if (data.result !== null || data.error !== null) fail();
      const metrics = {};
      for (const key of ['queue_wait_seconds', 'request_latency_seconds', 'scene_count', 'character_count']) {
        if (typeof data.metrics?.[key] === 'number' && Number.isFinite(data.metrics[key]) && data.metrics[key] >= 0) metrics[key] = data.metrics[key];
      }
      if (data.metrics?.execution === 'deterministic_cpu') metrics.execution = data.metrics.execution;
      return { state: data.state, result, error, metrics };
    },
  };
}
