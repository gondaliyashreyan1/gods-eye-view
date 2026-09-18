/**
 * @fileoverview Bortle Scale & Celestial Starlight Engine.
 *
 * Implements physically accurate celestial visibility and light pollution extinction
 * using official Cesium geodesics and planetary positions:
 *  - Altitude check: Space (> 80km) always displays stars.
 *  - Solar elevation check: Atmospheric Rayleigh scattering extinguishes stars during daylight/twilight.
 *  - Bortle scale check: At night inside the atmosphere (< 80km):
 *      - Pristine Dark Sky (Bortle 1-4, e.g. Big Bend, Death Valley, rural/deserts/oceans):
 *        Milky Way and background stars remain brilliantly visible.
 *      - Urban Light Pollution (Bortle 7-9, e.g. Austin, NYC, Tokyo, London):
 *        Artificial skyglow completely extinguishes background stars.
 */

// International Dark Sky Places (IDSP) and pristine wilderness reserves (Bortle 1-2)
export const DARK_SKY_RESERVES = Object.freeze([
  { name: 'Big Bend National Park, TX', lat: 29.25, lon: -103.25, radiusM: 80000, bortle: 1 },
  { name: 'Big Bend Ranch State Park, TX', lat: 29.47, lon: -104.03, radiusM: 60000, bortle: 1 },
  { name: 'Death Valley National Park, CA', lat: 36.53, lon: -116.93, radiusM: 90000, bortle: 1 },
  { name: 'Cherry Springs State Park, PA', lat: 41.66, lon: -77.82, radiusM: 40000, bortle: 2 },
  { name: 'Central Idaho Dark Sky Reserve, ID', lat: 44.05, lon: -114.75, radiusM: 80000, bortle: 2 },
  { name: 'Great Basin National Park, NV', lat: 38.98, lon: -114.30, radiusM: 70000, bortle: 1 },
  { name: 'Natural Bridges National Monument, UT', lat: 37.60, lon: -110.01, radiusM: 50000, bortle: 1 },
  { name: 'Cosmic Campground, NM', lat: 33.48, lon: -108.92, radiusM: 40000, bortle: 1 },
  { name: 'Stephen C. Foster State Park, GA', lat: 30.82, lon: -82.36, radiusM: 40000, bortle: 2 },
  { name: 'Headlands International Dark Sky Park, MI', lat: 45.78, lon: -84.78, radiusM: 30000, bortle: 2 },
  { name: 'Black Canyon of the Gunnison, CO', lat: 38.57, lon: -107.74, radiusM: 40000, bortle: 2 },
  { name: 'Canyonlands & Arches, UT', lat: 38.32, lon: -109.87, radiusM: 60000, bortle: 2 },
  { name: 'Bryce Canyon, UT', lat: 37.62, lon: -112.16, radiusM: 50000, bortle: 2 },
  { name: 'Joshua Tree National Park, CA', lat: 33.87, lon: -115.90, radiusM: 60000, bortle: 3 },
  { name: 'Atacama Desert (Paranal/ALMA), Chile', lat: -24.62, lon: -70.40, radiusM: 120000, bortle: 1 },
  { name: 'NamibRand Nature Reserve, Namibia', lat: -24.95, lon: 15.98, radiusM: 100000, bortle: 1 },
  { name: 'Aoraki Mackenzie, New Zealand', lat: -43.98, lon: 170.46, radiusM: 80000, bortle: 2 },
  { name: 'Kerry International Dark Sky Reserve, Ireland', lat: 51.85, lon: -10.15, radiusM: 50000, bortle: 2 },
  { name: 'Pic du Midi, France', lat: 42.93, lon: 0.14, radiusM: 50000, bortle: 2 },
  { name: 'Mont-Mégantic, Quebec, Canada', lat: 45.45, lon: -71.15, radiusM: 50000, bortle: 2 },
  { name: 'Jasper National Park, Alberta, Canada', lat: 52.87, lon: -117.95, radiusM: 80000, bortle: 2 },
  { name: 'Warrumbungle National Park, Australia', lat: -31.27, lon: 149.00, radiusM: 60000, bortle: 1 },
  { name: 'Galloway Forest Park, Scotland, UK', lat: 55.07, lon: -4.43, radiusM: 45000, bortle: 2 },
  { name: 'Mauna Kea Observatories, HI', lat: 19.82, lon: -155.46, radiusM: 40000, bortle: 1 },
  { name: 'Roque de los Muchachos, La Palma, Spain', lat: 28.76, lon: -17.88, radiusM: 35000, bortle: 1 },
]);

