// Real Web/FastAPI TCP transport, signed synthetic Clerk session, MOCK vision worker only.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import process from 'node:process';
import {spawn} from 'node:child_process';import {once} from 'node:events';
import {randomBytes,createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {serve,session} from './support/local-ai-fixtures.mjs';
async function startGateway(root, runtime, token, port = 0) {
  const child = spawn(path.join(root, '.venv/Scripts/python.exe'), ['-I', '-B', fileURLToPath(new URL('./support/gateway_visual_mock.py', import.meta.url))], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GATEWAY_START_GPU_WORKER: 'false', GATEWAY_SERVICE_TOKEN: token,
      GATEWAY_DATA_DIR: runtime, GATEWAY_GPU_MODE: 'shared',
      GATEWAY_GPU_LOCK_PATH: 'F:/Cooking-AI-review/jobs/.speech_gpu.lock',
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


test('real loopback Web → gateway HTTP validates actual image bytes and routes only to MOCK vision worker', {timeout:30000}, async t=>{
  const runtime=await fs.mkdtemp(path.join(os.tmpdir(),'phase4a-http-'));
  const token=randomBytes(32).toString('hex');
  const gateway=await startGateway('F:/tool-ai-dh/local-ai-gateway',runtime,token);t.after(()=>gateway.stop());
  const web=await serve(t,undefined,{gatewayUrl:gateway.base,gatewayToken:token,visualEnabled:true,pollIntervalMs:5});
  const f=JSON.parse(await fs.readFile(new URL('./support/visual-fixture.json',import.meta.url)));
  const payload={image_base64:f.image_base64,mime_type:f.mime_type};
  assert.equal((await web.call('/api/local-ai/visual-profile',{body:payload,token:''})).status,401);
  const admitted=await web.call('/api/local-ai/visual-profile',{body:payload});assert.equal(admitted.status,202);
  assert.equal((await web.call(admitted.body.status_url,{token:session('user_other')})).status,404);
  let actual;
  for(let n=0;n<100;n++){actual=await web.call(admitted.body.status_url);assert.equal(actual.status,200);if(['completed','failed'].includes(actual.body.state))break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(actual.body.state,'completed');assert.equal(actual.body.result.profile.visual_id,'mock_blue_coat');
  const bad={...payload,image_base64:Buffer.from([137,80,78,71,13,10,26,10,0,0,0]).toString('base64')};
  const rejected=await web.call('/api/local-ai/visual-profile',{body:bad});assert.equal(rejected.status,422);
  const project=await web.call('/api/local-ai/visual-profile',{body:{...payload,projectId:'foreign-project'}});assert.equal(project.status,422);
  const unauth=await fetch(gateway.base+'/v1/visual/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});assert.equal(unauth.status,401);
  const health=await(await fetch(gateway.base+'/health',{headers:{Authorization:'Bearer '+token}})).json();assert.equal(health.model_load_count,0);
  const stopped=await gateway.stop();assert.equal(stopped.gpu_worker_started,false);assert.deepEqual(stopped.model_modules_loaded,[]);
  const evidence={status:'PASS',transport:'Real Web → FastAPI TCP',inference:'MOCK ONLY; REAL QWEN NOT RUN',
    clerk:'Synthetic signed test session; live Clerk NOT RUN',image:'Synthetic solid blue PNG, not a human reference',
    image_sha256:createHash('sha256').update(Buffer.from(payload.image_base64,'base64')).digest('hex'),
    response:actual.body,invalid_image_status:rejected.status,project_selector_rejected:project.status,health,stopped};
  if(process.env.PHASE3A_EVIDENCE_DIR)await fs.writeFile(path.join(process.env.PHASE3A_EVIDENCE_DIR,'visual-mock-http.json'),JSON.stringify(evidence,null,2));
});
