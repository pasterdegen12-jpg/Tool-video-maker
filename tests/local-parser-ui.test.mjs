// React DOM/jsdom component tests. Clerk hook and HTTP are MOCKED, never live browser acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import process from 'node:process';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { transformWithOxc } from 'vite';
import React, { act } from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
let auth = { isLoaded: true, isSignedIn: true, sessionId: 'sess_mock', getToken: async () => 'mock-clerk-session' };
let saves = 0, media = 0, navigations = 0;
const savedFetch = globalThis.fetch;
const compilerCache = new Map();
async function compile(relative, env = { DEV: true, VITE_ENABLE_LOCAL_PARSER: 'true' }) {
  const url = new URL(relative, import.meta.url);
  const key = url.href + JSON.stringify(env);
  if (compilerCache.has(key)) return compilerCache.get(key);
  const { code } = await transformWithOxc(await fs.readFile(url, 'utf8'), url.pathname, { jsx: { runtime: 'automatic' } });
  const module = new vm.SourceTextModule(code, { identifier: url.href, initializeImportMeta(meta) { meta.env = env; } });
  await module.link(async specifier => {
    let exports;
    if (specifier === '@clerk/clerk-react') exports = { useAuth: () => auth };
    else if (specifier === './firebase.js') exports = { autoSaveToFirebase: () => { saves++; throw Error('Firestore forbidden in preview'); } };
    else if (specifier === '@ffmpeg/util') exports = { fetchFile: () => { media++; throw Error('Media forbidden in preview'); } };
    else if (specifier === 'react-router-dom') exports = { useNavigate: () => () => { navigations++; } };
    else if (specifier.endsWith('.jsx')) exports = await compile('../src/' + specifier.replace('./', ''), env);
    else exports = await import(specifier.startsWith('.') ? new URL(specifier, url).href : specifier);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    });
  });
  await module.evaluate(); compilerCache.set(key, module.namespace); return module.namespace;
}
const { default: Panel, LocalParserPreview: Preview } = await compile('../src/LocalParserPanel.jsx');
const captures = Object.fromEntries(await Promise.all(['full-ai', 'semi'].map(async workflow => [workflow,
  JSON.parse(await fs.readFile(new URL('../docs/phase3a/' + workflow + '.web-http.json', import.meta.url), 'utf8'))])));
const id = 'b'.repeat(48);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Retry-After': '1' } });
const admitted = () => json({ job_id: id, state: 'queued', status_url: '/api/local-ai/jobs/' + id,
  expires_at: new Date(Date.now() + 300000).toISOString(), max_polls: 120 }, 202);
