import * as DefaultCesium from 'cesium';

/**
 * Controller for Cesium's official ParticleSystem driven by live meteorology.
 * Uses official Cesium.ParticleSystem and Cesium.BoxEmitter primitives.
 *
 * @param {Cesium.Viewer} viewer
 * @param {{Cesium?: Object}} [options]
 */
export function createWeatherParticleController(viewer, options = {}) {
  if (!viewer?.scene) {
    throw new TypeError('createWeatherParticleController requires a Cesium viewer');
  }

  const Cesium = options.Cesium || DefaultCesium;
  const scene = viewer.scene;

  let particleSystem = null;

  function ensureParticleSystem(isSnow = false) {
    if (particleSystem && !particleSystem.isDestroyed()) {
      return particleSystem;
    }

    const emitterDimensions = Cesium.Cartesian3.fromElements(40.0, 40.0, 20.0);
    const emitter = new Cesium.BoxEmitter(emitterDimensions);

    particleSystem = new Cesium.ParticleSystem({
      emitter,
      emissionRate: 0,
      particleLife: 1.2,
      speed: isSnow ? 3.0 : 18.0,
      imageSize: new Cesium.Cartesian2(isSnow ? 8.0 : 2.0, isSnow ? 8.0 : 16.0),
      startColor: Cesium.Color.WHITE.withAlpha(0.6),
      endColor: Cesium.Color.WHITE.withAlpha(0.1),
      loop: true,
      updateCallback: (particle, dt) => {
        // Apply vertical falling motion
        particle.position.z -= (isSnow ? 4.0 : 25.0) * dt;
      },
    });

    scene.primitives.add(particleSystem);
    return particleSystem;
  }

  function updateWeather(meteorology) {
    if (!meteorology) return;

    const isRaining = Boolean(meteorology.isRaining);
    const isSnowing = Boolean(meteorology.isSnowing);
    const precipMm = Number(meteorology.precipitationMm) || 0;

    if (!isRaining && !isSnowing) {
      if (particleSystem) {
        particleSystem.emissionRate = 0;
      }
      return;
    }

    const ps = ensureParticleSystem(isSnowing);
    // Rate scales between 200 and 2000 particles/sec depending on precipitation
    const baseRate = isSnowing ? 150 : 300;
    ps.emissionRate = Math.min(2500, Math.max(baseRate, baseRate * (1 + precipMm)));
  }

  function destroy() {
    if (particleSystem && scene?.primitives) {
      scene.primitives.remove(particleSystem);
      if (!particleSystem.isDestroyed()) {
        particleSystem.destroy();
      }
      particleSystem = null;
    }
  }

  return {
    updateWeather,
    destroy,
    get particleSystem() {
      return particleSystem;
    },
  };
}
