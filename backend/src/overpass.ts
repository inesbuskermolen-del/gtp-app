import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { haversineMetres, metresToWalkMinutes, formatDistance } from './geoUtils.js';
import { getOverpassCache, setOverpassCache } from './cache.js';
import type { LatLon, TransportItem, TransportItemType, TransportSummary } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USE_MOCK = process.env.GTP_MOCK_DATA === '1';

// Primary + a known public mirror, tried in order — Overpass's main
// instance rate-limits/queues under load; falling back to a mirror rather
// than failing outright keeps the pipeline usable during peak hours.
const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

const SEARCH_RADIUS_M = 1200; // ~15 min walk, standard GTP catchment

// Overpass's Apache front-end (mod_negotiation) 406s Node's fetch() when no
// Accept header is present — curl sends one implicitly, fetch() doesn't.
// Also send a descriptive User-Agent as etiquette for shared infra.
const OVERPASS_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  Accept: '*/*',
  'User-Agent': 'giw-gtp-generator/1.0 (GIW Environmental Solutions internal tool; contact via giw.com.au)',
};

function loadFixture<T>(name: string): T {
  const p = path.join(__dirname, '..', 'data', 'fixtures', name);
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function buildQuery(lat: number, lon: number, radius: number): string {
  return `
    [out:json][timeout:25];
    (
      node(around:${radius},${lat},${lon})[railway=station];
      node(around:${radius},${lat},${lon})[railway=halt];
      node(around:${radius},${lat},${lon})[railway=tram_stop];
      node(around:${radius},${lat},${lon})[highway=bus_stop];
      node(around:${radius},${lat},${lon})[amenity=car_sharing];
      way(around:${radius},${lat},${lon})[highway=cycleway];
      way(around:${radius},${lat},${lon})[cycleway];
      way(around:${radius},${lat},${lon})[bicycle=designated];
    );
    out center tags;
  `;
}

function classify(el: OverpassElement): TransportItemType | null {
  const t = el.tags || {};
  if (t.railway === 'station' || t.railway === 'halt') return 'train';
  if (t.railway === 'tram_stop') return 'tram';
  if (t.highway === 'bus_stop') return 'bus';
  if (t.amenity === 'car_sharing') return 'carShare';
  return null;
}

function isCyclingWay(el: OverpassElement): boolean {
  const t = el.tags || {};
  return t.highway === 'cycleway' || Boolean(t.cycleway) || t.bicycle === 'designated';
}

function nearestByType(elements: OverpassElement[], origin: LatLon) {
  const byType: Record<TransportItemType, TransportItem[]> = { train: [], tram: [], bus: [], carShare: [] };
  let cyclingCount = 0;
  for (const el of elements) {
    if (isCyclingWay(el)) {
      cyclingCount += 1;
      continue;
    }
    const type = classify(el);
    if (!type) continue;
    const point = el.type === 'node' ? { lat: el.lat!, lon: el.lon! } : el.center;
    if (!point) continue;
    const distance = haversineMetres(origin, point);
    byType[type].push({
      name: el.tags?.name || el.tags?.ref || `${type} facility`,
      distanceM: Math.round(distance),
      distanceLabel: formatDistance(distance),
      walkMinutes: metresToWalkMinutes(distance),
      tags: el.tags || {},
    });
  }
  for (const k of Object.keys(byType) as TransportItemType[]) {
    byType[k].sort((a, b) => a.distanceM - b.distanceM);
  }
  return { byType, cyclingCount };
}

function summarise(byType: Record<TransportItemType, TransportItem[]>, cyclingCount: number, source: string, error?: string): TransportSummary {
  return {
    searchRadiusM: SEARCH_RADIUS_M,
    train: byType.train.slice(0, 3),
    tram: byType.tram.slice(0, 3),
    bus: byType.bus.slice(0, 3),
    carShare: byType.carShare.slice(0, 5),
    cyclingInfraCount: cyclingCount,
    // Indicative walkability proxy: NOT the commercial Walk Score(R) product.
    // Rough heuristic from stop density + cycling infra density within the
    // search radius, scaled 0-100.
    indicativeWalkability: Math.min(
      100,
      Math.round(byType.train.length * 12 + byType.tram.length * 6 + byType.bus.length * 3 + Math.min(cyclingCount, 20) * 2)
    ),
    _source: source,
    ...(error ? { _error: error } : {}),
  };
}

async function fetchWithTimeout(url: string, opts: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function queryOverpass(query: string): Promise<OverpassElement[]> {
  const errors: string[] = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: OVERPASS_HEADERS,
        },
        30_000
      );
      if (!res.ok) {
        errors.push(`${endpoint}: HTTP ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { elements?: OverpassElement[] };
      return data.elements || [];
    } catch (e) {
      errors.push(`${endpoint}: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }
  throw new Error(errors.join('; '));
}

/**
 * Fetch nearby transport infrastructure via Overpass (OpenStreetMap).
 * Never throws — a failed live lookup after exhausting endpoints degrades
 * to an empty-but-clearly-flagged summary (`_error` set) so the rest of the
 * GTP can still be generated and the consultant knows to check this section
 * manually, per the "handle I don't know gracefully" requirement.
 */
export async function getTransportInfrastructure(lat: number, lon: number): Promise<TransportSummary> {
  if (USE_MOCK) {
    const fixture = loadFixture<{ elements: OverpassElement[] }>('overpass.richmond.json');
    const { byType, cyclingCount } = nearestByType(fixture.elements, { lat, lon });
    return summarise(byType, cyclingCount, 'DEMO FIXTURE (not a live query)');
  }

  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)},${SEARCH_RADIUS_M}`;
  const cached = await getOverpassCache(cacheKey);
  if (cached) {
    const { byType, cyclingCount } = nearestByType((cached as { elements: OverpassElement[] }).elements, { lat, lon });
    return summarise(byType, cyclingCount, 'Overpass API (OpenStreetMap) — cached result');
  }

  const query = buildQuery(lat, lon, SEARCH_RADIUS_M);
  try {
    const elements = await queryOverpass(query);
    await setOverpassCache(cacheKey, { elements });
    const { byType, cyclingCount } = nearestByType(elements, { lat, lon });
    return summarise(byType, cyclingCount, 'Overpass API (OpenStreetMap) live query');
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return summarise(
      { train: [], tram: [], bus: [], carShare: [] },
      0,
      'Overpass API (OpenStreetMap) — lookup failed',
      `Live transport-infrastructure lookup failed (${message}). Confirm nearby train/tram/bus/car-share options manually before issuing this GTP.`
    );
  }
}

export { SEARCH_RADIUS_M };
