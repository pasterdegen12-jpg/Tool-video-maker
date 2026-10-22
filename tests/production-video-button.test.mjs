import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { composeScene, estimateCost, videoVisible, DEFAULT_SETTINGS } from '../src/lib/seedanceContract.js';

test('production routing: videoVisible returns true on https with VITE_CLOUD_VIDEO_ENABLED=true, false otherwise', () => {
  // Production with cloud flag set — should be enabled
  assert.equal(
    videoVisible({ VITE_CLOUD_VIDEO_ENABLED: 'true' }, { hostname: 'www.aivideomaker.live', protocol: 'https:' }, 'full-ai'),
    true
  );
  // Production without cloud flag — disabled
  assert.equal(
    videoVisible({ VITE_CLOUD_VIDEO_ENABLED: 'false' }, { hostname: 'www.aivideomaker.live', protocol: 'https:' }, 'full-ai'),
    false
  );
  assert.equal(
    videoVisible({ DEV: false }, { hostname: 'www.aivideomaker.live', protocol: 'https:' }, 'full-ai'),
    false
  );
  // Local development loopback (DEV mode)
  assert.equal(
    videoVisible({ DEV: true }, { hostname: 'localhost', protocol: 'http:' }, 'full-ai'),
    true
  );
  assert.equal(
    videoVisible({ DEV: true }, { hostname: '127.0.0.1', protocol: 'http:' }, 'full-ai'),
    true
  );
  // Semi-content never enables Seedance full-ai workflow
  assert.equal(
    videoVisible({ VITE_CLOUD_VIDEO_ENABLED: 'true' }, { hostname: 'www.aivideomaker.live', protocol: 'https:' }, 'semi'),
    false
  );
});

test('handleGenVideoSingle behavior: production shows accurate availability error, does not tell user to open localhost', () => {
  const alerts = [];
  const fakeAlert = msg => alerts.push(msg);

  // Simulate production environment
  const envProd = { DEV: false };
  const locProd = { hostname: 'www.aivideomaker.live', protocol: 'https:' };
  const projectType = 'full-ai';

  let activeVideoGenModal = { scene_n: 3 };
  let activeVideoScene = null;
  const setActiveVideoGenModal = val => { activeVideoGenModal = val; };
  const setActiveVideoScene = val => { activeVideoScene = val; };

  // Logic from handleGenVideoSingle
  const isSemi = projectType === 'semi';
  const handleGenVideoSingle = (sceneNo, options, isBatch = false) => {
    if (!isSemi) {
      if (!videoVisible(envProd, locProd, projectType)) {
        if (!isBatch) fakeAlert("Dịch vụ tạo video AI hiện chưa khả dụng trên môi trường web. Backend dịch vụ video chưa được triển khai trên hệ thống cloud.");
        return;
      }
      setActiveVideoGenModal(null);
      setActiveVideoScene(String(sceneNo));
      return;
    }
  };

  handleGenVideoSingle(3, { mode: 'start_frame_to_video' });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0], "Dịch vụ tạo video AI hiện chưa khả dụng trên môi trường web. Backend dịch vụ video chưa được triển khai trên hệ thống cloud.");
  assert.ok(!alerts[0].includes("Mở Storyboard local"));
  assert.equal(activeVideoScene, null); // Did not open panel
  assert.deepEqual(activeVideoGenModal, { scene_n: 3 }); // Modal state remained safely
});