// Major Light-Polluted Metropolitan Centers (Bortle 8-9)
export const URBAN_LIGHT_DOMES = Object.freeze([
  { name: 'Austin, TX', lat: 30.2672, lon: -97.7431, radiusM: 32000, coreBortle: 8 },
  { name: 'Dallas-Fort Worth, TX', lat: 32.7767, lon: -96.7970, radiusM: 55000, coreBortle: 8 },
  { name: 'Houston, TX', lat: 29.7604, lon: -95.3698, radiusM: 55000, coreBortle: 8 },
  { name: 'San Antonio, TX', lat: 29.4241, lon: -98.4936, radiusM: 35000, coreBortle: 8 },
  { name: 'New York City, NY', lat: 40.7128, lon: -74.0060, radiusM: 60000, coreBortle: 9 },
  { name: 'Los Angeles, CA', lat: 34.0522, lon: -118.2437, radiusM: 65000, coreBortle: 9 },
  { name: 'Chicago, IL', lat: 41.8781, lon: -87.6298, radiusM: 50000, coreBortle: 8 },
  { name: 'Miami, FL', lat: 25.7617, lon: -80.1918, radiusM: 45000, coreBortle: 8 },
  { name: 'Atlanta, GA', lat: 33.7490, lon: -84.3880, radiusM: 50000, coreBortle: 8 },
  { name: 'San Francisco / Bay Area, CA', lat: 37.7749, lon: -122.4194, radiusM: 50000, coreBortle: 8 },
  { name: 'Seattle, WA', lat: 47.6062, lon: -122.3321, radiusM: 40000, coreBortle: 8 },
  { name: 'Phoenix, AZ', lat: 33.4484, lon: -112.0740, radiusM: 50000, coreBortle: 8 },
  { name: 'Denver, CO', lat: 39.7392, lon: -104.9903, radiusM: 40000, coreBortle: 8 },
  { name: 'Washington, DC', lat: 38.9072, lon: -77.0369, radiusM: 45000, coreBortle: 8 },
  { name: 'Boston, MA', lat: 42.3601, lon: -71.0589, radiusM: 40000, coreBortle: 8 },
  { name: 'Philadelphia, PA', lat: 39.9526, lon: -75.1652, radiusM: 40000, coreBortle: 8 },
  { name: 'London, UK', lat: 51.5074, lon: -0.1278, radiusM: 50000, coreBortle: 9 },
  { name: 'Paris, France', lat: 48.8566, lon: 2.3522, radiusM: 45000, coreBortle: 8 },
  { name: 'Berlin, Germany', lat: 52.5200, lon: 13.4050, radiusM: 35000, coreBortle: 8 },
  { name: 'Tokyo, Japan', lat: 35.6762, lon: 139.6503, radiusM: 60000, coreBortle: 9 },
  { name: 'Seoul, South Korea', lat: 37.5665, lon: 126.9780, radiusM: 45000, coreBortle: 8 },
  { name: 'Shanghai, China', lat: 31.2304, lon: 121.4737, radiusM: 50000, coreBortle: 9 },
  { name: 'Beijing, China', lat: 39.9042, lon: 116.4074, radiusM: 50000, coreBortle: 9 },
  { name: 'Hong Kong', lat: 22.3193, lon: 114.1694, radiusM: 30000, coreBortle: 9 },
  { name: 'Singapore', lat: 1.3521, lon: 103.8198, radiusM: 25000, coreBortle: 8 },
  { name: 'Mumbai, India', lat: 19.0760, lon: 72.8777, radiusM: 45000, coreBortle: 9 },
  { name: 'Delhi, India', lat: 28.6139, lon: 77.2090, radiusM: 50000, coreBortle: 9 },
  { name: 'Dubai, UAE', lat: 25.2048, lon: 55.2708, radiusM: 35000, coreBortle: 8 },
  { name: 'Sydney, Australia', lat: -33.8688, lon: 151.2093, radiusM: 40000, coreBortle: 8 },
  { name: 'Melbourne, Australia', lat: -37.8136, lon: 144.9631, radiusM: 40000, coreBortle: 8 },
  { name: 'Toronto, Canada', lat: 43.6532, lon: -79.3832, radiusM: 45000, coreBortle: 8 },
  { name: 'Mexico City, Mexico', lat: 19.4326, lon: -99.1332, radiusM: 50000, coreBortle: 9 },
  { name: 'São Paulo, Brazil', lat: -23.5505, lon: -46.6333, radiusM: 50000, coreBortle: 8 },
]);

