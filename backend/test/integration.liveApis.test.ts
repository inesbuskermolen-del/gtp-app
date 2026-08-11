import { describe, expect, it } from 'vitest';
import { geocodeAddress } from '../src/geocode.js';
import { getTransportInfrastructure } from '../src/overpass.js';
import { findCouncilForLocation } from '../src/councilLookup.js';
import { generateGtpContent } from '../src/gtpGenerator.js';
import { renderGtpDocx } from '../src/docx/fillTemplate.js';

// Hits the real Nominatim + Overpass APIs — run via `npm run test:live`, not
// part of the default `npm test`. Respects the same rate-limit/caching path
// as production code (see src/geocode.ts, src/overpass.ts); no extra
// throttling needed here beyond what those modules already do.
const REAL_ADDRESSES = [
  '1 Swan Street, Richmond VIC 3121', // inner suburb, dense OSM coverage
  '625 Doncaster Road, Doncaster VIC 3108', // middle suburb
  '1 High Street, Cranbourne VIC 3977', // outer suburb, sparser OSM coverage
];

describe.each(REAL_ADDRESSES)('live pipeline for %s', (address) => {
  it(
    'geocodes, matches a council, fetches transport data, and renders a valid docx without throwing',
    async () => {
      const geocode = await geocodeAddress(address);
      expect(geocode.lat).not.toBeNaN();
      expect(geocode.lon).not.toBeNaN();

      const councilMatch = findCouncilForLocation(geocode, geocode.suburb);
      expect(councilMatch.council).toBeDefined();

      const transport = await getTransportInfrastructure(geocode.lat, geocode.lon);
      expect(transport.searchRadiusM).toBe(1200);

      const gtp = generateGtpContent(
        { address, developmentType: 'residential', scale: '10 dwellings' },
        geocode,
        councilMatch,
        transport
      );
      const buffer = renderGtpDocx(gtp);
      expect(buffer.length).toBeGreaterThan(10_000);
    },
    30_000
  );
});

describe('live geocoding failure modes', () => {
  it('throws a clear error for an address outside Victoria', async () => {
    await expect(geocodeAddress('1 George Street, Sydney NSW 2000')).rejects.toThrow(/Victoria/);
  });

  it('throws a clear error for an unresolvable address', async () => {
    await expect(geocodeAddress('asdkjfhaksjdhfkajshdf nonexistent place 999999')).rejects.toThrow();
  });
});
