import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('Local development only.');
const env = { ...process.env, NODE_ENV: 'development', GEMINI_TEST_LOCAL: 'true',
  GEMINI_TEST_OMIT_BOTGUARD: 'true', GEMINI_TEST_ORIGIN: 'http://localhost:5174',
  VITE_ENABLE_GEMINI_TEST: 'true', PORT: '5174' };
const backend = spawn(process.execPath, ['scripts/gemini-test-server.mjs'], { cwd, env, windowsHide: true, stdio: 'inherit' });
const frontend = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', 'localhost', '--port', '5174', '--strictPort'], { cwd, env, windowsHide: true, stdio: 'inherit' });
const stop = () => { backend.kill(); frontend.kill(); };
for (const child of [backend, frontend]) {
  child.on('error', () => { process.exitCode = 1; stop(); });
  child.on('exit', (code) => { if (code) process.exitCode = code; stop(); });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
console.log('Experimental test: http://localhost:5174/gemini-request-test (no BotGuard, no automatic retry)');
