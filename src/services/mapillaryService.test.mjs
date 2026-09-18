import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMapillaryToken,
  queryMapillaryImage,
  queryPanoramaxImage,
  fetchNearestStreetView,
} from './mapillaryService.js';

test('resolveMapillaryToken resolves token from options or environment', () => {
  const custom = resolveMapillaryToken({ token: 'MLY|test_token_123' });
  assert.equal(custom, 'MLY|test_token_123');
});

test('queryMapillaryImage parses API v4 response successfully', async () => {
  const fakeResponse = {
    data: [
      {
        id: '123456789',
        thumb_2048_url: 'https://images.mapillary.com/123456789/thumb-2048.jpg',
        thumb_1024_url: 'https://images.mapillary.com/123456789/thumb-1024.jpg',
        captured_at: 1715500000000,
        compass_angle: 182.4,
        is_pano: true,
        computed_geometry: { coordinates: [-97.7431, 30.2672] },
      },
    ],
  };

  const fakeFetch = async (url) => {
    assert.match(url, /graph\.mapillary\.com/);
    assert.match(url, /access_token=MLY%7Ctest/);
    return {
      ok: true,
      json: async () => fakeResponse,
    };
  };

  const result = await queryMapillaryImage(30.2672, -97.7431, {
    token: 'MLY|test',
    fetchImpl: fakeFetch,
  });

  assert.ok(result !== null);
  assert.equal(result.id, '123456789');
  assert.equal(result.source, 'Mapillary');
  assert.equal(result.isPano, true);
  assert.equal(result.compassAngle, 182.4);
  assert.match(result.imageUrl, /thumb-2048\.jpg/);
});

test('queryPanoramaxImage parses STAC search response when Mapillary has no token', async () => {
  const fakePanoramax = {
    features: [
      {
        id: 'pano-abc-123',
        geometry: { coordinates: [-97.7431, 30.2672] },
        properties: {
          'view:azimuth': 90.0,
          datetime: '2026-09-16T12:00:00Z',
        },
        assets: {
          hd: { href: 'https://panoramax.openstreetmap.fr/api/pictures/pano-abc-123/hd.jpg' },
          thumb: { href: 'https://panoramax.openstreetmap.fr/api/pictures/pano-abc-123/thumb.jpg' },
        },
      },
    ],
  };

  const fakeFetch = async (url) => {
    assert.match(url, /panoramax\.openstreetmap\.fr/);
    return {
      ok: true,
      json: async () => fakePanoramax,
    };
  };

  const result = await queryPanoramaxImage(30.2672, -97.7431, { fetchImpl: fakeFetch });
  assert.ok(result !== null);
  assert.equal(result.id, 'pano-abc-123');
  assert.equal(result.source, 'Panoramax (OSM)');
  assert.equal(result.compassAngle, 90.0);
  assert.equal(result.imageUrl, 'https://panoramax.openstreetmap.fr/api/pictures/pano-abc-123/hd.jpg');
});

test('fetchNearestStreetView falls back to Panoramax when no Mapillary token is configured', async () => {
  const fakePanoramax = {
    features: [
      {
        id: 'pano-fallback',
        geometry: { coordinates: [2.3522, 48.8566] },
        properties: { 'view:azimuth': 45.0 },
        assets: { hd: { href: 'https://example.com/pano.jpg' } },
      },
    ],
  };

  const fakeFetch = async (url) => {
    return {
      ok: true,
      json: async () => fakePanoramax,
    };
  };

  const result = await fetchNearestStreetView(48.8566, 2.3522, {
    token: null,
    fetchImpl: fakeFetch,
  });

  assert.ok(result !== null);
  assert.equal(result.id, 'pano-fallback');
  assert.equal(result.source, 'Panoramax (OSM)');
});
