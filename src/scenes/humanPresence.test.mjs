import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHumanEyeCartesian,
  createHumanPresenceController,
} from './humanPresence.js';

test('calculateHumanEyeCartesian computes cartesian at ground elevation + 1.7m', () => {
  const fakeCesium = {
    Cartesian3: {
      fromDegrees: (lon, lat, height) => ({ lon, lat, height }),
    },
  };

  const pos = calculateHumanEyeCartesian(37.7749, -122.4194, 25.0, { Cesium: fakeCesium });
  assert.equal(pos.lat, 37.7749);
  assert.equal(pos.lon, -122.4194);
  assert.equal(pos.height, 26.7, 'Height must be exactly ground (25.0m) + 1.7m');
});

test('createHumanPresenceController transitions camera to 1.7m and restores on exit', async () => {
  let flownTo = null;
  const originalFov = 1.047; // 60 deg

  const fakeCamera = {
    position: { x: 100, y: 200, z: 300 },
    heading: 0,
    pitch: -0.5,
    roll: 0,
    frustum: { fov: originalFov },
    flyTo: (options) => {
      flownTo = options;
      options.complete?.();
    },
  };

  const fakeScene = {
    camera: fakeCamera,
    globe: {
      getHeight: () => 15.0,
    },
  };

  const fakeViewer = {
    isDestroyed: () => false,
    scene: fakeScene,
    camera: fakeCamera,
  };

  const fakeCesium = {
    Cartesian3: {
      fromDegrees: (lon, lat, height) => ({ lon, lat, height }),
    },
    Cartographic: {
      fromDegrees: (lon, lat) => ({ lon, lat }),
    },
    Math: {
      toRadians: (deg) => (deg * Math.PI) / 180,
    },
  };

  const controller = createHumanPresenceController(fakeViewer, { Cesium: fakeCesium });
  await controller.dropIn(37.7749, -122.4194);

  assert.ok(flownTo !== null, 'Camera flyTo must be invoked');
  assert.equal(flownTo.destination.height, 16.7, 'Target destination must be ground + 1.7m');
  assert.ok(fakeCamera.frustum.fov < 1.05, 'Human FOV must be set');

  // Exit drop-in
  await controller.exit();
  assert.equal(fakeCamera.frustum.fov, originalFov, 'Original FOV must be restored on exit');
});
