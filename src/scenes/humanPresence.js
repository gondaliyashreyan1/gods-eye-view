import * as DefaultCesium from 'cesium';
import { evaluateCelestialVisibility } from './bortleScale.js';
import { fetchNearestStreetView } from '../services/mapillaryService.js';

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

  // Ensure default orbital Earth rotation is active on initialization
  const initialSscc = scene.screenSpaceCameraController;
  if (initialSscc) {
    initialSscc.enableInputs = true;
    initialSscc.enableRotate = true;
    initialSscc.enableTranslate = true;
    initialSscc.enableTilt = true;
    initialSscc.enableZoom = true;
    if (Cesium?.CameraEventType?.LEFT_DRAG !== undefined) {
      initialSscc.rotateEventTypes = Cesium.CameraEventType.LEFT_DRAG;
      initialSscc.translateEventTypes = Cesium.CameraEventType.LEFT_DRAG;
      initialSscc.zoomEventTypes = [
        Cesium.CameraEventType.RIGHT_DRAG,
        Cesium.CameraEventType.WHEEL,
        Cesium.CameraEventType.PINCH,
      ];
      if (Cesium?.KeyboardEventModifier?.SHIFT !== undefined) {
        initialSscc.lookEventTypes = {
          eventType: Cesium.CameraEventType.LEFT_DRAG,
          modifier: Cesium.KeyboardEventModifier.SHIFT,
        };
      }
    }
  }

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

  let isDraggingMouse = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  const LOOK_SENSITIVITY = 0.003;

  let streetViewContainer = null;
  let lastStreetViewPos = null;

  async function updateStreetView(lat, lon) {
    if (typeof document === 'undefined') return;
    if (!streetViewContainer) {
      streetViewContainer = document.getElementById('streetview-hud');
      if (!streetViewContainer) {
        streetViewContainer = document.createElement('div');
        streetViewContainer.id = 'streetview-hud';
        streetViewContainer.className = 'streetview-hud';
        document.body.appendChild(streetViewContainer);
      }
    }
    streetViewContainer.classList.remove('hidden');
    streetViewContainer.innerHTML = `
      <div class="streetview-hud-header">
        <div class="streetview-hud-title">
          <span class="streetview-live-dot" style="background:#ffaa00;box-shadow:0 0 8px #ffaa00;"></span>
          <span class="streetview-source-badge">MAPILLARY</span>
          <span class="streetview-heading-readout">SEARCHING</span>
        </div>
        <button class="streetview-close-btn" id="streetview-close-btn" title="Close street view">×</button>
      </div>
      <div class="streetview-img-container" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:180px;background:#0b0f19;color:#8899a6;font-size:11px;gap:6px;">
        <span style="color:#00d4ff;font-weight:600;">Connecting Street Imagery...</span>
        <span>${lat.toFixed(4)}°, ${lon.toFixed(4)}°</span>
      </div>
    `;
    const closeBtnInit = streetViewContainer.querySelector('#streetview-close-btn');
    if (closeBtnInit) {
      closeBtnInit.onclick = () => streetViewContainer.classList.add('hidden');
    }

    try {
      const data = await fetchNearestStreetView(lat, lon, options);
      if (!isDroppedIn) return;
      if (data && (data.imageUrl || data.thumbnailUrl || data.id)) {
        streetViewContainer.classList.remove('hidden');
        const imgUrl = data.thumbnailUrl || data.imageUrl;
        const year = data.capturedAt ? new Date(data.capturedAt).getFullYear() : '';
        const isMapillary = data.source === 'Mapillary' && data.id;
        streetViewContainer.innerHTML = `
          <div class="streetview-hud-header">
            <div class="streetview-hud-title">
              <span class="streetview-live-dot"></span>
              <span class="streetview-source-badge">${data.source.toUpperCase()}</span>
              <span class="streetview-heading-readout">${data.isPano || isMapillary ? '360°' : 'STREET'}</span>
            </div>
            <button class="streetview-close-btn" id="streetview-close-btn" title="Close street view">×</button>
          </div>
          <div class="streetview-img-container">
            ${
              isMapillary
                ? `<iframe class="streetview-iframe" src="https://www.mapillary.com/embed?image_key=${data.id}&style=photo" allowfullscreen loading="lazy"></iframe>`
                : `<img id="streetview-img" src="${imgUrl}" alt="Street View" />`
            }
            <div class="streetview-overlay-meta">
              <span>${year ? 'Captured: ' + year : 'Live Street View'}</span>
              ${data.externalUrl ? `<a href="${data.externalUrl}" target="_blank" rel="noopener">Open ↗</a>` : ''}
            </div>
          </div>
        `;
        const closeBtn = streetViewContainer.querySelector('#streetview-close-btn');
        if (closeBtn) {
          closeBtn.onclick = () => streetViewContainer.classList.add('hidden');
        }
      } else {
        streetViewContainer.innerHTML = `
          <div class="streetview-hud-header">
            <div class="streetview-hud-title">
              <span class="streetview-live-dot" style="background:#ff9900;box-shadow:0 0 6px #ff9900;"></span>
              <span class="streetview-source-badge">STREET VIEW</span>
              <span class="streetview-heading-readout">OFF-GRID</span>
            </div>
            <button class="streetview-close-btn" id="streetview-close-btn" title="Close street view">×</button>
          </div>
          <div class="streetview-img-container" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;text-align:center;color:#8899a6;font-size:11px;gap:8px;height:180px;background:#0b0f19;">
            <span style="color:#fff;font-weight:600;">No Street Photography Here</span>
            <span>(${lat.toFixed(4)}°, ${lon.toFixed(4)}°)</span>
            <button id="streetview-jump-btn" style="background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.4);color:#00d4ff;padding:5px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:10px;font-weight:600;margin-top:2px;">
              📍 Jump to Austin 360° View
            </button>
          </div>
        `;
        const closeBtn = streetViewContainer.querySelector('#streetview-close-btn');
        if (closeBtn) {
          closeBtn.onclick = () => streetViewContainer.classList.add('hidden');
        }
        const jumpBtn = streetViewContainer.querySelector('#streetview-jump-btn');
        if (jumpBtn) {
          jumpBtn.onclick = () => {
            dropIn(30.2672, -97.7431, { surfaceHeightM: 155 });
          };
        }
      }
    } catch {
      // Graceful fallback if network is unreachable
    }
  }

  function applyLookDelta(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (dx === 0 && dy === 0) return;

    if (camera.setView && Cesium?.Math) {
      const currentHeading = camera.heading ?? 0;
      const currentPitch = camera.pitch ?? 0;
      const newHeading = currentHeading + dx * LOOK_SENSITIVITY;
      const maxPitch = Cesium.Math.toRadians(85);
      const minPitch = Cesium.Math.toRadians(-85);
      const newPitch = Math.max(minPitch, Math.min(maxPitch, currentPitch - dy * LOOK_SENSITIVITY));

      camera.setView({
        orientation: {
          heading: newHeading,
          pitch: newPitch,
          roll: 0.0,
        },
      });
    } else {
      if (dx > 0) camera.lookRight?.(dx * LOOK_SENSITIVITY);
      if (dx < 0) camera.lookLeft?.(-dx * LOOK_SENSITIVITY);
      if (dy > 0) camera.lookDown?.(dy * LOOK_SENSITIVITY);
      if (dy < 0) camera.lookUp?.(-dy * LOOK_SENSITIVITY);
    }
  }

  function onMouseDown(e) {
    if (!isDroppedIn) return;
    const canvas = viewer.canvas;
    if (canvas && (e.target === canvas || canvas.contains(e.target))) {
      isDraggingMouse = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    }
  }

  function onMouseMove(e) {
    if (!isDroppedIn) return;
    const canvas = viewer.canvas;
    if (typeof document !== 'undefined' && document.pointerLockElement === canvas) {
      applyLookDelta(e.movementX || 0, e.movementY || 0);
      return;
    }
    if (!isDraggingMouse) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    applyLookDelta(dx, dy);
  }

  function onMouseUp() {
    isDraggingMouse = false;
  }

  function onKeyDown(e) {
    if (!isDroppedIn) return;
    const target = e.target;
    if (target && target.matches && target.matches('input, textarea, select'))
      return;
    const code = e.code;
    if (code === 'KeyG' || code === 'Escape') {
      exit();
      e.preventDefault?.();
      return;
    }
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

      // Forward direction tangent to Earth surface (up cross right)
      const forwardGround = Cesium.Cartesian3.cross(up, right, new Cesium.Cartesian3());
      Cesium.Cartesian3.normalize(forwardGround, forwardGround);

      // Right strafe direction tangent to Earth surface (forward cross up)
      const rightGround = Cesium.Cartesian3.cross(forwardGround, up, new Cesium.Cartesian3());
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

      // Refresh street view photo if walked more than ~40m
      if (isMoving && lastStreetViewPos) {
        const dLat = Math.abs(carto.latitude - lastStreetViewPos.latitude);
        const dLon = Math.abs(carto.longitude - lastStreetViewPos.longitude);
        if (dLat > 0.00036 || dLon > 0.00036) {
          lastStreetViewPos = {
            latitude: carto.latitude,
            longitude: carto.longitude,
          };
          const latDeg = (carto.latitude * 180) / Math.PI;
          const lonDeg = (carto.longitude * 180) / Math.PI;
          updateStreetView(latDeg, lonDeg);
        }
      }
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

    // Disable Cesium orbital camera controller while in first-person human presence
    const sscc = scene.screenSpaceCameraController;
    if (sscc) {
      sscc.enableRotate = false;
      sscc.enableTranslate = false;
      sscc.enableTilt = false;
      sscc.enableInputs = false;
    }

    // Attach mouse look listeners
    if (typeof window !== 'undefined') {
      window.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }

    // Fetch nearest street view photo (Mapillary / Panoramax)
    lastStreetViewPos = {
      latitude: (latitude * Math.PI) / 180,
      longitude: (longitude * Math.PI) / 180,
    };
    updateStreetView(latitude, longitude);

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

    if (typeof window !== 'undefined') {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    if (streetViewContainer) {
      streetViewContainer.classList.add('hidden');
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
      sscc.enableInputs = true;
      sscc.enableRotate = true;
      sscc.enableLook = true;
      sscc.enableTranslate = true;
      sscc.enableTilt = true;
      sscc.enableZoom = true;
      if (Cesium?.CameraEventType?.LEFT_DRAG !== undefined) {
        sscc.rotateEventTypes = Cesium.CameraEventType.LEFT_DRAG;
        sscc.translateEventTypes = Cesium.CameraEventType.LEFT_DRAG;
        sscc.zoomEventTypes = [
          Cesium.CameraEventType.RIGHT_DRAG,
          Cesium.CameraEventType.WHEEL,
          Cesium.CameraEventType.PINCH,
        ];
        if (Cesium?.KeyboardEventModifier?.SHIFT !== undefined) {
          sscc.lookEventTypes = {
            eventType: Cesium.CameraEventType.LEFT_DRAG,
            modifier: Cesium.KeyboardEventModifier.SHIFT,
          };
        }
      }
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
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
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
    // Test helper for simulating mouse drag look
    _triggerMouseDragForTest(dx, dy) {
      applyLookDelta(dx, dy);
    },
  };
}
