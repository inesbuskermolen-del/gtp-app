import { prisma } from './prisma.js';

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — LGA/transport data doesn't change fast enough to justify re-hitting Nominatim/Overpass more often than this for the same query.

export async function getGeocodeCache(query: string): Promise<unknown | null> {
  const row = await prisma.geocodeCache.findUnique({ where: { query } });
  if (!row) return null;
  if (Date.now() - row.fetchedAt.getTime() > DEFAULT_TTL_MS) return null;
  return JSON.parse(row.resultJson);
}

export async function setGeocodeCache(query: string, result: unknown): Promise<void> {
  await prisma.geocodeCache.upsert({
    where: { query },
    create: { query, resultJson: JSON.stringify(result) },
    update: { resultJson: JSON.stringify(result), fetchedAt: new Date() },
  });
}

export async function getOverpassCache(cacheKey: string): Promise<unknown | null> {
  const row = await prisma.overpassCache.findUnique({ where: { cacheKey } });
  if (!row) return null;
  if (Date.now() - row.fetchedAt.getTime() > DEFAULT_TTL_MS) return null;
  return JSON.parse(row.resultJson);
}

export async function setOverpassCache(cacheKey: string, result: unknown): Promise<void> {
  await prisma.overpassCache.upsert({
    where: { cacheKey },
    create: { cacheKey, resultJson: JSON.stringify(result) },
    update: { resultJson: JSON.stringify(result), fetchedAt: new Date() },
  });
}
