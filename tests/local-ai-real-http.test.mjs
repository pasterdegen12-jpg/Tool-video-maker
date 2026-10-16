// Real source files + real loopback FastAPI/JobManager/parser. Synthetic signed test sessions only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config, session, serve } from './support/local-ai-fixtures.mjs';

const files = {
  'full-ai': ['C:/Users/Admin/Downloads/kịch bản gen video AI.txt', 'e24725a239b5084dfa4dfd57192cf636e2ebf423ee953ada760bce29d15ca74b', 23],
  semi: ['C:/Users/Admin/Downloads/kịch bản semi-content.txt', '600431973c83c7c74603fcc1d347a0231c19a310a2a902669d3d8c99f12f9050', 22],
};

// Independent, deliberately narrow oracle for the two actual single-line-field scripts.
function oracle(source) {
  const headings = [...source.matchAll(/^scene_([1-9][0-9]*)\r?$/gm)];
  return headings.map((m, index) => ({ number: Number(m[1]), fields: Object.fromEntries([
    ...source.slice(m.index + m[0].length, headings[index + 1]?.index ?? source.length)
      .matchAll(/^([^:\r\n]+):[ \t]*(.*?)\r?$/gm),
  ].map(f => [f[1], f[2]])) }));
}

async function startGateway(root, runtime, token, port = 0) {
  const child = spawn(path.join(root, '.venv/Scripts/python.exe'), ['-I', '-B', fileURLToPath(new URL('./support/gateway_cpu.py', import.meta.url))], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GATEWAY_START_GPU_WORKER: 'false', GATEWAY_SERVICE_TOKEN: token,
      GATEWAY_DATA_DIR: runtime, GATEWAY_GPU_MODE: 'standalone',
      PHASE3A_GATEWAY_ROOT: root, PHASE3A_GATEWAY_PORT: String(port) },
  });
  let out = '', errors = '';
  child.stdout.on('data', b => { out += b.toString(); });
  child.stderr.on('data', b => { errors += b.toString(); });
  const exit = once(child, 'exit');
  try {
    const end = Date.now() + 12000;
    while (!out.includes('\n') && child.exitCode === null && Date.now() < end) await new Promise(r => setTimeout(r, 10));
    assert.ok(out.includes('\n'), 'CPU gateway startup failed; see local stderr: ' + errors.slice(-2000));
    const ready = JSON.parse(out.split('\n')[0]); assert.equal(ready.ready, true);
    let stopped;
    return { base: 'http://127.0.0.1:' + ready.port, port: ready.port,
      stop() {
        return stopped ??= (async () => {
          child.stdin.end('stop\n');
          let timer;
          const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Gateway did not stop')), 12000); });
          try { const [code] = await Promise.race([exit, timeout]); assert.equal(code, 0, errors.slice(-2000)); }
          finally { clearTimeout(timer); if (child.exitCode === null) child.kill(); }
          return JSON.parse(out.trim().split('\n').at(-1));
        })();
      },
    };
  } catch (error) { child.kill(); throw error; }
}

