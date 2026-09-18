import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMeteorology,
  createMeteorologyService,
} from './liveMeteorology.js';

test('normalizeMeteorology parses METAR cloud bases and Open-Meteo conditions', () => {
  const mockWeather = {
    current: {
      temperature_2m: 15.2,
      precipitation: 2.4,
      cloud_cover: 85,
      weather_code: 61, // Rain
      wind_speed_10m: 18.5,
      wind_direction_10m: 240,
    },
  };

  const mockMetar = [
    {
      icaoId: 'KSFO',
      clouds: [
        { cover: 'SCT', base: 1200 },
        { cover: 'BKN', base: 4500 },
      ],
    },
  ];

  const mockAirQuality = {
    current: {
      pm2_5: 12.0,
      pm10: 18.0,
      ozone: 45.0,
    },
  };

  const norm = normalizeMeteorology({
    weather: mockWeather,
    metar: mockMetar,
    airQuality: mockAirQuality,
  });

  assert.equal(norm.temperatureC, 15.2);
  assert.equal(norm.precipitationMm, 2.4);
  assert.equal(norm.isRaining, true);
  assert.equal(norm.cloudCoverPct, 85);
  assert.equal(norm.cloudBaseM, Math.round(1200 * 0.3048)); // 1200 ft to meters
  assert.equal(norm.clouds.length, 2);
  assert.equal(norm.airQuality.pm2_5, 12.0);
  assert.equal(norm.airQuality.ozone, 45.0);
  assert.equal(norm.wind.speedKph, 18.5);
  assert.equal(norm.wind.directionDeg, 240);
});

test('normalizeMeteorology falls back safely when METAR or Air Quality is missing', () => {
  const norm = normalizeMeteorology({
    weather: {
      current: {
        temperature_2m: 20.0,
        precipitation: 0.0,
        cloud_cover: 20,
        weather_code: 0,
        wind_speed_10m: 5.0,
        wind_direction_10m: 90,
      },
    },
  });

  assert.equal(norm.temperatureC, 20.0);
  assert.equal(norm.isRaining, false);
  assert.equal(norm.cloudBaseM, 1500, 'Default cloud base when METAR unavailable');
  assert.equal(norm.airQuality.pm2_5, 10.0, 'Standard clean baseline');
});

test('createMeteorologyService caches responses within TTL', async () => {
  let fetchCount = 0;
  const mockFetch = async () => {
    fetchCount++;
    return {
      ok: true,
      json: async () => ({
        temperatureC: 18,
        cloudBaseM: 1000,
        precipitationMm: 0,
      }),
    };
  };

  const service = createMeteorologyService({ fetchImpl: mockFetch, cacheTtlMs: 60_000 });
  const res1 = await service.getMeteorology(37.77, -122.41);
  const res2 = await service.getMeteorology(37.77, -122.41);

  assert.equal(fetchCount, 1, 'Second call must hit memory cache');
  assert.equal(res1.temperatureC, 18);
  assert.equal(res2.temperatureC, 18);
});
