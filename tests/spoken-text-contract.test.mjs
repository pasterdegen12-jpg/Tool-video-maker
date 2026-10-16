import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { readSpokenText, writeFullDialogue, prepareNewProjectScenes, countSpokenWords } from '../src/lib/spokenText.js';

// Synthetic compatibility fixtures; real source files are exercised by gateway regressions.
const exact = '"Xin chào…\r\n  Judge: giữ nguyên!  "';
for (const [name, scene, workflow, text, source, issue] of [
  ['canonical Full', { Dialogue: exact }, 'full-ai', exact, 'Dialogue', null],
  ['legacy Full', { Voiceover: exact }, 'full-ai', exact, 'Voiceover', null],
  ['equal aliases', { Dialogue: exact, Voiceover: exact }, 'full-ai', exact, 'Dialogue', null],
  ['conflicting aliases', { Dialogue: 'A', Voiceover: 'B' }, 'full-ai', '', null, 'DIALOGUE_VOICEOVER_CONFLICT'],
  ['empty Dialogue conflict', { Dialogue: '', Voiceover: 'B' }, 'full-ai', '', null, 'DIALOGUE_VOICEOVER_CONFLICT'],
  ['empty legacy conflict', { Dialogue: 'A', Voiceover: '' }, 'full-ai', '', null, 'DIALOGUE_VOICEOVER_CONFLICT'],
  ['whitespace is significant', { Dialogue: 'A', Voiceover: 'A ' }, 'full-ai', '', null, 'DIALOGUE_VOICEOVER_CONFLICT'],
  ['empty canonical', { Dialogue: '' }, 'full-ai', '', 'Dialogue', null],
  ['both empty', { Dialogue: '', Voiceover: '' }, 'full-ai', '', 'Dialogue', null],
  ['missing speech', {}, 'full-ai', '', null, null],
  ['null is invalid', { Dialogue: null, Voiceover: 'B' }, 'full-ai', '', null, 'INVALID_SPOKEN_TEXT'],
  ['non-string legacy', { Voiceover: 42 }, 'full-ai', '', null, 'INVALID_SPOKEN_TEXT'],
  ['Semi keeps Voiceover', { Voiceover: exact, Dialogue: 'Ignore me', Footage: 'Visual' }, 'semi', exact, 'Voiceover', null],
  ['Semi never falls back', { Dialogue: 'Not narration' }, 'semi', '', null, null],
  ['Semi invalid Voiceover', { Voiceover: {} }, 'semi', '', null, 'INVALID_SPOKEN_TEXT'],
]) {
  test('read-only contract: ' + name, () => {
    const saved = structuredClone(scene);
    Object.freeze(scene);
    const result = readSpokenText(scene, workflow);
    assert.deepEqual([result.text, result.source, result.issue], [text, source, issue]);
    assert.deepEqual(scene, saved);
  });
}

test('explicit Full edit preserves media/metadata and removes only legacy alias', () => {
  const scene = Object.freeze({ scene_n: 7, Voiceover: exact, Character: 'Judge', Word_count: 999,
    videoUrl: '/video.mp4', startFrameUrl: '/frame.png', status: 'completed', custom: { untouched: true } });
  const edited = writeFullDialogue(scene, exact);
  assert.equal(edited.Dialogue, exact);
  assert.equal(Object.hasOwn(edited, 'Voiceover'), false);
  assert.equal(edited.Word_count, 6);
  for (const key of ['scene_n', 'Character', 'videoUrl', 'startFrameUrl', 'status', 'custom']) assert.equal(edited[key], scene[key]);
  assert.equal(scene.Voiceover, exact);
  assert.equal(writeFullDialogue(edited, '').Dialogue, '');
  assert.equal(writeFullDialogue(edited, '').Word_count, 0);
  assert.throws(() => writeFullDialogue(scene, null), /chuỗi/);
});

test('new Full projects canonicalize legacy/equal aliases without mutating input', () => {
  const scenes = [{ scene_n: 1, Voiceover: exact }, { scene_n: 2, Dialogue: 'Same', Voiceover: 'Same' }];
  const saved = structuredClone(scenes);
  const output = prepareNewProjectScenes(scenes, 'full-ai');
  assert.equal(output[0].Dialogue, exact);
  assert.ok(output.every(scene => !Object.hasOwn(scene, 'Voiceover')));
  assert.deepEqual(scenes, saved);
  assert.throws(() => prepareNewProjectScenes([{ scene_n: 23, Dialogue: 'A', Voiceover: 'B' }], 'full-ai'), /Scene 23: Dialogue và Voiceover/);
});

