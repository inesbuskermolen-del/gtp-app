import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { point, booleanPointInPolygon } from '@turf/turf';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';
import type { LatLon } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Sourced from the ABS ASGS2024 LGA (generalised) ArcGIS FeatureServer,
// https://geo.abs.gov.au/arcgis/rest/services/ASGS2024/LGA/MapServer/1,
// filtered to state_name_2021='Victoria', reprojected to WGS84 (outSR=4326),
// coordinates rounded to 5dp (~1m) to keep the file small. CC BY 4.0,
// Australian Bureau of Statistics. Re-fetch periodically — LGA boundaries
// and vintages change (e.g. council amalgamations/renames).
const BOUNDARIES_PATH = path.join(__dirname, 'boundaries.geojson');

interface LgaProperties {
  lga_name: string;
  lga_code: string;
}

let cachedFeatures: Feature<Geometry, LgaProperties>[] | null = null;

function loadFeatures(): Feature<Geometry, LgaProperties>[] {
  if (!cachedFeatures) {
    const raw = readFileSync(BOUNDARIES_PATH, 'utf8');
    const fc = JSON.parse(raw) as FeatureCollection<Geometry, LgaProperties>;
    cachedFeatures = fc.features;
  }
  return cachedFeatures;
}

/**
 * Point-in-polygon match against real Victorian LGA boundaries. Returns the
 * ABS LGA name (e.g. "Yarra", "Boroondara") or null if the point doesn't
 * fall inside any loaded polygon (most likely: outside Victoria, or right
 * on a coastline/data gap).
 */
export function findLgaForPoint(coords: LatLon): string | null {
  const pt = point([coords.lon, coords.lat]);
  for (const feature of loadFeatures()) {
    try {
      const polyFeature = feature as unknown as Feature<Polygon | MultiPolygon, LgaProperties>;
      if (booleanPointInPolygon(pt, polyFeature)) {
        return feature.properties.lga_name;
      }
    } catch {
      // Malformed ring in a handful of ABS features is a known quirk;
      // skip rather than fail the whole lookup.
      continue;
    }
  }
  return null;
}