const done = workflow => json({ ...captures[workflow].response, job_id: id });
const flush = () => act(async () => { await new Promise(resolve => setImmediate(resolve)); });
const click = async button => { assert.ok(button, 'button exists'); await act(async () => { button.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); };
const findButton = (container, text) => [...container.querySelectorAll('button')].find(b => b.textContent.includes(text));
async function mount(t, element) {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  t.after(async () => { await act(async () => root.unmount()); container.remove(); globalThis.fetch = savedFetch; });
  return { container, render: async e => { await act(async () => root.render(e)); }, unmount: async () => { await act(async () => root.unmount()); } };
}
const props = (workflow = 'full-ai', changes = {}) => ({ script: captures[workflow].request.script, projectType: workflow,
  language: workflow === 'semi' ? 'vi' : 'en', onProjectTypeChange() {}, onLanguageChange() {}, darkMode: true, blocked: false, ...changes });

for (const workflow of ['full-ai', 'semi']) test('actual React preview of recorded real ' + workflow + ' output preserves every scene/field', async t => {
  const result = structuredClone(captures[workflow].response.result);
  const before = JSON.stringify(result);
  const { container } = await mount(t, React.createElement(Preview, { result }));
  const rows = container.querySelector('[aria-label="Các scene theo thứ tự nguồn"]').querySelectorAll('ol > li');
  assert.equal(rows.length, workflow === 'full-ai' ? 23 : 22);
  const checks = [];
  for (const [index, row] of [...rows].entries()) {
    const scene = result.web_data.scenes[index];
    assert.ok(row.querySelector('summary').textContent.startsWith('Scene ' + scene.scene_n));
    for (const field of workflow === 'full-ai' ? ['Dialogue', 'Character', 'Translate', 'Tone_of_Voice', 'Context', 'Camera', 'Action']
      : ['Voiceover', 'Footage', 'time_origin', 'Effect']) {
      assert.equal(row.querySelector('[data-source-field="' + field + '"]').textContent, scene[field]);
    }
    assert.equal(row.querySelector('[data-source-field="' + (workflow === 'full-ai' ? 'Voiceover' : 'Dialogue') + '"]'), null);
    checks.push({ scene_n: scene.scene_n, status: 'PASS', field_text: Object.fromEntries([...row.querySelectorAll('[data-source-field]')].map(el => [el.dataset.sourceField, el.textContent])) });
  }
  const metadata = [...container.querySelectorAll('details')].find(d => d.firstElementChild?.textContent.includes('source_metadata'));
  assert.deepEqual(JSON.parse(metadata.querySelector('pre').textContent), result.source_metadata);
  assert.equal(JSON.stringify(result), before); assert.equal(container.querySelectorAll('img,audio,video,iframe').length, 0);
  if (process.env.PHASE3B_EVIDENCE_DIR) {
    await fs.mkdir(process.env.PHASE3B_EVIDENCE_DIR, { recursive: true });
    await fs.writeFile(process.env.PHASE3B_EVIDENCE_DIR + '/' + workflow + '.preview.json', JSON.stringify({
      mode: 'React DOM/jsdom replay of recorded real CPU response; MOCKED transport, live Clerk NOT RUN',
      input: captures[workflow].input, sha256: captures[workflow].sha256, status: 'PASS', scenes: checks,
      metadata_unchanged: true, model_inference: 'NOT RUN',
    }, null, 2));
  }
});

test('synthetic HTML-like speech/metadata is safe plain text, not markup or media', async t => {
  const result = structuredClone(captures['full-ai'].response.result);
  result.web_data.scenes[0].Dialogue = '<img src="https://private.invalid/x" onerror="alert(1)"><script>attack()</script>';
  result.source_metadata.header_metadata.extra = '<iframe src="https://private.invalid"></iframe>';
  const { container } = await mount(t, React.createElement(Preview, { result }));
  assert.equal(container.querySelector('[data-source-field="Dialogue"]').textContent, result.web_data.scenes[0].Dialogue);
  assert.equal(container.querySelectorAll('img,script,iframe,audio,video').length, 0);
});

test('MainEditor hides local feature by default and in production even with visibility flag', async t => {
  for (const env of [{ DEV: true }, { DEV: false, VITE_ENABLE_LOCAL_PARSER: 'true' }]) {
    const Main = (await compile('../src/MainEditor.jsx', env)).default;
    const { container } = await mount(t, React.createElement(Main, { darkMode: true }));
    assert.equal(findButton(container, 'Phân tích kịch bản'), undefined);
    assert.ok(findButton(container, 'TẠO VIDEO (GEN AI)')); assert.ok(findButton(container, 'CẮT VIDEO (SEMI-CONTENT)'));
  }
});

test('enabled MainEditor uses chosen workflow/language and original textarea; no Firebase/media/Gemini action', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  saves = 0; media = 0; navigations = 0;
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options });
    assert.match(url, /^\/api\/local-ai\//); return options.method === 'POST' ? admitted() : done('semi'); };
  const Main = (await compile('../src/MainEditor.jsx')).default;
  const { container } = await mount(t, React.createElement(Main, { darkMode: true, ffmpeg: { exec() { media++; } } }));
  const area = container.querySelector('textarea');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(area, captures.semi.request.script);
    area.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  const selects = container.querySelectorAll('select');
  await act(async () => { selects[0].value = 'semi'; selects[0].dispatchEvent(new window.Event('change', { bubbles: true }));
    selects[1].value = 'vi'; selects[1].dispatchEvent(new window.Event('change', { bubbles: true })); });
  const button = findButton(container, 'Phân tích kịch bản');
  await click(button); await flush();
  assert.equal(calls.length, 1); assert.equal(button.disabled, true);
  const submitted = JSON.parse(calls[0].options.body);
  assert.deepEqual(submitted, { projectType: 'semi', script: area.value, language: 'vi' });
  // The browser textarea itself normalizes CRLF to LF; the new client must preserve its exact value.
  assert.equal(submitted.script, captures.semi.request.script.replaceAll('\r\n', '\n'));
  await act(async () => t.mock.timers.tick(1000)); await flush();
  assert.match(container.textContent, /22 scene/); assert.match(container.textContent, /0 nhân vật/);
  assert.deepEqual([saves, media, navigations], [0, 0, 0]); assert.equal(calls.length, 2);
});