test('Semi preparation preserves independent fields and characters are not inferred', () => {
  const scene = { scene_n: 1, Voiceover: exact, Footage: 'Visual only', time_origin: '1 - 3', Character: '', Translate: '', Tone_of_Voice: '' };
  assert.deepEqual(prepareNewProjectScenes([scene], 'semi'), [scene]);
  assert.equal(Object.hasOwn(prepareNewProjectScenes([scene], 'semi')[0], 'Dialogue'), false);
  assert.equal(countSpokenWords('  \r\n '), 0);
});

// Compile the actual JSX modules and exercise their rendered elements/callbacks on CPU.
async function componentExports(path) {
  const url = new URL(path, import.meta.url);
  const { code } = await transformWithOxc(await readFile(url, 'utf8'), url.pathname, { jsx: { runtime: 'automatic' } });
  const module = new vm.SourceTextModule(code, { identifier: url.href, initializeImportMeta(meta) { meta.env = { DEV: false }; } });
  await module.link(async specifier => {
    const exports = specifier.endsWith('.jsx') ? await componentExports(new URL(specifier, url).href)
      : await import(specifier.startsWith('.') ? new URL(specifier, url).href : specifier);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    });
  });
  await module.evaluate();
  return module.namespace;
}
async function component(path) { return (await componentExports(path)).default; }
const FullDialogueField = await component('../src/Workspace/FullDialogueField.jsx');
const StoryboardTab = await component('../src/Workspace/StoryboardTab.jsx');
function elements(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
function label(node) {
  if (Array.isArray(node)) return node.map(label).join('');
  return typeof node === 'string' ? node : label(node?.props?.children || []);
}

test('conflict editor shows both exact values; explicit choice keeps one and media', () => {
  const scene = { scene_n: 1, Dialogue: exact, Voiceover: 'legacy', videoUrl: '/keep.mp4' };
  for (const field of ['Dialogue', 'Voiceover']) {
    let changed;
    const tree = FullDialogueField({ scene, onChange: value => { changed = value; }, inputClassName: '' });
    const nodes = elements(tree);
    const areas = nodes.filter(node => node.type === 'textarea');
    assert.equal(areas[0].props.value, exact);
    assert.equal(areas[1].props.value, 'legacy');
    assert.equal(areas[2].props.readOnly, true);
    assert.equal(changed, undefined); // Rendering must not write.
    nodes.find(node => node.type === 'button' && label(node) === 'Giữ ' + field).props.onClick();
    assert.equal(changed.Dialogue, scene[field]);
    assert.equal(Object.hasOwn(changed, 'Voiceover'), false);
    assert.equal(changed.videoUrl, scene.videoUrl);
  }
  assert.equal(scene.Voiceover, 'legacy');
});

test('legacy editor reads old text; clearing it does not resurrect Voiceover', () => {
  const scene = { Voiceover: exact, startFrameUrl: '/keep.png' };
  let changed;
  const tree = FullDialogueField({ scene, onChange: value => { changed = value; } });
  const area = elements(tree).find(node => node.type === 'textarea');
  assert.equal(area.props.value, exact);
  area.props.onChange({ target: { value: '' } });
  assert.equal(changed.Dialogue, '');
  assert.equal(Object.hasOwn(changed, 'Voiceover'), false);
  assert.equal(changed.startFrameUrl, scene.startFrameUrl);
});

const storyboardDom = new JSDOM('<!doctype html><body></body>');
const document = storyboardDom.window.document;
globalThis.window = storyboardDom.window;
globalThis.document = storyboardDom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
async function storyboard(t, scene, projectType = 'full-ai', extra = {}) {
  const box = document.createElement('div');
  document.body.append(box);
  const root = createRoot(box);
  await act(async () => root.render(React.createElement(StoryboardTab, {
    parsedData: [scene], projectCharacters: [], generatedAudios: { 1: '/existing.mp3' },
    isGenerating: {}, mergingScenes: {}, mergedVideos: { 1: '/merged.mp4' }, projectType, ...extra,
  })));
  t.after(async () => { await act(async () => root.unmount()); box.remove(); });
  return box;
}
const storyboardButton = (box, text) => [...box.querySelectorAll('button')].find(b => b.textContent.includes(text));
for (const [name, speech, projectType, expected] of [
  ['new Full', { Dialogue: exact }, 'full-ai', exact],
  ['legacy Full', { Voiceover: exact }, 'full-ai', exact],
  ['Semi', { Voiceover: exact, Dialogue: 'ignored' }, 'semi', exact],
]) {
  test('Storyboard displays and passes exact text: ' + name, async t => {
    let modal;
    const box = await storyboard(t, { scene_n: 1, ...speech }, projectType, { setActiveGenModal: value => { modal = value; } });
    const button = storyboardButton(box, 'Gen Audio');
    assert.equal(button.disabled, false);
    await act(async () => button.click());
    assert.equal(modal.textToGen, expected);
    for (const value of ['Xin chào', 'existing.mp3', 'merged.mp4']) assert.ok(box.innerHTML.includes(value));
  });
}
test('Storyboard conflict blocks ambiguous speech but keeps media and edit action', async t => {
  const scene = { scene_n: 1, Dialogue: 'A', Voiceover: 'B', videoUrl: '/video.mp4', startFrameUrl: '/frame.png' };
  let editing;
  const box = await storyboard(t, scene, 'full-ai', { setActiveEditSceneModal: value => { editing = value; } });
  assert.equal(storyboardButton(box, 'Gen Audio').disabled, true);
  await act(async () => storyboardButton(box, 'Sửa lời thoại').click());
  assert.equal(editing, scene);
  for (const value of ['role="alert"', '/existing.mp3', '/merged.mp4', '/frame.png']) assert.ok(box.innerHTML.includes(value));
});

test('actual Firebase helper: creation uses workflow field; conflict fails before external work; updates do not migrate', async () => {
  const writes = [];
  let fetches = 0;
  const context = vm.createContext({ console: { log() {}, error() {} }, setTimeout, clearTimeout,
    fetch: () => { fetches++; throw Error('Network forbidden in compatibility test'); } });
  const source = await readFile(new URL('../src/firebase.js', import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(source, { context, initializeImportMeta(meta) { meta.env = {}; } });
  const exportsByName = {
    'firebase/app': { initializeApp: () => ({}) },
    'firebase/firestore': { getFirestore: () => ({}), doc: (...args) => args, setDoc: async (...args) => { writes.push(args); } },
    './lib/spokenText.js': { prepareNewProjectScenes, readSpokenText },
  };
  await module.link(name => {
    const exports = exportsByName[name];
    assert.ok(exports, name);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  assert.equal(writes.length, 0);
  for (const [projectType, scene, field] of [
    ['full-ai', { Dialogue: exact }, 'Dialogue'],
    ['full-ai', { Voiceover: exact }, 'Dialogue'],
    ['semi', { Voiceover: exact, Footage: 'Visual', time_origin: '1 - 2' }, 'Voiceover'],
  ]) {
    await module.namespace.autoSaveToFirebase([{ scene_n: 1, ...scene, videoUrl: 'https://media.invalid/keep.mp4' }], 'Test', 'source', [], projectType);
    const doc = writes.at(-1)[1];
    assert.equal(doc.data[0][field], exact);
    assert.equal(Object.hasOwn(doc.data[0], field === 'Dialogue' ? 'Voiceover' : 'Dialogue'), false);
    assert.equal(doc.estCost, 0.01);
    assert.equal(doc.data[0].videoUrl, 'https://media.invalid/keep.mp4');
  }
  const count = writes.length;
  await assert.rejects(module.namespace.autoSaveToFirebase([{ scene_n: 4, Dialogue: 'A', Voiceover: 'B', videoUrl: 'blob:unused' }], 'Test', '', [], 'full-ai'), /Scene 4/);
  assert.equal(writes.length, count);
  assert.equal(fetches, 0);
  const legacy = { data: [{ scene_n: 1, Voiceover: exact }], generatedAudios: { 1: '/existing.mp3' }, mergedVideos: { 1: '/merged.mp4' } };
  await module.namespace.updateProjectProgress('existing-project', legacy);
  assert.equal(writes.at(-1)[1], legacy);
  assert.equal(writes.at(-1)[2].merge, true);
  assert.equal(Object.hasOwn(legacy.data[0], 'Dialogue'), false);
});
