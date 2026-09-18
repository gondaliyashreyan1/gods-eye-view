import test from 'node:test';
import assert from 'node:assert/strict';
import { configureAdaptiveAntiAliasing } from './viewer.js';

test('configureAdaptiveAntiAliasing enables FXAA on standard-DPI screens (< 2.0 DPR)', () => {
  const fakeScene = {
    postProcessStages: {
      fxaa: { enabled: false },
    },
  };

  const enabledStandard = configureAdaptiveAntiAliasing(fakeScene, 1.0);
  assert.equal(enabledStandard, true);
  assert.equal(fakeScene.postProcessStages.fxaa.enabled, true);

  const enabledHalf = configureAdaptiveAntiAliasing(fakeScene, 1.5);
  assert.equal(enabledHalf, true);
  assert.equal(fakeScene.postProcessStages.fxaa.enabled, true);
});

test('configureAdaptiveAntiAliasing disables FXAA on high-DPI/Retina screens (>= 2.0 DPR) to save GPU cycles', () => {
  const fakeScene = {
    postProcessStages: {
      fxaa: { enabled: true },
    },
  };

  const enabledRetina = configureAdaptiveAntiAliasing(fakeScene, 2.0);
  assert.equal(enabledRetina, false);
  assert.equal(fakeScene.postProcessStages.fxaa.enabled, false);

  const enabledHighDpi = configureAdaptiveAntiAliasing(fakeScene, 3.0);
  assert.equal(enabledHighDpi, false);
  assert.equal(fakeScene.postProcessStages.fxaa.enabled, false);
});

test('configureAdaptiveAntiAliasing handles missing postProcessStages safely', () => {
  assert.equal(configureAdaptiveAntiAliasing(null), false);
  assert.equal(configureAdaptiveAntiAliasing({}), false);
  assert.equal(configureAdaptiveAntiAliasing({ postProcessStages: {} }), false);
});
