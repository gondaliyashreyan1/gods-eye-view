import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWeatherParticleController,
} from './weatherParticles.js';

test('createWeatherParticleController creates and attaches Cesium ParticleSystem when raining', () => {
  const addedPrimitives = [];
  const removedPrimitives = [];

  const fakeScene = {
    primitives: {
      add: (p) => addedPrimitives.push(p),
      remove: (p) => removedPrimitives.push(p),
    },
    camera: {
      position: { x: 0, y: 0, z: 0 },
    },
  };

  const fakeViewer = {
    isDestroyed: () => false,
    scene: fakeScene,
  };

  class FakeParticleSystem {
    constructor(options) {
      this.options = options;
      this.emissionRate = options.emissionRate;
      this.isDestroyed = () => false;
      this.destroy = () => {};
    }
  }

  const fakeCesium = {
    ParticleSystem: FakeParticleSystem,
    BoxEmitter: class {
      constructor(dim) {
        this.dim = dim;
      }
    },
    Cartesian2: class {
      constructor(x, y) {
        this.x = x;
        this.y = y;
      }
    },
    Cartesian3: {
      fromElements: (x, y, z) => ({ x, y, z }),
    },
    Color: {
      WHITE: { withAlpha: () => 'white_alpha' },
    },
  };

  const controller = createWeatherParticleController(fakeViewer, { Cesium: fakeCesium });

  // Update with active rain
  controller.updateWeather({
    isRaining: true,
    precipitationMm: 5.0,
    wind: { speedKph: 15, directionDeg: 180 },
  });

  assert.equal(addedPrimitives.length, 1, 'ParticleSystem must be added to primitives');
  assert.ok(addedPrimitives[0].emissionRate > 0, 'Emission rate should reflect precipitation');

  // Update with clear weather
  controller.updateWeather({
    isRaining: false,
    precipitationMm: 0,
  });

  assert.equal(addedPrimitives[0].emissionRate, 0, 'Emission rate must drop to 0 in clear weather');

  // Teardown
  controller.destroy();
  assert.equal(removedPrimitives.length, 1, 'ParticleSystem must be removed on destroy');
});
