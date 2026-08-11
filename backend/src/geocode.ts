import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getGeocodeCache, setGeocodeCache } from './cache.js';
import { createRateLimiter } from './rateLimit.js';
import { GeocodeNotFoundError, GeocodeServiceError, NonVictorianAddressError } from './errors.js';
import type { GeocodeResult } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USE_MOCK = process.env.GTP_MOCK_DATA === '1';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
// Nominatim's usage policy requires a descriptive User-Agent identifying
// the application — see https://operations.osmfoundation.org/policies/nominatim/
const USER_AGENT = 'giw-gtp-generator/1.0 (GIW Environmental Solutions internal tool; contact via giw.com.au)';

// Nominatim allows max 1 req/sec; keep a margin.
const nominatimLimiter = createRateLimiter(1100);

function loadFixture<T>(name: string): T {
  const p = path.join(__dirname, '..', 'data', 'fixtures', name);
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

const VICTORIAN_STATE_NAMES = new Set(['victoria', 'vic']);

async function fetchWithTimeout(url: string, opts: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Geocode a free-text address to a lat/lon + address components.
 * Live mode calls OpenStreetMap Nominatim (free, no API key, subject to
 * their usage policy — max 1 req/sec, descriptive User-Agent required).
 * Demo mode (GTP_MOCK_DATA=1) returns a recorded fixture. Results are
 * cached (see cache.ts) so repeat lookups of the same address don't re-hit
 * the live API.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  if (USE_MOCK) {
    const fixture = loadFixture<Omit<GeocodeResult, '_source'>>('geocode.richmond.json');
    return { ...fixture, _source: 'DEMO FIXTURE (not a live lookup)' };
  }

  const normalisedQuery = address.trim().toLowerCase();
  const cached = await getGeocodeCache(normalisedQuery);
  if (cached) {
    return { ...(cached as GeocodeResult), _source: 'Nominatim (OpenStreetMap) — cached result' };
  }

  const url = `${NOMINATIM_URL}?${new URLSearchParams({
    q: address,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '1',
    countrycodes: 'au',
  })}`;

  let res: Response;
  try {
    res = await nominatimLimiter(() =>
      fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } }, 10_000)
    );
  } catch (e) {
    throw new GeocodeServiceError(e instanceof Error ? e.message : 'network error contacting Nominatim');
  }

  if (!res.ok) {
    throw new GeocodeServiceError(`Nominatim returned HTTP ${res.status}`);
  }

  const results = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    address?: Record<string, string>;
  }>;

  if (!results.length) {
    throw new GeocodeNotFoundError(address);
  }

  const r = results[0];
  const addr = r.address || {};
  const suburb = addr.suburb || addr.city_district || addr.town || addr.village || addr.hamlet || '';
  const state = addr.state || '';

  if (state && !VICTORIAN_STATE_NAMES.has(state.trim().toLowerCase())) {
    throw new NonVictorianAddressError(address, state);
  }

  const result: Omit<GeocodeResult, '_source'> = {
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    displayName: r.display_name,
    suburb,
    postcode: addr.postcode || '',
    state,
    raw: r,
  };

  await setGeocodeCache(normalisedQuery, result);

  return { ...result, _source: 'Nominatim (OpenStreetMap) live lookup' };
}
