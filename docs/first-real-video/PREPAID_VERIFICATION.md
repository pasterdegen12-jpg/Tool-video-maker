# Prepaid verification — 2026-10-16

Generation NOT RUN. Fresh informed operator approval is still required. Paid flag remains false.

- Dedicated key replaced privately by operator; read-only balance check HTTP 200. No credential value stored in this report.
- New single-use retry authorization links a new durable attempt to a verified pre-prediction FAILED predecessor. Both consents, exact payload, fresh quote, same Clerk user/session, paid flag and authorization ID are enforced. No automatic submit.
- Original attempt 453784079c656769af51a6b6effc04bc6e91163f80b4e722 remains FAILED; SHA-256 98a773ecb93a291413c71d1cdd4673450bf281539780d73f82d4f403e1521d2c. Timeline QUOTED→UPLOADING→FAILED; provider ID null.
- Historical pre-journal UNKNOWN remains unresolved and must be disclosed before fresh approval.
- Source backups: before/ and before-manifest.json. Changes: retry.js, journal.js, service.js, errors.js, seedanceClient.js, SeedanceScenePanel.jsx; retry and UI tests. No audio/Gateway/Cooking/GPU/Firestore/deployment change.
- Focused tests: 20 backend + 22 UI/client PASS. Full suite 314/314 PASS. Targeted lint PASS. Isolated build with frontend/backend keys empty PASS; bundle-size warning only. No matching live-key pattern in built JS. Automated provider responses are mocks.
- Commands: node --test tests/seedance-retry.test.mjs; node --experimental-vm-modules --test tests/seedance-ui.test.mjs tests/seedance-client.test.mjs; npm test; node node_modules/eslint/bin/eslint.js api/lib/seedance/retry.js api/lib/seedance/journal.js api/lib/seedance/service.js api/lib/seedance/errors.js src/lib/seedanceClient.js src/Workspace/SeedanceScenePanel.jsx; node docs/first-real-video/build-safe.mjs. First sandbox UI test launch failed EPERM, rerun with process permission passed.
- Backend restarted safely: PID 10016, 127.0.0.1:8790. Vite PID 1548, 127.0.0.1:5173. No LAN binding. .env.video.local is Git-ignored.
- Real Clerk recovery UI found predecessor FAILED. Real quote accepted exact image/prompt; first quote had default camera_fixed=false, was invalidated by selecting true, and must not be used. Capacity gate respected while waiting for old quote expiry.
- Price documentation checked 2026-10-16: 480p with audio $0.12/5 seconds, linear duration; six seconds estimate $0.1440. Source: https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-v1.5-pro-image-to-video . Estimate is not confirmed billing.
- Restore/revert only with preserved backups and journal evidence; older code does not understand retry field, so never strip retry history to make old code accept it. Keep paid disabled during any rollback.

Final real UI quote accepted duration=6, resolution=480p, aspect_ratio=16:9, generate_audio=true, camera_fixed=true, seed=-1; USD0.1440; exact known image/prompt hashes and predecessor ID displayed. Both consent controls tested and returned unchecked; retry authorization and Generate remained disabled with paid=false. Scene DOM remained byte-for-byte equal. Evidence: preapproval-panel.txt, preapproval-scene3.png, scene3-original-ui.txt, scene3-exact-prompt.txt, preapproval-journal.json. No provider upload or prediction performed in this task. Fresh approval pending; obtain another fresh quote after enabling and restart.
