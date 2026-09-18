import * as DefaultCesium from 'cesium';

const HUMAN_EYE_HEIGHT_M = 1.7;
const HUMAN_EYE_FOV_DEG = 58.0;

/**
 * Calculates human eye Cartesian position using Cesium library primitives.
 */
export function calculateHumanEyeCartesian(latitude, longitude, groundElevationM = 0, options = {}) {
  const Cesium = options.Cesium || DefaultCesium;
  const targetHeight = (Number(groundElevationM) || 0) + HUMAN_EYE_HEIGHT_M;
  return Cesium.Cartesian3.fromDegrees(longitude, latitude, targetHeight);
}

/**
 * First-person 1.7m ground presence controller.
 * Smoothly drops camera to pedestrian eye-level and restores previous perspective on exit.
 *
 * @param {Cesium.Viewer} viewer
 * @param {{Cesium?: Object}} [options]
 */
export function createHumanPresenceController(viewer, options = {}) {
  if (!viewer?.scene) {
    throw new TypeError('createHumanPresenceController requires a Cesium viewer');
  }

  const Cesium = options.Cesium || DefaultCesium;
  const scene = viewer.scene;
  const camera = viewer.camera || scene.camera;

  let isDroppedIn = false;
  let savedCameraState = null;

  async function dropIn(latitude, longitude, { surfaceHeightM, heading = 0, duration = 2.0 } = {}) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new TypeError('Valid latitude and longitude are required to drop in');
    }

    console.log(`[DropIn] Dropping in to lat=${latitude.toFixed(5)}, lon=${longitude.toFixed(5)}`);

    // Save previous camera state for clean restoration
    savedCameraState = {
      position: camera.position ? { ...camera.position } : null,
      heading: camera.heading,
      pitch: camera.pitch,
      roll: camera.roll,
      fov: camera.frustum?.fov,
    };

    let groundElevation = Number.isFinite(surfaceHeightM) ? surfaceHeightM : 0;
    if (!Number.isFinite(surfaceHeightM)) {
      if (scene.globe?.getHeight && Cesium.Cartographic?.fromDegrees) {
        const carto = Cesium.Cartographic.fromDegrees(longitude, latitude);
        const h = scene.globe.getHeight(carto);
        if (Number.isFinite(h)) {
          groundElevation = Math.max(0, h);
        }
      }
    }

    console.log(`[DropIn] Ground elevation resolved: ${groundElevation.toFixed(1)}m AGL`);
    const destination = calculateHumanEyeCartesian(latitude, longitude, groundElevation, { Cesium });

    // Apply human eye FOV (~58 deg vertical)
    if (camera.frustum && Cesium.Math?.toRadians) {
      camera.frustum.fov = Cesium.Math.toRadians(HUMAN_EYE_FOV_DEG);
    }

    // Configure screen space camera controller for first-person look
    const sscc = scene.screenSpaceCameraController;
    if (sscc) {
      sscc.enableRotate = false;
      sscc.enableLook = true;
      sscc.enableTranslate = false;
    }

    return new Promise((resolve) => {
      camera.flyTo({
        destination,
        orientation: {
          heading: heading || camera.heading || 0,
          pitch: -0.05, // Horizontal pedestrian gaze
          roll: 0.0,
        },
        duration,
        complete: () => {
          isDroppedIn = true;
          console.log('[DropIn] Successfully arrived at 1.7m human eye level');
          resolve({ latitude, longitude, height: groundElevation + HUMAN_EYE_HEIGHT_M });
        },
      });
    });
  }

  async function exit({ duration = 1.5 } = {}) {
    if (!isDroppedIn || !savedCameraState) return;

    console.log('[DropIn] Exiting drop-in mode, restoring orbital view');

    if (savedCameraState.fov && camera.frustum) {
      camera.frustum.fov = savedCameraState.fov;
    }

    const sscc = scene.screenSpaceCameraController;
    if (sscc) {
      sscc.enableRotate = true;
      sscc.enableLook = true;
      sscc.enableTranslate = true;
    }

    return new Promise((resolve) => {
      if (savedCameraState.position) {
        camera.flyTo({
          destination: savedCameraState.position,
          orientation: {
            heading: savedCameraState.heading || 0,
            pitch: savedCameraState.pitch || -0.5,
            roll: savedCameraState.roll || 0,
          },
          duration,
          complete: () => {
            isDroppedIn = false;
            savedCameraState = null;
            resolve();
          },
        });
      } else {
        isDroppedIn = false;
        resolve();
      }
    });
  }

  return {
    dropIn,
    exit,
    get isDroppedIn() {
      return isDroppedIn;
    },
  };
}
