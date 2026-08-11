import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRateLimiter } from './rateLimit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USE_MOCK = process.env.GTP_MOCK_DATA === '1';

// Esri's hosted World Imagery basemap — publicly reachable without an API
// key (same ArcGIS Online family this app already queries, keyless, for LGA
// boundaries — see src/lga/boundaries.ts). Intended for light/evaluation use
// per Esri's terms; fine for this tool's low-volume draft generation, but
// swap for a licensed imagery provider before any high-volume production use.
const WORLD_IMAGERY_EXPORT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export';

const IMAGE_WIDTH_PX = 900;
const IMAGE_HEIGHT_PX = 600;
// Half-width of the square-ish context box around the site, in metres.
// Tighter than the 1200m transport-catchment radius (src/overpass.ts) —
// this figure is meant to show the site and its immediate surrounds, not
// the whole GTP catchment.
const HALF_EXTENT_M = 300;

const METRES_PER_DEGREE_LAT = 111_320;

// Etiquette for shared public infra — see geocode.ts/overpass.ts for the
// same pattern against Nominatim/Overpass.
const REQUEST_HEADERS = {
  'User-Agent': 'giw-gtp-generator/1.0 (GIW Environmental Solutions internal tool; contact via giw.com.au)',
};

const imageryLimiter = createRateLimiter(600);

export interface SiteContextImage {
  /** PNG bytes, or null if the live fetch failed. */
  buffer: Buffer | null;
  /** Nominal display size (px) to render at in the exported docx — always
   * set, even on failure, so callers don't need to special-case it. */
  width: number;
  height: number;
  source: string;
  error?: string;
}

function loadFixture(name: string): Buffer {
  const p = path.join(__dirname, '..', 'data', 'fixtures', name);
  return readFileSync(p);
}

function boundingBox(lat: number, lon: number, halfExtentM: number) {
  const latDelta = halfExtentM / METRES_PER_DEGREE_LAT;
  const lonDelta = halfExtentM / (METRES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
  return {
    minLon: lon - lonDelta,
    minLat: lat - latDelta,
    maxLon: lon + lonDelta,
    maxLat: lat + latDelta,
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

/**
 * Fetch an aerial image centred on the site, showing the site and its
 * immediate wider context, for the docx template's "Figure 1" placeholder.
 * Never throws — a failed live fetch degrades to a null buffer (the caller
 * renders a "confirm manually" note in its place instead) rather than
 * failing the whole export, per this app's usual degrade-honestly pattern
 * (see overpass.ts).
 */
export async function getSiteContextImage(lat: number, lon: number): Promise<SiteContextImage> {
  if (USE_MOCK) {
    const buffer = loadFixture('siteImage.richmond.png');
    return { buffer, width: IMAGE_WIDTH_PX, height: IMAGE_HEIGHT_PX, source: 'DEMO FIXTURE (not a live image)' };
  }

  const { minLon, minLat, maxLon, maxLat } = boundingBox(lat, lon, HALF_EXTENT_M);
  const url = `${WORLD_IMAGERY_EXPORT_URL}?${new URLSearchParams({
    bbox: `${minLon},${minLat},${maxLon},${maxLat}`,
    bboxSR: '4326',
    imageSR: '4326',
    size: `${IMAGE_WIDTH_PX},${IMAGE_HEIGHT_PX}`,
    format: 'png24',
    transparent: 'false',
    f: 'image',
  })}`;

  try {
    const res = await imageryLimiter(() => fetchWithTimeout(url, { headers: REQUEST_HEADERS }, 20_000));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('image')) throw new Error(`unexpected content-type: ${contentType}`);
    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      width: IMAGE_WIDTH_PX,
      height: IMAGE_HEIGHT_PX,
      source: 'Esri World Imagery (ArcGIS Online) — live aerial imagery',
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return {
      buffer: null,
      width: IMAGE_WIDTH_PX,
      height: IMAGE_HEIGHT_PX,
      source: 'Esri World Imagery — fetch failed',
      error: `Live site-context imagery fetch failed (${message}). Insert a site photo/aerial manually before issuing this GTP.`,
    };
  }
}
