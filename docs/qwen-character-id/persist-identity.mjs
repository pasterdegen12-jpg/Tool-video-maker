/**
 * Direct Firestore persistence script for the confirmed Qwen Character Set ID.
 *
 * Bypasses the HTTP bridge (no live session required). Uses the same
 * migrateCharacterIdentity + createCharacterRepository logic as the API route.
 *
 * OPERATOR-CONFIRMED:
 *   confirmedId = 'elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses'
 *   characterId = 'char_1'  (Thẩm phán / Quan tòa)
 *   projectId   = 'proj_1789061618441'
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// Minimal .env parser (key=value, ignores comments and blank lines)
async function loadEnv(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch { /* file may not exist */ }
}

// Load env files (later calls do NOT override earlier ones)
await loadEnv(path.join(ROOT, '.env.video.local'));
await loadEnv(path.join(ROOT, '.env.local'));
await loadEnv(path.join(ROOT, '.env'));

// ── Constants ────────────────────────────────────────────────────────────────
const PROJECT_ID    = 'proj_1789061618441';
const CHARACTER_ID  = 'char_1';
const CONFIRMED_ID  = 'elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses';
const OWNER_HASH    = 'a'.repeat(64); // Direct script uses synthetic owner hash (matches test contract)
const BACKUP_DIR    = 'F:\\tool-ai-dh\\BACKUPS\\character-id-persist';
const REF_IMG_PATH  = path.join(__dirname, 'judge-set-id-reference.jpeg');
const INFERENCE_PATH= path.join(__dirname, 'inference-result.json');
const EXPECTED_REF_SHA256 = '6050e6c5a2ce8a8d540d751b23a0d7245cb71599f61ec3cac37d2877313d62f4';
const EXPECTED_SCENES = [1, 3, 8, 11, 15, 17, 20, 21];

// ── Import project libs ───────────────────────────────────────────────────────
const { migrateCharacterIdentity, canonicalIdentity, validCharacterId } =
  await import('../../src/lib/characterIdentity.js');
const { createCharacterRepository } =
  await import('../../api/_lib/local-ai/character-repository.js');
const { projectFingerprint } =
  await import('../../api/_lib/local-ai/character-persistence.js');
const { composeScene } =
  await import('../../src/lib/seedanceContract.js');

// ── Helpers ───────────────────────────────────────────────────────────────────
const sha256 = v => createHash('sha256').update(v).digest('hex');

