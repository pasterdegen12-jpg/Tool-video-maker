// Synthetic Clerk-shaped sessions signed with an ephemeral test key, NOT live Clerk sessions.
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { once } from 'node:events';
import { readConfig } from '../../api/_lib/local-ai/config.js';
import { createLocalServer } from '../../scripts/local-ai-server.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
export const config = readConfig({ NODE_ENV: 'development', LOCAL_AI_BRIDGE_ENABLED: 'true',
  LOCAL_AI_GATEWAY_URL: 'http://127.0.0.1:9999', LOCAL_AI_GATEWAY_TOKEN: 'test-only-ephemeral-service-token-000000',
  CLERK_ISSUER: 'https://phase3a.clerk.accounts.dev',
  CLERK_JWT_KEY: publicKey.export({ type: 'spki', format: 'pem' }) });
export function session(user = 'user_owner', changes = {}, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: config.issuer, sub: user, sid: 'sess_test', azp: config.origin,
    iat: now, nbf: now - 1, exp: now + 120, v: 2, ...changes })).toString('base64url');
  const data = header + '.' + payload;
  return data + '.' + sign('RSA-SHA256', Buffer.from(data), key).toString('base64url');
}
export const upstreamId = 'a'.repeat(32);
export const payload = { projectType: 'full-ai', script: 'scene_1\nCharacter: Judge\nDialogue: Synthetic test only.\n', language: 'en' };
export const sourceHash = createHash('sha256').update(payload.script).digest('hex');
export const admission = () => ({ job_id: upstreamId, state: 'queued', status_url: '/v1/jobs/' + upstreamId });
export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', ...headers },
});
export function completed() {
  return { job_id: upstreamId, state: 'completed', error: null, metrics: { execution: 'deterministic_cpu', scene_count: 1 },
    result: { projectType: 'full-ai', execution: 'deterministic_cpu',
      web_data: { characters: [{ id: 'judge', name: 'Judge', description: '', voiceTone: '' }], scenes: [
        { scene_n: 1, Character: 'Judge', Dialogue: 'Synthetic test only.', Translate: '', Tone_of_Voice: '',
          Context: '', Camera: '', Action: '', Word_count: 3, status: 'pending' },
      ] }, source_metadata: { source_sha256: sourceHash, header_raw: '', header_metadata: {}, scenes: [{ scene_id: 'scene_1', metadata: {} }] } } };
}
export async function serve(t, fetchImpl, overrides = {}, now) {
  const server = createLocalServer({ ...config, pollIntervalMs: 1, ...overrides }, { fetchImpl, now });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed; });
  return {
    base: 'http://127.0.0.1:' + server.address().port,
    async call(path, { body, token = session(), headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
      const response = await fetch('http://127.0.0.1:' + server.address().port + path, { method,
        headers: { Origin: config.origin, Authorization: 'Bearer ' + token, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, headers: response.headers, body: await response.json() };
    },
  };
}