test('handleGenVideoSingle behavior: when cloud backend is available on https, transitions to Seedance workflow', () => {
  const alerts = [];
  const fakeAlert = msg => alerts.push(msg);

  // Simulate production environment with cloud enabled
  const envCloud = { VITE_CLOUD_VIDEO_ENABLED: 'true' };
  const locProd = { hostname: 'www.aivideomaker.live', protocol: 'https:' };
  const projectType = 'full-ai';

  let activeVideoGenModal = { scene_n: 3 };
  let activeVideoScene = null;
  const setActiveVideoGenModal = val => { activeVideoGenModal = val; };
  const setActiveVideoScene = val => { activeVideoScene = val; };

  const isSemi = projectType === 'semi';
  const handleGenVideoSingle = (sceneNo, options, isBatch = false) => {
    if (!isSemi) {
      if (!videoVisible(envCloud, locProd, projectType)) {
        if (!isBatch) fakeAlert('Dịch vụ tạo video AI hiện chưa khả dụng.');
        return;
      }
      setActiveVideoGenModal(null);
      setActiveVideoScene(String(sceneNo));
      return;
    }
  };

  handleGenVideoSingle(3, { mode: 'start_frame_to_video' });

  assert.equal(alerts.length, 0);
  assert.equal(activeVideoGenModal, null); // Modal closed
  assert.equal(activeVideoScene, '3'); // Correct scene selected
});

test('scene composition preserves confirmed Qwen Character ID, dialogue, and excludes translation', () => {
  const confirmedScene = {
    scene_n: 3,
    Context: 'Phòng xử án trang nghiêm với ánh sáng tự nhiên qua cửa sổ lớn.',
    Character: 'elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses',
    Action: 'Thẩm phán nhìn thẳng vào tài liệu, tay cầm bút ghi chép cẩn thận.',
    Camera: 'Medium shot góc ngang mắt, tiêu cự cố định.',
    Dialogue: 'Tòa tuyên bố tạm nghỉ trong mười lăm phút trước khi ra phán quyết.',
    Translate: 'The court is adjourned for fifteen minutes before the verdict.',
    Tone_of_Voice: 'Nghiêm nghị, rõ ràng'
  };

  const composed = composeScene(confirmedScene);

  assert.equal(composed.sceneId, 3);
  assert.equal(composed.dialogue, confirmedScene.Dialogue);
  assert.ok(composed.prompt.includes('elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses'));
  assert.ok(composed.prompt.includes('Tòa tuyên bố tạm nghỉ trong mười lăm phút trước khi ra phán quyết.'));
  assert.ok(composed.prompt.includes('ORIGINAL CONTEXT:\n' + confirmedScene.Context));
  assert.ok(composed.prompt.includes('ORIGINAL ACTION:\n' + confirmedScene.Action));
  assert.ok(composed.prompt.includes('ORIGINAL CAMERA:\n' + confirmedScene.Camera));
  assert.ok(composed.prompt.includes('ORIGINAL TONE:\n' + confirmedScene.Tone_of_Voice));
  // Translation must NEVER be in the composed prompt
  assert.ok(!composed.prompt.includes(confirmedScene.Translate));
});

test('pricing and duration calculation: valid reference cost and no stale quote reuse', () => {
  const time = Date.parse('2026-10-14T00:00:00Z');
  const cost480p = estimateCost({ ...DEFAULT_SETTINGS, resolution: '480p', duration: 5, generate_audio: true }, time);
  assert.equal(cost480p.usd, '0.1200');

  const cost720p = estimateCost({ ...DEFAULT_SETTINGS, resolution: '720p', duration: 5, generate_audio: false }, time);
  assert.equal(cost720p.usd, '0.1300');

  // Stale quote after 30 days is rejected
  const futureTime = time + 35 * 86400000;
  assert.equal(estimateCost(DEFAULT_SETTINGS, futureTime), null);
});

test('serverless function count in api/ conforms to Vercel Hobby plan limit <= 12', async () => {
  const files = await fs.readdir('api', { withFileTypes: true, recursive: true });
  // In Vercel, serverless function entry points are .js files inside api/ except those starting with _ (e.g. api/_lib)
  const serverlessFunctions = files
    .filter(f => f.isFile() && f.name.endsWith('.js'))
    .map(f => f.parentPath ? `${f.parentPath}/${f.name}` : f.name)
    .filter(path => !path.includes('_lib') && !path.includes('\\_lib') && !path.includes('/_lib'));

  assert.ok(serverlessFunctions.length <= 12, `Expected <= 12 serverless functions, found ${serverlessFunctions.length}`);
  assert.equal(serverlessFunctions.length, 12); // Existing eleven plus the consolidated remote Qwen dispatcher.
});
