import { validateVisualInput, imageHash, MAX_VISUAL_BODY } from './visual.js';
import { createHash, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { authenticateSession } from './auth.js';
import { createGatewayClient } from './client.js';
import { integrationEnabled, readConfig } from './config.js';
import { BridgeError, sendError, sendJson } from './errors.js';

function validateInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(k => !['projectType', 'script', 'language'].includes(k)) ||
      !['full-ai', 'semi'].includes(body.projectType) ||
      typeof body.script !== 'string' || !body.script.trim() ||
      (body.language !== undefined && (typeof body.language !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(body.language)))) {
    throw new BridgeError('INVALID_REQUEST');
  }
  if ([...body.script].length > 40000) throw new BridgeError('REQUEST_TOO_LARGE');
  return { projectType: body.projectType, script: body.script, language: body.language ?? 'en' };
}

async function readBody(req, config) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new BridgeError('UNSUPPORTED_MEDIA_TYPE');
  const length = req.headers['content-length'];
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > config.maxBodyBytes)) throw new BridgeError('REQUEST_TOO_LARGE');
  if (req.body !== undefined) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > config.maxBodyBytes) throw new BridgeError('REQUEST_TOO_LARGE');
    return req.body;
  }
  return await new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const finish = (error, value) => {
      clearTimeout(timer);
      req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onAbort);
      for (const chunk of chunks) chunk.fill(0);
      if (error) { req.resume(); reject(error); } else resolve(value);
    };
    const onData = chunk => {
      size += chunk.length;
      if (size > config.maxBodyBytes) finish(new BridgeError('REQUEST_TOO_LARGE'));
      else chunks.push(chunk);
    };
    const onError = () => finish(new BridgeError('INVALID_REQUEST'));
    const onAbort = () => finish(new BridgeError('INVALID_REQUEST'));
    const onEnd = () => {
      const raw = Buffer.concat(chunks);
      try { finish(null, JSON.parse(raw.toString('utf8'))); }
      catch { finish(new BridgeError('INVALID_REQUEST')); }
      finally { raw.fill(0); }
    };
    const timer = setTimeout(() => finish(new BridgeError('REQUEST_BODY_TIMEOUT')), config.bodyTimeoutMs);
    req.on('data', onData); req.on('end', onEnd); req.on('error', onError); req.on('aborted', onAbort);
  });
}

// Single local process only. No scripts, result payloads or session tokens are retained here.
export function createBridge(config, { fetchImpl, now = Date.now } = {}) {
  const jobs = new Map();
  const client = createGatewayClient(config, fetchImpl);
  const expires = job => new Date(job.expiresAt).toISOString();
  function reserve(owner, payload, visual) {
    for (const [key, job] of jobs) if (job.expiresAt <= now() && !job.busy) jobs.delete(key);
    if (jobs.size >= config.maxJobs || [...jobs.values()].filter(j => j.owner === owner).length >= config.maxJobsPerUser) {
      throw new BridgeError('BRIDGE_CAPACITY', { retryAfter: 30 });
    }
    const id = randomBytes(24).toString('hex');
    const job = { owner, operation: visual ? 'visual_profile' : 'script', projectType: payload.projectType,
      sourceHash: visual ? imageHash(payload) : createHash('sha256').update(payload.script, 'utf8').digest('hex'),
      expiresAt: now() + config.jobTtlMs, polls: 0, nextPoll: 0, busy: true, upstreamId: null };
    jobs.set(id, job); // Reserve before await, including concurrent submissions.
    return { id, job };
  }
  const handler=async function handler(req, res) {
    try {
      const path = req.url?.split('?')[0];
      const polling = /^\/api\/local-ai\/jobs\/([a-f0-9]{48})$/.exec(path || '');
      const visual = path === '/api/local-ai/visual-profile';
      if (visual && !config.visualEnabled) throw new BridgeError('INTEGRATION_DISABLED');
      const admission = path === '/api/local-ai/analyze' || visual;
      if (!admission && !polling) throw new BridgeError('NOT_FOUND');
      if ((admission && req.method !== 'POST') || (polling && req.method !== 'GET')) {
        res.setHeader('Allow', admission ? 'POST' : 'GET');
        throw new BridgeError('METHOD_NOT_ALLOWED');
      }
      const session = await authenticateSession(req, config),owner=session.subject;
      // Do not accept projectId, userId or alternative URLs anywhere on this API.
      if (req.url.includes('?')) throw new BridgeError('INVALID_REQUEST');
      if (admission) {
        const body = await readBody(req, visual ? { ...config, maxBodyBytes: MAX_VISUAL_BODY } : config);
        const payload = visual ? validateVisualInput(body) : validateInput(body);
        const { id, job } = reserve(owner, payload, visual);
        job.session=session.session;
        try { job.upstreamId = await client.submit(payload, visual); }
        catch (error) { jobs.delete(id); throw error; }
        finally { job.busy = false; }
        const statusUrl = '/api/local-ai/jobs/' + id;
        res.setHeader('Location', statusUrl);
        res.setHeader('Retry-After', String(Math.ceil(config.pollIntervalMs / 1000)));
        sendJson(res, 202, { job_id: id, state: 'queued', status_url: statusUrl,
          expires_at: expires(job), max_polls: config.maxPolls });
      } else {
        const id = polling[1];
        const job = jobs.get(id);
        if (!job || job.owner !== owner || !job.upstreamId) throw new BridgeError('JOB_NOT_FOUND');
        if (job.expiresAt <= now()) { jobs.delete(id); throw new BridgeError('POLL_EXPIRED'); }
        if (job.polls >= config.maxPolls) { jobs.delete(id); throw new BridgeError('POLL_LIMIT'); }
        if (job.busy || now() < job.nextPoll) throw new BridgeError('POLL_TOO_FAST', {
          retryAfter: Math.max(1, Math.ceil((job.nextPoll - now()) / 1000)), retryable: true,
        });
        job.busy = true;
        job.polls++;
        job.nextPoll = now() + config.pollIntervalMs;
        try {
          const result = await client.get(job.upstreamId, job);
          if (now() >= job.expiresAt) { jobs.delete(id); throw new BridgeError('POLL_EXPIRED'); }
          if (['queued', 'running'].includes(result.state)) res.setHeader('Retry-After', String(Math.ceil(config.pollIntervalMs / 1000)));
          if(job.operation==='visual_profile'&&result.state==='completed')job.visualEvidence=structuredClone(result.result);
          sendJson(res, 200, { job_id: id, ...result, expires_at: expires(job), polls_remaining: config.maxPolls - job.polls });
        } catch (error) {
          if (error.code === 'JOB_NOT_FOUND') jobs.delete(id);
          if (error.retryAfter) job.nextPoll = now() + error.retryAfter * 1000;
          throw error;
        } finally { job.busy = false; }
      }
    } catch (error) { sendError(res, error); }
    finally { req.body = undefined; }
  };
  handler.visualEvidence=(id,session)=>{
    const job=jobs.get(id);
    if(!job||job.owner!==session.subject||job.session!==session.session||job.expiresAt<=now()||!job.visualEvidence)throw new BridgeError('JOB_NOT_FOUND');
    return structuredClone(job.visualEvidence);
  };
  return handler;
}

let localHandler;
export default async function handler(req, res) {
  // Production and Vercel always reject, even if someone copies the opt-in flag there.
  if (!integrationEnabled(process.env)) return sendError(res, new BridgeError('INTEGRATION_DISABLED'));
  try {
    localHandler ??= createBridge(readConfig());
    await localHandler(req, res);
  } catch (error) { sendError(res, error); }
}
