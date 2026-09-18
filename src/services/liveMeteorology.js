/**
 * Live Meteorology service.
 * Ingests real-time observations from Open-Meteo, AviationWeather METAR ceilometers,
 * and Open-Meteo Air Quality into physical units for atmospheric rendering.
 */

const FT_TO_METERS = 0.3048;
const DEFAULT_CLOUD_BASE_M = 1500;
const DEFAULT_CLEAN_PM2_5 = 10.0;
const DEFAULT_CLEAN_OZONE = 50.0;
const DEFAULT_CACHE_TTL_MS = 10 * 60_000; // 10 minutes

/**
 * Normalizes raw API responses into unified physical meteorology.
 */
export function normalizeMeteorology({ weather, metar, airQuality, aiForecast } = {}) {
  const current = weather?.current || {};
  const code = Number(current.weather_code) || 0;
  const precip = Number(current.precipitation) || 0;
  const isRaining = precip > 0 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
  const isSnowing = (code >= 71 && code <= 77) || (code >= 85 && code <= 86);

  // Parse METAR laser ceilometer cloud layers if available
  const metarClouds = [];
  let lowestBaseM = null;

  if (Array.isArray(metar) && metar.length > 0) {
    const station = metar[0];
    if (Array.isArray(station?.clouds)) {
      for (const layer of station.clouds) {
        const baseFt = Number(layer.base);
        if (Number.isFinite(baseFt) && baseFt > 0) {
          const baseM = Math.round(baseFt * FT_TO_METERS);
          metarClouds.push({ cover: layer.cover || 'SCT', baseM });
          if (lowestBaseM === null || baseM < lowestBaseM) {
            lowestBaseM = baseM;
          }
        }
      }
    }
  }

  const cloudBaseM = lowestBaseM !== null ? lowestBaseM : DEFAULT_CLOUD_BASE_M;

  const aq = airQuality?.current || {};
  const pm2_5 = Number.isFinite(Number(aq.pm2_5)) ? Number(aq.pm2_5) : DEFAULT_CLEAN_PM2_5;
  const pm10 = Number.isFinite(Number(aq.pm10)) ? Number(aq.pm10) : pm2_5 * 1.5;
  const ozone = Number.isFinite(Number(aq.ozone)) ? Number(aq.ozone) : DEFAULT_CLEAN_OZONE;

  return {
    temperatureC: Number(current.temperature_2m) || 15.0,
    apparentTemperatureC: Number(current.apparent_temperature) || 15.0,
    precipitationMm: precip,
    isRaining,
    isSnowing,
    weatherCode: code,
    cloudCoverPct: Number(current.cloud_cover) || 0,
    cloudBaseM,
    clouds: metarClouds,
    wind: {
      speedKph: Number(current.wind_speed_10m) || 0,
      directionDeg: Number(current.wind_direction_10m) || 0,
    },
    airQuality: {
      pm2_5,
      pm10,
      ozone,
    },
    aiForecast: aiForecast || null,
  };
}

/**
 * Creates a cached meteorology client.
 */
export function createMeteorologyService({
  fetchImpl = (...args) => fetch(...args),
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
} = {}) {
  const cache = new Map();

  function cacheKey(lat, lon) {
    return `${(Math.round(lat * 10) / 10).toFixed(1)},${(Math.round(lon * 10) / 10).toFixed(1)}`;
  }

  async function getMeteorology(latitude, longitude, { signal } = {}) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new TypeError('Valid latitude and longitude are required');
    }

    const key = cacheKey(latitude, longitude);
    const now = Date.now();
    const cached = cache.get(key);

    if (cached && now - cached.timestamp < cacheTtlMs) {
      return cached.data;
    }

    // Query weather endpoint
    const url = `/api/weather-effects?latitude=${latitude.toFixed(5)}&longitude=${longitude.toFixed(5)}`;
    const response = await fetchImpl(url, { signal });
    if (!response.ok) {
      throw new Error(`Meteorology request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const data = payload.normalized || payload;
    cache.set(key, { timestamp: now, data });
    return data;
  }

  return {
    getMeteorology,
    clearCache: () => cache.clear(),
  };
}
