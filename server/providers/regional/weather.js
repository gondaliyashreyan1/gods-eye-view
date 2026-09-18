import { fetchRegionalJson } from './http.js';
import { normalizeRegionalWeather } from '../../../src/data/regionalModel.js';
import { normalizeMeteorology } from '../../../src/services/liveMeteorology.js';

const WEATHER_EFFECTS_MAX_RESPONSE_BYTES = 512 * 1024;

async function fetchRegionalWeather(point) {
  const params = new URLSearchParams({
    latitude: point.latitude.toFixed(5),
    longitude: point.longitude.toFixed(5),
    current:
      'temperature_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,visibility',
    timezone: 'UTC',
  });

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?${params}`;
  const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${point.latitude.toFixed(5)}&longitude=${point.longitude.toFixed(5)}&current=pm2_5,pm10,dust,ozone`;

  const minLat = (point.latitude - 0.75).toFixed(2);
  const minLon = (point.longitude - 0.75).toFixed(2);
  const maxLat = (point.latitude + 0.75).toFixed(2);
  const maxLon = (point.longitude + 0.75).toFixed(2);
  const metarUrl = `https://aviationweather.gov/api/data/metar?format=json&bbox=${minLat},${minLon},${maxLat},${maxLon}`;

  try {
    const [weatherRes, aqRes, metarRes] = await Promise.allSettled([
      fetchRegionalJson(weatherUrl, { maxBytes: WEATHER_EFFECTS_MAX_RESPONSE_BYTES }),
      fetchRegionalJson(aqUrl, { maxBytes: WEATHER_EFFECTS_MAX_RESPONSE_BYTES }),
      fetchRegionalJson(metarUrl, { maxBytes: WEATHER_EFFECTS_MAX_RESPONSE_BYTES }),
    ]);

    const rawWeather = weatherRes.status === 'fulfilled' ? weatherRes.value : null;
    if (!rawWeather) return null;

    const rawAq = aqRes.status === 'fulfilled' ? aqRes.value : null;
    const rawMetar = metarRes.status === 'fulfilled' ? metarRes.value : null;

    const normalized = normalizeRegionalWeather(rawWeather);
    if (!normalized) return null;

    const meteorology = normalizeMeteorology({
      weather: rawWeather,
      metar: rawMetar,
      airQuality: rawAq,
    });

    return {
      ...normalized,
      meteorology,
    };
  } catch {
    return null;
  }
}

export { fetchRegionalWeather };
