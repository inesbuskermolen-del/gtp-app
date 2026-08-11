import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { findLgaForPoint } from './lga/boundaries.js';
import type { CouncilMatch, CouncilProfile, LatLon } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CouncilData {
  generatedNote: string;
  actionCategories: string[];
  councils: CouncilProfile[];
}

const councilData: CouncilData = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'data', 'councils.json'), 'utf8')
);

function normalise(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // drop "(part)", "(Vic.)" etc.
    .replace(/[^a-z]/g, '');
}

function findGeneric(): CouncilProfile {
  const generic = councilData.councils.find((c) => c.id === 'generic');
  if (!generic) throw new Error('councils.json is missing the required "generic" fallback profile');
  return generic;
}

function findByLgaName(lgaName: string): CouncilProfile | undefined {
  const target = normalise(lgaName);
  return councilData.councils.find((c) => c.lgaNames.some((n) => normalise(n) === target));
}

function findBySuburb(suburb: string): CouncilProfile | undefined {
  const target = normalise(suburb);
  if (!target) return undefined;
  return councilData.councils.find((c) => c.suburbs.some((s) => normalise(s) === target));
}

/**
 * Council (LGA) matching, in priority order:
 *  1. Real point-in-polygon match against ABS LGA boundaries (authoritative
 *     for "which council is this address in", including boundary-adjacent
 *     addresses).
 *  2. If the point falls in an LGA we haven't profiled in detail yet, say
 *     so explicitly rather than silently guessing via suburb name.
 *  3. If the point doesn't land in any Victorian LGA polygon at all
 *     (outside Victoria, or a small data gap), fall back to the old
 *     suburb-name lookup as a last resort, then to the generic profile.
 */
export function findCouncilForLocation(coords: LatLon, suburb: string): CouncilMatch {
  const lgaName = findLgaForPoint(coords);

  if (lgaName) {
    const detailed = findByLgaName(lgaName);
    if (detailed) {
      return { council: detailed, matchConfidence: 'lga-polygon-matched', matchedLgaName: lgaName };
    }
    return { council: findGeneric(), matchConfidence: 'lga-matched-no-detailed-profile', matchedLgaName: lgaName };
  }

  const bySuburb = findBySuburb(suburb);
  if (bySuburb) {
    return { council: bySuburb, matchConfidence: 'suburb-matched-fallback' };
  }

  return { council: findGeneric(), matchConfidence: 'no-match-generic-fallback' };
}

export function listCouncils() {
  return councilData.councils.map((c) => ({
    id: c.id,
    name: c.name,
    profileDepth: c.profileDepth,
    suburbCount: c.suburbs.length,
    lgaNames: c.lgaNames,
  }));
}

export const actionCategories = councilData.actionCategories;
