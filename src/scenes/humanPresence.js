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

  async function dropIn(latitude, longitude, { heading = 0, duration = 2.5 } = {}) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new TypeError('Valid latitude and longitude are required to drop in');
    }

    // Save previous camera state for clean restoration
    savedCameraState = {
      position: camera.position ? { ...camera.position } : null,
      heading: camera.heading,
      pitch: camera.pitch,
      roll: camera.roll,
      fov: camera.frustum?.fov,
    };

    // Query terrain ground height via Cesium globe API
    let groundElevation = 0;
    if (scene.globe?.getHeight && Cesium.Cartographic?.fromDegrees) {
      const carto = Cesium.Cartographic.fromDegrees(longitude, latitude);
      const h = scene.globe.getHeight(carto);
      if (Number.isFinite(h)) {
        groundElevation = Math.max(0, h);
      }
    }

    const destination = calculateHumanEyeCartesian(latitude, longitude, groundElevation, { Cesium });

    // Apply human eye FOV (~58 deg vertical)
    if (camera.frustum && Cesium.Math?.toRadians) {
      camera.frustum.fov = Cesium.Math.toRadians(HUMAN_EYE_FOV_DEG);
    }

    return new Promise((resolve) => {
      camera.flyTo({
        destination,
        orientation: {
          heading: heading || 0,
          pitch: 0.0, // Horizontal pedestrian gaze
          roll: 0.0,
        },
        duration,
        complete: () => {
          isDroppedIn = true;
          resolve({ latitude, longitude, height: groundElevation + HUMAN_EYE_HEIGHT_M });
        },
      });
    });
  }

  async function exit({ duration = 1.5 } = {}) {
    if (!isDroppedIn || !savedCameraState) return;

    if (savedCameraState.fov && camera.frustum) {
      camera.frustum.fov = savedCameraState.fov;
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
