import test from 'node:test';
import assert from 'node:assert/strict';
import { installCinematicPipeline } from './cinematicPipeline.js';

test('installCinematicPipeline configures HDR, ACES tonemapping and bloom on viewer', () => {
  const addedStages = [];
  const removedStages = [];
  const fakeAcesStage = { id: 'aces' };

  const fakeViewer = {
    isDestroyed: () => false,
    scene: {
      highDynamicRange: false,
      light: null,
      globe: { enableLighting: false },
      postProcessStages: {
        bloom: { enabled: false, uniforms: {} },
        add: (stage) => addedStages.push(stage),
        remove: (stage) => removedStages.push(stage),
      },
    },
  };

  const fakeCesium = {
    SunLight: class {
      constructor() {
        this.type = 'sun';
      }
    },
    PostProcessStageLibrary: {
      createAcesTonemappingStage: () => fakeAcesStage,
    },
  };

  const uninstall = installCinematicPipeline(fakeViewer, { Cesium: fakeCesium });

  assert.equal(fakeViewer.scene.highDynamicRange, true, 'HDR must be enabled');
  assert.equal(fakeViewer.scene.globe.enableLighting, true, 'Globe lighting must be enabled');
  assert.equal(fakeViewer.scene.light.type, 'sun', 'Light must be Cesium.SunLight');
  assert.equal(fakeViewer.scene.postProcessStages.bloom.enabled, true, 'Bloom must be enabled');
  assert.equal(addedStages.length, 1, 'ACES stage must be added');
  assert.equal(addedStages[0], fakeAcesStage);

  uninstall();

  assert.equal(removedStages.length, 1, 'ACES stage must be removed on uninstall');
  assert.equal(fakeViewer.scene.postProcessStages.bloom.enabled, false, 'Bloom disabled on teardown');
  assert.equal(fakeViewer.scene.highDynamicRange, false, 'HDR reset on teardown');
});

test('installCinematicPipeline throws on invalid viewer', () => {
  assert.throws(() => installCinematicPipeline(null), TypeError);
  assert.throws(() => installCinematicPipeline({}), TypeError);
});
