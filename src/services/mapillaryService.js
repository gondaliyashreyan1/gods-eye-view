/**
 * @fileoverview Mapillary & Open Street-Level Imagery Service.
 *
 * Provides real-world street-level photographs matching the observer's geographic position:
 *  - Primary: Mapillary Graph API v4 (Meta's global crowd-sourced street imagery).
 *  - Fallback: OpenStreetMap Panoramax (decentralized, 100% token-free open street view).
 */

export const MAPILLARY_API_BASE = 'https://graph.mapillary.com';
export const PANORAMAX_API_BASE = 'https://panoramax.openstreetmap.fr/api';

export const DEFAULT_MAPILLARY_CLIENT_TOKEN =
  'MLY|28770904692516138|c46ebeeaba88e0bcd9842b503fabc44d';

/**
 * Resolves the active Mapillary access token from options, environment, or localStorage.
 *
 * @param {object} [options]
 * @returns {string|null}
 */
export function resolveMapillaryToken(options = {}) {
  if (options.token !== undefined) return options.token;

  if (typeof process !== 'undefined' && process.env?.MAPILLARY_CLIENT_TOKEN) {
    return process.env.MAPILLARY_CLIENT_TOKEN;
  }

  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MAPILLARY_CLIENT_TOKEN) {
    return import.meta.env.VITE_MAPILLARY_CLIENT_TOKEN;
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem('gev_mapillary_token');
      if (stored) return stored;
    } catch {
      // Ignore storage access restrictions
    }
  }

  return DEFAULT_MAPILLARY_CLIENT_TOKEN;
}

/**
 * Queries Mapillary API v4 for the nearest street image.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {object} [options]
 * @param {string} [options.token]
 * @param {number} [options.radius=50] Search radius in meters (max 50 per API v4 spec)
 * @param {typeof fetch} [options.fetchImpl=fetch]
 * @returns {Promise<object|null>}
 */
export async function queryMapillaryImage(latitude, longitude, options = {}) {
  const token = resolveMapillaryToken(options);
  if (!token) return null;

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const radius = Math.min(50, Math.max(5, options.radius || 50));
  const url = `${MAPILLARY_API_BASE}/images?access_token=${encodeURIComponent(token)}&lat=${latitude}&lng=${longitude}&radius=${radius}&limit=1&fields=id,thumb_1024_url,thumb_2048_url,captured_at,compass_angle,is_pano,camera_type,computed_geometry`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetchImpl(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[Mapillary] API response status ${res.status}`);
      return null;
    }
    const data = await res.json();
    const item = data?.data?.[0];
    if (!item) return null;

    const coords = item.computed_geometry?.coordinates || [longitude, latitude];
    return {
      id: item.id,
      source: 'Mapillary',
      imageUrl: item.thumb_2048_url || item.thumb_1024_url,
      thumbnailUrl: item.thumb_1024_url,
      isPano: Boolean(item.is_pano),
      compassAngle: item.compass_angle ?? null,
      capturedAt: item.captured_at ? new Date(item.captured_at).toISOString() : null,
      latitude: coords[1],
      longitude: coords[0],
      externalUrl: `https://www.mapillary.com/app/?pKey=${item.id}`,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Fallback query using Panoramax (OpenStreetMap) token-free open street view API.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl=fetch]
 * @returns {Promise<object|null>}
 */
export async function queryPanoramaxImage(latitude, longitude, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const delta = 0.002; // ~200m bounding box
  const bbox = `${longitude - delta},${latitude - delta},${longitude + delta},${latitude + delta}`;
  const url = `${PANORAMAX_API_BASE}/search?bbox=${bbox}&limit=1`;

  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) return null;

    const assets = feature.assets || {};
    const props = feature.properties || {};
    const coords = feature.geometry?.coordinates || [longitude, latitude];

    return {
      id: feature.id,
      source: 'Panoramax (OSM)',
      imageUrl: assets.hd?.href || assets.sd?.href || assets.thumb?.href,
      thumbnailUrl: assets.thumb?.href || assets.sd?.href,
      isPano: true,
      compassAngle: props['view:azimuth'] ?? null,
      capturedAt: props.datetime || null,
      latitude: coords[1],
      longitude: coords[0],
      externalUrl: feature.links?.find((l) => l.rel === 'self')?.href || null,
    };
  } catch (err) {
    console.warn('[Panoramax] Request failed:', err);
    return null;
  }
}

/**
 * Resolves the best available street view image near a given coordinate.
 * Attempts Mapillary first, falling back to Panoramax.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {object} [options]
 * @returns {Promise<object|null>}
 */
export async function fetchNearestStreetView(latitude, longitude, options = {}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new TypeError('Valid latitude and longitude required');
  }

  // Query Mapillary and Panoramax concurrently for sub-second response
  const [mapillaryResult, panoramaxResult] = await Promise.all([
    queryMapillaryImage(latitude, longitude, options),
    queryPanoramaxImage(latitude, longitude, options),
  ]);

  return mapillaryResult || panoramaxResult || null;
}
