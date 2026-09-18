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

test('createHumanPresenceController transitions camera to 1.7m, enables walking, and restores on exit', async () => {
  let flownTo = null;
  let moveForwardCalled = 0;
  const originalFov = 1.047; // 60 deg
  const listeners = [];

  const fakeCamera = {
    position: { x: 100, y: 200, z: 300 },
    positionCartographic: { longitude: -2.1, latitude: 0.6, height: 16.7 },
    heading: 0,
    pitch: -0.5,
    roll: 0,
    frustum: { fov: originalFov },
    flyTo: (options) => {
      flownTo = options;
      options.complete?.();
    },
    moveForward: (dist) => {
      moveForwardCalled += dist;
    },
    moveBackward: () => {},
    moveLeft: () => {},
    moveRight: () => {},
  };

  const fakeScene = {
    camera: fakeCamera,
    globe: {
      getHeight: () => 15.0,
    },
    screenSpaceCameraController: {
      enableRotate: true,
      enableLook: true,
      enableTranslate: true,
    },
    preRender: {
      addEventListener: (fn) => listeners.push(fn),
      removeEventListener: (fn) => {
        const idx = listeners.indexOf(fn);
        if (idx !== -1) listeners.splice(idx, 1);
      },
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
      fromRadians: (lon, lat, height) => ({ lon, lat, height }),
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
  assert.equal(fakeScene.screenSpaceCameraController.enableRotate, false, 'Rotate disabled for first-person look');
  assert.equal(listeners.length, 1, 'Walk preRender listener installed');

  // Trigger walk tick with forward key
  controller._triggerKeyForTest('KeyW', true);
  listeners[0]();
  assert.ok(moveForwardCalled > 0, 'moveForward must be called when KeyW is down');

  // Release key
  controller._triggerKeyForTest('KeyW', false);

  // Exit drop-in
  await controller.exit();
  assert.equal(fakeCamera.frustum.fov, originalFov, 'Original FOV must be restored on exit');
  assert.equal(fakeScene.screenSpaceCameraController.enableRotate, true, 'Rotate re-enabled on exit');
  assert.equal(listeners.length, 0, 'Walk preRender listener removed on exit');
});

test('createHumanPresenceController preserves stars in Big Bend (Bortle 1) and hides stars in Austin', async () => {
  const fakeCamera = {
    position: { x: 100, y: 200, z: 300 },
    positionCartographic: { longitude: -103.25, latitude: 29.25, height: 600 },
    flyTo: (opts) => opts.complete?.(),
  };

  const fakeScene = {
    camera: fakeCamera,
    skyBox: { show: true },
    screenSpaceCameraController: {},
    preRender: { addEventListener: () => {}, removeEventListener: () => {} },
  };

  const fakeViewer = {
    isDestroyed: () => false,
    scene: fakeScene,
    camera: fakeCamera,
  };

  const fakeCesium = {
    Cartesian3: {
      fromDegrees: (lon, lat, h) => ({ lon, lat, h }),
      fromRadians: (lon, lat, h) => ({ lon, lat, h }),
    },
    Cartographic: { fromDegrees: (lon, lat) => ({ lon, lat }) },
    Math: { toRadians: (d) => (d * Math.PI) / 180 },
  };

  const controller = createHumanPresenceController(fakeViewer, { Cesium: fakeCesium });

  // 1. Drop into Big Bend at night (Bortle 1)
  fakeCamera.positionCartographic.latitude = (29.25 * Math.PI) / 180;
  fakeCamera.positionCartographic.longitude = (-103.25 * Math.PI) / 180;
  await controller.dropIn(29.25, -103.25);
  assert.equal(fakeScene.skyBox.show, true, 'Stars MUST remain visible in Big Bend Bortle 1!');

  // 2. Drop into Austin at night (Bortle 8)
  fakeCamera.positionCartographic.latitude = (30.2672 * Math.PI) / 180;
  fakeCamera.positionCartographic.longitude = (-97.7431 * Math.PI) / 180;
  await controller.dropIn(30.2672, -97.7431);
  assert.equal(fakeScene.skyBox.show, false, 'Stars MUST be extinguished in Austin due to light pollution!');
});

test('createHumanPresenceController updates heading and pitch on mouse drag', async () => {
  let viewSet = null;
  const fakeCamera = {
    position: { x: 100, y: 200, z: 300 },
    positionCartographic: { longitude: -97.7431, latitude: 30.2672, height: 200 },
    heading: 1.0,
    pitch: -0.1,
    roll: 0,
    flyTo: (opts) => opts.complete?.(),
    setView: (opts) => {
      viewSet = opts;
    },
  };

  const fakeScene = {
    camera: fakeCamera,
    skyBox: { show: true },
    screenSpaceCameraController: {},
    preRender: { addEventListener: () => {}, removeEventListener: () => {} },
  };

  const fakeViewer = {
    isDestroyed: () => false,
    scene: fakeScene,
    camera: fakeCamera,
  };

  const fakeCesium = {
    Cartesian3: {
      fromDegrees: (lon, lat, h) => ({ lon, lat, h }),
      fromRadians: (lon, lat, h) => ({ lon, lat, h }),
    },
    Cartographic: { fromDegrees: (lon, lat) => ({ lon, lat }) },
    Math: {
      toRadians: (d) => (d * Math.PI) / 180,
    },
  };

  const controller = createHumanPresenceController(fakeViewer, { Cesium: fakeCesium });
  await controller.dropIn(30.2672, -97.7431);

  // Simulate mouse drag: dx = 50px right, dy = -30px up
  controller._triggerMouseDragForTest(50, -30);

  assert.ok(viewSet !== null, 'setView must be invoked on mouse drag');
  assert.ok(viewSet.orientation.heading > 1.0, 'Heading must increase when looking right');
  assert.ok(viewSet.orientation.pitch > -0.1, 'Pitch must increase when looking up');
  assert.equal(viewSet.orientation.roll, 0.0, 'Roll must remain 0 to keep horizon level');
});


