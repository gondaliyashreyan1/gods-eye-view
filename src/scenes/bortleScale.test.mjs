import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeEllipsoidalDistance,
  getBortleClassForCoordinates,
  evaluateCelestialVisibility,
  ALTITUDE_SPACE_BOUNDARY_M,
} from './bortleScale.js';

test('getBortleClassForCoordinates accurately classifies Austin as urban Bortle 8', () => {
  const result = getBortleClassForCoordinates(30.2672, -97.7431);
  assert.equal(result.bortleClass >= 7, true, 'Austin must be classified as Bortle 7-9');
  assert.match(result.nearestFeature, /Austin/i);
});

test('getBortleClassForCoordinates accurately classifies Big Bend as Bortle 1', () => {
  const result = getBortleClassForCoordinates(29.25, -103.25);
  assert.equal(result.bortleClass, 1, 'Big Bend must be classified as Bortle 1');
  assert.match(result.nearestFeature, /Big Bend/i);
});

test('getBortleClassForCoordinates accurately classifies Death Valley as Bortle 1', () => {
  const result = getBortleClassForCoordinates(36.53, -116.93);
  assert.equal(result.bortleClass, 1, 'Death Valley must be classified as Bortle 1');
  assert.match(result.nearestFeature, /Death Valley/i);
});

test('getBortleClassForCoordinates accurately classifies Cherry Springs as Bortle 2', () => {
  const result = getBortleClassForCoordinates(41.66, -77.82);
  assert.equal(result.bortleClass, 2, 'Cherry Springs must be Bortle 2');
});

test('evaluateCelestialVisibility reveals stars in space regardless of location', () => {
  const fakeViewer = {
    scene: {
      camera: {
        positionCartographic: {
          latitude: (30.2672 * Math.PI) / 180,
          longitude: (-97.7431 * Math.PI) / 180,
          height: 100000, // 100km (space)
        },
      },
    },
  };

  const result = evaluateCelestialVisibility(fakeViewer);
  assert.equal(result.starsVisible, true, 'Stars must be visible in space');
  assert.equal(result.isSpace, true);
});

test('evaluateCelestialVisibility hides stars in Austin at ground level due to light pollution', () => {
  const fakeViewer = {
    scene: {
      camera: {
        positionCartographic: {
          latitude: (30.2672 * Math.PI) / 180,
          longitude: (-97.7431 * Math.PI) / 180,
          height: 200, // Ground level in Austin
        },
      },
    },
  };

  const result = evaluateCelestialVisibility(fakeViewer);
  assert.equal(result.starsVisible, false, 'Stars must be extinguished in Austin');
  assert.equal(result.bortleClass >= 7, true);
  assert.match(result.reason, /Austin/i);
});

test('evaluateCelestialVisibility shows stars in Big Bend at ground level at night', () => {
  const fakeViewer = {
    scene: {
      camera: {
        positionCartographic: {
          latitude: (29.25 * Math.PI) / 180,
          longitude: (-103.25 * Math.PI) / 180,
          height: 600, // Ground level in Big Bend
        },
      },
    },
  };

  const result = evaluateCelestialVisibility(fakeViewer);
  assert.equal(result.starsVisible, true, 'Stars MUST be visible in Big Bend Bortle 1');
  assert.equal(result.bortleClass, 1);
  assert.match(result.reason, /Big Bend/i);
});

test('evaluateCelestialVisibility extinguishes stars during daylight via solar dot', () => {
  const fakeCesium = {
    Cartesian3: {
      dot: () => 0.5, // Sun high above horizon
    },
    Ellipsoid: {
      WGS84: {
        geodeticSurfaceNormal: () => ({}),
      },
    },
  };

  const fakeViewer = {
    scene: {
      camera: {
        positionWC: {},
        positionCartographic: {
          latitude: (29.25 * Math.PI) / 180,
          longitude: (-103.25 * Math.PI) / 180,
          height: 600,
        },
      },
      context: {
        uniformState: {
          sunDirectionWC: {},
        },
      },
    },
  };

  const result = evaluateCelestialVisibility(fakeViewer, { Cesium: fakeCesium });
  assert.equal(result.starsVisible, false, 'Daylight must extinguish stars');
  assert.equal(result.isNight, false);
});

test('evaluateCelestialVisibility respects manual bortle override', () => {
  const fakeViewer = {
    scene: {
      camera: {
        positionCartographic: {
          latitude: (30.2672 * Math.PI) / 180,
          longitude: (-97.7431 * Math.PI) / 180,
          height: 200, // Austin
        },
      },
    },
  };

  const resultOverride = evaluateCelestialVisibility(fakeViewer, { bortleOverride: 'bortle1' });
  assert.equal(resultOverride.starsVisible, true, 'Override to Bortle 1 should reveal stars');
});
