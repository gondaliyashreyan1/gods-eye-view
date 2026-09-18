import * as DefaultCesium from 'cesium';
import { evaluateCelestialVisibility } from './bortleScale.js';

const HUMAN_EYE_HEIGHT_M = 1.7;
const HUMAN_EYE_FOV_DEG = 58.0;
const WALK_SPEED_MPS = 1.6; // 1.6 m/s (~5.8 km/h brisk pedestrian walk)
const SPRINT_SPEED_MPS = 5.0; // 5.0 m/s (~18 km/h human sprint)

/**
 * Calculates human eye Cartesian position using Cesium library primitives.
 */
export function calculateHumanEyeCartesian(
  latitude,
  longitude,
  groundElevationM = 0,
  options = {},
) {
  const Cesium = options.Cesium || DefaultCesium;
  const targetHeight = (Number(groundElevationM) || 0) + HUMAN_EYE_HEIGHT_M;
  return Cesium.Cartesian3.fromDegrees(longitude, latitude, targetHeight);
}

/**
 * First-person 1.7m ground presence controller with full WASD walking kinematics.
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
  let currentGroundElevation = 0;

  const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  };

  function onKeyDown(e) {
    if (!isDroppedIn) return;
    const target = e.target;
    if (target && target.matches && target.matches('input, textarea, select'))
      return;
    const code = e.code;
    if (code === 'KeyW' || code === 'ArrowUp') {
      keys.forward = true;
      e.preventDefault?.();
    }
    if (code === 'KeyS' || code === 'ArrowDown') {
      keys.backward = true;
      e.preventDefault?.();
    }
    if (code === 'KeyA' || code === 'ArrowLeft') {
      keys.left = true;
      e.preventDefault?.();
    }
    if (code === 'KeyD' || code === 'ArrowRight') {
      keys.right = true;
      e.preventDefault?.();
    }
    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      keys.sprint = true;
    }
  }

  function onKeyUp(e) {
    const code = e.code;
    if (code === 'KeyW' || code === 'ArrowUp') keys.forward = false;
    if (code === 'KeyS' || code === 'ArrowDown') keys.backward = false;
    if (code === 'KeyA' || code === 'ArrowLeft') keys.left = false;
    if (code === 'KeyD' || code === 'ArrowRight') keys.right = false;
    if (code === 'ShiftLeft' || code === 'ShiftRight') keys.sprint = false;
  }

  let lastTick = performance.now();
  function onWalkTick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastTick) / 1000);
    lastTick = now;

    if (!isDroppedIn) return;

    const isMoving =
      keys.forward || keys.backward || keys.left || keys.right;
    if (!isMoving) return;

    const speed = keys.sprint ? SPRINT_SPEED_MPS : WALK_SPEED_MPS;
    const distance = speed * dt;

    // Use official Cesium vector geometry to move strictly tangent to the Earth's surface
    if (camera.move && Cesium?.Cartesian3 && Cesium?.Ellipsoid?.WGS84) {
      const posWC = camera.positionWC || camera.position;
      const scratchUp = typeof Cesium.Cartesian3 === 'function' ? new Cesium.Cartesian3() : {};
      const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(posWC, scratchUp);
      const right = camera.right || new Cesium.Cartesian3(1, 0, 0);

      // Forward direction tangent to Earth surface (perpendicular to right and up)
      const forwardGround = Cesium.Cartesian3.cross(right, up, new Cesium.Cartesian3());
      Cesium.Cartesian3.normalize(forwardGround, forwardGround);

      // Right strafe direction tangent to Earth surface
      const rightGround = Cesium.Cartesian3.cross(up, forwardGround, new Cesium.Cartesian3());
      Cesium.Cartesian3.normalize(rightGround, rightGround);

      const moveDir = new Cesium.Cartesian3(0, 0, 0);
      if (keys.forward) Cesium.Cartesian3.add(moveDir, forwardGround, moveDir);
      if (keys.backward) Cesium.Cartesian3.subtract(moveDir, forwardGround, moveDir);
      if (keys.right) Cesium.Cartesian3.add(moveDir, rightGround, moveDir);
      if (keys.left) Cesium.Cartesian3.subtract(moveDir, rightGround, moveDir);

      if (Cesium.Cartesian3.magnitudeSquared(moveDir) > 0.0001) {
        Cesium.Cartesian3.normalize(moveDir, moveDir);
        camera.move(moveDir, distance);
      }
    } else {
      // Fallback for mock/test environments
      if (keys.forward) camera.moveForward?.(distance);
      if (keys.backward) camera.moveBackward?.(distance);
      if (keys.left) camera.moveLeft?.(distance);
      if (keys.right) camera.moveRight?.(distance);
    }

    // Re-clamp camera height to 3D tiles or terrain + 1.7m
    const carto = camera.positionCartographic;
    if (carto && Cesium.Cartesian3?.fromRadians) {
      let groundH = currentGroundElevation;
      if (scene.sampleHeight) {
        const sampled = scene.sampleHeight(carto);
        if (Number.isFinite(sampled)) {
          groundH = Math.max(0, sampled);
          currentGroundElevation = groundH;
        }
      } else if (scene.globe?.getHeight) {
        const h = scene.globe.getHeight(carto);
        if (Number.isFinite(h)) {
          groundH = Math.max(0, h);
          currentGroundElevation = groundH;
        }
      }
      carto.height = groundH + HUMAN_EYE_HEIGHT_M;
      camera.position = Cesium.Cartesian3.fromRadians(
        carto.longitude,
        carto.latitude,
        carto.height,
      );
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }

  async function dropIn(
    latitude,
    longitude,
    { surfaceHeightM, heading = 0, duration = 2.0 } = {},
  ) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new TypeError('Valid latitude and longitude are required to drop in');
    }

    console.log(
      `[DropIn] Dropping in to lat=${latitude.toFixed(5)}, lon=${longitude.toFixed(5)}`,
    );

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
    currentGroundElevation = groundElevation;

    console.log(
      `[DropIn] Ground elevation resolved: ${groundElevation.toFixed(1)}m AGL`,
    );
    const destination = calculateHumanEyeCartesian(
      latitude,
      longitude,
      groundElevation,
      { Cesium },
    );

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

    // Evaluate Bortle scale & celestial visibility:
    // In dark sky regions (Bortle 1-4, e.g. Big Bend, Death Valley), stars remain visible at night!
    // In urban centers (Bortle 7-9, e.g. Austin), artificial skyglow extinguishes the stars.
    if (scene.skyBox) {
      const celestial = evaluateCelestialVisibility(viewer, { Cesium });
      scene.skyBox.show = celestial.starsVisible;
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
          lastTick = performance.now();
          if (scene.preRender?.addEventListener) {
            scene.preRender.addEventListener(onWalkTick);
          }
          console.log('[DropIn] Successfully arrived at 1.7m human eye level. WASD walking active.');
          resolve({
            latitude,
            longitude,
            height: groundElevation + HUMAN_EYE_HEIGHT_M,
          });
        },
      });
    });
  }

  async function exit({ duration = 1.5 } = {}) {
    if (!isDroppedIn || !savedCameraState) return;

    console.log('[DropIn] Exiting drop-in mode, restoring orbital view');
    isDroppedIn = false;

    if (scene.preRender?.removeEventListener) {
      scene.preRender.removeEventListener(onWalkTick);
    }

    // Reset keys
    keys.forward = false;
    keys.backward = false;
    keys.left = false;
    keys.right = false;
    keys.sprint = false;

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
            savedCameraState = null;
            if (scene.skyBox) {
              const celestial = evaluateCelestialVisibility(viewer, { Cesium });
              scene.skyBox.show = celestial.starsVisible;
            }
            resolve();
          },
        });
      } else {
        resolve();
      }
    });
  }

  function destroy() {
    exit();
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    }
  }

  return {
    dropIn,
    exit,
    destroy,
    get isDroppedIn() {
      return isDroppedIn;
    },
    // Test helper for simulating keys
    _triggerKeyForTest(code, down) {
      if (code === 'KeyW') keys.forward = down;
      if (code === 'KeyS') keys.backward = down;
      if (code === 'KeyA') keys.left = down;
      if (code === 'KeyD') keys.right = down;
      if (code === 'Shift') keys.sprint = down;
    },
  };
}
