import { describe, expect, it } from 'vitest';
import { findCouncilForLocation } from '../src/councilLookup.js';

describe('findCouncilForLocation', () => {
  it('matches a clearly-inside address to its real LGA polygon (Richmond -> Yarra)', () => {
    const result = findCouncilForLocation({ lat: -37.8226, lon: 144.993 }, 'Richmond');
    expect(result.matchConfidence).toBe('lga-polygon-matched');
    expect(result.council.id).toBe('yarra');
    expect(result.matchedLgaName).toBe('Yarra');
  });

  it('matches Melbourne CBD to City of Melbourne', () => {
    const result = findCouncilForLocation({ lat: -37.8136, lon: 144.9631 }, 'Melbourne');
    expect(result.matchConfidence).toBe('lga-polygon-matched');
    expect(result.council.id).toBe('melbourne');
  });

  it('matches Prahran to City of Stonnington', () => {
    const result = findCouncilForLocation({ lat: -37.8496, lon: 144.993 }, 'Prahran');
    expect(result.matchConfidence).toBe('lga-polygon-matched');
    expect(result.council.id).toBe('stonnington');
  });

  it('resolves a boundary-adjacent address to the correct side of the Yarra/Melbourne line', () => {
    // 2 Punt Road, Richmond geocodes just across the Yarra river, inside
    // the City of Melbourne boundary, not City of Yarra — a real
    // boundary-adjacent case surfaced during live testing, not a
    // constructed one.
    const result = findCouncilForLocation({ lat: -37.8211202, lon: 144.9894289 }, 'Richmond');
    expect(result.matchConfidence).toBe('lga-polygon-matched');
    expect(result.council.id).toBe('melbourne');
  });

  it('falls back to the generic profile for a real Victorian LGA with no detailed council data', () => {
    // Box Hill is real and inside Victoria, but Whitehorse isn't one of
    // the 6 councils profiled in detail.
    const result = findCouncilForLocation({ lat: -37.8193038, lon: 145.1221243 }, 'Box Hill');
    expect(result.matchConfidence).toBe('lga-matched-no-detailed-profile');
    expect(result.matchedLgaName).toBe('Whitehorse');
    expect(result.council.id).toBe('generic');
  });

  it('falls back to suburb-name matching when the point matches no LGA polygon at all', () => {
    // A Port Phillip Bay water point matches no land LGA polygon; the
    // suburb name should still resolve it via the fallback list.
    const result = findCouncilForLocation({ lat: -38.05, lon: 144.85 }, 'Richmond');
    expect(result.matchConfidence).toBe('suburb-matched-fallback');
    expect(result.council.id).toBe('yarra');
  });

  it('falls back to the generic profile when neither polygon nor suburb match', () => {
    const result = findCouncilForLocation({ lat: -33.8688, lon: 151.2093 }, 'Sydney');
    expect(result.matchConfidence).toBe('no-match-generic-fallback');
    expect(result.council.id).toBe('generic');
  });
});
