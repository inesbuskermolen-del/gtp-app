import type { LatLon } from './types.js';

export const MELBOURNE_CBD: LatLon = { lat: -37.8136, lon: 144.9631 };

/** Great-circle distance between two lat/lon points, in metres. */
export function haversineMetres(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function metresToWalkMinutes(metres: number): number {
  // Average walking pace ~4.8km/h (80m/min), standard used in walkability literature.
  return Math.round(metres / 80);
}

export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)}m`;
  return `${(metres / 1000).toFixed(1)}km`;
}