test('double click, cancel and a late successful POST never display stale preview', async t => {
  let release, signal; let calls = 0;
  globalThis.fetch = (_url, options) => { calls++; signal = options.signal; return new Promise(resolve => { release = resolve; }); };
  const { container } = await mount(t, React.createElement(Panel, props()));
  const button = findButton(container, 'Phân tích kịch bản');
  await act(async () => { button.click(); button.click(); }); await flush();
  assert.equal(calls, 1); assert.equal(button.disabled, true);
  await click(findButton(container, 'Dừng chờ')); assert.equal(signal.aborted, true);
  await act(async () => release(admitted())); await flush();
  assert.match(container.textContent, /Job trên server có thể vẫn đang chạy/);
  assert.equal(container.querySelector('[aria-label="Kết quả parser Local"]'), null); assert.equal(calls, 1);
});

for (const change of ['script', 'workflow', 'language', 'session']) test('changing ' + change + ' aborts active GET and rejects old completed output', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  let release, signal;
  globalThis.fetch = async (_url, options) => options.method === 'POST' ? admitted() : new Promise(resolve => { release = resolve; signal = options.signal; });
  const { container, render } = await mount(t, React.createElement(Panel, props()));
  await click(findButton(container, 'Phân tích kịch bản')); await flush();
  await act(async () => t.mock.timers.tick(1000)); await flush(); assert.ok(release);
  if (change === 'session') auth = { ...auth, sessionId: 'sess_new_mock' };
  await render(React.createElement(Panel, change === 'workflow' ? props('semi') : props('full-ai', change === 'script'
    ? { script: 'scene_1\nCharacter: New\nDialogue: Changed.' } : change === 'language' ? { language: 'vi' } : {})));
  assert.equal(signal.aborted, true);
  await act(async () => release(done('full-ai'))); await flush();
  assert.equal(container.querySelector('[aria-label="Kết quả parser Local"]'), null);
  assert.match(container.textContent, /Sẵn sàng/);
});

test('component unmount during token acquisition sends no request', async t => {
  let release; let calls = 0;
  const before = auth; auth = { ...auth, getToken: () => new Promise(resolve => { release = resolve; }) };
  t.after(() => { auth = before; });
  globalThis.fetch = async () => { calls++; throw Error('must not send'); };
  const { container, unmount } = await mount(t, React.createElement(Panel, props()));
  await click(findButton(container, 'Phân tích kịch bản'));
  await unmount(); await act(async () => release('late-test-token')); await flush();
  assert.equal(calls, 0);
});

test('pagehide stops polling timer and presents cancelled state for browser back navigation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  let calls = 0; globalThis.fetch = async () => { calls++; return admitted(); };
  const { container } = await mount(t, React.createElement(Panel, props()));
  await click(findButton(container, 'Phân tích kịch bản')); await flush();
  await act(async () => window.dispatchEvent(new window.Event('pagehide')));
  await act(async () => t.mock.timers.tick(1000)); await flush();
  assert.equal(calls, 1); assert.match(container.textContent, /Đã dừng chờ/);
  assert.equal(findButton(container, 'Phân tích kịch bản').disabled, false);
});

test('unauthenticated UI disables submit; 401 from backend clears busy state', async t => {
  const before = auth; auth = { ...auth, isSignedIn: false }; t.after(() => { auth = before; });
  globalThis.fetch = async () => json({ error: { code: 'UNAUTHORIZED' } }, 401);
  const { container, render } = await mount(t, React.createElement(Panel, props()));
  assert.equal(findButton(container, 'Phân tích kịch bản').disabled, true);
  auth = { ...before, isSignedIn: true };
  await render(React.createElement(Panel, props()));
  await click(findButton(container, 'Phân tích kịch bản')); await flush();
  assert.match(container.textContent, /Phiên đăng nhập không hợp lệ hoặc đã hết hạn/);
  assert.equal(findButton(container, 'Phân tích kịch bản').disabled, false);
});
