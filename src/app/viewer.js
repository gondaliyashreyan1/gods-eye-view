import * as Cesium from 'cesium';

/** Create the standard globe viewer in caller-owned, visible containers. */
export function createApplicationViewer({ container, creditContainer }) {
  if (!container || !creditContainer)
    throw new TypeError('Viewer and credit containers are required');
  const viewer = new Cesium.Viewer(container, {
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    vrButton: false,
    selectionIndicator: false,
    infoBox: false,
    baseLayer: false,
    creditContainer,
    msaaSamples: 1,
    contextOptions: { webgl: { preserveDrawingBuffer: false } },
  });
  try {
    configureAdaptiveAntiAliasing(viewer.scene);

    // Uncapped targetFrameRate enables display hardware VSync (e.g. 60Hz or 120Hz ProMotion)
    viewer.targetFrameRate = undefined;
    viewer.scene.globe.show = false;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.skyAtmosphere.atmosphereLightIntensity = 18;
    viewer.scene.skyAtmosphere.saturationShift = -0.12;
    viewer.scene.skyAtmosphere.brightnessShift = -0.08;
    return viewer;
  } catch (error) {
    viewer.destroy();
    throw error;
  }
}

/**
 * Configures FXAA to run only when needed (standard-DPI displays).
 * On high-DPI displays (DPR >= 2.0), physical pixel density renders anti-aliasing imperceptible,
 * so disabling FXAA eliminates unnecessary post-processing shader passes.
 *
 * @param {object} scene
 * @param {number} [devicePixelRatio]
 * @returns {boolean} Whether FXAA is enabled
 */
export function configureAdaptiveAntiAliasing(scene, devicePixelRatio) {
  if (!scene?.postProcessStages?.fxaa) return false;
  const dpr =
    devicePixelRatio !== undefined
      ? devicePixelRatio
      : typeof window !== 'undefined'
        ? window.devicePixelRatio || 1
        : 1;
  const needed = dpr < 2.0;
  scene.postProcessStages.fxaa.enabled = needed;
  return needed;
}