export const ALTITUDE_SPACE_BOUNDARY_M = 80000; // Mesopause / Karman threshold (~80 km)
export const TWILIGHT_SOLAR_DOT_THRESHOLD = -0.15; // Solar elevation ~ -8.6 deg (nautical twilight)

/**
 * Calculates the exact ellipsoidal surface distance in meters using Cesium's EllipsoidGeodesic.
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @param {object} Cesium
 * @returns {number} Distance in meters
 */
export function computeEllipsoidalDistance(lat1, lon1, lat2, lon2, Cesium) {
  if (!Cesium?.Cartographic || !Cesium?.EllipsoidGeodesic) {
    // Fallback if Cesium geodesic is absent
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return 6371000 * c;
  }

  const p1 = Cesium.Cartographic.fromDegrees(lon1, lat1);
  const p2 = Cesium.Cartographic.fromDegrees(lon2, lat2);
  const geodesic = new Cesium.EllipsoidGeodesic(p1, p2);
  return geodesic.surfaceDistance;
}

/**
 * Estimates the Bortle scale (1 to 9) for given geographic coordinates.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {object} [options]
 * @param {object} [options.Cesium]
 * @returns {{ bortleClass: number, description: string, nearestFeature: string }}
 */
export function getBortleClassForCoordinates(latitude, longitude, { Cesium } = {}) {
  // 1. Check if within certified Dark Sky Reserves / Parks (Bortle 1 - 2)
  for (const reserve of DARK_SKY_RESERVES) {
    const dist = computeEllipsoidalDistance(latitude, longitude, reserve.lat, reserve.lon, Cesium);
    if (dist <= reserve.radiusM) {
      return {
        bortleClass: reserve.bortle,
        description: `Pristine Dark Sky (Bortle ${reserve.bortle})`,
        nearestFeature: reserve.name,
      };
    }
  }

  // 2. Check if within an Urban Light Pollution Dome (Bortle 7 - 9)
  for (const city of URBAN_LIGHT_DOMES) {
    const dist = computeEllipsoidalDistance(latitude, longitude, city.lat, city.lon, Cesium);
    if (dist <= city.radiusM) {
      // Inner city core vs suburban fringe
      const fraction = dist / city.radiusM;
      let bortle = city.coreBortle;
      if (fraction > 0.6) {
        bortle = Math.max(6, city.coreBortle - 1);
      }
      return {
        bortleClass: bortle,
        description: `Urban Light Pollution (Bortle ${bortle})`,
        nearestFeature: city.name,
      };
    }
  }

  // 3. Default rural sky (Bortle 3)
  return {
    bortleClass: 3,
    description: 'Rural Dark Sky (Bortle 3)',
    nearestFeature: 'Rural / Wilderness',
  };
}

