import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { approveVisualProfile, resolveSceneCharacterProfile as resolve, validVisualProposal, visualProfilesVisible } from '../src/lib/visualProfile.js';
const proposal = { status: 'detected', visual_id: 'woman_black_coat', visual_description: 'A woman wearing a black coat.' };
const image = { dataUrl: 'data:image/png;base64,AA==', sha256: 'a'.repeat(64) };
const character = { id: 'char_3', name: 'Plaintiff', imageUrl: '/existing.png', voiceUrl: '/existing.mp3' };
test('approval preserves stable ID, name, media and leaves the input untouched', () => {
  const before = structuredClone(character);
  const profile = approveVisualProfile(Object.freeze(character), proposal, image);
  assert.equal(profile.characterId, character.id); assert.equal(profile.visualId, proposal.visual_id);
  assert.deepEqual(character, before); assert.notEqual(profile.visualId, character.id);
  assert.throws(() => approveVisualProfile(character, { ...proposal, status: 'ambiguous' }, image));
});
for (const bad of [null, {}, { ...proposal, visual_id: 'Plaintiff' }, { ...proposal, visual_id: 'white__coat' },
  { ...proposal, visual_description: '' }, { ...proposal, visual_description: 'a'.repeat(601) },
  { ...proposal, visual_description: 'a\nb' }, { ...proposal, extra: 'private' }, { ...proposal, status: 'ambiguous' }]) {
  test('reject malformed visual proposal ' + JSON.stringify(bad).slice(0,70), () => assert.equal(validVisualProposal(bad), false));
}
for (const status of ['ambiguous','no_human']) test('explicit ' + status + ' cannot become an approval', () => {
  const result = { status, visual_id: '', visual_description: '' }; assert.equal(validVisualProposal(result), true);
  assert.throws(() => approveVisualProfile(character, result, image));
});
test('exact mapping rejects missing/deleted/renamed/duplicate/name-ID ambiguity and unapproved profiles', () => {
  const approved = { ...character, visualProfile: approveVisualProfile(character, proposal, image) };
  assert.equal(resolve({ Character: 'Plaintiff' }, [approved]).status, 'approved');
  assert.equal(resolve({ Character: 'char_3' }, [approved]).status, 'approved');
  assert.equal(resolve({ Character: 'plaintiff' }, [approved]).status, 'missing');
  assert.equal(resolve({ Character: 'Plaintiff' }, []).status, 'missing');
  assert.equal(resolve({ Character: 'Plaintiff' }, [{ ...approved, name: 'Renamed' }]).status, 'missing');
  assert.equal(resolve({ Character: 'char_3' }, [{ ...approved, name: 'Renamed' }]).status, 'unapproved');
  for (const duplicate of [{ ...approved, id: 'other' }, { ...approved }, { id: 'Plaintiff', name: 'Other' }]) {
    assert.equal(resolve({ Character: 'Plaintiff' }, [approved, duplicate]).status, 'ambiguous');
  }
  assert.equal(resolve({ Character: 'Plaintiff' }, [character]).status, 'unapproved');
  assert.equal(resolve({ Character: 'Plaintiff' }, [{ ...approved, imageUrl: '/changed.png' }]).status, 'unapproved');
  assert.equal(resolve({ Character: 'Plaintiff' }, [approved], 'semi').status, 'not_applicable');
});
test('real 23/22 scene captures: every Plaintiff reference changes dynamically, original fields/media remain exact', async () => {
  for (const workflow of ['full-ai', 'semi']) {
    const capture = JSON.parse(await fs.readFile(new URL('../docs/phase3a/' + workflow + '.web-http.json', import.meta.url), 'utf8'));
    const source = await fs.readFile(capture.input);
    assert.equal(createHash('sha256').update(source).digest('hex'), capture.sha256);
    const { scenes, characters } = capture.response.result.web_data;
    const baseline = JSON.stringify(capture);
    if (workflow === 'semi') {
      assert.equal(scenes.length, 22); assert.deepEqual(characters, []);
      assert.ok(scenes.every(s => resolve(s, characters, 'semi').status === 'not_applicable'));
    } else {
      assert.equal(scenes.length, 23);
      const plaintiff = characters.find(c => c.name === 'Plaintiff');
      let mapped = characters.map(c => c.id === plaintiff.id ? { ...c, visualProfile: approveVisualProfile(c, proposal, image) } : c);
      const references = scenes.filter(s => s.Character === 'Plaintiff'); assert.equal(references.length, 5);
      for (const scene of references) assert.equal(resolve(scene, mapped).profile.visualId, proposal.visual_id);
      mapped = mapped.map(c => c.id === plaintiff.id ? { ...c, visualProfile: approveVisualProfile(c, { ...proposal, visual_id: 'woman_white_jacket' }, image) } : c);
      for (const scene of scenes) assert.equal(resolve(scene, mapped).profile?.visualId, scene.Character === 'Plaintiff' ? 'woman_white_jacket' : undefined);
      assert.ok(scenes.every(s => 'Dialogue' in s && !('Voiceover' in s) && !('visualId' in s)));
    }
    assert.equal(JSON.stringify(capture), baseline);
  }
});
test('feature is opt-in local development only', () => {
  const env = { DEV: true, VITE_ENABLE_LOCAL_VISUAL_ID: 'true' };
  assert.equal(visualProfilesVisible(env, { protocol: 'http:', hostname: 'localhost' }), true);
  for (const e of [{ ...env, DEV: false }, { DEV: true }]) assert.equal(visualProfilesVisible(e, { protocol: 'http:', hostname: 'localhost' }), false);
  assert.equal(visualProfilesVisible(env, { protocol: 'https:', hostname: 'public.example' }), false);
});