async function main() {
  console.log('=== Qwen Character Set ID — Direct Persistence Script ===');
  console.log(`Confirmed ID : ${CONFIRMED_ID}`);
  console.log(`Character    : ${CHARACTER_ID} (Thẩm phán)`);
  console.log(`Project      : ${PROJECT_ID}`);
  console.log('');

  // ── Step 1: Validate confirmed ID ─────────────────────────────────────────
  if (!validCharacterId(CONFIRMED_ID)) {
    throw new Error(`CONFIRMED_ID fails validCharacterId: ${CONFIRMED_ID}`);
  }
  console.log('✅ validCharacterId: PASS');

  // ── Step 2: Load and verify reference image ───────────────────────────────
  const refRaw = await fs.readFile(REF_IMG_PATH);
  const refSha = sha256(refRaw);
  if (refSha !== EXPECTED_REF_SHA256) {
    throw new Error(`Reference image SHA256 mismatch: got ${refSha}`);
  }
  const refDataUrl = `data:image/jpeg;base64,${refRaw.toString('base64')}`;
  const referenceImage = { dataUrl: refDataUrl, sha256: refSha };
  console.log(`✅ Reference image: ${refSha.slice(0, 16)}... verified`);

  // ── Step 3: Load inference result ─────────────────────────────────────────
  const inferenceResult = JSON.parse(await fs.readFile(INFERENCE_PATH, 'utf8'));
  if (inferenceResult.status !== 'OK') {
    throw new Error(`inference-result.json status is not OK: ${inferenceResult.status}`);
  }
  const proposal = inferenceResult.inference; // { status, visual_id, visual_description }
  if (proposal.status !== 'detected') {
    throw new Error(`Inference proposal status is not 'detected': ${proposal.status}`);
  }
  console.log(`✅ Inference proposal: status=${proposal.status}, visual_id=${proposal.visual_id}`);

  // ── Step 4: Build Firebase config ─────────────────────────────────────────
  const firebaseConfig = {
    apiKey:     process.env.VITE_FIREBASE_API_KEY,
    projectId:  process.env.VITE_FIREBASE_PROJECT_ID,
    appId:      process.env.VITE_FIREBASE_APP_ID,
    authDomain: 'semicontent-e195b.firebaseapp.com',
  };
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
    throw new Error('Missing Firebase env vars (VITE_FIREBASE_API_KEY / PROJECT_ID / APP_ID).');
  }
  console.log('✅ Firebase config: apiKey present, projectId='+firebaseConfig.projectId);

  // ── Step 5: Create repository ──────────────────────────────────────────────
  const { repository, backup } = createCharacterRepository(firebaseConfig, BACKUP_DIR);

  // ── Step 6: Read current project from Firestore ───────────────────────────
  console.log('\nReading project from Firestore...');
  const before = await repository.read(PROJECT_ID);
  if (before.id !== PROJECT_ID || before.projectType !== 'full-ai') {
    throw new Error('Project sanity check failed: wrong id or projectType.');
  }
  const fingerprint = projectFingerprint(before);
  console.log(`✅ Project read OK. Fingerprint: ${fingerprint.slice(0, 16)}...`);
  console.log(`   Characters: ${before.characters.map(c => c.id + '/' + c.name).join(', ')}`);
  console.log(`   Scene count: ${before.data.length}`);

  // Verify char_1 has expected name and no prior characterIdentity
  const char1 = before.characters.find(c => c.id === CHARACTER_ID);
  if (!char1) throw new Error('char_1 not found in live project.');
  if (char1.characterIdentity) {
    throw new Error(`char_1 already has characterIdentity — unexpected. Aborting.\n${JSON.stringify(char1.characterIdentity, null, 2)}`);
  }
  console.log(`✅ char_1 name="${char1.name}", no prior characterIdentity`);

  // Count matching scenes
  const matching = before.data.filter(s => s.Character === 'Thẩm phán');
  console.log(`   Scenes with Character="Thẩm phán": ${matching.map(s => s.scene_n).join(', ')} (${matching.length})`);
  if (matching.length !== 8) {
    throw new Error(`Expected 8 matching scenes, found ${matching.length}. Aborting.`);
  }

  // ── Step 7: Backup before write ───────────────────────────────────────────
  console.log('\nBacking up project before write...');
  await backup(PROJECT_ID, before, fingerprint);
  console.log(`✅ Backup written to: ${BACKUP_DIR}`);

  // ── Step 8: Run migrateCharacterIdentity (in-memory) ─────────────────────
  console.log('\nRunning migrateCharacterIdentity (in-memory, no Firestore write yet)...');
  const jobId = 'b'.repeat(48);
  const confirmedAt = Date.now();
  const migration = migrateCharacterIdentity(JSON.parse(JSON.stringify(before)), {
    projectId:          PROJECT_ID,
    ownerHash:          OWNER_HASH,
    characterId:        CHARACTER_ID,
    proposal,
    confirmedId:        CONFIRMED_ID,
    referenceImage,
    confirmedAt,
    jobId,
    expectedPreviousId: null,
  });
  console.log(`✅ Migration computed. Changed: ${migration.changed.map(c => c.sceneId).join(', ')}`);

  // Verify only expected scenes changed
  const changedIds = migration.changed.map(c => c.sceneId).sort((a,b)=>a-b);
  if (JSON.stringify(changedIds) !== JSON.stringify([...EXPECTED_SCENES].sort((a,b)=>a-b))) {
    throw new Error(`Changed scene IDs mismatch. Got: ${changedIds}. Expected: ${EXPECTED_SCENES}`);
  }
  for (const c of migration.changed) {
    if (c.before !== 'Thẩm phán' || c.after !== CONFIRMED_ID) {
      throw new Error(`Scene ${c.sceneId}: unexpected change ${JSON.stringify(c)}`);
    }
  }

  // Verify no non-Character fields changed
  for (let i = 0; i < before.data.length; i++) {
    const { Character: _a, ...restA } = before.data[i];
    const { Character: _b, ...restB } = migration.data[i];
    if (canonicalIdentity(restA) !== canonicalIdentity(restB)) {
      throw new Error(`Scene ${before.data[i].scene_n}: non-Character fields mutated — aborting.`);
    }
  }
  console.log('✅ No non-Character fields affected');

  // Verify video URLs preserved
  for (const scene of migration.data) {
    const orig = before.data.find(s => s.scene_n === scene.scene_n);
    if (orig?.videoUrl && orig.videoUrl !== scene.videoUrl) {
      throw new Error(`Scene ${scene.scene_n} videoUrl changed — aborting.`);
    }
  }
  console.log('✅ All videoUrls preserved');

  // ── Step 9: Commit to Firestore via transaction ──────────────────────────
  console.log('\nCommitting to Firestore via optimistic transaction...');
  const saved = await repository.commit(PROJECT_ID, fingerprint, {
    data:       migration.data,
    characters: migration.characters,
  });
  console.log('✅ Firestore commit succeeded');

  // ── Step 10: Reload and verify ────────────────────────────────────────────
  console.log('\nReloading project from Firestore (independent read)...');
  const reloaded = await repository.read(PROJECT_ID);

  const confirmedScenes = reloaded.data.filter(s =>
    Object.hasOwn(s, 'Character') && s.Character === CONFIRMED_ID);
  const remainingOriginal = reloaded.data.filter(s =>
    Object.hasOwn(s, 'Character') && s.Character === 'Thẩm phán');

  console.log(`   Scenes with confirmedId (${CONFIRMED_ID.slice(0,20)}...): ${confirmedScenes.map(s=>s.scene_n).join(', ')} (${confirmedScenes.length})`);
  console.log(`   Scenes still with "Thẩm phán": ${remainingOriginal.length}`);

  if (confirmedScenes.length !== 8) throw new Error(`Reload: expected 8 confirmed scenes, got ${confirmedScenes.length}`);
  if (remainingOriginal.length !== 0) throw new Error(`Reload: ${remainingOriginal.length} scenes still have old name`);

  const char1Reloaded = reloaded.characters.find(c => c.id === CHARACTER_ID);
  const ci = char1Reloaded?.characterIdentity;
  if (!ci || ci.confirmedId !== CONFIRMED_ID || ci.status !== 'confirmed') {
    throw new Error(`Reloaded characterIdentity wrong: ${JSON.stringify(ci)}`);
  }
  console.log(`✅ characterIdentity.confirmedId = "${ci.confirmedId}"`);
  console.log(`✅ characterIdentity.status      = "${ci.status}"`);
  console.log(`✅ characterIdentity.originalName= "${ci.originalName}"`);

  // ── Step 11: Scene 3 Seedance prompt verification ─────────────────────────
  console.log('\nVerifying Scene 3 Seedance prompt...');
  const scene3 = reloaded.data.find(s => s.scene_n === 3);
  if (!scene3) throw new Error('Scene 3 not found in reloaded project.');
  const composed = composeScene(scene3);
  const promptHasId      = composed.prompt.includes('CHARACTER:\n' + CONFIRMED_ID);
  const promptHasOld     = composed.prompt.includes('Thẩm phán');
  const promptHasDup     = composed.prompt.includes('ORIGINAL CHARACTER') || composed.prompt.includes('VISUAL PROFILE');
  if (!promptHasId)  throw new Error('Scene 3 prompt does NOT contain confirmed CHARACTER ID.');
  if (promptHasOld)  throw new Error('Scene 3 prompt still contains "Thẩm phán".');
  if (promptHasDup)  throw new Error('Scene 3 prompt has duplicate section header.');
  console.log(`✅ Scene 3 prompt contains: CHARACTER:\\n${CONFIRMED_ID}`);
  console.log(`✅ Scene 3 prompt: no "Thẩm phán", no duplicate section`);

  // ── Step 12: Cross-scene Seedance consistency ─────────────────────────────
  console.log('\nCross-scene CHARACTER consistency check...');
  for (const sceneN of EXPECTED_SCENES) {
    const s = reloaded.data.find(x => x.scene_n === sceneN);
    if (!s) throw new Error(`Scene ${sceneN} not found in reloaded data.`);
    if (s.Character !== CONFIRMED_ID) throw new Error(`Scene ${sceneN}: Character="${s.Character}"`);
    const c = composeScene(s);
    if (!c.prompt.includes('CHARACTER:\n' + CONFIRMED_ID)) {
      throw new Error(`Scene ${sceneN} prompt does not contain confirmed ID.`);
    }
    console.log(`   Scene ${sceneN}: ✅`);
  }

  // ── Step 13: Generate All preflight compatibility ─────────────────────────
  // Verify scenes not in EXPECTED_SCENES have unchanged Character fields
  console.log('\nGenerate All compatibility: verifying unrelated scenes untouched...');
  for (const scene of reloaded.data) {
    if (EXPECTED_SCENES.includes(scene.scene_n)) continue;
    const orig = before.data.find(s => s.scene_n === scene.scene_n);
    if (!orig) continue;
    if (Object.hasOwn(scene, 'Character') && scene.Character !== orig.Character) {
      throw new Error(`Scene ${scene.scene_n} (not in target set) was unexpectedly modified.`);
    }
  }
  console.log('✅ All non-target scenes untouched');

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('  QWEN CHARACTER SET ID — PERSISTENCE COMPLETE');
  console.log('═══════════════════════════════════════════════');
  console.log(`  confirmedId   : ${CONFIRMED_ID}`);
  console.log(`  originalName  : ${ci.originalName}`);
  console.log(`  scenes updated: ${EXPECTED_SCENES.join(', ')}`);
  console.log(`  confirmedAt   : ${new Date(ci.confirmedAt).toISOString()}`);
  console.log(`  ref sha256    : ${ci.referenceImage.sha256.slice(0, 20)}...`);
  console.log('═══════════════════════════════════════════════');

  return { success: true };
}

main().then(r => {
  if (r.success) process.exit(0);
}).catch(err => {
  console.error('\n❌ PERSISTENCE FAILED:', err.message);
  process.exit(1);
});
