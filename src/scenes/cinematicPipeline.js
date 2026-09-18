import * as DefaultCesium from 'cesium';
import { evaluateCelestialVisibility } from './bortleScale.js';

/**
 * Installs Cesium's official cinematic post-processing pipeline:
 *  - 16-bit High Dynamic Range (HDR)
 *  - ACES Filmic tonemapping stage
 *  - Specular bloom
 *  - Physical SunLight and globe illumination
 *
 * All operations use official Cesium library APIs without hand-rolled math.
 *
 * @param {Cesium.Viewer} viewer
 * @param {{Cesium?: Object}} [options]
 * @returns {() => void} Cleanup function restoring previous configuration
 */
export function installCinematicPipeline(viewer, options = {}) {
  if (!viewer?.scene) {
    throw new TypeError('installCinematicPipeline requires a Cesium viewer');
  }

  const Cesium = options.Cesium || DefaultCesium;
  const scene = viewer.scene;

  const previousHdr = scene.highDynamicRange;
  const previousLighting = scene.globe?.enableLighting ?? false;
  const previousBloom = scene.postProcessStages?.bloom?.enabled ?? false;

  // 1. Enable 16-bit High Dynamic Range
  scene.highDynamicRange = true;

  // 2. Enable solar directional illumination
  if (scene.globe) {
    scene.globe.enableLighting = true;
  }
  scene.light = new Cesium.SunLight();

  // 3. Configure Cesium native bloom stage
  if (scene.postProcessStages?.bloom) {
    scene.postProcessStages.bloom.enabled = true;
    const uniforms = scene.postProcessStages.bloom.uniforms;
    if (uniforms) {
      uniforms.contrast = 128;
      uniforms.brightness = -0.3;
      uniforms.delta = 1.0;
      uniforms.sigma = 2.0;
      uniforms.stepSize = 1.0;
    }
  }

  // 4. Attach official ACES tonemapping stage
  let acesStage = null;
  if (Cesium.PostProcessStageLibrary?.createAcesTonemappingStage && scene.postProcessStages) {
    try {
      acesStage = Cesium.PostProcessStageLibrary.createAcesTonemappingStage();
      scene.postProcessStages.add(acesStage);
    } catch {
      // Graceful fallback if stage is unsupported in test/mock environment
    }
  }

  // 5. Physically accurate Bortle scale & atmospheric star extinction
  function onPreRender() {
    if (!scene.skyBox) return;
    const celestial = evaluateCelestialVisibility(viewer, { Cesium, bortleOverride: options.bortleOverride });
    scene.skyBox.show = celestial.starsVisible;
  }
  if (scene.preRender?.addEventListener) {
    scene.preRender.addEventListener(onPreRender);
  }

  return function uninstall() {
    if (!viewer.isDestroyed() && viewer.scene) {
      if (viewer.scene.preRender?.removeEventListener) {
        viewer.scene.preRender.removeEventListener(onPreRender);
      }
      if (viewer.scene.skyBox) {
        viewer.scene.skyBox.show = true;
      }
      if (acesStage && viewer.scene.postProcessStages) {
        try {
          viewer.scene.postProcessStages.remove(acesStage);
        } catch {
          // Ignore
        }
      }
      if (viewer.scene.postProcessStages?.bloom) {
        viewer.scene.postProcessStages.bloom.enabled = previousBloom;
      }
      if (viewer.scene.globe) {
        viewer.scene.globe.enableLighting = previousLighting;
      }
      viewer.scene.highDynamicRange = previousHdr;
    }
  };
}