test('two ORIGINAL scripts through Web HTTP → real gateway → JobManager → CPU parser, then restart', { timeout: 45000 }, async t => {
  const root = process.env.PHASE3A_GATEWAY_ROOT || 'F:/tool-ai-dh/local-ai-gateway';
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), 'phase3a-cpu-'));
  const evidence = process.env.PHASE3A_EVIDENCE_DIR || path.join(runtime, 'evidence');
  await fs.mkdir(evidence, { recursive: true });
  // Check both originals BEFORE starting services. Missing or changed source is a FAIL, not a skip.
  const originals = {};
  for (const [workflow, [filename, hash]] of Object.entries(files)) {
    const raw = await fs.readFile(filename);
    assert.equal(createHash('sha256').update(raw).digest('hex'), hash, filename + ': original changed');
    originals[workflow] = raw;
  }
  const token = randomBytes(32).toString('hex');
  const gateway = await startGateway(root, runtime, token); t.after(() => gateway.stop());
  const auth = { Authorization: 'Bearer ' + token };
  const healthResponse = await fetch(gateway.base + '/health', { headers: auth });
  const health = await healthResponse.json();
  assert.equal(healthResponse.status, 503); assert.equal(health.cpu_workflows.ready, true);
  assert.equal(health.worker_state, 'disabled'); assert.equal(health.model_load_count, 0); assert.equal(health.model_ready, false);
  // The test reduces poll spacing only. The production defaults are 1 second / 120 attempts / 5 minutes.
  const web = await serve(t, undefined, { gatewayUrl: gateway.base, gatewayToken: token, requestTimeoutMs: 3000, pollIntervalMs: 5 });
  let lastUrl;
  for (const [workflow, [filename, hash, count]] of Object.entries(files)) {
    const source = originals[workflow].toString('utf8');
    const reference = oracle(source); assert.equal(reference.length, count);
    const sent = { projectType: workflow, script: source, language: workflow === 'semi' ? 'vi' : 'en' };
    const accepted = await web.call('/api/local-ai/analyze', { body: sent });
    assert.equal(accepted.status, 202);
    assert.equal((await web.call(accepted.body.status_url, { token: session('user_other') })).status, 404);
    const states = []; let actual;
    const end = Date.now() + 10000;
    while (Date.now() < end) {
      actual = await web.call(accepted.body.status_url); assert.equal(actual.status, 200);
      states.push(actual.body.state);
      if (['completed', 'failed'].includes(actual.body.state)) break;
      await new Promise(r => setTimeout(r, 10));
    }
    assert.equal(actual.body.state, 'completed'); assert.equal(actual.body.error, null);
    const { result } = actual.body;
    assert.equal(result.execution, 'deterministic_cpu'); assert.equal(result.projectType, workflow);
    assert.equal(result.source_metadata.source_sha256, hash);
    assert.equal(result.web_data.scenes.length, count);
    assert.deepEqual(result.web_data.scenes.map(s => s.scene_n), Array.from({ length: count }, (_, i) => i + 1));
    const comparisons = [];
    for (const [index, scene] of result.web_data.scenes.entries()) {
      const expected = reference[index].fields; const metadata = result.source_metadata.scenes[index];
      assert.equal(metadata.scene_id, 'scene_' + (index + 1));
      if (workflow === 'full-ai') {
        for (const key of ['Dialogue', 'Character', 'Context', 'Camera', 'Action']) assert.equal(scene[key], expected[key]);
        assert.equal(scene.Translate, expected['Dịch']); assert.equal(scene.Tone_of_Voice, expected.Tone);
        assert.equal('Voiceover' in scene, false); assert.equal('time_origin' in scene, false);
      } else {
        for (const key of ['Voiceover', 'Footage', 'Effect']) assert.equal(scene[key], expected[key]);
        assert.equal(scene.time_origin, expected.Time_origin);
        assert.equal(metadata.Time, expected.Time); assert.equal(metadata.Scene_Duration, expected.Scene_Duration);
        assert.equal(expected.Time, expected.Time_origin); // Real sample cannot prove unequal time handling.
        for (const key of ['VO_Token_Count', 'VO_Target_Range', 'Audio_Mode', 'Content_Function', 'Review_Angle']) assert.equal(metadata.metadata[key], expected[key]);
        assert.deepEqual(['Character', 'Translate', 'Tone_of_Voice'].map(k => scene[k]), ['', '', '']);
        assert.equal('Dialogue' in scene, false);
      }
      comparisons.push({ scene_id: metadata.scene_id, expected, actual: scene, source_metadata: metadata, status: 'PASS' });
    }
    if (workflow === 'full-ai') {
      const counts = {};
      for (const s of result.web_data.scenes) counts[s.Character] = (counts[s.Character] || 0) + 1;
      assert.deepEqual(counts, { Judge: 10, Defendant: 8, Plaintiff: 5 });
      assert.deepEqual(new Set(result.web_data.characters.map(c => c.name)), new Set(['Judge', 'Defendant', 'Plaintiff']));
      assert.ok(result.web_data.characters.every(c => c.description === '' && c.voiceTone === ''));
    } else {
      assert.deepEqual(result.web_data.characters, []); assert.equal(Object.keys(result.source_metadata.header_metadata).length, 13);
    }
    assert.equal(result.source_metadata.header_raw, source.slice(0, source.indexOf('scene_1')));
    assert.deepEqual(await fs.readFile(filename), originals[workflow]);
    await fs.writeFile(path.join(evidence, workflow + '.web-http.json'), JSON.stringify({
      status: 'PASS', input: filename, sha256: hash, transport: 'Web HTTP → gateway TCP → JobManager → CPU parser → Web HTTP',
      authentication: 'Real Clerk SDK signature verification with SYNTHETIC ephemeral test sessions; live Clerk login NOT RUN',
      request: sent, admission: accepted.body, poll_states_observed: states, response: actual.body,
      scene_comparisons: comparisons, gateway_health_http: healthResponse.status, gateway_health: health,
      real_qwen_inference: 'NOT RUN',
    }, null, 2));
    lastUrl = accepted.body.status_url;
  }
  // Explicitly synthetic negative source: real CPU validation, no mock Qwen output.
  const negative = await web.call('/api/local-ai/analyze', { body: {
    projectType: 'full-ai', language: 'en', script: 'scene_1\nCharacter: Judge\nDialogue: PRIVATE_A\nDialogue: PRIVATE_B\n',
  } });
  assert.equal(negative.status, 202);
  let rejected;
  const negativeDeadline = Date.now() + 5000;
  while (Date.now() < negativeDeadline) {
    rejected = await web.call(negative.body.status_url); assert.equal(rejected.status, 200);
    if (rejected.body.state === 'failed') break;
    await new Promise(r => setTimeout(r, 10));
  }
  assert.equal(rejected.body.state, 'failed'); assert.equal(rejected.body.error.code, 'DUPLICATE_FIELD');
  assert.equal(JSON.stringify(rejected.body).includes('PRIVATE_'), false);
  await fs.writeFile(path.join(evidence, 'synthetic-validation-error.json'), JSON.stringify({
    source: 'SYNTHETIC duplicate Dialogue negative test', transport: 'real Web and gateway HTTP', response: rejected.body,
  }, null, 2));
  // The actual upstream loses its job store across restart. Existing bridge ownership cannot recover it.
  const stopped = await gateway.stop();
  const restarted = await startGateway(root, runtime, token, gateway.port); t.after(() => restarted.stop());
  const missing = await web.call(lastUrl);
  assert.equal(missing.status, 404); assert.equal(missing.body.error.code, 'JOB_NOT_FOUND');
  const stoppedRestart = await restarted.stop();
  await fs.writeFile(path.join(evidence, 'cpu-isolation.json'), JSON.stringify({ status: 'PASS', stopped, stoppedRestart,
    gateway_restart: { status: missing.status, body: missing.body }, health,
    inference: 'NOT RUN', live_clerk_session: 'NOT RUN', time_vs_time_origin_different_real_sample: 'NOT RUN' }, null, 2));
});
