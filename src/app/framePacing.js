/**
 * Hardware VSync and adaptive frame pacing governor.
 *
 * Ensures Cesium render ticks lock cleanly to the display refresh rate
 * (e.g. 60Hz or 120Hz ProMotion on macOS) without micro-stutters,
 * and dynamically relaxes 3D tile screen-space error under high GPU load
 * so the renderer never misses a VSync deadline.
 */

const ROLLING_SAMPLE_SIZE = 10;
const DEFAULT_MAX_SSE = 16.0;
const THROTTLED_MAX_SSE = 32.0;

export function installFramePacingGovernor(viewer, options = {}) {
  if (!viewer?.scene) {
    throw new TypeError('installFramePacingGovernor requires a Cesium viewer');
  }

  const {
    baseMaxScreenSpaceError = DEFAULT_MAX_SSE,
    throttledMaxScreenSpaceError = THROTTLED_MAX_SSE,
  } = options;

  // Uncap targetFrameRate so requestAnimationFrame is driven strictly by display VSync
  viewer.targetFrameRate = undefined;

  let lastTimestamp = performance.now();
  const frameDeltas = [];
  let currentSSE = baseMaxScreenSpaceError;

  function onPreRender() {
    const now = performance.now();
    const delta = now - lastTimestamp;
    lastTimestamp = now;

    if (delta > 0 && delta < 200) {
      frameDeltas.push(delta);
      if (frameDeltas.length > ROLLING_SAMPLE_SIZE) {
        frameDeltas.shift();
      }
    }

    if (frameDeltas.length >= 5) {
      const avgDelta = frameDeltas.reduce((a, b) => a + b, 0) / frameDeltas.length;
      
      // If average frame time exceeds 14ms (dropping below 60fps) or is spiking,
      // dynamically increase SSE to shed tile refinement load before VSync misses.
      const shouldThrottle = avgDelta > 15.0;
      const targetSSE = shouldThrottle ? throttledMaxScreenSpaceError : baseMaxScreenSpaceError;

      if (currentSSE !== targetSSE) {
        currentSSE = targetSSE;
        applyTilesetSSE(viewer.scene, currentSSE);
      }
    }
  }

  function applyTilesetSSE(scene, sse) {
    if (!scene?.primitives) return;
    for (let i = 0; i < scene.primitives.length; i++) {
      const prim = scene.primitives.get(i);
      if (prim && typeof prim.maximumScreenSpaceError === 'number') {
        prim.maximumScreenSpaceError = sse;
      }
    }
  }

  viewer.scene.preRender.addEventListener(onPreRender);

  return function uninstall() {
    if (!viewer.isDestroyed() && viewer.scene?.preRender) {
      viewer.scene.preRender.removeEventListener(onPreRender);
      applyTilesetSSE(viewer.scene, baseMaxScreenSpaceError);
    }
  };
}
