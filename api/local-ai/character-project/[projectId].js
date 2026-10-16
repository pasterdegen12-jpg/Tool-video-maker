/**
 * /api/local-ai/character-project/[projectId]
 *
 * GET  — returns the current project document + fingerprint for snapshot.
 * POST — confirms the Qwen-proposed character ID, persists to Firestore,
 *        reloads and verifies the saved result.
 *
 * Evidence lookup uses the same in-process bridge instance that handled
 * the /api/local-ai/visual-profile job, so no evidence can be invented.
 *
 * Local-only: integrationEnabled() check is re-enforced here and in
 * character-persistence.js (403 from the grant check).
 */
import process from 'node:process';
import path from 'node:path';
import { integrationEnabled, readConfig } from '../lib/local-ai/config.js';
import { createCharacterPersistence } from '../lib/local-ai/character-persistence.js';
import { createCharacterRepository } from '../lib/local-ai/character-repository.js';
import { BridgeError, sendError } from '../lib/local-ai/errors.js';

// Lazily initialised alongside the visual-profile bridge.
// Import the bridge module so we share the same singleton localHandler
// that stores visual-evidence for completed visual_profile jobs.
let persistence;

export default async function handler(req, res) {
  if (!integrationEnabled(process.env)) {
    return sendError(res, new BridgeError('INTEGRATION_DISABLED'));
  }
  try {
    if (!persistence) {
      const config = readConfig();
      // Read grants table from environment (JSON map of projectId → ownerHash).
      // Format: LOCAL_CHARACTER_GRANTS={"proj_...":"<sha256>"}
      let grants = {};
      try {
        const raw = process.env.LOCAL_CHARACTER_GRANTS;
        if (raw) grants = JSON.parse(raw);
      } catch {
        throw new BridgeError('CONFIGURATION_ERROR');
      }
      const firebaseConfig = {
        apiKey:     process.env.VITE_FIREBASE_API_KEY,
        projectId:  process.env.VITE_FIREBASE_PROJECT_ID,
        appId:      process.env.VITE_FIREBASE_APP_ID,
      };
      const backupDir = process.env.LOCAL_CHARACTER_BACKUP_DIR ||
        path.join(process.cwd(), 'local-character-backups');

      const { repository, backup } = createCharacterRepository(firebaseConfig, backupDir);

      // Import the bridge lazily so the same process module cache is used.
      // bridge.js exports the singleton default handler which carries .visualEvidence().
      const { default: bridgeHandler } = await import('../lib/local-ai/bridge.js');
      const evidence = (jobId, session) => bridgeHandler.visualEvidence(jobId, session);

      persistence = createCharacterPersistence({ config, grants, repository, evidence, backup });
    }
    await persistence(req, res);
  } catch (error) {
    sendError(res, error);
  }
}