/**
 * Evaluates whether stars and the Milky Way should be visible to the observer.
 *
 * @param {object} viewer Cesium.Viewer
 * @param {object} [options]
 * @param {object} [options.Cesium] Cesium namespace
 * @param {string} [options.bortleOverride] 'auto' | 'bortle1' | 'bortle8'
 * @returns {{
 *   starsVisible: boolean,
 *   isSpace: boolean,
 *   isNight: boolean,
 *   bortleClass: number,
 *   reason: string
 * }}
 */
export function evaluateCelestialVisibility(
  viewer,
  { Cesium = globalThis.Cesium, bortleOverride = 'auto' } = {},
) {
  if (!viewer?.scene) {
    return {
      starsVisible: true,
      isSpace: true,
      isNight: true,
      bortleClass: 1,
      reason: 'No active viewer scene',
    };
  }

  const camera = viewer.scene.camera;
  const carto = camera?.positionCartographic;
  const altitude = carto?.height ?? 100000;

  // 1. Orbital & Deep Space (> 80 km): Pure vacuum, stars are always visible
  if (altitude > ALTITUDE_SPACE_BOUNDARY_M) {
    return {
      starsVisible: true,
      isSpace: true,
      isNight: true,
      bortleClass: 1,
      reason: 'Space vacuum: unattenuated starlight',
    };
  }

  const latDeg = carto ? (carto.latitude * 180) / Math.PI : 0;
  const lonDeg = carto ? (carto.longitude * 180) / Math.PI : 0;

  // 2. Solar Zenith / Day-Night Evaluation via Cesium vector geometry
  let isNight = true;
  const scene = viewer.scene;
  const posWC = camera?.positionWC || camera?.position;

  if (scene && posWC && Cesium?.Cartesian3 && Cesium?.Ellipsoid?.WGS84) {
    const sunDir = scene.context?.uniformState?.sunDirectionWC;
    if (sunDir) {
      const scratchZenith = typeof Cesium.Cartesian3 === 'function' ? new Cesium.Cartesian3() : {};
      const zenithNormal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(posWC, scratchZenith);
      const dot = Cesium.Cartesian3.dot(zenithNormal, sunDir);
      isNight = dot <= TWILIGHT_SOLAR_DOT_THRESHOLD;
    }
  }

  // 3. Daylight in atmosphere: Atmospheric Rayleigh scattering washes out all stars
  if (!isNight) {
    return {
      starsVisible: false,
      isSpace: false,
      isNight: false,
      bortleClass: 0,
      reason: 'Daylight/twilight: atmospheric Rayleigh scattering washes out stars',
    };
  }

  // 4. Nighttime in atmosphere: Bortle Scale light pollution classification
  let classification;
  if (bortleOverride === 'bortle1') {
    classification = {
      bortleClass: 1,
      description: 'Force Bortle 1 (Dark Sky)',
      nearestFeature: 'User Override',
    };
  } else if (bortleOverride === 'bortle8' || bortleOverride === 'bortle9') {
    classification = {
      bortleClass: 8,
      description: 'Force Bortle 8 (City Skyglow)',
      nearestFeature: 'User Override',
    };
  } else {
    classification = getBortleClassForCoordinates(latDeg, lonDeg, { Cesium });
  }

  // Bortle 1-4: Stars & Milky Way visible from ground!
  // Bortle 7-9: Severe urban light pollution extinguishes faint stars & Milky Way
  const starsVisible = classification.bortleClass <= 5;

  return {
    starsVisible,
    isSpace: false,
    isNight: true,
    bortleClass: classification.bortleClass,
    reason: starsVisible
      ? `${classification.description} near ${classification.nearestFeature} - Stars and Milky Way visible from ground`
      : `${classification.description} near ${classification.nearestFeature} - Stars extinguished by urban skyglow`,
  };
}
